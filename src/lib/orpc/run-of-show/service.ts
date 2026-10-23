import { and, asc, count, eq, inArray, sql } from "drizzle-orm";
import { Effect } from "effect";

import {
  communityMembers,
  events,
  obsCues,
  outboundMessages,
  rooms,
  runOfShowItems,
  schedules,
  type RunOfShowItemRow,
} from "../../db/schema";
import { sendTelegram } from "../../owy/messaging";
import { slotDay, wallClock } from "../../slot-day";
import { query, transaction } from "../db";
import { Conflict, Invalid, NotFound } from "../errors";
import { fireCue, getStatus as obsStatus } from "../obs-control/service";
import { opsPing, recordActivity } from "../ops";
import { CurrentUser } from "../services";
import { eventPhase } from "../shell/service";
import type { CreateMomentInput, GoInput, Moment, RunOfShow, ShiftInput, UpdateMomentInput } from "./schemas";
import { plannedCollisions, rundownStatus, shiftPlan, signed, toClock, toMinutes } from "./timing";

/** Two GOs closer than this are one press (a Stream Deck bounce, a double tap). */
const DOUBLE_PRESS_MS = 1000;

type Row = RunOfShowItemRow & {
  owner: Moment["owner"];
  cue: Moment["cue"];
};

const eventNotFound = new NotFound({ entity: "event", message: "Ese evento no existe" });
const momentNotFound = new NotFound({ entity: "moment", message: "Ese momento no es de este evento" });

/**
 * The event a change is about. With `lock` it stays locked until the transaction ends, so an
 * event's run of show changes one at a time: two GOs at once can't both start the same moment.
 */
const eventOf = (eventId: string, lock = false) =>
  query((db) => {
    const select = db
      .select({
        id: events.id,
        communityId: events.communityId,
        timezone: events.timezone,
        startDate: events.startDate,
        endDate: events.endDate,
      })
      .from(events)
      .where(eq(events.id, eventId));

    return lock ? select.for("update") : select;
  }).pipe(Effect.flatMap(([row]) => (row ? Effect.succeed(row) : Effect.fail(eventNotFound))));

const rowsOf = (eventId: string) =>
  query((db) =>
    db.query.runOfShowItems.findMany({
      where: eq(runOfShowItems.eventId, eventId),
      with: {
        owner: { columns: { id: true, name: true, image: true } },
        cue: { columns: { id: true, name: true, obsScene: true, stageScene: true, sound: true } },
      },
      orderBy: [asc(runOfShowItems.position), asc(runOfShowItems.createdAt)],
    })
  ).pipe(Effect.map((rows): Row[] => rows));

/** Minutes late (+) or early (−) on the event's wall clock, like the shell's footer reads it. */
const driftOf = (row: RunOfShowItemRow, timezone: string) =>
  row.actualStart ? toMinutes(wallClock(row.actualStart, timezone).slice(11)) - toMinutes(row.plannedStart) : null;

const toMoment = (row: Row, timezone: string): Moment => ({
  id: row.id,
  position: row.position,
  title: row.title,
  plannedStart: row.plannedStart,
  durationMin: row.durationMin,
  fixed: row.fixed,
  owner: row.owner,
  location: row.location,
  notes: row.notes,
  cue: row.cue,
  owyMessage: row.owyMessage,
  actualStart: row.actualStart?.toISOString() ?? null,
  actualEnd: row.actualEnd?.toISOString() ?? null,
  driftMin: driftOf(row, timezone),
});

const momentIn = (eventId: string, itemId: string) =>
  Effect.gen(function* () {
    const { timezone } = yield* eventOf(eventId);
    const row = (yield* rowsOf(eventId)).find((candidate) => candidate.id === itemId);
    if (!row) return yield* momentNotFound;

    return toMoment(row, timezone);
  });

export const listRunOfShow = (eventId: string) =>
  Effect.gen(function* () {
    const event = yield* eventOf(eventId);
    const rows = yield* rowsOf(eventId);

    return {
      timezone: event.timezone,
      day: wallClock(event.startDate, event.timezone).slice(0, 10),
      moments: rows.map((row) => toMoment(row, event.timezone)),
    } satisfies RunOfShow;
  });

