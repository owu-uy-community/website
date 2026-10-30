import { and, asc, count, eq, notInArray, sql } from "drizzle-orm";
import { Effect } from "effect";

import { obsInstances, obsPresetItems, obsPresets, obsQueueItems } from "../../db/schema";
import { obsQueueChannel } from "../../realtime/channels";
import { query, transaction } from "../db";
import { Conflict } from "../errors";
import { Realtime } from "../services";
import type { LoopAction, OBSQueueState, QueueItem, UpdateStateInput } from "./schemas";

/** Rigs are created on first use. */
export const ensureInstance = (instanceId: number) =>
  query((db) => db.insert(obsInstances).values({ id: instanceId }).onConflictDoNothing());

/** The rig's row, locked until the surrounding transaction ends, so read-then-write can't interleave. */
export const lockInstance = (instanceId: number) =>
  Effect.gen(function* () {
    yield* ensureInstance(instanceId);
    const [row] = yield* query((db) =>
      db.select().from(obsInstances).where(eq(obsInstances.id, instanceId)).for("update")
    );

    return row;
  });

const toItem = (item: QueueItem) => ({
  id: item.id,
  sceneName: item.sceneName,
  delay: item.delay,
  position: item.position,
});

const loadQueue = (instanceId: number) =>
  query((db) =>
    db.query.obsInstances.findFirst({
      where: eq(obsInstances.id, instanceId),
      with: {
        queueItems: { orderBy: asc(obsQueueItems.position) },
        presets: { with: { items: { orderBy: asc(obsPresetItems.position) } } },
      },
    })
  ).pipe(
    Effect.map((row): OBSQueueState => ({
      queueItems: row?.queueItems.map(toItem) ?? [],
      isPlaying: row?.isPlaying ?? false,
      currentItemIndex: row?.currentItemIndex ?? 0,
      directMode: row?.directMode ?? false,
      presets:
        row?.presets.map((preset) => ({ id: preset.id, name: preset.name, items: preset.items.map(toItem) })) ?? [],
      currentPreset: row?.currentPresetId ?? "",
      version: row?.version ?? 1,
    }))
  );

/** Tell the control screens to refetch (they compare versions). */
const announce = (state: OBSQueueState, instanceId: number) =>
  Effect.gen(function* () {
    const realtime = yield* Realtime;
    yield* realtime.publish(obsQueueChannel(instanceId), "state_update", {
      instanceId,
      version: state.version,
      timestamp: Date.now(),
      type: "full_state" as const,
    });
  });

export const getQueue = (instanceId: number) =>
  Effect.gen(function* () {
    yield* ensureInstance(instanceId);
    return yield* loadQueue(instanceId);
  });

const itemRows = (items: readonly QueueItem[]) =>
  items.map((item) => ({ sceneName: item.sceneName, delay: item.delay, position: item.position }));

/**
 * Save the loop: only the fields sent change, and every save bumps the
 * version screens refetch on. Queue and preset items get fresh ids, so two
 * rigs (or two presets saved from the same queue) never fight over one.
 */
export const updateQueue = ({ instanceId, data }: UpdateStateInput) =>
  Effect.gen(function* () {
    yield* transaction(
      Effect.gen(function* () {
        yield* lockInstance(instanceId);
        yield* query((db) =>
          db
            .update(obsInstances)
            .set({
              ...(data.isPlaying === undefined ? {} : { isPlaying: data.isPlaying }),
              ...(data.currentItemIndex === undefined ? {} : { currentItemIndex: data.currentItemIndex }),
              ...(data.directMode === undefined ? {} : { directMode: data.directMode }),
              ...(data.currentPreset === undefined ? {} : { currentPresetId: data.currentPreset || null }),
              version: sql`${obsInstances.version} + 1`,
            })
            .where(eq(obsInstances.id, instanceId))
        );

        if (data.queueItems) {
          const items = data.queueItems;
          yield* query((db) => db.delete(obsQueueItems).where(eq(obsQueueItems.instanceId, instanceId)));
          if (items.length > 0) {
            yield* query((db) =>
              db.insert(obsQueueItems).values(itemRows(items).map((item) => ({ ...item, instanceId })))
            );
          }
        }

        if (data.presets) {
          const presets = data.presets;
          const kept = presets.map((preset) => preset.id);
          yield* query((db) =>
            db
              .delete(obsPresets)
              .where(
                and(
                  eq(obsPresets.instanceId, instanceId),
                  kept.length > 0 ? notInArray(obsPresets.id, kept) : undefined
                )
              )
          );
          yield* Effect.forEach(
            presets,
            (preset) =>
              Effect.gen(function* () {
                const [saved] = yield* query((db) =>
                  db
                    .insert(obsPresets)
                    .values({ id: preset.id, name: preset.name, instanceId })
                    .onConflictDoUpdate({
                      target: obsPresets.id,
                      set: { name: preset.name },
                      setWhere: eq(obsPresets.instanceId, instanceId),
                    })
                    .returning({ id: obsPresets.id })
                );
                // The id belongs to the other rig's preset: never touch it from here.
                if (!saved) {
                  return yield* new Conflict({ reason: "preset_taken", message: "Ese preset es del otro equipo" });
                }
                yield* query((db) => db.delete(obsPresetItems).where(eq(obsPresetItems.presetId, preset.id)));
                if (preset.items.length > 0) {
                  yield* query((db) =>
                    db
                      .insert(obsPresetItems)
                      .values(itemRows(preset.items).map((item) => ({ ...item, presetId: preset.id })))
                  );
                }
              }),
            { discard: true }
          );
        }
      })
    );

    const state = yield* loadQueue(instanceId);
    yield* announce(state, instanceId);

    return state;
  });

/** Play, pause, stop or step the loop as it is right now (no stale read: the rig is locked meanwhile). */
export const loop = ({ instanceId, action }: { instanceId: number; action: LoopAction }) =>
  Effect.gen(function* () {
    yield* transaction(
      Effect.gen(function* () {
        const rig = yield* lockInstance(instanceId);
        const [{ items }] = yield* query((db) =>
          db.select({ items: count() }).from(obsQueueItems).where(eq(obsQueueItems.instanceId, instanceId))
        );
        const step = (by: number) =>
          items === 0 ? {} : { currentItemIndex: (((rig.currentItemIndex + by) % items) + items) % items };
        const change =
          action === "play"
            ? { isPlaying: true }
            : action === "pause"
              ? { isPlaying: false }
              : action === "stop"
                ? { isPlaying: false, currentItemIndex: 0 }
                : step(action === "next" ? 1 : -1);

        yield* query((db) =>
          db
            .update(obsInstances)
            .set({ ...change, version: sql`${obsInstances.version} + 1` })
            .where(eq(obsInstances.id, instanceId))
        );
      })
    );

    const state = yield* loadQueue(instanceId);
    yield* announce(state, instanceId);

    return state;
  });
