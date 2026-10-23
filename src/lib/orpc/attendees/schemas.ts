import * as z from "zod";

const eventId = z.string().min(1);

/** The tabs: who is in, who is still to come, who won't (cancelled or refunded, and not in). */
export const PresenceSchema = z.enum(["all", "in", "out", "waiting", "pending", "cancelled"]);
/** Name A→Z, latest check-in first, newest registration first; a leading "-" reverses. */
export const AttendeeSortSchema = z.enum(["name", "-name", "checkin", "-checkin", "registered", "-registered"]);

const tag = z.string().trim().min(1).max(32);

const Filters = z.object({
  eventId,
  /** Name, email or barcode; accents and case don't matter, every word has to match. */
  q: z.string().trim().max(120).default(""),
  status: PresenceSchema.default("all"),
  /** Ticket classes: any of them. */
  ticket: z.array(z.string().max(120)).max(30).default([]),
  /** Tags: any of them. */
  tag: z.array(tag).max(30).default([]),
  /** "no": people with a seat who haven't answered "Voy" (and aren't in yet) */
  confirmed: z.enum(["yes", "no"]).optional(),
});

export const ListAttendeesSchema = Filters.extend({
  sort: AttendeeSortSchema.default("name"),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(10).max(200).default(50),
});

export const ExportAttendeesSchema = Filters.extend({
  /** Only these (the selection), still within the event. */
  ids: z.array(z.string().min(1)).max(5000).optional(),
});

export const SetTagsSchema = z
  .object({
    eventId,
    ids: z.array(z.string().min(1)).min(1).max(5000),
    add: z.array(tag).max(10).default([]),
    remove: z.array(tag).max(10).default([]),
  })
  .refine((input) => input.add.length + input.remove.length > 0, "Decí qué etiqueta agregar o sacar");

export const SyncSchema = z.object({
  eventId,
  /** "Sincronizar ahora": skips the 30 s wait (not the 5 s floor). */
  force: z.boolean().default(false),
});

export const CheckinsSchema = z.object({
  eventId,
  /** Start of the arrival curve; an hour ago by default. */
  since: z.iso.datetime().optional(),
});

export const RecentSchema = z.object({ eventId, limit: z.number().int().min(1).max(50).default(25) });

/** A check-in that shouldn't have happened, taken back. */
export const UndoCheckinSchema = z.object({ eventId, attendeeId: z.string().min(1) });

export const ScanSchema = z.object({
  eventId,
  /** What the camera read (the ticket's barcode), or what was typed: a barcode or an Eventbrite attendee id. */
  code: z.string().trim().min(1).max(200),
  /** Made by the phone per scan, so replaying an offline queue can't count anyone twice. */
  nonce: z.string().min(8).max(100),
  device: z.string().trim().max(60).default(""),
  /** When the phone scanned it (queued scans arrive later). */
  scannedAt: z.iso.datetime().optional(),
});

export const AttendeeStatusSchema = z.enum([
  "attending",
  "cancelled",
  "refunded",
  "waitlisted",
  "offered",
  "pending",
  "declined",
]);

/** What a ticket that doesn't get you in is called, in the table and at the door. */
export const NOT_ATTENDING_LABEL: Record<Exclude<z.infer<typeof AttendeeStatusSchema>, "attending">, string> = {
  cancelled: "Cancelada",
  refunded: "Reembolsada",
  waitlisted: "En lista de espera",
  offered: "Lugar ofrecido, sin confirmar",
  pending: "Pendiente de aprobación",
  declined: "No aprobada",
};
export const CheckinSourceSchema = z.enum(["eventbrite", "owu"]);

/**
 * Someone's attendance in the community before this event (lib/organizar/attendance). Private to
 * the community's organizers: never on public pages, never to hosts.
 */
export const HistorySchema = z.object({
  attended: z.number(),
  noShows: z.number(),
  lateReleases: z.number(),
  excused: z.number(),
  seated: z.number(),
});

/** An answer to a sign-up question, with the question's label (the ID only for community admins) */
export const AnswerSchema = z.object({ label: z.string(), value: z.string() });

export const AttendeeSchema = z.object({
  id: z.string(),
  /** Null for OWU's own RSVPs. */
  eventbriteId: z.string().nullable(),
  source: z.enum(["eventbrite", "owu"]),
  name: z.string(),
  email: z.string(),
  ticketClass: z.string(),
  status: AttendeeStatusSchema,
  barcode: z.string().nullable(),
  checkedInAt: z.string().nullable(),
  checkinSource: CheckinSourceSchema.nullable(),
  /** "Escaneo", "Búsqueda" (Organizer) or the OWU scanner's device name. */
  checkinDevice: z.string().nullable(),
  registeredAt: z.string().nullable(),
  tags: z.array(z.string()),
  /** Times OWU's scanner read this ticket again after it was used. */
  repeatScans: z.number(),
  // Organizá's list only (attendees.list for the community's organizers): never at the door or in /admin
  /** Their +1s */
  guests: z.number().optional(),
  /** When they answered "Voy" to the reminder */
  confirmedAt: z.string().nullable().optional(),
  /** The team took their place, or marked that they said they couldn't come */
  excused: z.boolean().optional(),
  answers: z.array(AnswerSchema).optional(),
  volunteerRoles: z.array(z.string()).optional(),
  history: HistorySchema.nullable().optional(),
});

const Count = z.object({ value: z.string(), count: z.number() });
const PresenceCounts = z.object({
  all: z.number(),
  in: z.number(),
  out: z.number(),
  waiting: z.number(),
  pending: z.number(),
  cancelled: z.number(),
});

