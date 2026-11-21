import * as z from "zod";

/** A null Eventbrite sends for an empty text field reads as "". */
const text = z
  .string()
  .nullish()
  .transform((value) => value ?? "");

/** One ticket's barcode: `used` once it was checked in, with when (`changed`) and how (`checkin_method`). */
export const BarcodeSchema = z.object({
  barcode: z.string(),
  status: z.string(),
  changed: z.string().nullish(),
  checkin_method: z.string().nullish(),
});

/**
 * The attendee fields the admin uses. Eventbrite sends far more (addresses,
 * phones, payment details); those never leave the server.
 */
export const AttendeeSchema = z.object({
  id: z.string(),
  created: z.string(),
  /** When anything about the attendee last changed (a check-in included): the mirror's cursor. */
  changed: z.string().nullish(),
  event_id: z.string().nullish(),
  order_id: z.string().nullish(),
  ticket_class_name: text,
  checked_in: z.boolean(),
  cancelled: z.boolean(),
  refunded: z.boolean(),
  profile: z.object({ name: z.string(), email: text }),
  barcodes: z.array(BarcodeSchema).default([]),
});

export const PaginationSchema = z.object({
  object_count: z.number(),
  page_number: z.number(),
  page_size: z.number(),
  page_count: z.number(),
  has_more_items: z.boolean(),
  continuation: z.string().nullish(),
});

export const AttendeesPageSchema = z.object({ attendees: z.array(AttendeeSchema), pagination: PaginationSchema });

/** An order read with `expand=attendees`: what an `order.placed` webhook points at. */
export const OrderSchema = z.object({ id: z.string(), attendees: z.array(AttendeeSchema).default([]) });

/** What Eventbrite POSTs to a webhook: the action, and the API URL of what changed. */
export const WebhookSchema = z.object({
  config: z.object({ action: z.string().default("") }).default({ action: "" }),
  api_url: z.string(),
});

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
