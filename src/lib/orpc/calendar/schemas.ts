import * as z from "zod";

import { ClockSchema, DurationSchema } from "../events/schemas";

export const PlanSchema = z.object({
  communityId: z.string().min(1),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Usá AAAA-MM"),
  startTime: ClockSchema.default("19:00"),
  durationMin: DurationSchema.default(120),
  /** A space being considered: its busy days and host weekdays block days */
  venueId: z.string().min(1).optional(),
});

export const ReasonSchema = z.object({
  tone: z.enum(["ok", "info", "warn", "bad"]),
  text: z.string(),
  itemId: z.string().optional(),
});

export const DayScoreSchema = z.object({
  day: z.string(),
  score: z.number(),
  level: z.enum(["libre", "cuidado", "choca", "bloqueado"]),
  blocked: z.boolean(),
  reasons: z.array(ReasonSchema),
});

export const PlanItemSchema = z.object({
  id: z.string(),
  communitySlug: z.string().nullable(),
  communityName: z.string(),
  /** Null for another community's hold: who reserved shows, not for what. */
  title: z.string().nullable(),
  start: z.string(),
  end: z.string().nullable(),
  kind: z.enum(["event", "hold"]),
  isOwu: z.boolean(),
  /** This community's own event or hold */
  own: z.boolean(),
  /** A similar audience (or OWU's own events): what "Mi audiencia" shows */
  related: z.boolean(),
  /** Where to read more: the Meetup page for feed items */
  url: z.string().nullable(),
});

export const PlanResultSchema = z.object({
  month: z.string(),
  from: z.string(),
  to: z.string(),
  days: z.array(DayScoreSchema),
  suggestions: z.array(DayScoreSchema),
  items: z.array(PlanItemSchema),
});

export type PlanInput = z.infer<typeof PlanSchema>;
export type PlanResult = z.infer<typeof PlanResultSchema>;
export type PlanItem = z.infer<typeof PlanItemSchema>;
export type PlanDay = z.infer<typeof DayScoreSchema>;
