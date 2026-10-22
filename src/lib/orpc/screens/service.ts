import { asc, desc, eq, sql } from "drizzle-orm";
import { Effect } from "effect";

import { screens, type ScreenRow } from "../../db/schema";
import { GLOBAL_CHANNELS } from "../../realtime/channels";
import { query, transaction } from "../db";
import { NotFound } from "../errors";
import { opsPing, recordActivity } from "../ops";
import { Realtime } from "../services";
import { screenLabel, type BeatInput, type Screen, type ScreenSignal } from "./schemas";

/** Seen within a minute is online, here and in the shell's "6/7" in the sidebar. */
export const ONLINE_MS = 60_000;

const toScreen = (row: ScreenRow, now: number): Screen => ({
  id: row.id,
  name: row.name,
  path: row.path,
  label: screenLabel(row.path) ?? row.path,
  userAgent: row.userAgent,
  online: now - row.lastSeenAt.getTime() < ONLINE_MS,
  lastSeenAt: row.lastSeenAt.toISOString(),
  createdAt: row.createdAt.toISOString(),
});

const screenNotFound = new NotFound({ entity: "screen", message: "Esa pantalla ya no está en la lista" });

/**
 * A display says it is alive and what it shows. The name is never part of a beat: only the
 * admin names a screen, so a display that reloads can't undo it.
 */
export const beat = ({ id, path, eventId, userAgent }: BeatInput) => {
  const now = new Date();

  return query((db) =>
    db
      .insert(screens)
      .values({ id, path, userAgent, eventId: eventId ?? null, lastSeenAt: now })
      .onConflictDoUpdate({
        target: screens.id,
        set: { path, userAgent, lastSeenAt: now, ...(eventId === undefined ? {} : { eventId }) },
      })
  ).pipe(
    Effect.catchTag("ForeignKeyViolation", () =>
      Effect.fail(new NotFound({ entity: "event", message: "Ese evento no existe" }))
    ),
    Effect.as({ ok: true as const })
  );
};

/** An event's screens: named ones first, alphabetically; unnamed ones after, most recent first. */
export const listScreens = (eventId: string) =>
  query((db) =>
    db
      .select()
      .from(screens)
      .where(eq(screens.eventId, eventId))
      .orderBy(sql`${screens.name} = ''`, asc(screens.name), desc(screens.lastSeenAt))
  ).pipe(Effect.map((rows) => rows.map((row) => toScreen(row, Date.now()))));

export const renameScreen = ({ id, name }: { id: string; name: string }) =>
  Effect.gen(function* () {
    const row = yield* transaction(
      Effect.gen(function* () {
        const [row] = yield* query((db) => db.update(screens).set({ name }).where(eq(screens.id, id)).returning());
        if (!row) return yield* Effect.fail(screenNotFound);
        yield* recordActivity({
          eventId: row.eventId,
          verb: "screen.renamed",
          entityType: "screen",
          entityId: row.id,
          summary: `nombró la pantalla «${name}»`,
        });

        return row;
      })
    );
    if (row.eventId) yield* opsPing(row.eventId, "screens");

    return toScreen(row, Date.now());
  });

/** Drop a screen from the list. One that is still on comes back, unnamed, with its next beat. */
export const forgetScreen = (id: string) =>
  Effect.gen(function* () {
    const row = yield* transaction(
      Effect.gen(function* () {
        const [row] = yield* query((db) => db.delete(screens).where(eq(screens.id, id)).returning());
        if (!row) return yield* Effect.fail(screenNotFound);
        yield* recordActivity({
          eventId: row.eventId,
          verb: "screen.forgotten",
          entityType: "screen",
          entityId: row.id,
          summary: `olvidó la pantalla «${row.name || "sin nombre"}»`,
        });

        return row;
      })
    );
    if (row.eventId) yield* opsPing(row.eventId, "screens");

    return { ok: true as const };
  });

/** Tell one display to show its name (identify) or to reload. Only that display acts on it. */
export const signalScreen = (id: string, signal: "identify" | "reload") =>
  Effect.gen(function* () {
    const [row] = yield* query((db) => db.select().from(screens).where(eq(screens.id, id)));
    if (!row) return yield* Effect.fail(screenNotFound);
    const payload: ScreenSignal =
      signal === "identify" ? { id: row.id, name: row.name, label: screenLabel(row.path) ?? "" } : { id: row.id };
    const realtime = yield* Realtime;
    yield* realtime.publish(GLOBAL_CHANNELS.screens, signal, payload);

    return { ok: true as const };
  });
