import { defineTool } from "eve/tools";
import { z } from "zod";
import { findCard, getBoard } from "../lib/board";
import { owuApi } from "../lib/owu-api";
import { requireStaff, staffOnly } from "../lib/staff";

export default defineTool({
  description:
    "SOLO STAFF: edita los datos de una card de la grilla (título, speaker, descripción, requisitos de TV/pizarra) sin moverla de lugar. Para cambiarla de sala/horario usá move_track.",
  inputSchema: z
    .object({
      track: z.string().min(1).describe("Card a editar (id o parte del título)"),
      title: z.string().min(1).optional(),
      speaker: z.string().optional(),
      description: z.string().optional(),
      needsTV: z.boolean().optional(),
      needsWhiteboard: z.boolean().optional(),
    })
    .refine(
      (input) =>
        input.title !== undefined ||
        input.speaker !== undefined ||
        input.description !== undefined ||
        input.needsTV !== undefined ||
        input.needsWhiteboard !== undefined,
      { message: "Indicá al menos un campo a cambiar" }
    ),
  approval: staffOnly(),
  async execute(input, ctx) {
    requireStaff(ctx);
    const board = await getBoard();
    const card = findCard(board, input.track);

    const updated = await owuApi().tracks.update({
      id: card.id,
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.speaker !== undefined ? { speaker: input.speaker } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.needsTV !== undefined ? { needsTV: input.needsTV } : {}),
        ...(input.needsWhiteboard !== undefined ? { needsWhiteboard: input.needsWhiteboard } : {}),
      },
    });

    return {
      ok: true,
      card: {
        id: updated.id,
        title: updated.title,
        speaker: updated.speaker ?? null,
        room: updated.room ?? updated.roomId,
        timeSlot: updated.timeSlot ?? updated.scheduleId,
      },
    };
  },
});
