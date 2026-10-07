import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";
import { Effect } from "effect";

import {
  eventLiveState,
  rooms,
  schedules,
  tracks,
  type RoomRow,
  type ScheduleRow,
  type TrackRow,
} from "../../db/schema";
import { eventChannel } from "../../realtime/channels";
import { cardChanged } from "../board-events";
import { query, transaction } from "../db";
import { Conflict, Invalid, NotFound } from "../errors";
import { Realtime } from "../services";
import type { CreateTrackInput, StickyNote, TrackWithRelations, UpdateTrackInput } from "./schemas";

type PlacedTrack = TrackRow & { room?: RoomRow | null; schedule?: ScheduleRow | null };

/** A talk as the board shows it: readable room and slot instead of ids. */
export const toStickyNote = (track: PlacedTrack): StickyNote => ({
  id: track.id,
  title: track.title,
  speaker: track.speaker || undefined,
  description: track.description || undefined,
  needsTV: track.needsTV,
  needsWhiteboard: track.needsWhiteboard,
  openSpaceId: track.openSpaceId,
  scheduleId: track.scheduleId,
  roomId: track.roomId,
  room: track.room?.name || track.roomId,
  roomColor: track.room?.color ?? undefined,
  timeSlot: track.schedule ? `${track.schedule.startTime} - ${track.schedule.endTime}` : track.scheduleId,
  createdAt: track.createdAt.toISOString(),
  updatedAt: track.updatedAt.toISOString(),
});

const trackNotFound = new NotFound({ entity: "track", message: "Esa charla no existe" });

const slotTaken = (title: string) =>
  new Conflict({ reason: "slot_taken", message: `Ese lugar ya lo ocupa "${title}"`, occupiedBy: title });

/** Who sits in a slot right now (optionally ignoring one talk). */
const occupantOf = (scheduleId: string, roomId: string, exceptTrackId?: string) =>
  query((db) =>
    db
      .select({ title: tracks.title })
      .from(tracks)
      .where(
        and(
          eq(tracks.scheduleId, scheduleId),
          eq(tracks.roomId, roomId),
          exceptTrackId ? ne(tracks.id, exceptTrackId) : undefined
        )
      )
  ).pipe(Effect.map(([occupant]) => occupant?.title ?? null));

/**
 * The write hit the (slot, room) unique index: someone took the place
 * between our check and our write. Answer with who got there first.
 */
const lostTheRace = (scheduleId: string, roomId: string) => () =>
  occupantOf(scheduleId, roomId).pipe(Effect.flatMap((title) => Effect.fail(slotTaken(title ?? "otra charla"))));

const loadNote = (id: string) =>
  query((db) => db.query.tracks.findFirst({ where: eq(tracks.id, id), with: { room: true, schedule: true } })).pipe(
    Effect.flatMap((track) => (track ? Effect.succeed(toStickyNote(track)) : Effect.fail(trackNotFound)))
  );

/**
 * The slot and room a talk is going to: both must exist and belong to the
 * talk's event, the room must have what the talk needs (unless the staffer
 * insisted), and the place must be free.
 */
const checkPlace = (place: {
  openSpaceId: string;
  scheduleId: string;
  roomId: string;
  needsTV: boolean;
  needsWhiteboard: boolean;
  skipResourceValidation: boolean;
  exceptTrackId?: string;
}) =>
  Effect.gen(function* () {
    const [[schedule], [room]] = yield* Effect.all([
      query((db) => db.select().from(schedules).where(eq(schedules.id, place.scheduleId))),
      query((db) => db.select().from(rooms).where(eq(rooms.id, place.roomId))),
    ]);
    if (!schedule) return yield* new NotFound({ entity: "schedule", message: "Ese bloque no existe" });
    if (!room) return yield* new NotFound({ entity: "room", message: "Esa sala no existe" });
    if (schedule.openSpaceId !== place.openSpaceId || room.openSpaceId !== place.openSpaceId) {
      return yield* new Invalid({ message: "El bloque y la sala tienen que ser del mismo evento que la charla" });
    }

    if (!place.skipResourceValidation) {
      if (place.needsTV && !room.hasTV) {
        return yield* new Invalid({ message: `La sala "${room.name}" no tiene TV ni proyector` });
      }
      if (place.needsWhiteboard && !room.hasWhiteboard) {
        return yield* new Invalid({ message: `La sala "${room.name}" no tiene pizarra` });
      }
    }

    const occupant = yield* occupantOf(place.scheduleId, place.roomId, place.exceptTrackId);
    if (occupant !== null) return yield* slotTaken(occupant);

    return { schedule, room };
  });

