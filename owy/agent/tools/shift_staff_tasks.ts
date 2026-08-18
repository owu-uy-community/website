import { defineTool } from "eve/tools";
import { z } from "zod";
import { resolveActiveEvent } from "../lib/board";
import { eventToday } from "../lib/dates";
import { owuApi } from "../lib/owu-api";
import { requireStaff, staffOnly } from "../lib/staff";

export default defineTool({
  description:
    "SOLO STAFF: corre en bloque TODAS las tareas del staff de un día que arrancan a partir de cierta hora, ±minutos. Es lo que se usa cuando el evento se atrasa o se adelanta ('corré todo lo de las 15:00 en adelante 15 minutos'). Afecta muchas tareas de una: confirmá siempre el día, la hora de corte y los minutos antes de ejecutar.",
  inputSchema: z.object({
    fromTime: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Usá HH:MM")
      .describe("Se corren las tareas que empiezan a esta hora o después"),
    deltaMinutes: z
      .number()
      .int()
      .min(-180)
      .max(180)
      .refine((value) => value !== 0, "El corrimiento no puede ser 0")
      .describe("Minutos a correr: positivo atrasa, negativo adelanta"),
    day: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Usá YYYY-MM-DD")
      .optional()
      .describe("Día afectado (default: hoy en Uruguay)"),
  }),
  approval: staffOnly(),
  async execute({ fromTime, deltaMinutes, day }, ctx) {
    requireStaff(ctx);
    const event = await resolveActiveEvent();
    const dayDate = day ?? eventToday();

    await owuApi().staffTasks.shiftFrom({ eventId: event.id, dayDate, fromTime, deltaMinutes });

    // Read back so the reply states what actually moved.
    const tasks = await owuApi().staffTasks.list({ eventId: event.id });
    const affected = tasks.filter((task) => task.dayDate.slice(0, 10) === dayDate && task.startTime !== null);

    return {
      ok: true,
      day: dayDate,
      fromTime,
      deltaMinutes,
      tasks: affected.map((task) => ({ title: task.title, startTime: task.startTime, endTime: task.endTime })),
    };
  },
});
