import { prisma } from "../../../prisma";
import type { OBSQueueState, GetInstanceInput } from "../schemas";

const DEFAULT_STATE: Omit<OBSQueueState, "version"> = {
  queueItems: [],
  isPlaying: false,
  currentItemIndex: 0,
  directMode: false,
  presets: [],
  currentPreset: "",
};

/**
 * Get OBS queue state for a specific instance
 * Creates default instance if it doesn't exist
 */
export const getState = async ({ instanceId }: GetInstanceInput): Promise<OBSQueueState> => {
  let instance = await prisma.oBSInstance.findUnique({
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

  // Create default instance if it doesn't exist
  if (!instance) {
    instance = await prisma.oBSInstance.create({
      data: {
        id: instanceId,
        isPlaying: false,
        currentItemIndex: 0,
        directMode: false,
        version: 1,
      },
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
