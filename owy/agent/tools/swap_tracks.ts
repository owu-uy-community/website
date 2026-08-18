import { defineTool } from "eve/tools";
import { z } from "zod";
import { findCard, getBoard } from "../lib/board";
import { owuApi } from "../lib/owu-api";
import { requireStaff, staffApproval } from "../lib/staff";

export default defineTool({
  description:
    "SOLO STAFF: intercambia de lugar dos cards de la grilla (cada una pasa a la sala+horario de la otra). Es la forma correcta de 'mover' una card a una celda ocupada.",
  inputSchema: z.object({
    trackA: z.string().min(1).describe("Primera card (id o parte del título)"),
    trackB: z.string().min(1).describe("Segunda card (id o parte del título)"),
  }),
  approval: staffApproval("once"),
  async execute({ trackA, trackB }, ctx) {
    requireStaff(ctx);
    const board = await getBoard();
    const cardA = findCard(board, trackA);
    const cardB = findCard(board, trackB);
    if (cardA.id === cardB.id) {
      throw new Error("Las dos referencias apuntan a la misma card; indicá dos distintas.");
    }

    await owuApi().tracks.swap({ trackAId: cardA.id, trackBId: cardB.id });

    return {
      ok: true,
      swapped: [
        { id: cardA.id, title: cardA.title, nowAt: { room: cardB.room ?? cardB.roomId, timeSlot: cardB.timeSlot ?? cardB.scheduleId } },
        { id: cardB.id, title: cardB.title, nowAt: { room: cardA.room ?? cardA.roomId, timeSlot: cardA.timeSlot ?? cardA.scheduleId } },
      ],
    };
  },
});
