import { defineTool } from "eve/tools";
import { z } from "zod";
import { resolveActiveEvent } from "../lib/board";
import { eventToday } from "../lib/dates";
import { normalizeText } from "../lib/board";
import { owuApi, type StaffTask, type UpdateStaffTaskData } from "../lib/owu-api";
import { requireStaff, staffOnly } from "../lib/staff";

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Resolve a task by id or (accent-insensitive) title, like the grid tools do. */
function findTask(tasks: StaffTask[], ref: string): StaffTask {
  const byId = tasks.find((task) => task.id === ref);
  if (byId) return byId;

  const needle = normalizeText(ref);
  const matches = tasks.filter((task) => normalizeText(task.title).includes(needle));
  if (matches.length === 1) return matches[0];
  if (matches.length === 0) {
    throw new Error(`No encontré ninguna tarea que matchee "${ref}". Mirá el tablero con get_staff_tasks.`);
  }

  const candidates = matches
    .slice(0, 6)
    .map((task) => `«${task.title}» (${task.dayDate.slice(0, 10)} ${task.startTime ?? "sin hora"}, id ${task.id})`)
    .join("; ");
  throw new Error(`"${ref}" matchea varias tareas: ${candidates}. Indicá el id o un título más específico.`);
}

/** Resolve a person by userId or name against the event's staff roster. */
function findPerson(roster: { userId: string; name: string }[], ref: string): { userId: string; name: string } {
  const byId = roster.find((person) => person.userId === ref);
  if (byId) return byId;

  const needle = normalizeText(ref);
  const matches = roster.filter((person) => normalizeText(person.name).includes(needle));
  if (matches.length === 1) return matches[0];
  if (matches.length === 0) {
    throw new Error(`No encontré a "${ref}" en el staff del evento. Mirá el roster con get_staff_tasks.`);
  }

  throw new Error(`"${ref}" matchea a varias personas: ${matches.map((person) => person.name).join(", ")}.`);
}

export default defineTool({
  description:
    "SOLO STAFF: administra el tablero de tareas del staff. Acciones: create (tarea nueva), update (editar), set_status (pending/in_progress/done/blocked), assign / unassign (persona por nombre o userId), delete. Mirá primero el tablero con get_staff_tasks; las tareas y las personas se referencian por id o por nombre.",
  inputSchema: z.object({
    action: z.enum(["create", "update", "set_status", "assign", "unassign", "delete"]),
    task: z
      .string()
      .optional()
      .describe("Tarea sobre la que operar (id o parte del título). Requerido salvo en create."),
    title: z.string().min(1).max(200).optional().describe("Título (create; opcional en update)"),
    notes: z.string().max(4000).optional().describe("Instrucciones o detalle"),
    type: z.enum(["task", "ongoing", "milestone"]).optional().describe("task (default), ongoing o milestone"),
    day: z.string().regex(DAY, "Usá YYYY-MM-DD").optional().describe("Día de la tarea (default: hoy en Uruguay)"),
    startTime: z.string().regex(TIME, "Usá HH:MM").nullish().describe("Hora de inicio 'HH:MM'"),
    endTime: z.string().regex(TIME, "Usá HH:MM").nullish().describe("Hora de fin 'HH:MM'"),
    minPeople: z.number().int().min(1).max(99).nullish().describe("Cuánta gente hace falta"),
    location: z.string().max(120).nullish().describe("Dónde (ej: 'Puerta', 'Sala Cueva')"),
    status: z.enum(["pending", "in_progress", "done", "blocked"]).optional().describe("Para set_status"),
    person: z.string().optional().describe("Para assign/unassign: nombre o userId de la persona"),
  }),
  approval: staffOnly(),
  async execute(input, ctx) {
    requireStaff(ctx);
    const event = await resolveActiveEvent();
    const api = owuApi();
    const eventId = event.id;

    if (input.action === "create") {
      if (!input.title) throw new Error("create necesita un título.");
      const created = await api.staffTasks.create({
        eventId,
        title: input.title,
        dayDate: input.day ?? eventToday(),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        ...(input.type !== undefined ? { type: input.type } : {}),
        ...(input.startTime !== undefined ? { startTime: input.startTime } : {}),
        ...(input.endTime !== undefined ? { endTime: input.endTime } : {}),
        ...(input.minPeople !== undefined ? { minPeople: input.minPeople } : {}),
        ...(input.location !== undefined ? { location: input.location } : {}),
      });

      return {
        ok: true,
        action: input.action,
        task: { id: created.id, title: created.title, day: created.dayDate.slice(0, 10), startTime: created.startTime },
      };
    }

    if (!input.task) throw new Error(`${input.action} necesita indicar la tarea (id o título).`);

    const tasks = await api.staffTasks.list({ eventId });
    const task = findTask(tasks, input.task);

    switch (input.action) {
      case "update": {
        const data: UpdateStaffTaskData = {
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.notes !== undefined ? { notes: input.notes } : {}),
          ...(input.type !== undefined ? { type: input.type } : {}),
          ...(input.day !== undefined ? { dayDate: input.day } : {}),
          ...(input.startTime !== undefined ? { startTime: input.startTime } : {}),
          ...(input.endTime !== undefined ? { endTime: input.endTime } : {}),
          ...(input.minPeople !== undefined ? { minPeople: input.minPeople } : {}),
          ...(input.location !== undefined ? { location: input.location } : {}),
        };
        if (Object.keys(data).length === 0) throw new Error("update necesita al menos un campo a cambiar.");

        const updated = await api.staffTasks.update({ eventId, taskId: task.id, data });
        return { ok: true, action: input.action, task: { id: updated.id, title: updated.title, day: updated.dayDate.slice(0, 10), startTime: updated.startTime, location: updated.location } };
      }

      case "set_status": {
        if (!input.status) throw new Error("set_status necesita status.");
        const updated = await api.staffTasks.setStatus({ eventId, taskId: task.id, status: input.status });
        return { ok: true, action: input.action, task: { id: updated.id, title: updated.title, status: updated.status } };
      }

      case "assign":
      case "unassign": {
        if (!input.person) throw new Error(`${input.action} necesita person (nombre o userId).`);
        const roster = await api.staffTasks.roster({ eventId });
        const person = findPerson(
          roster.map((member) => ({ userId: member.userId, name: member.name })),
          input.person
        );
        const updated =
          input.action === "assign"
            ? await api.staffTasks.assign({ eventId, taskId: task.id, userId: person.userId })
            : await api.staffTasks.unassign({ eventId, taskId: task.id, userId: person.userId });

        return {
          ok: true,
          action: input.action,
          person: person.name,
          task: {
            id: updated.id,
            title: updated.title,
            assignees: updated.assignees.map((assignee) => assignee.name),
          },
        };
      }

      case "delete": {
        await api.staffTasks.delete({ eventId, taskId: task.id });
        return { ok: true, action: input.action, deleted: { id: task.id, title: task.title } };
      }
    }
  },
});
