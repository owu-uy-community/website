import { defineTool } from "eve/tools";
import { z } from "zod";
import { normalizeText, resolveActiveEvent } from "../lib/board";
import { owuApi } from "../lib/owu-api";
import { requireStaff, staffOnly } from "../lib/staff";

export default defineTool({
  description:
    "SOLO STAFF: publica un aviso en el tablero del staff del evento (les llega a las pantallas y al panel de coordinación). Se puede marcar como urgente y dirigir solo a quienes están asignados a una tarea. Lo firma Owy. Le llega a personas reales: leele el texto a quien lo pide y esperá su OK antes de publicar; no publiques dos veces lo mismo.",
  inputSchema: z.object({
    body: z.string().min(1).max(2000).describe("El mensaje, redactado y listo para publicar"),
    urgent: z.boolean().optional().describe("true para marcarlo como urgente"),
    task: z
      .string()
      .optional()
      .describe("Si se indica, el aviso va solo a quienes están en esa tarea (id o parte del título)"),
  }),
  approval: staffOnly(),
  async execute({ body, urgent, task }, ctx) {
    requireStaff(ctx);
    const event = await resolveActiveEvent();
    const api = owuApi();

    let taskId: string | undefined;
    let taskTitle: string | undefined;
    if (task) {
      const tasks = await api.staffTasks.list({ eventId: event.id });
      const needle = normalizeText(task);
      const matches = tasks.filter((candidate) => candidate.id === task || normalizeText(candidate.title).includes(needle));
      if (matches.length === 0) throw new Error(`No encontré la tarea "${task}" para dirigir el aviso.`);
      if (matches.length > 1) {
        throw new Error(`"${task}" matchea varias tareas: ${matches.map((match) => match.title).join("; ")}.`);
      }
      taskId = matches[0].id;
      taskTitle = matches[0].title;
    }

    const { id } = await api.staffTasks.announcements.create({
      eventId: event.id,
      body,
      urgent: urgent ?? false,
      audience: taskId ? "task" : "all",
      ...(taskId ? { taskId } : {}),
    });

    // create() returns just the id — read it back for who still has to see it.
    const published = (await api.staffTasks.announcements.list({ eventId: event.id })).find(
      (announcement) => announcement.id === id
    );

    return {
      ok: true,
      announcement: {
        id,
        body,
        urgent: urgent ?? false,
        audience: taskId ? "task" : "all",
        task: taskTitle ?? null,
        pending: published?.pending.map((person) => person.name) ?? [],
      },
    };
  },
});
