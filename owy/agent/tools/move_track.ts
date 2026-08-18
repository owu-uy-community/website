import { defineTool } from "eve/tools";
import { z } from "zod";
import { findCard, findRoom, findSchedule, getBoard } from "../lib/board";
import { owuApi } from "../lib/owu-api";
import { requireStaff, staffOnly } from "../lib/staff";

export default defineTool({
  description:
    "SOLO STAFF: mueve una card existente de la grilla a otra sala y/o horario. La card se identifica por id o título; sala y horario aceptan nombre o id. Si el destino está ocupado la API rechaza el cambio (usá swap_tracks para intercambiar dos cards).",
  inputSchema: z
    .object({
      track: z.string().min(1).describe("Card a mover (id o parte del título)"),
      room: z.string().optional().describe("Sala destino (nombre o id). Omitir para mantener la actual."),
      timeSlot: z.string().optional().describe("Horario destino (nombre, '15:30' o id). Omitir para mantener el actual."),
      skipResourceValidation: z
        .boolean()
        .optional()
        .describe("true solo si el staff confirma mover a una sala sin los recursos que la charla pide"),
    })
    .refine((input) => input.room !== undefined || input.timeSlot !== undefined, {
      message: "Indicá al menos sala o horario destino",
    }),
  approval: staffOnly(),
  async execute(input, ctx) {
    requireStaff(ctx);
    const board = await getBoard();
    const card = findCard(board, input.track);
    const room = input.room ? findRoom(board, input.room) : undefined;
    const schedule = input.timeSlot ? findSchedule(board, input.timeSlot) : undefined;

    const updated = await owuApi().tracks.update({
      id: card.id,
      data: {
        ...(room ? { roomId: room.id } : {}),
        ...(schedule ? { scheduleId: schedule.id } : {}),
        ...(input.skipResourceValidation ? { skipResourceValidation: true } : {}),
      },
    });

    return {
      ok: true,
      moved: {
        id: updated.id,
        title: updated.title,
        from: { room: card.room ?? card.roomId, timeSlot: card.timeSlot ?? card.scheduleId },
        to: { room: updated.room ?? updated.roomId, timeSlot: updated.timeSlot ?? updated.scheduleId },
      },
    };
  },
});