/** Only someone on the community's staff can own a moment, and only an existing cue can be linked. */
const ensureLinks = (communityId: string, { ownerId, cueId }: { ownerId?: string | null; cueId?: string | null }) =>
  Effect.gen(function* () {
    if (ownerId) {
      const [member] = yield* query((db) =>
        db
          .select({ id: communityMembers.id })
          .from(communityMembers)
          .where(and(eq(communityMembers.communityId, communityId), eq(communityMembers.userId, ownerId)))
      );
      if (!member) return yield* new Invalid({ message: "El responsable tiene que ser del staff de la comunidad" });
    }
    if (cueId) {
      const [cue] = yield* query((db) => db.select({ id: obsCues.id }).from(obsCues).where(eq(obsCues.id, cueId)));
      if (!cue) return yield* new NotFound({ entity: "cue", message: "Ese cue no existe" });
    }
  });

/** Positions 0…n in the given order, in one statement. */
const writeOrder = (eventId: string, ids: readonly string[]) =>
  ids.length === 0
    ? Effect.void
    : query((db) =>
        db
          .update(runOfShowItems)
          .set({
            position: sql`(case ${runOfShowItems.id} ${sql.join(
              ids.map((id, index) => sql`when ${id} then ${index}`),
              sql` `
            )} end)::int`,
          })
          .where(and(eq(runOfShowItems.eventId, eventId), inArray(runOfShowItems.id, [...ids])))
      );

/** A new moment goes where its start falls in the day, after the ones that start at the same time. */
export const createMoment = ({ eventId, ...fields }: CreateMomentInput) =>
  Effect.gen(function* () {
    const itemId = yield* transaction(
      Effect.gen(function* () {
        const event = yield* eventOf(eventId, true);
        yield* ensureLinks(event.communityId, fields);
        const rows = yield* rowsOf(eventId);
        const at = rows.findLastIndex((row) => row.plannedStart <= fields.plannedStart) + 1;
        const [row] = yield* query((db) =>
          db
            .insert(runOfShowItems)
            .values({ eventId, ...fields, position: at })
            .returning({ id: runOfShowItems.id })
        );
        yield* writeOrder(eventId, [...rows.slice(0, at).map((r) => r.id), row.id, ...rows.slice(at).map((r) => r.id)]);
        yield* recordActivity({
          eventId,
          verb: "rundown.created",
          entityType: "rundown",
          entityId: row.id,
          summary: `agregó «${fields.title}» al guion · ${fields.plannedStart}`,
        });

        return row.id;
      })
    );
    yield* opsPing(eventId, "rundown");

    return yield* momentIn(eventId, itemId);
  });

const editSummary = (current: RunOfShowItemRow, data: UpdateMomentInput["data"]) => {
  const title = data.title ?? current.title;
  if (data.plannedStart && data.plannedStart !== current.plannedStart)
    return `movió «${title}» a las ${data.plannedStart}`;
  if (data.durationMin !== undefined && data.durationMin !== current.durationMin) {
    return `dejó «${title}» en ${data.durationMin} min`;
  }
  return `editó «${title}» en el guion`;
};

/** Only the planned side: actual times belong to GO. */
export const updateMoment = ({ eventId, itemId, data }: UpdateMomentInput) =>
  Effect.gen(function* () {
    const changed = yield* transaction(
      Effect.gen(function* () {
        const event = yield* eventOf(eventId);
        const [current] = yield* query((db) =>
          db
            .select()
            .from(runOfShowItems)
            .where(and(eq(runOfShowItems.id, itemId), eq(runOfShowItems.eventId, eventId)))
        );
        if (!current) return yield* momentNotFound;
        if (Object.keys(data).length === 0) return false;
        yield* ensureLinks(event.communityId, data);
        yield* query((db) => db.update(runOfShowItems).set(data).where(eq(runOfShowItems.id, itemId)));
        yield* recordActivity({
          eventId,
          verb: "rundown.updated",
          entityType: "rundown",
          entityId: itemId,
          summary: editSummary(current, data),
        });

        return true;
      })
    );
    if (changed) yield* opsPing(eventId, "rundown");

    return yield* momentIn(eventId, itemId);
  });

export const removeMoment = ({ eventId, itemId }: { eventId: string; itemId: string }) =>
  Effect.gen(function* () {
    yield* transaction(
      Effect.gen(function* () {
        const [row] = yield* query((db) =>
          db
            .delete(runOfShowItems)
            .where(and(eq(runOfShowItems.id, itemId), eq(runOfShowItems.eventId, eventId)))
            .returning({ title: runOfShowItems.title })
        );
        if (!row) return yield* momentNotFound;
        yield* recordActivity({
          eventId,
          verb: "rundown.removed",
          entityType: "rundown",
          entityId: itemId,
          summary: `sacó «${row.title}» del guion`,
        });
      })
    );
    yield* opsPing(eventId, "rundown");

    return { ok: true as const };
  });

