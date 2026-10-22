import * as z from "zod";

import { ClockSchema, DaySchema, DurationSchema } from "../events/schemas";

export const AMENITIES = ["proyector", "microfono", "wifi", "accesible", "comida"] as const;
export const AmenitySchema = z.enum(AMENITIES);
export type Amenity = z.infer<typeof AmenitySchema>;
export const AMENITY_LABEL: Record<z.infer<typeof AmenitySchema>, string> = {
  proyector: "Proyector o pantalla",
  microfono: "Micrófono",
  wifi: "Wi-Fi para asistentes",
  accesible: "Accesible en silla de ruedas",
  comida: "Se puede comer y tomar algo",
};

/** For chips and filters, where the full label doesn't fit */
export const AMENITY_SHORT: Record<z.infer<typeof AmenitySchema>, string> = {
  proyector: "Proyector",
  microfono: "Micrófono",
  wifi: "Wi-Fi",
  accesible: "Accesible",
  comida: "Comida",
};

const Weekdays = z.array(z.number().int().min(0).max(6)).max(7);

/** A space as organizers see it: never its contacts, never the street address. */
export const VenueSchema = z.object({
  id: z.string(),
  name: z.string(),
  neighbourhood: z.string(),
  city: z.string(),
  capacity: z.number().nullable(),
  amenities: z.array(AmenitySchema),
  hostDays: Weekdays,
  availability: z.string(),
  leadDays: z.number(),
  monthlyCap: z.number().nullable(),
  logoUrl: z.string().nullable(),
  /** Takes requests through OWU; otherwise OWU's staff coordinate it */
  requestable: z.boolean(),
  /** The "Plan B" space, offered last whatever the event */
  fallback: z.boolean(),
  /** Times it hosted this community */
  hostedUs: z.number(),
});

/** What the event needs, to rank the spaces (all optional: without them, the plain list) */
export const VenueListSchema = z.object({
  communityId: z.string().min(1),
  size: z.enum(["hasta-30", "30-60", "60-120", "120+"]).nullish(),
  needs: z.array(AmenitySchema).max(AMENITIES.length).optional(),
  day: DaySchema.nullish(),
});

/** A space for this event: why it doesn't work (blockers) and which needs it doesn't cover */
export const RankedVenueSchema = VenueSchema.extend({
  fit: z.object({ blockers: z.array(z.string()), missing: z.array(AmenitySchema) }),
});

export const RequestOptionSchema = z.object({ day: DaySchema, startTime: ClockSchema, durationMin: DurationSchema });

export const RequestVenueSchema = z.object({
  communityId: z.string().min(1),
  venueId: z.string().min(1),
  /** The event it's for, when there's one already */
  eventId: z.string().min(1).optional(),
  /** Best first */
  options: z.array(RequestOptionSchema).min(1).max(3),
  expectedAttendees: z.number().int().min(5).max(2000),
  message: z.string().trim().max(1000).default(""),
});

export const RequestStatusSchema = z.enum(["pending", "accepted", "declined", "expired", "cancelled"]);
const Option = z.object({ start: z.string(), end: z.string() });

/** A request as its community sees it; the address and contact only once accepted. */
export const VenueRequestSchema = z.object({
  id: z.string(),
  venue: z.object({ id: z.string(), name: z.string(), neighbourhood: z.string() }),
  eventId: z.string().nullable(),
  options: z.array(Option),
  expectedAttendees: z.number(),
  message: z.string(),
  status: RequestStatusSchema,
  chosenOption: z.number().nullable(),
  hostMessage: z.string().nullable(),
  address: z.string().nullable(),
  contact: z.object({ name: z.string(), email: z.string() }).nullable(),
  respondedAt: z.string().nullable(),
  expiresAt: z.string(),
  createdAt: z.string(),
});

export const RequestRefSchema = z.object({ communityId: z.string().min(1), requestId: z.string().min(1) });

