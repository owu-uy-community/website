import { defineTool } from "eve/tools";
import { z } from "zod";
import { resolveActiveEvent } from "../lib/board";
import { owuApi } from "../lib/owu-api";
import { requireStaff, staffOnly } from "../lib/staff";

export default defineTool({
  description:
    "SOLO STAFF: maneja el countdown/timer que se muestra en las pantallas del open space. Acciones: start, pause, reset, setDuration (con durationSeconds), setTargetTime (con targetTime ISO o 'HH:MM'), toggleSound.",
  inputSchema: z.object({
    action: z.enum(["start", "pause", "reset", "setDuration", "toggleSound", "setTargetTime"]),
    durationSeconds: z.number().int().positive().optional().describe("Para setDuration: duración en segundos"),
    targetTime: z.string().optional().describe("Para setTargetTime: timestamp ISO o hora 'HH:MM'"),
  }),
  approval: staffOnly(),
  async execute(input, ctx) {
    requireStaff(ctx);
    if (input.action === "setDuration" && !input.durationSeconds) {
      throw new Error("setDuration necesita durationSeconds.");
    }
    if (input.action === "setTargetTime" && !input.targetTime) {
      throw new Error("setTargetTime necesita targetTime.");
    }
    const event = await resolveActiveEvent();
    const state = await owuApi().countdown.updateState({
      action: input.action,
      eventId: event.id,
      ...(input.durationSeconds ? { durationSeconds: input.durationSeconds } : {}),
      ...(input.targetTime ? { targetTime: input.targetTime } : {}),
    });
    return { ok: true, event: event.name, state };
  },
});
