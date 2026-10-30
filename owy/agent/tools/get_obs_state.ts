import { defineTool } from "eve/tools";
import { z } from "zod";
import { owuApi } from "../lib/owu-api";

export default defineTool({
  description:
    "Lee el estado de OBS de las pantallas del evento: qué escena está al aire y en preview, modo estudio, stream/grabación, si hay un puesto de control conectado (ejecutor), el guion de cues con el actual, y la rotación automática (cola, play/pause, presets, modo directo). Instancia 1 = pantalla del admin, 2 = app standalone.",
  inputSchema: z.object({
    instanceId: z.number().int().min(1).max(2).default(1).describe("1 = pantalla admin (default), 2 = app standalone"),
  }),
  async execute({ instanceId }) {
    const api = owuApi();
    const [state, status, cues] = await Promise.all([
      api.obsQueue.getState({ instanceId }),
      api.obsControl.status({ instanceId }),
      api.obsCue.list({ instanceId }),
    ]);
    return {
      instanceId,
      live: {
        executorOnline: status.executorOnline,
        connected: status.connected,
        programScene: status.programScene,
        previewScene: status.previewScene,
        studioMode: status.studioMode,
        streaming: status.streaming,
        recording: status.recording,
        reportedAt: status.statusAt,
      },
      cues: cues.map((cue) => ({
        name: cue.name,
        active: cue.id === status.currentCueId,
        obsScene: cue.obsScene,
        stageScene: cue.stageScene,
        sound: cue.sound,
        hotkey: cue.hotkey,
      })),
      loop: {
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
      },
    };
  },
});
