import { defineTool } from "eve/tools";
import { z } from "zod";
import { getBoard, ROOM_STATUS_WORDS } from "../lib/board";

export default defineTool({
  description:
    "Devuelve la grilla completa del open space en vivo: salas (con su estado ahora: abierta, llena o en evacuación, como lo marca su host), horarios, cards (charlas propuestas) con su ubicación, y las celdas libres. Usala siempre antes de responder sobre la grilla o antes de crear/mover/editar cards, y para '¿está llena la sala X?'.",
  inputSchema: z.object({
    openSpaceId: z
      .string()
      .optional()
      .describe("ID del open space. Omitir para usar el open space activo (lo normal)."),
  }),
  async execute({ openSpaceId }) {
    const board = await getBoard(openSpaceId);
    return {
      openSpace: board.openSpace,
      rooms: board.rooms.map((room) => ({
        id: room.id,
        name: room.name,
        capacity: room.capacity ?? null,
        hasTV: room.hasTV ?? false,
        hasWhiteboard: room.hasWhiteboard ?? false,
        color: room.color ?? null,
        status: ROOM_STATUS_WORDS[room.status],
      })),
      timeSlots: board.schedules.map((schedule) => ({
        id: schedule.id,
        name: schedule.name,
        slot: `${schedule.startTime} - ${schedule.endTime}`,
      })),
      cards: board.cards.map((card) => ({
        id: card.id,
        title: card.title,
        speaker: card.speaker ?? null,
        room: card.room ?? card.roomId,
        timeSlot: card.timeSlot ?? card.scheduleId,
        needsTV: card.needsTV,
        needsWhiteboard: card.needsWhiteboard,
      })),
      freeCells: board.freeCells,
    };
  },
});