/** The listed moments first, in that order, then the rest as they were. Ids from another event are ignored. */
export const reorderMoments = ({ eventId, orderedIds }: { eventId: string; orderedIds: readonly string[] }) =>
  Effect.gen(function* () {
    yield* transaction(
      Effect.gen(function* () {
        yield* eventOf(eventId, true);
        const current = (yield* rowsOf(eventId)).map((row) => row.id);
        const listed = orderedIds.filter((id, index) => current.includes(id) && orderedIds.indexOf(id) === index);
        yield* writeOrder(eventId, [...listed, ...current.filter((id) => !listed.includes(id))]);
        yield* recordActivity({
          eventId,
          verb: "rundown.reordered",
          entityType: "rundown",
          summary: "reordenó el guion",
        });
      })
    );
    yield* opsPing(eventId, "rundown");

    return yield* listRunOfShow(eventId);
  });

/** A side effect of a GO: its failure becomes a line for the operator, never an error. */
const attempt = <E extends { message: string }, R>(
  effect: Effect.Effect<string | null, E, R>,
  explain: (message: string) => string
) => effect.pipe(Effect.catch((error) => Effect.succeed(explain(error.message || "error inesperado"))));

/** Fire the moment's cue; say so when OBS has nobody to put its scene on air. */
const fireMomentCue = (cueId: string, itemId: string) =>
  attempt(
    Effect.gen(function* () {
      const { cue } = yield* fireCue(cueId, `rundown:${itemId}`);
      if (!cue.obsScene) return null;
      const { executorOnline } = yield* obsStatus(cue.instanceId);

      return executorOnline ? null : `OBS no está conectado: la escena «${cue.obsScene}» no salió al aire`;
    }),
    (message) => `El cue no salió: ${message}`
  );

/**
 * GO: the running moment ends and the next one (or the one asked for) starts, at the same
 * instant, so undo can find both. Then its cue fires (OBS scene, wall scene and sound) and Owy
 * posts its message. Those go out after the GO is saved: if one fails, the GO stands and the
 * answer says what didn't go out.
 */
export const go = ({ eventId, itemId }: GoInput) =>
  Effect.gen(function* () {
    const step = yield* transaction(
      Effect.gen(function* () {
        const event = yield* eventOf(eventId, true);
        const rows = yield* rowsOf(eventId);
        const { live, next } = rundownStatus(rows);
        const running = rows[live] ?? null;
        const target = itemId === undefined ? (rows[next] ?? null) : rows.find((row) => row.id === itemId);
        if (target === undefined) return yield* momentNotFound;
        const now = new Date();

        const samePress =
          running &&
          (target?.id === running.id ||
            (itemId === undefined && now.getTime() - (running.actualStart?.getTime() ?? 0) < DOUBLE_PRESS_MS));
        if (samePress) return { timezone: event.timezone, started: running, repeated: true };
        if (target?.actualEnd) {
          return yield* new Conflict({ reason: "moment_done", message: `«${target.title}» ya se hizo` });
        }
        if (!target && !running) {
          return yield* new Conflict({ reason: "rundown_over", message: "No quedan momentos en el guion" });
        }

        if (running) {
          yield* query((db) =>
            db.update(runOfShowItems).set({ actualEnd: now }).where(eq(runOfShowItems.id, running.id))
          );
        }
        if (target) {
          yield* query((db) =>
            db.update(runOfShowItems).set({ actualStart: now, actualEnd: null }).where(eq(runOfShowItems.id, target.id))
          );
        }
        const drift = target ? toMinutes(wallClock(now, event.timezone).slice(11)) - toMinutes(target.plannedStart) : 0;
        yield* recordActivity({
          eventId,
          verb: "rundown.go",
          entityType: "rundown",
          entityId: target?.id ?? running?.id,
          summary: target
            ? `dio GO a «${target.title}»${drift ? ` · ${signed(drift)} min` : ""}`
            : `cerró «${running?.title}», el último momento del guion`,
        });

        return {
          timezone: event.timezone,
          started: target ? { ...target, actualStart: now, actualEnd: null } : null,
          repeated: false,
        };
      })
    );
    const item = step.started ? toMoment(step.started, step.timezone) : null;
    if (step.repeated) return { item, warnings: [], repeated: true };

    yield* opsPing(eventId, "rundown");
    const warnings: string[] = [];
    if (step.started?.cueId) {
      const warning = yield* fireMomentCue(step.started.cueId, step.started.id);
      if (warning) warnings.push(warning);
    }
    if (step.started?.owyMessage) {
      const body = step.started.owyMessage;
      const warning = yield* attempt(
        sendTelegram(body).pipe(Effect.as(null)),
        (message) => `Owy no pudo avisar: ${message}`
      );
      if (warning) warnings.push(warning);
      // What the guion said goes to the same message log as everything else Owy sends.
      const me = yield* CurrentUser;
      yield* query((db) =>
        db.insert(outboundMessages).values({
          eventId,
          channel: "telegram",
          body,
          status: warning ? "failed" : "sent",
          sentAt: warning ? null : new Date(),
          error: warning,
          createdById: me.id,
        })
      );
      yield* opsPing(eventId, "comms");
    }

    return { item, warnings, repeated: false };
  });

