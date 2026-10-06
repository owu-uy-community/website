import * as z from "zod";

/** A time-of-day as the board shows it: "15:00". */
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Formato inválido (HH:MM)");

/** Editable fields without defaults, so a partial update only touches what it was sent. */
const ScheduleFields = z.object({
  name: z.string().min(1, "El nombre es obligatorio"),
  startTime: time,
  endTime: time,
  date: z.iso.datetime(),
  isActive: z.boolean(),
  highlightInKiosk: z.boolean(),
});

/** What the API returns. Shapes only — input rules don't apply to rows already stored. */
export const ScheduleSchema = z.object({
  id: z.string(),
  openSpaceId: z.string(),
  name: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  date: z.string(),
  isActive: z.boolean(),
  highlightInKiosk: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const CreateScheduleSchema = ScheduleFields.extend({
  openSpaceId: z.string().min(1),
  isActive: z.boolean().default(true),
  highlightInKiosk: z.boolean().default(false),
});

export const UpdateScheduleInputSchema = z.object({ id: z.string().min(1), data: ScheduleFields.partial() });
export const ScheduleIdSchema = z.object({ id: z.string().min(1) });
export const GetSchedulesByOpenSpaceSchema = z.object({ openSpaceId: z.string().min(1) });

export type Schedule = z.infer<typeof ScheduleSchema>;
export type CreateScheduleInput = z.infer<typeof CreateScheduleSchema>;
