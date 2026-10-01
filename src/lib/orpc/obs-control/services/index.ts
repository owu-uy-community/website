import { and, asc, desc, eq, gt, inArray, isNull, lt, or, sql } from "drizzle-orm";

import { db } from "../../../db";
import { obsCommands, obsCues, obsInstances } from "../../../db/schema";
import { soundEvent } from "../../../launchpad/sounds";
import { GLOBAL_CHANNELS, obsControlChannel } from "../../../realtime/channels";
import { publishServer } from "../../../realtime/publish";
import { getState as getQueueState } from "../../obs-queue/services/get-state";
import { updateState as updateQueueState } from "../../obs-queue/services/update-state";
import { setScene } from "../../owy-stage/services";
import {
  CUE_COLORS,
  type Command,
  type CreateCueInput,
  type CueColor,
  type ObsReport,
  type UpdateCueInput,
} from "../schemas";

/** An executor that has not reported for this long has lost the room. */
export const EXECUTOR_STALE_MS = 30_000;
/** A command nobody executed within this window is dropped, never replayed late. */
const COMMAND_STALE_MS = 30_000;
/** Two TAKEs closer than this are one press (Stream Deck bounce, double tap). */
const DOUBLE_PRESS_MS = 500;

type InstanceRow = typeof obsInstances.$inferSelect;
export type CommandRow = typeof obsCommands.$inferSelect;
export type CueRow = typeof obsCues.$inferSelect;

export interface ObsStatus extends ObsReport {
  instanceId: number;
  executorId: string | null;
  executorOnline: boolean;
  statusAt: string | null;
  currentCueId: string | null;
}

function toStatus(row: InstanceRow): ObsStatus {
  const seen = row.executorSeenAt?.getTime() ?? 0;
  const executorOnline = Boolean(row.executorId) && Date.now() - seen < EXECUTOR_STALE_MS;

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
}

async function ensureInstance(instanceId: number): Promise<InstanceRow> {
  await db.insert(obsInstances).values({ id: instanceId }).onConflictDoNothing();
  const [row] = await db.select().from(obsInstances).where(eq(obsInstances.id, instanceId)).limit(1);
  if (!row) throw new Error("Failed to load OBS instance");

  return row;
}

async function publishStatus(instanceId: number): Promise<ObsStatus> {
  const status = toStatus(await ensureInstance(instanceId));
  await publishServer(obsControlChannel(instanceId), "status", status);

  return status;
}

export async function getObsStatus({ instanceId }: { instanceId: number }): Promise<ObsStatus> {
  return toStatus(await ensureInstance(instanceId));
}

// ---------------------------------------------------------------------------
// Command bus
// ---------------------------------------------------------------------------

/**
 * Queue a command for the executor tab: a row (the safety net, drained on
 * reconnect) plus a realtime `command` event (the fast path).
 */
export async function sendCommand(
  input: Command & { instanceId: number },
  source: string
): Promise<{ id: string; executorOnline: boolean }> {
  const instance = await ensureInstance(input.instanceId);

  if (input.type === "take" || input.type === "cut") {
    const [recent] = await db
      .select({ id: obsCommands.id })
      .from(obsCommands)
      .where(
        and(
          eq(obsCommands.instanceId, input.instanceId),
          eq(obsCommands.type, input.type),
          gt(obsCommands.createdAt, new Date(Date.now() - DOUBLE_PRESS_MS))
        )
      )
      .limit(1);
    if (recent) return { id: recent.id, executorOnline: toStatus(instance).executorOnline };
  }

  const [row] = await db
    .insert(obsCommands)
    .values({ instanceId: input.instanceId, type: input.type, payload: input.payload, source })
    .returning();
  if (!row) throw new Error("Failed to queue the command");

  await publishServer(obsControlChannel(input.instanceId), "command", serializeCommand(row));

  return { id: row.id, executorOnline: toStatus(instance).executorOnline };
}

export function serializeCommand(row: CommandRow) {
  return {
    id: row.id,
    instanceId: row.instanceId,
    type: row.type as Command["type"],
    payload: row.payload,
    source: row.source,
    status: row.status,
    error: row.error,
    createdAt: row.createdAt.toISOString(),
    doneAt: row.doneAt?.toISOString() ?? null,
  };
}
export type SerializedCommand = ReturnType<typeof serializeCommand>;

