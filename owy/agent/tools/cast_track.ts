import { defineTool } from "eve/tools";
import { z } from "zod";
import { findCard, getBoard, resolveActiveEvent } from "../lib/board";
import { owuApi } from "../lib/owu-api";
import { requireStaff, staffOnly } from "../lib/staff";

export default defineTool({
  description:
    "SOLO STAFF: destaca una charla del open space en las pantallas del evento ('castear' / 'poner en pantalla'). Acciones: highlight (poner una charla, se busca por título o id), clear (sacar lo que esté), status (ver qué hay ahora sin cambiar nada).",
  inputSchema: z.object({
    action: z.enum(["highlight", "clear", "status"]).describe("highlight, clear o status"),
    track: z.string().optional().describe("Para highlight: la charla (id o parte del título)"),
  }),
  approval: staffOnly(),
  async execute({ action, track }, ctx) {
    requireStaff(ctx);
    const event = await resolveActiveEvent();
    const api = owuApi();

    if (action === "status") {
      const state = await api.cast.getState({ eventId: event.id });
      return {
        ok: true,
        action,
        onScreen: state.note
          ? { id: state.note.id, title: state.note.title, room: state.note.room, timeSlot: state.note.timeSlot }
          : null,
      };
    }

    if (action === "clear") {
      await api.cast.setHighlightedNote({ eventId: event.id, trackId: null });
      return { ok: true, action, onScreen: null };
    }

    if (!track) throw new Error("highlight necesita indicar la charla (id o parte del título).");

    const board = await getBoard(event.id);
    const card = findCard(board, track);
    const state = await api.cast.setHighlightedNote({ eventId: event.id, trackId: card.id });

    return {
      ok: true,
      action,
      onScreen: {
        id: card.id,
        title: card.title,
        speaker: card.speaker ?? null,
        room: state.note?.room ?? card.room,
        timeSlot: state.note?.timeSlot ?? card.timeSlot,
      },
    };
  },
});
