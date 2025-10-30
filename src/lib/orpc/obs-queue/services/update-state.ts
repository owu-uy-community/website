import { prisma } from "../../../prisma";
import { Prisma } from "../../../../generated/prisma";
import type { OBSQueueState, UpdateStateInput } from "../schemas";

/**
 * Update OBS queue state for a specific instance
 * Uses transactions to ensure data consistency
 */
export const updateState = async ({ instanceId, data }: UpdateStateInput): Promise<OBSQueueState> => {
  return await prisma.$transaction(async (tx) => {
    // Get current instance or create if doesn't exist
    let instance = await tx.oBSInstance.findUnique({
      where: { id: instanceId },
    });

    if (!instance) {
      instance = await tx.oBSInstance.create({
        data: {
          id: instanceId,
          isPlaying: false,
          currentItemIndex: 0,
          directMode: false,
          version: 1,
        },
      });
    }

    // Prepare update data
    const updateData: Prisma.OBSInstanceUpdateInput = {
      version: { increment: 1 },
    };

    if (data.isPlaying !== undefined) updateData.isPlaying = data.isPlaying;
    if (data.currentItemIndex !== undefined) updateData.currentItemIndex = data.currentItemIndex;
    if (data.directMode !== undefined) updateData.directMode = data.directMode;
    if (data.currentPreset !== undefined) updateData.currentPresetId = data.currentPreset || null;

    // Update main instance
    await tx.oBSInstance.update({
      where: { id: instanceId },
      data: updateData,
    });

    // Update queue items if provided
    if (data.queueItems !== undefined) {
      // Delete all existing queue items
      await tx.oBSQueueItem.deleteMany({
        where: { instanceId },
      });

      // Create new queue items
      if (data.queueItems.length > 0) {
        await tx.oBSQueueItem.createMany({
          data: data.queueItems.map((item) => ({
            id: item.id,
            sceneName: item.sceneName,
            sceneId: null,
            delay: item.delay,
            position: item.position,
            instanceId,
          })),
        });
      }
    }

    // Update presets if provided
    if (data.presets !== undefined) {
      const existingPresets = await tx.oBSPreset.findMany({
        where: { instanceId },
        select: { id: true },
      });

      const existingPresetIds = new Set(existingPresets.map((p) => p.id));
      const newPresetIds = new Set(data.presets.map((p) => p.id));

      // Delete removed presets
      const presetsToDelete = existingPresets.filter((p) => !newPresetIds.has(p.id)).map((p) => p.id);

      if (presetsToDelete.length > 0) {
        await tx.oBSPreset.deleteMany({
          where: {
            id: { in: presetsToDelete },
            instanceId,
          },
        });
      }

      // Create or update presets
      for (const preset of data.presets) {
        if (!existingPresetIds.has(preset.id)) {
          // Create new preset
          await tx.oBSPreset.create({
            data: {
              id: preset.id,
              name: preset.name,
              instanceId,
              items: {
                createMany: {
                  data: preset.items.map((item) => ({
                    id: item.id,
                    sceneName: item.sceneName,
                    sceneId: null,
                    delay: item.delay,
                    position: item.position,
                  })),
                },
              },
            },
          });
        } else {
          // Update existing preset
          await tx.oBSPreset.update({
            where: { id: preset.id },
            data: { name: preset.name },
          });

          // Recreate preset items
          await tx.oBSPresetItem.deleteMany({
            where: { presetId: preset.id },
          });

          if (preset.items.length > 0) {
            await tx.oBSPresetItem.createMany({
              data: preset.items.map((item) => ({
                id: item.id,
                sceneName: item.sceneName,
                sceneId: null,
                delay: item.delay,
                position: item.position,
                presetId: preset.id,
              })),
            });
          }
        }
      }
    }

    // Fetch and return complete updated state
    const finalInstance = await tx.oBSInstance.findUnique({
      where: { id: instanceId },
      include: {
        queueItems: {
          orderBy: { position: "asc" },
        },
        presets: {
          include: {
            items: {
              orderBy: { position: "asc" },
            },
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