/** An event's talks, newest first. */
export const listNotes = (openSpaceId: string) =>
  query((db) =>
    db.query.tracks.findMany({
      where: eq(tracks.openSpaceId, openSpaceId),
      with: { room: true, schedule: true },
      orderBy: [desc(tracks.createdAt)],
    })
  ).pipe(Effect.map((rows) => rows.map(toStickyNote)));

export const getNote = loadNote;

/** Talks in active rooms with their room and slot, in programme order; optionally only the kiosk-highlighted slots. */
export const listWithPlaces = (openSpaceId: string, highlightedOnly: boolean) =>
  query((db) =>
    db
      .select()
      .from(tracks)
      .innerJoin(rooms, eq(tracks.roomId, rooms.id))
      .innerJoin(schedules, eq(tracks.scheduleId, schedules.id))
      .where(
        and(
          eq(tracks.openSpaceId, openSpaceId),
          // Public feed (EPG, map kiosk): a room switched off takes its talks off screens.
          eq(rooms.isActive, true),
          highlightedOnly ? eq(schedules.highlightInKiosk, true) : undefined
        )
      )
      .orderBy(asc(schedules.date), asc(schedules.startTime))
  ).pipe(
    Effect.map((rows) =>
      rows.map(({ tracks: track, rooms: room, schedules: schedule }): TrackWithRelations => ({
        id: track.id,
        title: track.title,
        speaker: track.speaker || undefined,
        description: track.description || undefined,
        location: room.name,
        needsTV: track.needsTV,
        needsWhiteboard: track.needsWhiteboard,
        openSpaceId: track.openSpaceId,
        scheduleId: track.scheduleId,
        roomId: track.roomId,
        createdAt: track.createdAt.toISOString(),
        updatedAt: track.updatedAt.toISOString(),
        room: { id: room.id, name: room.name, color: room.color },
        schedule: {
          id: schedule.id,
          name: schedule.name,
          startTime: schedule.startTime,
          endTime: schedule.endTime,
          date: schedule.date.toISOString(),
          highlightInKiosk: schedule.highlightInKiosk,
        },
      }))
    )
  );

export const createNote = (input: CreateTrackInput) =>
  Effect.gen(function* () {
    const { schedule, room } = yield* checkPlace(input);
    const [track] = yield* query((db) =>
      db
        .insert(tracks)
        .values({
          title: input.title,
          speaker: input.speaker || null,
          description: input.description || null,
          needsTV: input.needsTV,
          needsWhiteboard: input.needsWhiteboard,
          openSpaceId: input.openSpaceId,
          scheduleId: input.scheduleId,
          roomId: input.roomId,
        })
        .returning()
    ).pipe(Effect.catchTag("UniqueViolation", lostTheRace(input.scheduleId, input.roomId)));

    const note = toStickyNote({ ...track, room, schedule });
    yield* cardChanged({ type: "CARD_CREATE", openSpaceId: note.openSpaceId, cardId: note.id, updatedCard: note });

    return note;
  });

/** Edit a talk; moving it re-checks the new place. Only the fields sent change. */
export const updateNote = (id: string, data: UpdateTrackInput) =>
  Effect.gen(function* () {
    const [current] = yield* query((db) => db.select().from(tracks).where(eq(tracks.id, id)));
    if (!current) return yield* trackNotFound;

    const scheduleId = data.scheduleId ?? current.scheduleId;
    const roomId = data.roomId ?? current.roomId;
    const placeChanges =
      data.scheduleId !== undefined || data.roomId !== undefined || data.needsTV || data.needsWhiteboard;
    if (placeChanges) {
      yield* checkPlace({
        openSpaceId: current.openSpaceId,
        scheduleId,
        roomId,
        needsTV: data.needsTV ?? current.needsTV,
        needsWhiteboard: data.needsWhiteboard ?? current.needsWhiteboard,
        skipResourceValidation: data.skipResourceValidation ?? false,
        exceptTrackId: id,
      });
    }

    yield* query((db) =>
      db
        .update(tracks)
        .set({
          ...(data.title === undefined ? {} : { title: data.title }),
          ...(data.speaker === undefined ? {} : { speaker: data.speaker || null }),
          ...(data.description === undefined ? {} : { description: data.description || null }),
          ...(data.needsTV === undefined ? {} : { needsTV: data.needsTV }),
          ...(data.needsWhiteboard === undefined ? {} : { needsWhiteboard: data.needsWhiteboard }),
          scheduleId,
          roomId,
        })
        .where(eq(tracks.id, id))
    ).pipe(Effect.catchTag("UniqueViolation", lostTheRace(scheduleId, roomId)));

    const note = yield* loadNote(id);
    yield* cardChanged({ type: "CARD_UPDATE", openSpaceId: note.openSpaceId, cardId: note.id, updatedCard: note });

    return note;
  });

