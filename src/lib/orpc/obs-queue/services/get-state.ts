import { eq } from "drizzle-orm";
import { db } from "../../../db";
import { obsInstances } from "../../../db/schema";
import type { OBSQueueState, GetInstanceInput } from "../schemas";

/**
 * Get OBS queue state for a specific instance
 * Creates default instance if it doesn't exist
 */
export const getState = async ({ instanceId }: GetInstanceInput): Promise<OBSQueueState> => {
  const fetchInstance = () =>
    db.query.obsInstances.findFirst({
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

  let instance = await fetchInstance();

  // Create default instance if it doesn't exist
  if (!instance) {
    await db.insert(obsInstances).values({
      id: instanceId,
      isPlaying: false,
      currentItemIndex: 0,
      directMode: false,
      version: 1,
    });
    instance = await fetchInstance();
  }

  if (!instance) {
    throw new Error("Failed to load OBS instance");
  }

  // Transform database records to client format
  const queueItems = instance.queueItems.map((item) => ({
    id: item.id,
    sceneName: item.sceneName,
    delay: item.delay,
    position: item.position,
  }));

  const presets = instance.presets.map((preset) => ({
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
    isPlaying: instance.isPlaying,
    currentItemIndex: instance.currentItemIndex,
    directMode: instance.directMode,
    presets,
    currentPreset: instance.currentPresetId || "",
    version: instance.version,
  };
};
