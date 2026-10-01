import { randomUUID } from "node:crypto";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { owuApi, type OBSUpdateData } from "../lib/owu-api";
import { requireStaff, staffOnly } from "../lib/staff";

export default defineTool({
  description:
    "SOLO STAFF: controla OBS de las pantallas del evento a través del puesto de control (una pestaña conectada a OBS ejecuta los comandos). Acciones en vivo: scene (escena al aire), preview (a preview, modo estudio), take (preview → aire), cut, fire_cue (dispara un cue del guion por nombre: escena OBS + pantalla Owy + sonido), next_cue, prev_cue, mute (silencia/activa una fuente de audio), stream/record (start|stop). Rotación automática: play, pause, next_scene, prev_scene, set_scene_queue, activate_preset, set_direct_mode. Mirá primero el estado con get_obs_state.",
  inputSchema: z.object({
    action: z.enum([
      "scene",
      "preview",
      "take",
      "cut",
      "fire_cue",
      "next_cue",
      "prev_cue",
      "mute",
      "stream",
      "record",
      "play",
      "pause",
      "next_scene",
      "prev_scene",
      "set_scene_queue",
      "activate_preset",
      "set_direct_mode",
    ]),
    instanceId: z.number().int().min(1).max(2).default(1).describe("1 = pantalla admin (default), 2 = app standalone"),
    sceneNames: z
      .array(z.string().min(1))
      .optional()
      .describe("Para set_scene_queue: nombres de escenas de OBS en orden"),
    delaySeconds: z
      .number()
      .int()
      .min(1)
      .max(300)
      .optional()
      .describe("Para set_scene_queue: segundos entre escenas (default 5)"),
    presetName: z.string().optional().describe("Para activate_preset: nombre del preset guardado"),
    directMode: z.boolean().optional().describe("Para set_direct_mode: true = fijar escena, false = rotación normal"),
    sceneName: z.string().optional().describe("Para scene/preview: nombre EXACTO de la escena de OBS"),
    cueName: z.string().optional().describe("Para fire_cue: nombre del cue del guion"),
    inputName: z.string().optional().describe("Para mute: nombre de la fuente de audio en OBS"),
    muted: z.boolean().optional().describe("Para mute: true = silenciar, false = activar; sin valor = alternar"),
    outputAction: z.enum(["start", "stop"]).optional().describe("Para stream/record"),
  }),
  approval: staffOnly(),
  async execute(input, ctx) {
    requireStaff(ctx);
    const api = owuApi();

    // Live commands go through the command bus; the connected control tab runs them.
    const live = await liveCommand(input, api);
    if (live) return live;

    const current = await api.obsQueue.getState({ instanceId: input.instanceId });

    let data: OBSUpdateData;
    switch (input.action) {
      case "play":
        data = { isPlaying: true };
        break;
      case "pause":
        data = { isPlaying: false };
        break;
      case "next_scene": {
        if (current.queueItems.length === 0) throw new Error("La cola de escenas está vacía.");
        data = { currentItemIndex: (current.currentItemIndex + 1) % current.queueItems.length };
        break;
      }
      case "prev_scene": {
        if (current.queueItems.length === 0) throw new Error("La cola de escenas está vacía.");
        data = {
          currentItemIndex: (current.currentItemIndex - 1 + current.queueItems.length) % current.queueItems.length,
        };
        break;
      }
      case "set_scene_queue": {
        if (!input.sceneNames || input.sceneNames.length === 0) {
          throw new Error("set_scene_queue necesita sceneNames con al menos una escena.");
        }
        data = {
          queueItems: input.sceneNames.map((sceneName, index) => ({
            id: randomUUID(),
            sceneName,
            delay: input.delaySeconds ?? 5,
            position: index,
          })),
          currentItemIndex: 0,
        };
        break;
      }
      case "activate_preset": {
        if (!input.presetName) throw new Error("activate_preset necesita presetName.");
        const preset = current.presets.find(
          (candidate) => candidate.name.toLowerCase() === input.presetName!.toLowerCase()
        );
        if (!preset) {
          const names = current.presets.map((candidate) => candidate.name).join(", ") || "(no hay presets)";
          throw new Error(`No existe el preset "${input.presetName}". Presets disponibles: ${names}.`);
        }
        data = {
          currentPreset: preset.id,
          queueItems: preset.items.map((item, index) => ({ ...item, position: index })),
          currentItemIndex: 0,
        };
        break;
      }
      case "set_direct_mode": {
        if (input.directMode === undefined) throw new Error("set_direct_mode necesita directMode true/false.");
        data = { directMode: input.directMode };
        break;
      }
      default:
        throw new Error(`Acción desconocida: ${input.action}`);
    }

    const updated = await api.obsQueue.updateState({ instanceId: input.instanceId, data });
    return {
      ok: true,
      action: input.action,
      instanceId: input.instanceId,
      isPlaying: updated.isPlaying,
      directMode: updated.directMode,
      currentScene: updated.queueItems[updated.currentItemIndex]?.sceneName ?? null,
      queue: updated.queueItems.map((item) => item.sceneName),
      version: updated.version,
    };
  },
});