/** Delete a talk; if it was on the screens (cast), they are cleared too. */
export const deleteNote = (id: string) =>
  Effect.gen(function* () {
    const note = yield* loadNote(id);
    const [live] = yield* query((db) =>
      db
        .select({ highlightedTrackId: eventLiveState.highlightedTrackId })
        .from(eventLiveState)
        .where(eq(eventLiveState.eventId, note.openSpaceId))
    );
    yield* query((db) => db.delete(tracks).where(eq(tracks.id, id)));

    yield* cardChanged({ type: "CARD_DELETE", openSpaceId: note.openSpaceId, cardId: note.id });
    if (live?.highlightedTrackId === id) {
      const realtime = yield* Realtime;
      yield* realtime.publish(eventChannel(note.openSpaceId, "cast"), "note_highlighted", { note: null });
    }

    return note;
  });

/**
 * Two talks trade places, atomically. Both rows are locked first (in id
 * order, so two swaps can't deadlock), and they must belong to one event.
 * The unique (slot, room) index is checked row by row, so the swap goes
 * through a throwaway slot.
 */
export const swapNotes = (trackAId: string, trackBId: string) =>
  transaction(
    Effect.gen(function* () {
      if (trackAId === trackBId) return yield* new Invalid({ message: "Una charla no se puede cambiar consigo misma" });

      const locked = yield* query((db) =>
        db
          .select()
          .from(tracks)
          .where(inArray(tracks.id, [trackAId, trackBId]))
          .orderBy(asc(tracks.id))
          .for("update")
      );
      const a = locked.find((track) => track.id === trackAId);
      const b = locked.find((track) => track.id === trackBId);
      if (!a || !b) return yield* trackNotFound;
      if (a.openSpaceId !== b.openSpaceId) {
        return yield* new Invalid({ message: "Solo se pueden cambiar charlas del mismo evento" });
      }

      const [parking] = yield* query((db) =>
        db
          .insert(schedules)
          .values({ openSpaceId: a.openSpaceId, name: "swap", startTime: "--", endTime: "--", date: new Date() })
          .returning({ id: schedules.id })
      );
      yield* query((db) => db.update(tracks).set({ scheduleId: parking.id }).where(eq(tracks.id, a.id)));
      yield* query((db) =>
        db.update(tracks).set({ scheduleId: a.scheduleId, roomId: a.roomId }).where(eq(tracks.id, b.id))
      );
      yield* query((db) =>
        db.update(tracks).set({ scheduleId: b.scheduleId, roomId: b.roomId }).where(eq(tracks.id, a.id))
      );
      yield* query((db) => db.delete(schedules).where(eq(schedules.id, parking.id)));

      const notes = [yield* loadNote(a.id), yield* loadNote(b.id)];
      yield* cardChanged({ type: "CARD_SWAP", openSpaceId: a.openSpaceId, cardIds: [a.id, b.id], updatedCards: notes });

      return notes;
    })
  );

/**
 * A slot's time changed (or its talks move to another slot of the same
 * event): every talk in it is touched in one statement and re-sent to the
 * boards with the new label.
 */
export const moveSlot = (input: { scheduleId: string; newTimeSlot: string; newScheduleId?: string }) =>
  transaction(
    Effect.gen(function* () {
      const [schedule] = yield* query((db) => db.select().from(schedules).where(eq(schedules.id, input.scheduleId)));
      if (!schedule) return yield* new NotFound({ entity: "schedule", message: "Ese bloque no existe" });

      const target = input.newScheduleId ?? input.scheduleId;
      if (target !== input.scheduleId) {
        const [next] = yield* query((db) => db.select().from(schedules).where(eq(schedules.id, target)));
        if (!next) return yield* new NotFound({ entity: "schedule", message: "El bloque de destino no existe" });
        if (next.openSpaceId !== schedule.openSpaceId) {
          return yield* new Invalid({ message: "El bloque de destino es de otro evento" });
        }
      }

      const moved = yield* query((db) =>
        db
          .update(tracks)
          .set({ scheduleId: target })
          .where(eq(tracks.scheduleId, input.scheduleId))
          .returning({ id: tracks.id })
      ).pipe(
        Effect.catchTag("UniqueViolation", () =>
          Effect.fail(
            new Conflict({ reason: "slot_taken", message: "El bloque de destino ya tiene charlas en esas salas" })
          )
        )
      );

      const notes = yield* Effect.forEach(moved, ({ id }) => loadNote(id));
      const relabelled = notes.map((note) => ({ ...note, timeSlot: input.newTimeSlot }));
      yield* Effect.forEach(
        relabelled,
        (note) =>
          cardChanged({ type: "CARD_UPDATE", openSpaceId: note.openSpaceId, cardId: note.id, updatedCard: note }),
        { discard: true }
      );

      return relabelled;
    })
  );
