import { and, asc, desc, eq, gt, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";
import { Effect } from "effect";

import { obsCommands, obsCues, obsInstances } from "../../db/schema";
import { soundEvent } from "../../launchpad/sounds";
import { GLOBAL_CHANNELS, obsControlChannel } from "../../realtime/channels";
import { query, transaction } from "../db";
import { NotFound } from "../errors";
import { ensureInstance, lockInstance } from "../obs-queue/service";
import { setScene } from "../owy-stage/services";
import { Realtime } from "../services";
import {
  CUE_COLORS,
  type Command,
  type CreateCueInput,
  type Cue,
  type CueColor,
  type ObsReport,
  type ObsStatus,
  type SerializedCommand,
  type UpdateCueInput,
} from "./schemas";

/** An executor that has not reported for this long has lost the room. */
export const EXECUTOR_STALE_MS = 30_000;
/** A command nobody executed within this window is dropped, never replayed late. */
const COMMAND_STALE_MS = 30_000;
/** Two TAKEs closer than this are one press (Stream Deck bounce, double tap). */
const DOUBLE_PRESS_MS = 500;
/** How long finished commands stay in the history. */
const HISTORY_DAYS = 14;

type InstanceRow = typeof obsInstances.$inferSelect;
type CommandRow = typeof obsCommands.$inferSelect;
type CueRow = typeof obsCues.$inferSelect;

const ago = (ms: number) => new Date(Date.now() - ms);

const toStatus = (row: InstanceRow): ObsStatus => {
  const executorOnline =
    Boolean(row.executorId) && (row.executorSeenAt?.getTime() ?? 0) > Date.now() - EXECUTOR_STALE_MS;

  return {
    instanceId: row.id,
    connected: executorOnline && row.connected,
    programScene: row.programScene,
    previewScene: row.previewScene,
    studioMode: row.studioMode,
    transitionName: row.transitionName,
    transitionMs: row.transitionMs,
    streaming: row.streaming,
    recording: row.recording,
    lastError: row.lastError,
    scenes: row.scenes,
    audioInputs: row.audioInputs,
    executorId: executorOnline ? row.executorId : null,
    executorOnline,
    statusAt: row.statusAt?.toISOString() ?? null,
    currentCueId: row.currentCueId,
  };
};

const publish = (instanceId: number, event: string, payload: unknown) =>
  Effect.gen(function* () {
    const realtime = yield* Realtime;
    yield* realtime.publish(obsControlChannel(instanceId), event, payload);
  });

export const getStatus = (instanceId: number) =>
  Effect.gen(function* () {
    yield* ensureInstance(instanceId);
    const [row] = yield* query((db) => db.select().from(obsInstances).where(eq(obsInstances.id, instanceId)));

    return toStatus(row);
  });

/** Every control screen follows the rig's status over realtime. */
const publishStatus = (instanceId: number) =>
  Effect.gen(function* () {
    const status = yield* getStatus(instanceId);
    yield* publish(instanceId, "status", status);

    return status;
  });

// ---------------------------------------------------------------------------
// Command bus
// ---------------------------------------------------------------------------

export const serializeCommand = (row: CommandRow): SerializedCommand => ({
  id: row.id,
  instanceId: row.instanceId,
  type: row.type as Command["type"],
  payload: row.payload,
  source: row.source,
  status: row.status,
  error: row.error,
  createdAt: row.createdAt.toISOString(),
  doneAt: row.doneAt?.toISOString() ?? null,
});

/**
 * Queue a command for the executor tab: a row (the safety net, drained on
 * reconnect) plus a realtime `command` event (the fast path). A TAKE or CUT
 * right after another is the same press; the rig is locked while that is
 * checked, so two presses at once can't both get through.
 */
export const sendCommand = (input: Command & { instanceId: number }, source: string) =>
  Effect.gen(function* () {
    const { row, repeated } = yield* transaction(
      Effect.gen(function* () {
        yield* lockInstance(input.instanceId);
        if (input.type === "take" || input.type === "cut") {
          const [recent] = yield* query((db) =>
            db
              .select()
              .from(obsCommands)
              .where(
                and(
                  eq(obsCommands.instanceId, input.instanceId),
                  eq(obsCommands.type, input.type),
                  gt(obsCommands.createdAt, ago(DOUBLE_PRESS_MS))
                )
              )
              .limit(1)
          );
          if (recent) return { row: recent, repeated: true };
        }
        const [queued] = yield* query((db) =>
          db
            .insert(obsCommands)
            .values({ instanceId: input.instanceId, type: input.type, payload: input.payload, source })
            .returning()
        );

        return { row: queued, repeated: false };
      })
    );
    if (!repeated) yield* publish(input.instanceId, "command", serializeCommand(row));
    const { executorOnline } = yield* getStatus(input.instanceId);

    return { id: row.id, executorOnline };
  });

/** Commands still waiting, oldest first. Anything older than the window is skipped for good. */
export const pendingCommands = (instanceId: number) =>
  Effect.gen(function* () {
    yield* query((db) =>
      db
        .update(obsCommands)
        .set({ status: "skipped", doneAt: new Date(), error: "Nadie lo ejecutó a tiempo" })
        .where(
          and(
            eq(obsCommands.instanceId, instanceId),
            eq(obsCommands.status, "pending"),
            lt(obsCommands.createdAt, ago(COMMAND_STALE_MS))
          )
        )
    );
    // The executor drains on every (re)connect: a good moment to forget old history.
    yield* query((db) =>
      db.delete(obsCommands).where(
        and(
          eq(obsCommands.instanceId, instanceId),
          ne(obsCommands.status, "pending"),
          // createdAt is the database's clock, so the cutoff is too.
          lt(obsCommands.createdAt, sql`now() - make_interval(days => ${HISTORY_DAYS})`)
        )
      )
    );
    const rows = yield* query((db) =>
      db
        .select()
        .from(obsCommands)
        .where(and(eq(obsCommands.instanceId, instanceId), eq(obsCommands.status, "pending")))
        .orderBy(asc(obsCommands.createdAt))
        .limit(50)
    );

    return rows.map(serializeCommand);
  });

export const ackCommand = ({ id, ok, error }: { id: string; ok: boolean; error?: string }) =>
  query((db) =>
    db
      .update(obsCommands)
      .set({ status: ok ? "done" : "failed", error: ok ? null : (error ?? "Error"), doneAt: new Date() })
      .where(eq(obsCommands.id, id))
  ).pipe(Effect.as({ ok: true as const }));

export const listCommands = ({ instanceId, limit }: { instanceId: number; limit: number }) =>
  query((db) =>
    db
      .select()
      .from(obsCommands)
      .where(eq(obsCommands.instanceId, instanceId))
      .orderBy(desc(obsCommands.createdAt))
      .limit(limit)
  ).pipe(Effect.map((rows) => rows.map(serializeCommand)));

// ---------------------------------------------------------------------------
// Executor election + status
// ---------------------------------------------------------------------------

/** The seat is up for grabs: nobody holds it, or its holder stopped reporting. */
const seatFree = () =>
  or(
    isNull(obsInstances.executorId),
    isNull(obsInstances.executorSeenAt),
    lt(obsInstances.executorSeenAt, ago(EXECUTOR_STALE_MS))
  );

/**
 * Become the executor if the seat is free, already ours, stale, or `force`
 * ("Tomar el control"). Returns the status so the caller can tell who won.
 */
export const claimExecutor = ({
  instanceId,
  executorId,
  force,
}: {
  instanceId: number;
  executorId: string;
  force: boolean;
}) =>
  Effect.gen(function* () {
    yield* ensureInstance(instanceId);
    yield* query((db) =>
      db
        .update(obsInstances)
        .set({ executorId, executorSeenAt: new Date() })
        .where(
          and(
            eq(obsInstances.id, instanceId),
            force ? undefined : or(seatFree(), eq(obsInstances.executorId, executorId))
          )
        )
    );

    return yield* publishStatus(instanceId);
  });

/** Give the seat up (tab closing, OBS dropped) so another connected tab can take it at once. */
export const releaseExecutor = ({ instanceId, executorId }: { instanceId: number; executorId: string }) =>
  Effect.gen(function* () {
    yield* query((db) =>
      db
        .update(obsInstances)
        .set({ executorId: null, executorSeenAt: null, connected: false })
        .where(and(eq(obsInstances.id, instanceId), eq(obsInstances.executorId, executorId)))
    );

    return yield* publishStatus(instanceId);
  });

/** Heartbeat + the executor's view of OBS. Ignored (and reported as such) if the seat belongs to someone else. */
export const reportStatus = ({
  instanceId,
  executorId,
  status,
}: {
  instanceId: number;
  executorId: string;
  status: ObsReport;
}) =>
  Effect.gen(function* () {
    yield* ensureInstance(instanceId);
    yield* query((db) =>
      db
        .update(obsInstances)
        .set({ ...status, executorId, executorSeenAt: new Date(), statusAt: new Date() })
        .where(and(eq(obsInstances.id, instanceId), or(seatFree(), eq(obsInstances.executorId, executorId))))
    );

    return yield* publishStatus(instanceId);
  });

// ---------------------------------------------------------------------------
// Cues (the rundown)
// ---------------------------------------------------------------------------

export const serializeCue = (row: CueRow): Cue => ({
  id: row.id,
  instanceId: row.instanceId,
  name: row.name,
  color: (CUE_COLORS as readonly string[]).includes(row.color ?? "") ? (row.color as CueColor) : null,
  obsScene: row.obsScene,
  transition: row.transition,
  transitionMs: row.transitionMs,
  stageScene: row.stageScene,
  stageParams: row.stageParams,
  sound: row.sound,
  notes: row.notes,
  hotkey: row.hotkey,
  position: row.position,
});

const cueNotFound = new NotFound({ entity: "cue", message: "Ese cue no existe" });

export const listCues = (instanceId: number) =>
  query((db) =>
    db
      .select()
      .from(obsCues)
      .where(eq(obsCues.instanceId, instanceId))
      .orderBy(asc(obsCues.position), asc(obsCues.createdAt))
  ).pipe(Effect.map((rows) => rows.map(serializeCue)));

const publishCues = (instanceId: number) =>
  Effect.gen(function* () {
    const cues = yield* listCues(instanceId);
    yield* publish(instanceId, "cues", cues);

    return cues;
  });

/** A new cue goes to the end of the rundown. */
export const createCue = (input: CreateCueInput) =>
  Effect.gen(function* () {
    yield* ensureInstance(input.instanceId);
    const [row] = yield* query((db) =>
      db
        .insert(obsCues)
        .values({
          ...input,
          position: sql`(select coalesce(max(${obsCues.position}), -1) + 1 from ${obsCues} where ${obsCues.instanceId} = ${input.instanceId})`,
        })
        .returning()
    );
    yield* publishCues(input.instanceId);

    return serializeCue(row);
  });

export const updateCue = ({ id, ...fields }: UpdateCueInput) =>
  Effect.gen(function* () {
    const [row] = yield* query((db) => db.update(obsCues).set(fields).where(eq(obsCues.id, id)).returning());
    if (!row) return yield* cueNotFound;
    yield* publishCues(row.instanceId);

    return serializeCue(row);
  });

export const removeCue = (id: string) =>
  Effect.gen(function* () {
    const [row] = yield* query((db) => db.delete(obsCues).where(eq(obsCues.id, id)).returning());
    if (row) yield* publishCues(row.instanceId);

    return { ok: true as const };
  });

/** Rewrite the rundown order; ids from another rig are ignored. */
export const reorderCues = ({ instanceId, ids }: { instanceId: number; ids: string[] }) =>
  Effect.gen(function* () {
    if (ids.length > 0) {
      yield* query((db) =>
        db
          .update(obsCues)
          .set({
            position: sql`case ${sql.join(
              ids.map((id, position) => sql`when ${obsCues.id} = ${id} then ${position}::integer`),
              sql` `
            )} end`,
          })
          .where(and(eq(obsCues.instanceId, instanceId), inArray(obsCues.id, ids)))
      );
    }

    return yield* publishCues(instanceId);
  });

/**
 * What a press does once the rundown points at the cue: queue the OBS scene
 * for the executor, put the wall scene up and fire the launchpad sound. Each
 * leg is independent, so a rig that is down never blocks the others.
 */
const play = (cue: Cue, source: string) =>
  Effect.gen(function* () {
    const command = cue.obsScene
      ? yield* sendCommand(
          {
            instanceId: cue.instanceId,
            type: "scene",
            payload: {
              sceneName: cue.obsScene,
              ...(cue.transition ? { transition: cue.transition } : {}),
              ...(cue.transitionMs === null ? {} : { transitionMs: cue.transitionMs }),
              cue: cue.name,
            },
          },
          source
        )
      : null;
    if (cue.stageScene) {
      const scene = { scene: cue.stageScene as never, params: cue.stageParams ?? {} };
      yield* Effect.tryPromise(() => setScene(scene)).pipe(
        Effect.catch((error) => Effect.logWarning("A cue's wall scene failed", error))
      );
    }
    const sound = cue.sound ? soundEvent(cue.sound) : null;
    if (sound) {
      const realtime = yield* Realtime;
      yield* realtime.publish(GLOBAL_CHANNELS.launchpad, "play_sound", sound);
    }
    yield* publishStatus(cue.instanceId);

    return { cue, commandId: command?.id ?? null };
  });

const pointAt = (cue: Cue) =>
  query((db) => db.update(obsInstances).set({ currentCueId: cue.id }).where(eq(obsInstances.id, cue.instanceId)));

/** One press on a given cue. */
export const fireCue = (id: string, source: string) =>
  Effect.gen(function* () {
    const [row] = yield* query((db) => db.select().from(obsCues).where(eq(obsCues.id, id)));
    if (!row) return yield* cueNotFound;
    const cue = serializeCue(row);
    yield* pointAt(cue);

    return yield* play(cue, source);
  });

/**
 * Fire the cue after (or before) the current one, wrapping around. The rig is
 * locked while the pointer moves, so two NEXT presses at once step twice.
 */
export const stepCue = (
  { instanceId, direction }: { instanceId: number; direction: "next" | "prev" },
  source: string
) =>
  Effect.gen(function* () {
    const target = yield* transaction(
      Effect.gen(function* () {
        const rig = yield* lockInstance(instanceId);
        const cues = yield* listCues(instanceId);
        if (cues.length === 0) return null;
        const current = cues.findIndex((cue) => cue.id === rig.currentCueId);
        const index = direction === "next" ? (current + 1) % cues.length : current <= 0 ? cues.length - 1 : current - 1;
        yield* pointAt(cues[index]);

        return cues[index];
      })
    );

    return target ? yield* play(target, source) : null;
  });
