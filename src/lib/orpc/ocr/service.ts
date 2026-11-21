import { and, asc, eq } from "drizzle-orm";
import { Context, Effect } from "effect";

import { events, rooms, schedules, tracks } from "../../db/schema";
import { wallClock } from "../../slot-day";
import { query } from "../db";
import { Conflict, NotFound, UpstreamFailed } from "../errors";
import { Ai, type AppServices } from "../services";
import { readCard, streamCard, type CardModel } from "./card";
import { CARD_OCR_MODEL, SLOT_DECISION_MODEL } from "./models";
import type { CardEvent, FindFreeSpotResponse } from "./schemas";
import { buildCandidates, findFreeSpot, type Board, type Talk } from "./slot";

const label = (slot: { startTime: string; endTime: string }) => `${slot.startTime} - ${slot.endTime}`;

/**
 * An event's board as the slot picker needs it, read from the database rather
 * than taken from the caller, plus the room and slot rows behind its names.
 * Blocks that already ended are left out (at 15:10 nobody wants the 11:00
 * slot) — by time of day on the event's clock — unless that leaves none, e.g.
 * someone preparing the board the night before.
 */
const loadBoardRows = (eventId: string) =>
  Effect.gen(function* () {
    const [event] = yield* query((db) =>
      db.select({ timezone: events.timezone }).from(events).where(eq(events.id, eventId))
    );
    if (!event) return yield* new NotFound({ entity: "event", message: "Ese evento no existe" });

    const [roomRows, slotRows, talkRows] = yield* Effect.all(
      [
        query((db) =>
          db
            .select()
            .from(rooms)
            .where(and(eq(rooms.openSpaceId, eventId), eq(rooms.isActive, true)))
            .orderBy(asc(rooms.sortOrder))
        ),
        query((db) =>
          db
            .select()
            .from(schedules)
            .where(and(eq(schedules.openSpaceId, eventId), eq(schedules.isActive, true)))
            .orderBy(asc(schedules.startTime))
        ),
        query((db) =>
          db.query.tracks.findMany({ where: eq(tracks.openSpaceId, eventId), with: { room: true, schedule: true } })
        ),
      ],
      { concurrency: "unbounded" }
    );

    const now = wallClock(new Date(), event.timezone).slice(11);
    const upcoming = slotRows.filter((slot) => slot.endTime >= now);
    const slots = upcoming.length > 0 ? upcoming : slotRows;

    const board = {
      existingNotes: talkRows.flatMap((talk) =>
        talk.room && talk.schedule
          ? [
              {
                title: talk.title,
                speaker: talk.speaker ?? undefined,
                room: talk.room.name,
                timeSlot: label(talk.schedule),
              },
            ]
          : []
      ),
      roomsWithResources: roomRows.map((room) => ({
        name: room.name,
        hasTV: room.hasTV,
        hasWhiteboard: room.hasWhiteboard,
      })),
      availableRooms: roomRows.map((room) => room.name),
      availableTimeSlots: slots.map(label),
    } satisfies Board;

    return { board, rooms: roomRows, slots };
  });

const loadBoard = (eventId: string) => loadBoardRows(eventId).pipe(Effect.map((loaded) => loaded.board));

/** Where a talk could go on the event's board. Never fails on the AI: it degrades to the first free cell. */
export const suggestSlot = (eventId: string, talk: Talk) =>
  Effect.gen(function* () {
    const board = yield* loadBoard(eventId);
    const ai = yield* Ai;

    return yield* Effect.promise(() => findFreeSpot(talk, board, ai.decisionModel(SLOT_DECISION_MODEL.primary)));
  });

/** A free cell as ids, with the names the picker reasoned about. */
export interface Cell {
  roomId: string;
  scheduleId: string;
  room: string;
  timeSlot: string;
  hasTV: boolean;
  hasWhiteboard: boolean;
  reasoning?: string;
}

/**
 * Where a talk can go, as ids and best first: the model's pick, its
 * alternatives, then every other free candidate — so a caller that creates
 * the talk can fall through to the next cell when one is taken meanwhile.
 * No room with what the talk asked for → any free cell (`relaxed`), rather
 * than nothing; nothing free at all → CONFLICT board_full.
 */