/** Commands still waiting, oldest first; anything older than the window is skipped for good. */
export async function pendingCommands({ instanceId }: { instanceId: number }): Promise<SerializedCommand[]> {
  const staleBefore = new Date(Date.now() - COMMAND_STALE_MS);
  await db
    .update(obsCommands)
    .set({ status: "skipped", doneAt: new Date(), error: "Nadie lo ejecutó a tiempo" })
    .where(
      and(
        eq(obsCommands.instanceId, instanceId),
        eq(obsCommands.status, "pending"),
        lt(obsCommands.createdAt, staleBefore)
      )
    );

  const rows = await db
    .select()
    .from(obsCommands)
    .where(and(eq(obsCommands.instanceId, instanceId), eq(obsCommands.status, "pending")))
    .orderBy(asc(obsCommands.createdAt))
    .limit(50);

  return rows.map(serializeCommand);
}

export async function ackCommand({ id, ok, error }: { id: string; ok: boolean; error?: string }): Promise<void> {
  await db
    .update(obsCommands)
    .set({ status: ok ? "done" : "failed", error: ok ? null : (error ?? "Error"), doneAt: new Date() })
    .where(eq(obsCommands.id, id));
}

export async function listCommands({
  instanceId,
  limit,
}: {
  instanceId: number;
  limit: number;
}): Promise<SerializedCommand[]> {
  const rows = await db
    .select()
    .from(obsCommands)
    .where(eq(obsCommands.instanceId, instanceId))
    .orderBy(desc(obsCommands.createdAt))
    .limit(limit);

  return rows.map(serializeCommand);
}

// ---------------------------------------------------------------------------
// Executor election + status
// ---------------------------------------------------------------------------

/**
 * Become the executor if the seat is free, already ours, stale, or `force`
 * ("Tomar el control"). Returns the status so the caller can tell who won.
 */
export async function claimExecutor({
  instanceId,
  executorId,
  force,
}: {
  instanceId: number;
  executorId: string;
  force: boolean;
}): Promise<ObsStatus> {
  await ensureInstance(instanceId);
  const staleBefore = new Date(Date.now() - EXECUTOR_STALE_MS);
  await db
    .update(obsInstances)
    .set({ executorId, executorSeenAt: new Date() })
    .where(
      and(
        eq(obsInstances.id, instanceId),
        or(
          isNull(obsInstances.executorId),
          eq(obsInstances.executorId, executorId),
          isNull(obsInstances.executorSeenAt),
          lt(obsInstances.executorSeenAt, staleBefore),
          force ? sql`true` : sql`false`
        )
      )
    );

  return publishStatus(instanceId);
}

/** Give the seat up (tab closing, OBS dropped) so another connected tab can take it at once. */
export async function releaseExecutor({
  instanceId,
  executorId,
}: {
  instanceId: number;
  executorId: string;
}): Promise<ObsStatus> {
  await db
    .update(obsInstances)
    .set({ executorId: null, executorSeenAt: null, connected: false })
    .where(and(eq(obsInstances.id, instanceId), eq(obsInstances.executorId, executorId)));

  return publishStatus(instanceId);
}

/** Heartbeat + the executor's view of OBS. Ignored (and reported as such) if the seat belongs to someone else. */
export async function reportStatus({
  instanceId,
  executorId,
  status,
}: {
  instanceId: number;
  executorId: string;
  status: ObsReport;
}): Promise<ObsStatus> {
  const staleBefore = new Date(Date.now() - EXECUTOR_STALE_MS);
  await ensureInstance(instanceId);
  await db
    .update(obsInstances)
    .set({ ...status, executorId, executorSeenAt: new Date(), statusAt: new Date() })
    .where(
      and(
        eq(obsInstances.id, instanceId),
        or(
          isNull(obsInstances.executorId),
          eq(obsInstances.executorId, executorId),
          isNull(obsInstances.executorSeenAt),
          lt(obsInstances.executorSeenAt, staleBefore)
        )
      )
    );

  return publishStatus(instanceId);
}

// ---------------------------------------------------------------------------
// Cues (the rundown)
// ---------------------------------------------------------------------------

export function serializeCue(row: CueRow) {
  return {
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
  };
}
export type Cue = ReturnType<typeof serializeCue>;

export async function listCues({ instanceId }: { instanceId: number }): Promise<Cue[]> {
  const rows = await db
    .select()
    .from(obsCues)
    .where(eq(obsCues.instanceId, instanceId))
    .orderBy(asc(obsCues.position), asc(obsCues.createdAt));

  return rows.map(serializeCue);
}

async function publishCues(instanceId: number): Promise<Cue[]> {
  const cues = await listCues({ instanceId });
  await publishServer(obsControlChannel(instanceId), "cues", cues);

  return cues;
}

