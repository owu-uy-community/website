import { defineTool } from "eve/tools";
import { z } from "zod";
import { findRoom, getBoard, ROOM_STATUS_WORDS } from "../lib/board";
import { owuApi } from "../lib/owu-api";
import { requireStaff, staffOnly } from "../lib/staff";

export default defineTool({
  description:
    "SOLO STAFF: marca una sala como abierta, llena (no entra más gente) o para evacuar, como lo haría su host desde el teléfono. Se ve al instante en kioscos, agenda y en lo que responde Owy. Evacuar le avisa urgente a todo el staff: confirmalo con ask_question antes; volver a abierta avisa con calma.",
  inputSchema: z.object({
    room: z.string().min(1).describe("La sala (nombre o id)"),
    status: z.enum(["open", "full", "evacuate"]).describe("open: abierta · full: llena · evacuate: evacuar"),
  }),
  approval: staffOnly(),
  async execute({ room, status }, ctx) {
    requireStaff(ctx);
    const target = findRoom(await getBoard(), room);

    const updated = await owuApi().rooms.setStatus({ roomId: target.id, status });

    return {
      ok: true,
      room: updated.name,
      status: ROOM_STATUS_WORDS[updated.status],
      /** The site alerts the staff only when the room goes into (or comes out of) evacuation. */
      staffAlerted: target.status !== updated.status && (updated.status === "evacuate" || target.status === "evacuate"),
    };
  },
});
