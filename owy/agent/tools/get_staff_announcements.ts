import { defineTool } from "eve/tools";
import { z } from "zod";
import { resolveActiveEvent } from "../lib/board";
import { owuApi } from "../lib/owu-api";
import { requireStaff } from "../lib/staff";

export default defineTool({
  description:
    "SOLO STAFF: los avisos internos del staff para este evento, del más nuevo al más viejo, con quién los confirmó y quién todavía no (`pending`). Útil para responder '¿quién no se enteró?' o '¿qué se avisó recién?'.",
  inputSchema: z.object({
    limit: z.number().int().min(1).max(50).default(10).describe("Cuántos avisos traer (default 10)"),
    urgentOnly: z.boolean().optional().describe("true = solo los marcados como urgentes"),
  }),
  async execute({ limit, urgentOnly }, ctx) {
    requireStaff(ctx);
    const event = await resolveActiveEvent();

    const announcements = await owuApi().staffTasks.announcements.list({ eventId: event.id });
    const filtered = (urgentOnly ? announcements.filter((item) => item.urgent) : announcements).slice(0, limit);

    return {
      event: { id: event.id, name: event.name },
      total: announcements.length,
      announcements: filtered.map((item) => ({
        id: item.id,
        body: item.body,
        urgent: item.urgent,
        audience: item.audience,
        task: item.taskTitle,
        author: item.author?.name ?? null,
        createdAt: item.createdAt,
        ackCount: item.ackCount,
        pending: item.pending.map((person) => person.name),
      })),
    };
  },
});
