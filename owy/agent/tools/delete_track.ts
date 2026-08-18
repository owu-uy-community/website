import { defineTool } from "eve/tools";
import { z } from "zod";
import { findCard, getBoard } from "../lib/board";
import { owuApi } from "../lib/owu-api";
import { requireStaff, staffOnly } from "../lib/staff";

export default defineTool({
  description:
    "SOLO STAFF: borra una card de la grilla del open space. Es destructivo y NO se puede deshacer: confirmá SIEMPRE con la persona qué card exacta se borra (título, sala y horario) y esperá su OK antes de llamar esta tool.",
  inputSchema: z.object({
    track: z.string().min(1).describe("Card a borrar (id o parte del título)"),
  }),
  approval: staffOnly(),
  async execute({ track }, ctx) {
    requireStaff(ctx);
    const board = await getBoard();
    const card = findCard(board, track);

    await owuApi().tracks.delete({ id: card.id });

    return {
      ok: true,
      deleted: {
        id: card.id,
        title: card.title,
        wasAt: { room: card.room ?? card.roomId, timeSlot: card.timeSlot ?? card.scheduleId },
      },
    };
  },
});
