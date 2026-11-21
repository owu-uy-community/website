import * as z from "zod";

import { MAX_RESPONDERS } from "../../organizar/steps";

export const EventRefSchema = z.object({ eventId: z.string().min(1) });

/** Who can be named a responder (editors and up, custom roles too) and who is */
export const ConductTeamSchema = z.object({
  responders: z.array(z.string()),
  candidates: z.array(z.object({ userId: z.string(), name: z.string(), role: z.string() })),
  capacity: z.number().nullable(),
});

export const SetRespondersSchema = EventRefSchema.extend({
  userIds: z
    .array(z.string().min(1))
    .max(MAX_RESPONDERS, `Hasta ${MAX_RESPONDERS} personas`)
    .refine((ids) => new Set(ids).size === ids.length, "Cada persona una vez"),
});

/** A report from the event's page: anonymous unless they leave a way to reach them */
export const ReportSchema = z.object({
  communitySlug: z.string().min(1),
  eventSlug: z.string().min(1),
  description: z.string().trim().min(10, "Contanos un poco más: con 10 letras alcanza").max(4000),
  where: z.string().trim().max(200).default(""),
  contact: z.string().trim().max(200).default(""),
  /** It names someone on the team: it goes to OWU's conduct team only */
  involvesOrganizer: z.boolean().default(false),
});

export const ReportStatusSchema = z.enum(["open", "in_progress", "resolved"]);

const NoteSchema = z.object({ id: z.string(), body: z.string(), author: z.string().nullable(), createdAt: z.string() });

export const ConductReportSchema = z.object({
  id: z.string(),
  description: z.string(),
  where: z.string().nullable(),
  contact: z.string().nullable(),
  involvesOrganizer: z.boolean(),
  status: ReportStatusSchema,
  createdAt: z.string(),
  notes: z.array(NoteSchema),
});

/** The event's reports for who may read them: its responders, and OWU's conduct staff */
export const ConductReportsSchema = z.object({
  event: z.object({ id: z.string(), name: z.string(), startDate: z.string() }),
  /** Why the caller reads them: named on the event, or OWU staff (who also see the ones about the team) */
  as: z.enum(["responder", "staff"]),
  reports: z.array(ConductReportSchema),
});

export const ReportRefSchema = EventRefSchema.extend({ id: z.string().min(1) });
export const AddReportNoteSchema = ReportRefSchema.extend({
  body: z.string().trim().min(1, "Escribí la nota").max(2000),
});
export const SetReportStatusSchema = ReportRefSchema.extend({ status: ReportStatusSchema });

export type ConductReports = z.infer<typeof ConductReportsSchema>;
export type ReportInput = z.infer<typeof ReportSchema>;