export const AttendeeListSchema = z.object({
  rows: z.array(AttendeeSchema),
  page: z.number(),
  pageSize: z.number(),
  /** Every facet counts with the other filters applied, so the numbers always add up to what you'd get. */
  facets: z.object({ status: PresenceCounts, tickets: z.array(Count), tags: z.array(Count) }),
  /** The whole event, no filters. */
  totals: PresenceCounts,
  /** Organizá's list: the numbers headcount() labels (lugares, anotados, en espera) */
  headcount: z
    .object({
      attending: z.number(),
      guests: z.number(),
      offered: z.number(),
      waitlisted: z.number(),
      pending: z.number(),
      confirmed: z.number(),
    })
    .optional(),
});

export const ExportSchema = z.object({ filename: z.string(), csv: z.string(), count: z.number() });

export const SyncStateSchema = z.object({
  /** The Eventbrite event mirrored, or null when the event has none. */
  eventbriteEventId: z.string().nullable(),
  /** Why the mirror can't run: no Eventbrite event set, or no API key on the server. */
  missing: z.enum(["event_id", "api_key"]).nullable(),
  /** The last read that worked. */
  syncedAt: z.string().nullable(),
  /** The last webhook Eventbrite sent. */
  webhookAt: z.string().nullable(),
  /** Why the last read failed; null once one works again. */
  error: z.string().nullable(),
  /** Whether this call read Eventbrite (not throttled, not already running elsewhere). */
  ran: z.boolean(),
  /** Attendees added or updated by this call. */
  changed: z.number(),
});

export const CheckinStatsSchema = z.object({
  /** Check-ins per 5 minutes, oldest first, the last one still filling. */
  buckets: z.array(z.object({ at: z.string(), count: z.number() })),
  last15: z.number(),
  /** The busiest quarter hour so far. */
  peak: z.object({ at: z.string(), count: z.number() }).nullable(),
  /** Check-ins per door: Organizer's method, or the OWU scanner's device name. */
  doors: z.array(z.object({ device: z.string(), source: CheckinSourceSchema, count: z.number() })),
});

export const RecentEntrySchema = z.object({
  id: z.string(),
  /** In, read again after being in, or a code that doesn't let anyone in. */
  kind: z.enum(["in", "repeat", "unknown", "cancelled"]),
  at: z.string(),
  name: z.string().nullable(),
  ticketClass: z.string().nullable(),
  device: z.string().nullable(),
  source: CheckinSourceSchema.nullable(),
  /** For a repeat: when they had come in. */
  firstAt: z.string().nullable(),
  /** For an unknown code: what was read. */
  code: z.string().nullable(),
});

export const ScanResultSchema = z.object({
  result: z.enum(["ok", "repeat", "unknown", "cancelled"]),
  /** This nonce was already counted: the same answer as the first time. */
  replayed: z.boolean(),
  scannedAt: z.string(),
  attendee: AttendeeSchema.pick({
    id: true,
    name: true,
    ticketClass: true,
    status: true,
    checkedInAt: true,
    checkinSource: true,
    checkinDevice: true,
  })
    .extend({
      /** Their first time with the community: the door greets them (derived, never asked) */
      firstTime: z.boolean().optional(),
      /** "Sin fotos" / "Fotos: preguntar antes", from the photo question */
      photo: z.string().nullable().optional(),
    })
    .nullable(),
});

// ---------------------------------------------------------------------------
// Raffles
// ---------------------------------------------------------------------------

export const ListRafflesSchema = z.object({ eventId });
export const CreateRaffleSchema = z.object({
  eventId,
  prize: z.string().trim().min(1, "¿Qué se sortea?").max(40, "Hasta 40 letras: es el título en la pantalla"),
});
export const RaffleIdSchema = z.object({ raffleId: z.string().min(1) });
/** A new prize for a raffle; its seed stays, so every draw can still be checked. */
export const UpdateRaffleSchema = RaffleIdSchema.extend({
  prize: z.string().trim().min(1, "¿Qué se sortea?").max(40, "Hasta 40 letras: es el título en la pantalla"),
});
export const DrawIdSchema = z.object({ drawId: z.string().min(1) });

export const RaffleDrawSchema = z.object({
  id: z.string(),
  status: z.enum(["pending", "claimed", "redrawn"]),
  attendeeId: z.string(),
  name: z.string(),
  ticketClass: z.string(),
  /** How many were in the hat. */
  poolSize: z.number(),
  drawnAt: z.string(),
});

export const RaffleSchema = z.object({
  id: z.string(),
  prize: z.string(),
  seed: z.string(),
  createdAt: z.string(),
  /** Who could win the next draw: checked in, attending, not drawn yet. */
  pool: z.number(),
  /** Oldest first. */
  draws: z.array(RaffleDrawSchema),
});

export type AttendeeListInput = z.infer<typeof ListAttendeesSchema>;
export type AttendeeFilters = z.infer<typeof Filters>;
export type Attendee = z.infer<typeof AttendeeSchema>;
export type AttendeeList = z.infer<typeof AttendeeListSchema>;
export type Presence = z.infer<typeof PresenceSchema>;
export type AttendeeSort = z.infer<typeof AttendeeSortSchema>;
export type SyncState = z.infer<typeof SyncStateSchema>;
export type CheckinStats = z.infer<typeof CheckinStatsSchema>;
export type RecentEntry = z.infer<typeof RecentEntrySchema>;
export type ScanInput = z.infer<typeof ScanSchema>;
export type ScanResult = z.infer<typeof ScanResultSchema>;
export type Raffle = z.infer<typeof RaffleSchema>;
export type RaffleDraw = z.infer<typeof RaffleDrawSchema>;