export async function createCue(input: CreateCueInput): Promise<Cue> {
  await ensureInstance(input.instanceId);
  const [{ next }] = await db
    .select({ next: sql<number>`coalesce(max(${obsCues.position}), -1) + 1` })
    .from(obsCues)
    .where(eq(obsCues.instanceId, input.instanceId));
  const [row] = await db
    .insert(obsCues)
    .values({ ...input, position: next ?? 0 })
    .returning();
  if (!row) throw new Error("Failed to create the cue");
  await publishCues(input.instanceId);

  return serializeCue(row);
}

export async function updateCue({ id, ...fields }: UpdateCueInput): Promise<Cue> {
  const [row] = await db.update(obsCues).set(fields).where(eq(obsCues.id, id)).returning();
  if (!row) throw new Error("Cue not found");
  await publishCues(row.instanceId);

  return serializeCue(row);
}

export async function removeCue({ id }: { id: string }): Promise<{ ok: true }> {
  const [row] = await db.delete(obsCues).where(eq(obsCues.id, id)).returning();
  if (row) await publishCues(row.instanceId);

  return { ok: true };
}

export async function reorderCues({ instanceId, ids }: { instanceId: number; ids: string[] }): Promise<Cue[]> {
  if (ids.length) {
    await db.transaction(async (tx) => {
      for (const [position, id] of ids.entries()) {
        await tx
          .update(obsCues)
          .set({ position })
          .where(and(eq(obsCues.id, id), eq(obsCues.instanceId, instanceId), inArray(obsCues.id, ids)));
      }
    });
  }

  return publishCues(instanceId);
}

/**
 * One press: move the rundown pointer, queue the OBS scene for the executor,
 * put the wall scene up and fire the launchpad sound. Each leg is independent,
 * so a rig that is down never blocks the others.
 */
export async function fireCue({ id }: { id: string }, source: string): Promise<{ cue: Cue; commandId: string | null }> {
  const [row] = await db.select().from(obsCues).where(eq(obsCues.id, id)).limit(1);
  if (!row) throw new Error("Cue not found");
  const cue = serializeCue(row);

  await db.update(obsInstances).set({ currentCueId: cue.id }).where(eq(obsInstances.id, cue.instanceId));

  let commandId: string | null = null;
  if (cue.obsScene) {
    const sent = await sendCommand(
      {
        instanceId: cue.instanceId,
        type: "scene",
        payload: {
          sceneName: cue.obsScene,
          ...(cue.transition ? { transition: cue.transition } : {}),
          ...(cue.transitionMs != null ? { transitionMs: cue.transitionMs } : {}),
          cue: cue.name,
        },
      },
      source
    );
    commandId = sent.id;
  }
  if (cue.stageScene) {
    await setScene({ scene: cue.stageScene as never, params: cue.stageParams ?? {} }).catch((error) => {
      console.error("❌ [OBS] Cue stage scene failed:", error);
    });
  }
  if (cue.sound) {
    const event = soundEvent(cue.sound);
    if (event) await publishServer(GLOBAL_CHANNELS.launchpad, "play_sound", event);
  }
  await publishStatus(cue.instanceId);

  return { cue, commandId };
}

/** Fire the cue after (or before) the current one; wraps from the end back to the start. */
export async function stepCue(
  { instanceId, direction }: { instanceId: number; direction: "next" | "prev" },
  source: string
): Promise<{ cue: Cue; commandId: string | null } | null> {
  const [cues, instance] = await Promise.all([listCues({ instanceId }), ensureInstance(instanceId)]);
  if (cues.length === 0) return null;
  const current = cues.findIndex((cue) => cue.id === instance.currentCueId);
  const index = direction === "next" ? (current + 1) % cues.length : current <= 0 ? cues.length - 1 : current - 1;
  const target = cues[index];
  if (!target) return null;

  return fireCue({ id: target.id }, source);
}

// ---------------------------------------------------------------------------
// Loop (queue rotation) shortcuts for the HTTP surface
// ---------------------------------------------------------------------------

export async function loopAction({
  instanceId,
  action,
}: {
  instanceId: number;
  action: "play" | "pause" | "stop" | "next" | "prev";
}) {
  const current = await getQueueState({ instanceId });
  const count = current.queueItems.length;
  const data =
    action === "play"
      ? { isPlaying: true }
      : action === "pause"
        ? { isPlaying: false }
        : action === "stop"
          ? { isPlaying: false, currentItemIndex: 0 }
          : count === 0
            ? {}
            : {
                currentItemIndex:
                  action === "next"
                    ? (current.currentItemIndex + 1) % count
                    : (current.currentItemIndex - 1 + count) % count,
              };

  return updateQueueState({ instanceId, data });
}
