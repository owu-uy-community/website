import { defineTool } from "eve/tools";
import { z } from "zod";
import { owuApi } from "../lib/owu-api";

export default defineTool({
  description:
    "Lee el estado actual de la rotación de escenas de OBS (pantallas del evento): cola de escenas, si está reproduciendo, escena actual, presets y modo directo. Instancia 1 = pantalla del admin, 2 = app standalone.",
  inputSchema: z.object({
    instanceId: z.number().int().min(1).max(2).default(1).describe("1 = pantalla admin (default), 2 = app standalone"),
  }),
  async execute({ instanceId }) {
    const state = await owuApi().obsQueue.getState({ instanceId });
    return {
      instanceId,
      isPlaying: state.isPlaying,
      directMode: state.directMode,
      currentItemIndex: state.currentItemIndex,
      currentScene: state.queueItems[state.currentItemIndex]?.sceneName ?? null,
      queue: state.queueItems.map((item) => ({ sceneName: item.sceneName, delaySeconds: item.delay })),
      presets: state.presets.map((preset) => ({
        name: preset.name,
        active: preset.id === state.currentPreset,
        scenes: preset.items.map((item) => item.sceneName),
      })),
      version: state.version,
    };
  },
});
