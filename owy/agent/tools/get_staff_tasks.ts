import { defineTool } from "eve/tools";
import { z } from "zod";
import { resolveActiveEvent } from "../lib/board";
import { eventToday } from "../lib/dates";
import { owuApi, type StaffTask } from "../lib/owu-api";
import { requireStaff } from "../lib/staff";

function matchesDay(task: StaffTask, day: string | undefined): boolean {
  if (!day) return true;
  // dayDate arrives as "YYYY-MM-DD" (or an ISO timestamp on older rows)
  return task.dayDate.slice(0, 10) === day;
}

export default defineTool({
  description:
    "SOLO STAFF: el tablero de tareas del día del evento — qué hay que hacer, en qué horario y lugar, quién está asignado y en qué estado está cada tarea. Incluye el roster del staff (con sus userId) para poder asignar. Usala antes de crear, mover o asignar tareas.",
  inputSchema: z.object({
    day: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Usá formato YYYY-MM-DD")
      .optional()
      .describe("Filtrar por día (YYYY-MM-DD). Omitir para ver todos los días cargados."),
    today: z.boolean().optional().describe("true = solo las tareas de hoy (hora de Uruguay)"),
    status: z
      .enum(["pending", "in_progress", "done", "blocked"])
      .optional()
      .describe("Filtrar por estado"),
    pendingOnly: z.boolean().optional().describe("true = ocultar las tareas ya terminadas"),
  }),
  async execute(input, ctx) {
    requireStaff(ctx);
    const event = await resolveActiveEvent();
    const api = owuApi();

    const [tasks, roster] = await Promise.all([
      api.staffTasks.list({ eventId: event.id }),
      api.staffTasks.roster({ eventId: event.id }),
    ]);

    const day = input.today ? eventToday() : input.day;
    const filtered = tasks
      .filter((task) => matchesDay(task, day))
      .filter((task) => (input.status ? task.status === input.status : true))
      .filter((task) => (input.pendingOnly ? task.status !== "done" : true));

    return {
      event: { id: event.id, name: event.name },
      filters: { day: day ?? null, status: input.status ?? null, pendingOnly: input.pendingOnly ?? false },
      counts: {
        shown: filtered.length,
        total: tasks.length,
        byStatus: {
          pending: filtered.filter((task) => task.status === "pending").length,
          in_progress: filtered.filter((task) => task.status === "in_progress").length,
          done: filtered.filter((task) => task.status === "done").length,
          blocked: filtered.filter((task) => task.status === "blocked").length,
        },
      },
      tasks: filtered.map((task) => ({
        id: task.id,
        title: task.title,
        type: task.type,
        status: task.status,
        day: task.dayDate.slice(0, 10),
        startTime: task.startTime,
        endTime: task.endTime,
        location: task.location,
        minPeople: task.minPeople,
        notes: task.notes,
        assignees: task.assignees.map((person) => ({ userId: person.userId, name: person.name })),
        understaffed: task.minPeople !== null && task.assignees.length < task.minPeople,
      })),
      // userId is what assign/unassign need; emails stay out of the chat.
      roster: roster.map((member) => ({ userId: member.userId, name: member.name, role: member.role })),
    };
  },
});
