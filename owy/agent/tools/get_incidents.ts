import { defineTool } from "eve/tools";
import { z } from "zod";
import { resolveActiveEvent } from "../lib/board";
import { owuApi } from "../lib/owu-api";
import { requireStaff } from "../lib/staff";

export default defineTool({
  description:
    "SOLO STAFF: los incidentes del evento, abiertos y los más graves primero: qué pasa, dónde, gravedad, estado y quién lo tiene. Los confidenciales (código de conducta) no se detallan acá, solo se cuentan: los ven los organizadores en el admin.",
  inputSchema: z.object({
    status: z
      .enum(["open", "in_progress", "resolved"])
      .optional()
      .describe("open: sin tomar · in_progress: alguien lo tiene · resolved: cerrados. Omitir = todo lo que sigue sin resolver"),
  }),
  async execute({ status }, ctx) {
    requireStaff(ctx);
    const event = await resolveActiveEvent();

    const incidents = await owuApi().incidents.list({ eventId: event.id, ...(status ? { status } : {}) });
    const shown = status ? incidents : incidents.filter((incident) => incident.status !== "resolved");
    const confidential = shown.filter((incident) => incident.sensitive).length;

    return {
      event: { id: event.id, name: event.name },
      incidents: shown
        .filter((incident) => !incident.sensitive)
        .map((incident) => ({
          id: incident.id,
          title: incident.title,
          category: incident.category,
          severity: incident.severity,
          status: incident.status,
          where: incident.room?.name ?? incident.location,
          assignee: incident.assignee?.name ?? null,
          reportedAt: incident.createdAt,
        })),
      // Owy answers in shared channels: never more than that there are some.
      confidential,
    };
  },
});
