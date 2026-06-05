import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../../../db";
import { obsInstances, obsPresetItems, obsPresets, obsQueueItems } from "../../../db/schema";
import type { OBSQueueState, UpdateStateInput } from "../schemas";

/**
 * Update OBS queue state for a specific instance
 * Uses transactions to ensure data consistency
 */
export const updateState = async ({ instanceId, data }: UpdateStateInput): Promise<OBSQueueState> => {
  return await db.transaction(async (tx) => {
    // Get current instance or create if doesn't exist
    const [existing] = await tx.select().from(obsInstances).where(eq(obsInstances.id, instanceId)).limit(1);

    if (!existing) {
      await tx.insert(obsInstances).values({
        id: instanceId,
        isPlaying: false,
        currentItemIndex: 0,
        directMode: false,
        version: 1,
      });
    }

    // Prepare update data
    const updateData: Partial<typeof obsInstances.$inferInsert> = {};

    if (data.isPlaying !== undefined) updateData.isPlaying = data.isPlaying;
    if (data.currentItemIndex !== undefined) updateData.currentItemIndex = data.currentItemIndex;
    if (data.directMode !== undefined) updateData.directMode = data.directMode;
    if (data.currentPreset !== undefined) updateData.currentPresetId = data.currentPreset || null;

    // Update main instance (always bump version for conflict resolution)
    await tx
      .update(obsInstances)
      .set({ ...updateData, version: sql`${obsInstances.version} + 1` })
      .where(eq(obsInstances.id, instanceId));

    // Update queue items if provided
    if (data.queueItems !== undefined) {
      // Delete all existing queue items
      await tx.delete(obsQueueItems).where(eq(obsQueueItems.instanceId, instanceId));

      // Create new queue items
      if (data.queueItems.length > 0) {
        await tx.insert(obsQueueItems).values(
          data.queueItems.map((item) => ({
            id: item.id,
            sceneName: item.sceneName,
            sceneId: null,
            delay: item.delay,
            position: item.position,
            instanceId,
          }))
        );
      }
    }

    // Update presets if provided
    if (data.presets !== undefined) {
      const existingPresets = await tx
        .select({ id: obsPresets.id })
        .from(obsPresets)
        .where(eq(obsPresets.instanceId, instanceId));

      const existingPresetIds = new Set(existingPresets.map((p) => p.id));
      const newPresetIds = new Set(data.presets.map((p) => p.id));

      // Delete removed presets
      const presetsToDelete = existingPresets.filter((p) => !newPresetIds.has(p.id)).map((p) => p.id);

      if (presetsToDelete.length > 0) {
        await tx
          .delete(obsPresets)
          .where(and(inArray(obsPresets.id, presetsToDelete), eq(obsPresets.instanceId, instanceId)));
      }

      // Create or update presets
      for (const preset of data.presets) {
        if (!existingPresetIds.has(preset.id)) {
          // Create new preset
          await tx.insert(obsPresets).values({
            id: preset.id,
            name: preset.name,
            instanceId,
          });

          if (preset.items.length > 0) {
            await tx.insert(obsPresetItems).values(
              preset.items.map((item) => ({
                id: item.id,
                sceneName: item.sceneName,
                sceneId: null,
                delay: item.delay,
                position: item.position,
                presetId: preset.id,
              }))
            );
          }
        } else {
          // Update existing preset
          await tx.update(obsPresets).set({ name: preset.name }).where(eq(obsPresets.id, preset.id));

          // Recreate preset items
          await tx.delete(obsPresetItems).where(eq(obsPresetItems.presetId, preset.id));

          if (preset.items.length > 0) {
            await tx.insert(obsPresetItems).values(
              preset.items.map((item) => ({
                id: item.id,
                sceneName: item.sceneName,
                sceneId: null,
                delay: item.delay,
                position: item.position,
                presetId: preset.id,
              }))
            );
          }
        }
      }
    }

    // Fetch and return complete updated state
    const finalInstance = await tx.query.obsInstances.findFirst({
      where: eq(obsInstances.id, instanceId),
      with: {
        queueItems: { orderBy: (queueItems, { asc }) => [asc(queueItems.position)] },
        presets: {
          with: {
            items: { orderBy: (items, { asc }) => [asc(items.position)] },
          },
        },
      },
    });

    if (!finalInstance) {
      throw new Error("Failed to retrieve updated instance");
    }

    // Transform to client format
    const queueItems = finalInstance.queueItems.map((item) => ({
      id: item.id,
      sceneName: item.sceneName,
      delay: item.delay,
      position: item.position,
    }));

    const presets = finalInstance.presets.map((preset) => ({
      id: preset.id,
      name: preset.name,
      items: preset.items.map((item) => ({
        id: item.id,
        sceneName: item.sceneName,
        delay: item.delay,
        position: item.position,
      })),
    }));

    return {
      queueItems,
      isPlaying: finalInstance.isPlaying,
      currentItemIndex: finalInstance.currentItemIndex,
      directMode: finalInstance.directMode,
      presets,
      currentPreset: finalInstance.currentPresetId || "",
      version: finalInstance.version,
    };
  });
};