type Api = ReturnType<typeof owuApi>;
type Input = {
  action: string;
  instanceId: number;
  sceneName?: string;
  cueName?: string;
  inputName?: string;
  muted?: boolean;
  outputAction?: "start" | "stop";
};

async function liveCommand(input: Input, api: Api) {
  const { instanceId } = input;
  const done = async (sent: { id: string; executorOnline: boolean }, what: string) => ({
    ok: sent.executorOnline,
    action: input.action,
    instanceId,
    what,
    commandId: sent.id,
    note: sent.executorOnline
      ? "Enviado al puesto de control; OBS lo aplica en segundos."
      : "Quedó encolado pero NO hay ninguna pestaña conectada a OBS ahora mismo: avisale al staff que abra /admin/screen.",
  });

  switch (input.action) {
    case "scene": {
      if (!input.sceneName) throw new Error("scene necesita sceneName.");
      return done(
        await api.obsControl.send({ instanceId, type: "scene", payload: { sceneName: input.sceneName } }),
        `${input.sceneName} al aire`
      );
    }
    case "preview": {
      if (!input.sceneName) throw new Error("preview necesita sceneName.");
      return done(
        await api.obsControl.send({ instanceId, type: "preview", payload: { sceneName: input.sceneName } }),
        `${input.sceneName} a preview`
      );
    }
    case "take":
      return done(await api.obsControl.send({ instanceId, type: "take", payload: {} }), "TAKE");
    case "cut":
      return done(await api.obsControl.send({ instanceId, type: "cut", payload: {} }), "CUT");
    case "mute": {
      if (!input.inputName) throw new Error("mute necesita inputName.");
      return done(
        await api.obsControl.send({
          instanceId,
          type: "mute",
          payload: { inputName: input.inputName, ...(input.muted === undefined ? {} : { muted: input.muted }) },
        }),
        `mute ${input.inputName}`
      );
    }
    case "stream":
    case "record": {
      if (!input.outputAction) throw new Error(`${input.action} necesita outputAction start|stop.`);
      return done(
        await api.obsControl.send({ instanceId, type: input.action, payload: { action: input.outputAction } }),
        `${input.action} ${input.outputAction}`
      );
    }
    case "fire_cue": {
      if (!input.cueName) throw new Error("fire_cue necesita cueName.");
      const cues = await api.obsCue.list({ instanceId });
      const cue = cues.find((candidate) => candidate.name.toLowerCase() === input.cueName!.toLowerCase());
      if (!cue) {
        const names = cues.map((candidate) => candidate.name).join(", ") || "(no hay cues)";
        throw new Error(`No existe el cue "${input.cueName}". Cues del guion: ${names}.`);
      }
      const fired = await api.obsCue.fire({ id: cue.id });
      return { ok: true, action: input.action, instanceId, cue: fired.cue.name, commandId: fired.commandId };
    }
    case "next_cue":
    case "prev_cue": {
      const fired = await api.obsCue.step({ instanceId, direction: input.action === "next_cue" ? "next" : "prev" });
      if (!fired) throw new Error("El guion está vacío.");
      return { ok: true, action: input.action, instanceId, cue: fired.cue.name, commandId: fired.commandId };
    }
    default:
      return null;
  }
}
