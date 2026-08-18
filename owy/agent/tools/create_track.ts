import { defineTool } from "eve/tools";
import { z } from "zod";
import { findRoom, findSchedule, getBoard } from "../lib/board";
import { owuApi } from "../lib/owu-api";
import { requireStaff, staffOnly } from "../lib/staff";

export default defineTool({
  description:
    "SOLO STAFF: crea una card nueva en la grilla del open space, en una sala y horario dados. La sala y el horario aceptan nombre o id (ej: room 'Cueva', timeSlot '15:30'). La API valida choques de slot y requisitos de sala.",
  inputSchema: z.object({
    title: z.string().min(1).describe("Título de la charla"),
    speaker: z.string().optional().describe("Quién la da"),
    description: z.string().optional(),
    room: z.string().min(1).describe("Sala destino (nombre o id)"),
    timeSlot: z.string().min(1).describe("Horario destino (nombre del bloque, '15:30' o id)"),
    needsTV: z.boolean().optional().describe("La charla necesita TV/proyector"),
    needsWhiteboard: z.boolean().optional().describe("La charla necesita pizarra"),
  }),
  approval: staffOnly(),
  async execute(input, ctx) {
    requireStaff(ctx);
    const board = await getBoard();
    const room = findRoom(board, input.room);
    const schedule = findSchedule(board, input.timeSlot);

    const created = await owuApi().tracks.create({
      title: input.title,
      speaker: input.speaker,
      description: input.description,
      needsTV: input.needsTV ?? false,
      needsWhiteboard: input.needsWhiteboard ?? false,
      openSpaceId: board.openSpace.id,
      scheduleId: schedule.id,
      roomId: room.id,
    });

    return {
      ok: true,
      card: {
        id: created.id,
        title: created.title,
        speaker: created.speaker ?? null,
        room: created.room ?? room.name,
        timeSlot: created.timeSlot ?? `${schedule.startTime} - ${schedule.endTime}`,
      },
    };
  },
});
