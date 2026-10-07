import * as z from "zod";

export const GetAttendeesSchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(50),
  status: z.string().optional(),
});

/**
 * The attendee fields the admin uses. Eventbrite sends far more (addresses,
 * phones, payment details); those never leave the server.
 */
export const AttendeeSchema = z.object({
  id: z.string(),
  created: z.string(),
  ticket_class_name: z.string().default(""),
  checked_in: z.boolean(),
  cancelled: z.boolean(),
  refunded: z.boolean(),
  profile: z.object({ name: z.string(), email: z.string().default("") }),
});

export const PaginationSchema = z.object({
  object_count: z.number(),
  page_number: z.number(),
  page_size: z.number(),
  page_count: z.number(),
  has_more_items: z.boolean(),
});

export const AttendeesPageSchema = z.object({ attendees: z.array(AttendeeSchema), pagination: PaginationSchema });

export const EventbriteEventSchema = z.object({
  id: z.string(),
  name: z.object({ text: z.string() }),
  start: z.object({ local: z.string() }),
  end: z.object({ local: z.string() }),
  capacity: z.number().nullish(),
  status: z.string(),
});

export const SummarySchema = z.object({
  event: z.object({
    id: z.string(),
    name: z.string(),
    start: z.string(),
    end: z.string(),
    capacity: z.number().nullable(),
    status: z.string(),
  }),
  summary: z.object({
    total_attendees: z.number(),
    checked_in: z.number(),
    not_checked_in: z.number(),
    cancelled: z.number(),
    refunded: z.number(),
  }),
});

export type Attendee = z.infer<typeof AttendeeSchema>;
export type Summary = z.infer<typeof SummarySchema>;