export const suggestCells = (eventId: string, talk: Talk) =>
  Effect.gen(function* () {
    const { board, rooms, slots } = yield* loadBoardRows(eventId);
    const strict = buildCandidates({
      ...board,
      speaker: talk.speaker,
      needsTV: talk.needsTV,
      needsWhiteboard: talk.needsWhiteboard,
    });
    const relaxed = strict.length === 0;
    const candidates = relaxed ? buildCandidates({ ...board, speaker: talk.speaker }) : strict;
    if (candidates.length === 0) {
      return yield* new Conflict({
        reason: "board_full",
        message: "La grilla está llena: no queda ningún lugar libre",
      });
    }

    const ai = yield* Ai;
    const wanted = relaxed ? { ...talk, needsTV: false, needsWhiteboard: false } : talk;
    const suggestion = yield* Effect.promise(() =>
      findFreeSpot(wanted, board, ai.decisionModel(SLOT_DECISION_MODEL.primary))
    );

    // A label can name one block per day on a multi-day event: offer them all, earliest day first.
    // ponytail: labels aren't day-qualified (the admin's selects key on them); qualify them when a real multi-day board needs it.
    const resolve = (room: string, timeSlot: string, reasoning?: string): Cell[] =>
      rooms
        .filter((candidate) => candidate.name === room)
        .flatMap((candidate) =>
          slots
            .filter((slot) => label(slot) === timeSlot)
            .toSorted((a, b) => a.date.getTime() - b.date.getTime())
            .map((slot) => ({
              roomId: candidate.id,
              scheduleId: slot.id,
              room,
              timeSlot,
              hasTV: candidate.hasTV,
              hasWhiteboard: candidate.hasWhiteboard,
              reasoning,
            }))
        );
    const ordered: { room: string; timeSlot: string; reasoning?: string }[] = [
      { room: suggestion.suggestedRoom, timeSlot: suggestion.suggestedTimeSlot, reasoning: suggestion.reasoning },
      ...(suggestion.alternatives ?? []),
      ...candidates.map((candidate) => ({ room: candidate.room, timeSlot: candidate.timeSlot })),
    ];
    const seen = new Set<string>();
    const cells = ordered
      .flatMap((place) => resolve(place.room, place.timeSlot, place.reasoning))
      .filter((cell) => {
        const key = `${cell.roomId}|${cell.scheduleId}`;
        if (seen.has(key)) return false;
        seen.add(key);

        return true;
      });

    return { suggestion, cells, relaxed };
  });

const cardModel = (ai: Context.Service.Shape<typeof Ai>): CardModel => ({
  model: ai.model(CARD_OCR_MODEL.primary),
  fallbacks: CARD_OCR_MODEL.fallbacks,
});

const asUpstream = (error: unknown) =>
  error instanceof UpstreamFailed
    ? error
    : new UpstreamFailed({ service: "AI Gateway", message: "No pudimos leer la foto", cause: error });

/** Read a card and place it, in one answer (Owy's photo tool). */
export const readCardWithSuggestion = (input: { eventId: string; imageData: string; additionalContext?: string }) =>
  Effect.gen(function* () {
    const ai = yield* Ai;
    const card = yield* Effect.tryPromise({
      try: (signal) => readCard(input.imageData, cardModel(ai), signal),
      catch: asUpstream,
    });
    const suggestion = yield* suggestSlot(input.eventId, { ...card, additionalContext: input.additionalContext });

    return { ...card, ...suggestion };
  });

/**
 * The camera tab's flow as a stream. Runs outside the procedure's middleware
 * once streaming starts, so failures are thrown as they are for the caller to
 * turn into wire errors.
 *
 * @yields {CardEvent} The name and title as the model reads them, the whole card, then a place for it if it has a title.
 */
export async function* cardEvents(
  services: Context.Context<AppServices>,
  input: { eventId: string; imageData: string; additionalContext?: string },
  signal?: AbortSignal
): AsyncGenerator<CardEvent> {
  const run = Effect.runPromiseWith(services);
  // Fail fast on a wrong event, before paying a model to read the photo.
  const board = await run(loadBoard(input.eventId));
  const reading = streamCard(input.imageData, cardModel(Context.get(services, Ai)), signal);

  for await (const fields of reading.fields()) yield { type: "fields", fields };
  const card = await reading.card;
  yield { type: "card", card };

  if (card.title) {
    const suggestion: FindFreeSpotResponse = await findFreeSpot(
      { ...card, additionalContext: input.additionalContext },
      board,
      Context.get(services, Ai).decisionModel(SLOT_DECISION_MODEL.primary)
    );
    yield { type: "suggestion", suggestion };
  }
}
