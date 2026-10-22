import * as z from "zod";

import { AttendeeStatusSchema } from "../attendees/schemas";

export const RsvpEventSchema = z.object({ eventId: z.string().min(1) });

export const JoinSchema = z.object({
  eventId: z.string().min(1),
  guests: z.number().int().min(0).max(3).default(0),
  answers: z.record(z.string().max(20), z.string().trim().max(500)).default({}),
  /** Show their first name and initial in the event page's «quiénes van». */
  showName: z.boolean().default(false),
});

export const RsvpTokenSchema = z.object({ token: z.string().min(10).max(500) });

export const ReviewSchema = z.object({
  communityId: z.string().min(1),
  eventId: z.string().min(1),
  attendeeId: z.string().min(1),
  decision: z.enum(["approve", "decline"]),
});

/** An organizer acting on one person of their event */
export const SeatSchema = ReviewSchema.omit({ decision: true });

export const CancelSpotsSchema = SeatSchema.omit({ attendeeId: true }).extend({
  attendeeIds: z.array(z.string().min(1)).min(1).max(200),
});

export const TestEmailsSchema = SeatSchema.omit({ attendeeId: true });

/** Someone's place in an event, as they see it. The code, address and online link only with a seat. */
export const MyRsvpSchema = z.object({
  id: z.string(),
  status: AttendeeStatusSchema,
  guests: z.number(),
  registeredAt: z.string().nullable(),
  offerExpiresAt: z.string().nullable(),
  /** Their place in the waitlist, 1 first */
  position: z.number().nullable(),
  code: z.string().nullable(),
  address: z.string().nullable(),
  onlineUrl: z.string().nullable(),
  checkedInAt: z.string().nullable(),
});

/** The ticket page: the event and the person's place in it, from a session or a signed link. */
export const TicketSchema = z.object({
  rsvp: MyRsvpSchema,
  name: z.string(),
  token: z.string(),
  event: z.object({
    name: z.string(),
    slug: z.string(),
    startDate: z.string(),
    endDate: z.string(),
    status: z.enum(["draft", "published", "cancelled"]),
    place: z.string(),
    community: z.object({ slug: z.string(), name: z.string() }),
  }),
});

/** An event someone signed up for, for Mis eventos */
export const MyEventSchema = z.object({
  rsvp: MyRsvpSchema,
  event: z.object({
    id: z.string(),
    name: z.string(),
    slug: z.string(),
    startDate: z.string(),
    status: z.enum(["draft", "published", "cancelled"]),
    community: z.object({ slug: z.string(), name: z.string() }),
  }),
});

export type MyRsvp = z.infer<typeof MyRsvpSchema>;
export type Ticket = z.infer<typeof TicketSchema>;
export type JoinInput = z.infer<typeof JoinSchema>;