/**
 * Undo the last GO: the moments it started go back to pending and the one it closed runs again.
 * The last GO is the latest instant on the guion (GO stamps both sides with the same one). The
 * cue already fired stays fired.
 */
export const undoGo = ({ eventId }: { eventId: string }) =>
  Effect.gen(function* () {
    const item = yield* transaction(
      Effect.gen(function* () {
        const event = yield* eventOf(eventId, true);
        const rows = yield* rowsOf(eventId);
        const stamps = rows
          .flatMap((row) => [row.actualStart, row.actualEnd])
          .flatMap((at) => (at ? [at.getTime()] : []));
        if (stamps.length === 0) {
          return yield* new Conflict({ reason: "nothing_to_undo", message: "No hay un GO para deshacer" });
        }
        const last = Math.max(...stamps);
        const started = rows.filter((row) => row.actualStart?.getTime() === last);
        const closed = rows.filter((row) => row.actualEnd?.getTime() === last && row.actualStart?.getTime() !== last);
        if (started.length > 0) {
          yield* query((db) =>
            db
              .update(runOfShowItems)
              .set({ actualStart: null, actualEnd: null })
              .where(
                inArray(
                  runOfShowItems.id,
                  started.map((row) => row.id)
                )
              )
          );
        }
        if (closed.length > 0) {
          yield* query((db) =>
            db
              .update(runOfShowItems)
              .set({ actualEnd: null })
              .where(
                inArray(
                  runOfShowItems.id,
                  closed.map((row) => row.id)
                )
              )
          );
        }
        yield* recordActivity({
          eventId,
          verb: "rundown.undo",
          entityType: "rundown",
          entityId: (started[0] ?? closed[0]).id,
          summary: started[0]
            ? `deshizo el GO de «${started[0].title}»`
            : `volvió a poner en curso «${closed[0].title}»`,
        });

        return closed[0] ? toMoment({ ...closed[0], actualEnd: null }, event.timezone) : null;
      })
    );
    yield* opsPing(eventId, "rundown");

    return { item };
  });

/** "Correr horarios" (see `shiftPlan`): which moments moved, and which of them now run into a fixed start. */
export const shiftMoments = ({ eventId, fromItemId, minutes }: ShiftInput) =>
  Effect.gen(function* () {
    const result = yield* transaction(
      Effect.gen(function* () {
        yield* eventOf(eventId, true);
        const rows = yield* rowsOf(eventId);
        if (!rows.some((row) => row.id === fromItemId)) return yield* momentNotFound;
        const { moved } = shiftPlan(rows, fromItemId, minutes);
        if (moved.length === 0) return { moved: 0, collisions: [] };

        const starts = new Map(moved.map(({ moment, plannedStart }) => [moment.id, plannedStart]));
        yield* query((db) =>
          db
            .update(runOfShowItems)
            .set({
              plannedStart: sql`case ${runOfShowItems.id} ${sql.join(
                moved.map(({ moment, plannedStart }) => sql`when ${moment.id} then ${plannedStart}`),
                sql` `
              )} end`,
            })
            .where(inArray(runOfShowItems.id, [...starts.keys()]))
        );
        const first = moved[0].moment.title;
        yield* recordActivity({
          eventId,
          verb: "rundown.shifted",
          entityType: "rundown",
          entityId: moved[0].moment.id,
          summary:
            moved.length === 1
              ? `corrió «${first}» ${signed(minutes)} min`
              : `corrió ${moved.length} momentos ${signed(minutes)} min desde «${first}»`,
        });
        const after = rows.map((row) => ({ ...row, plannedStart: starts.get(row.id) ?? row.plannedStart }));

        return {
          moved: moved.length,
          collisions: plannedCollisions(after).filter((collision) => starts.has(collision.momentId)),
        };
      })
    );
    if (result.moved > 0) yield* opsPing(eventId, "rundown");

    return result;
  });

