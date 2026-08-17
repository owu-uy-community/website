import { defineTool } from "eve/tools";
import { z } from "zod";
import { resolveActiveEvent } from "../lib/board";
import { owuApi } from "../lib/owu-api";
import { requireStaff } from "../lib/staff";

export default defineTool({
  description:
    "SOLO STAFF: estadísticas internas del evento — números del dashboard (grilla, salas, horarios) y resumen de inscripciones de Eventbrite (entradas). Nunca compartas estos números con gente que no sea staff.",
  inputSchema: z.object({}),
  async execute(_input, ctx) {
    requireStaff(ctx);
    const api = owuApi();
    const event = await resolveActiveEvent();

    const [dashboard, eventbrite] = await Promise.allSettled([
      api.dashboard.getStats({ eventId: event.id }),
      api.eventbrite.getSummary(),
    ]);

    return {
      event: { id: event.id, name: event.name, community: event.communityName },
      dashboard:
        dashboard.status === "fulfilled" ? dashboard.value : { error: `No pude leer el dashboard: ${dashboard.reason}` },
      eventbrite:
        eventbrite.status === "fulfilled"
          ? eventbrite.value
          : { error: `No pude leer Eventbrite (¿está configurado?): ${eventbrite.reason}` },
    };
  },
});
