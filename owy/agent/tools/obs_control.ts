import { randomUUID } from "node:crypto";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { owuApi, type OBSUpdateData } from "../lib/owu-api";
import { requireStaff, staffApproval } from "../lib/staff";

export default defineTool({
  description:
    "SOLO STAFF: controla remotamente la rotación de escenas de OBS de las pantallas del evento. Acciones: play (reanudar rotación), pause, next_scene, prev_scene, set_scene_queue (reemplaza la cola con sceneNames), activate_preset (carga un preset guardado por nombre), set_direct_mode (on = la escena no rota sola). Mirá primero el estado con get_obs_state.",
  inputSchema: z.object({
    action: z.enum(["play", "pause", "next_scene", "prev_scene", "set_scene_queue", "activate_preset", "set_direct_mode"]),
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
  }),
  approval: staffApproval("once"),
  async execute(input, ctx) {
    requireStaff(ctx);
    const api = owuApi();
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