/**
 * A first guion from the board: doors at the event's start, one moment per time slot of its day,
 * and a fixed closing before the venue does. Only on an empty guion.
 */
export const importProgram = ({ eventId }: { eventId: string }) =>
  Effect.gen(function* () {
    yield* transaction(
      Effect.gen(function* () {
        const event = yield* eventOf(eventId, true);
        const [existing] = yield* query((db) =>
          db.select({ value: count() }).from(runOfShowItems).where(eq(runOfShowItems.eventId, eventId))
        );
        if ((existing?.value ?? 0) > 0) {
          return yield* new Conflict({ reason: "rundown_not_empty", message: "El guion ya tiene momentos" });
        }

        const [day, opening] = wallClock(event.startDate, event.timezone).split("T");
        const [lastDay, closing] = wallClock(event.endDate, event.timezone).split("T");
        const slots = (yield* query((db) =>
          db
            .select({
              name: schedules.name,
              date: schedules.date,
              startTime: schedules.startTime,
              endTime: schedules.endTime,
            })
            .from(schedules)
            .where(and(eq(schedules.openSpaceId, eventId), eq(schedules.isActive, true)))
        ))
          .filter((slot) => slotDay(slot.date.toISOString()) === day)
          .toSorted((a, b) => a.startTime.localeCompare(b.startTime));
        const [roomCount] = yield* query((db) =>
          db
            .select({ value: count() })
            .from(rooms)
            .where(and(eq(rooms.openSpaceId, eventId), eq(rooms.isActive, true)))
        );
        const salas = roomCount?.value ?? 0;
        const firstSlot = slots[0] ? toMinutes(slots[0].startTime) - toMinutes(opening) : 0;

        const moments = [
          {
            title: "Apertura y acreditación",
            plannedStart: opening,
            durationMin: firstSlot > 0 ? Math.min(30, firstSlot) : 30,
            fixed: false,
            location: "Entrada",
          },
          ...slots.map((slot) => ({
            title: `Open space · ${slot.name || slot.startTime}`,
            plannedStart: slot.startTime,
            durationMin: Math.max(0, toMinutes(slot.endTime) - toMinutes(slot.startTime)),
            fixed: false,
            location: salas > 0 ? `${salas} ${salas === 1 ? "sala" : "salas"}` : null,
          })),
          // The venue closes at the event's end: the goodbye can't slide past it.
          ...(lastDay === day
            ? [
                {
                  title: "Cierre",
                  plannedStart: toClock(toMinutes(closing) - 15),
                  durationMin: 15,
                  fixed: true,
                  location: null,
                },
              ]
            : []),
        ].toSorted((a, b) => a.plannedStart.localeCompare(b.plannedStart));

        yield* query((db) =>
          db.insert(runOfShowItems).values(moments.map((moment, position) => ({ ...moment, eventId, position })))
        );
        yield* recordActivity({
          eventId,
          verb: "rundown.imported",
          entityType: "rundown",
          summary: `armó el guion con ${moments.length} momentos del programa`,
        });
      })
    );
    yield* opsPing(eventId, "rundown");

    return yield* listRunOfShow(eventId);
  });

/**
 * The event a Stream Deck GO is about when it doesn't say: the one with a moment running, else
 * the one whose day is today. Null when there's none, or more than one.
 */
export const liveEventId = () =>
  Effect.gen(function* () {
    const now = new Date();
    const candidates = yield* query((db) =>
      db
        .select({
          id: events.id,
          startDate: events.startDate,
          endDate: events.endDate,
          timezone: events.timezone,
          running: sql<boolean>`bool_or(${runOfShowItems.actualStart} is not null and ${runOfShowItems.actualEnd} is null)`,
          cued: sql<boolean>`bool_or(${runOfShowItems.cueId} is not null)`,
        })
        .from(events)
        .innerJoin(runOfShowItems, eq(runOfShowItems.eventId, events.id))
        .groupBy(events.id)
    );
    const running = candidates.filter((candidate) => candidate.running);
    const pool =
      running.length > 0 ? running : candidates.filter((candidate) => eventPhase(candidate, now).phase === "live");
    // A meetup's agenda (Organizá, no cues) the same night doesn't take the Stream Deck from the stage
    const staged = pool.length > 1 ? pool.filter((candidate) => candidate.cued) : pool;

    return { eventId: staged.length === 1 ? staged[0].id : null };
  });
