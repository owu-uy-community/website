import * as z from "zod";

export const DaySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Usá AAAA-MM-DD");
export const ClockSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Usá HH:MM");
export const DurationSchema = z
  .number()
  .int()
  .min(30)
  .max(12 * 60);

export const EventStatusSchema = z.enum(["draft", "published", "cancelled"]);

/** An event as its organizers see it in the panel, drafts included. */
export const OrganizerEventSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  status: EventStatusSchema,
  startDate: z.string(),
  endDate: z.string(),
  /** While ahead, the date is reserved and every organizer sees it on the calendar. */
  heldUntil: z.string().nullable(),
  /** A draft's date is provisional until it's reserved once. */
  dateChosen: z.boolean(),
  registration: z.enum(["none", "owu", "external"]),
  capacity: z.number().nullable(),
  publishedAt: z.string().nullable(),
  updatedAt: z.string(),
});

export const ListEventsSchema = z.object({ communityId: z.string().min(1) });

export const HoldSchema = z.object({
  communityId: z.string().min(1),
  /** A draft to (re)date; without it a new draft is made for the date. */
  eventId: z.string().min(1).optional(),
  day: DaySchema,
  startTime: ClockSchema,
  durationMin: DurationSchema,
  title: z.string().trim().min(1).max(120).optional(),
});

export const EventRefSchema = z.object({ communityId: z.string().min(1), eventId: z.string().min(1) });

export const HoldResultSchema = OrganizerEventSchema.extend({
  /** Communities with a similar audience told about the date. */
  headsUp: z.number(),
});

export type OrganizerEvent = z.infer<typeof OrganizerEventSchema>;
export type HoldInput = z.infer<typeof HoldSchema>;
