import { defineTool } from "eve/tools";
import { z } from "zod";
import { findSchedule, getBoard } from "../lib/board";

export default defineTool({
  description:
    "Encuentra celdas libres en la grilla del open space (horario + sala sin charla asignada), opcionalmente filtrando por requisitos (TV/proyector, pizarra) o por un horario puntual. Usala para sugerir dónde poner una charla nueva o a dónde mover una existente.",
  inputSchema: z.object({
    needsTV: z.boolean().optional().describe("Solo salas con TV/proyector"),
    needsWhiteboard: z.boolean().optional().describe("Solo salas con pizarra"),
    timeSlot: z.string().optional().describe("Limitar a un horario (ej: '15:30' o el nombre del bloque)"),
  }),
  async execute({ needsTV, needsWhiteboard, timeSlot }) {
    const board = await getBoard();
    const roomsById = new Map(board.rooms.map((room) => [room.id, room]));
    const scheduleFilter = timeSlot ? findSchedule(board, timeSlot).id : null;

    const free = board.freeCells.filter((cell) => {
      if (scheduleFilter && cell.scheduleId !== scheduleFilter) return false;
      const room = roomsById.get(cell.roomId);
      if (!room) return false;
      if (needsTV && !room.hasTV) return false;
      if (needsWhiteboard && !room.hasWhiteboard) return false;
      return true;
    });

    return {
      openSpace: board.openSpace.name,
      freeCells: free.map((cell) => ({
        room: cell.room,
        timeSlot: cell.timeSlot,
        roomId: cell.roomId,
        scheduleId: cell.scheduleId,
      })),
      note:
        free.length === 0
          ? "No hay celdas libres con esos criterios. Probá relajando los filtros o mirá la grilla completa."
          : undefined,
    };
  },
});