/** What the host's link shows: who asks, for when, how many. */
export const HostViewSchema = z.object({
  venueName: z.string(),
  communityName: z.string(),
  /** First name only, until they accept */
  organizerName: z.string(),
  eventName: z.string().nullable(),
  options: z.array(Option),
  expectedAttendees: z.number(),
  message: z.string(),
  status: RequestStatusSchema,
  chosenOption: z.number().nullable(),
  expiresAt: z.string(),
  /** Whether the event page shows the space's street address to anyone, or only to who signs up */
  addressVisibility: z.enum(["public", "attendees"]),
});

export const TokenSchema = z.object({ token: z.string().min(10).max(500) });

export const RespondSchema = z.discriminatedUnion("decision", [
  z.object({
    token: z.string().min(10).max(500),
    decision: z.literal("accept"),
    option: z.number().int().min(0).max(2),
    hostMessage: z.string().trim().max(1000).default(""),
    shareContact: z.boolean().default(false),
    /** The space's choice, kept for its next meetups too */
    addressVisibility: z.enum(["public", "attendees"]).optional(),
  }),
  z.object({
    token: z.string().min(10).max(500),
    decision: z.literal("decline"),
    hostMessage: z.string().trim().max(1000).default(""),
  }),
]);

/** Sumá tu espacio: a company offering its space; staff review it. */
export const SubmitVenueSchema = z.object({
  name: z.string().trim().min(2).max(120),
  neighbourhood: z.string().trim().min(2).max(80),
  city: z.string().trim().min(2).max(80).default("Montevideo"),
  address: z.string().trim().max(200).default(""),
  capacity: z.number().int().min(5).max(2000),
  amenities: z.array(AmenitySchema).max(AMENITIES.length).default([]),
  hostDays: Weekdays.default([]),
  availability: z.string().trim().min(3).max(500),
  monthlyCap: z.number().int().min(1).max(8).nullable().default(null),
  addressVisibility: z.enum(["public", "attendees"]).default("attendees"),
  notes: z.string().trim().max(1000).default(""),
  /** Required: the contact agrees to receive requests (Ley 18.331) */
  consent: z.literal(true),
});

// Site staff
export const ManagedVenueSchema = VenueSchema.omit({ hostedUs: true }).extend({
  address: z.string(),
  mapUrl: z.string().nullable(),
  addressVisibility: z.enum(["public", "attendees"]),
  notes: z.string(),
  status: z.enum(["pending", "active", "archived"]),
  contacts: z.array(z.object({ id: z.string(), name: z.string(), email: z.string(), consentAt: z.string() })),
  createdAt: z.string(),
});

export const UpdateVenueSchema = z.object({
  venueId: z.string().min(1),
  data: z
    .object({
      status: z.enum(["pending", "active", "archived"]),
      requestable: z.boolean(),
      fallback: z.boolean(),
      name: z.string().trim().min(2).max(120),
      neighbourhood: z.string().trim().max(80),
      address: z.string().trim().max(200),
      capacity: z.number().int().min(5).max(2000).nullable(),
      notes: z.string().trim().max(1000),
    })
    .partial()
    .refine((data) => Object.keys(data).length > 0, "No hay nada para cambiar"),
});

export const VenueIdSchema = z.object({ venueId: z.string().min(1) });

export type Venue = z.infer<typeof VenueSchema>;
export type RankedVenue = z.infer<typeof RankedVenueSchema>;
export type VenueListInput = z.infer<typeof VenueListSchema>;
export type VenueRequest = z.infer<typeof VenueRequestSchema>;
export type RequestVenueInput = z.infer<typeof RequestVenueSchema>;
export type RespondInput = z.infer<typeof RespondSchema>;
export type SubmitVenueInput = z.infer<typeof SubmitVenueSchema>;
export type ManagedVenue = z.infer<typeof ManagedVenueSchema>;
