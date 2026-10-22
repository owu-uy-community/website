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

// ---------------------------------------------------------------------------
// The wizard: create, edit (autosave), publish, cancel
// ---------------------------------------------------------------------------

export const FORMATS = ["charlas", "taller", "open-space", "social", "hackathon", "otro"] as const;
export const FormatSchema = z.enum(FORMATS);
export const ModeSchema = z.enum(["presencial", "online", "hibrido"]);
export const RegistrationSchema = z.enum(["none", "owu", "external"]);
const HttpsUrl = z.url({ protocol: /^https$/, message: "Usá un link https://" });

export const QuestionSchema = z.object({
  id: z.string().min(1).max(20),
  label: z.string().trim().min(1).max(200),
  required: z.boolean(),
});

/** Everything the wizard edits, plus where the event lives. */
export const EditableEventSchema = OrganizerEventSchema.extend({
  communitySlug: z.string(),
  summary: z.string().nullable(),
  description: z.string().nullable(),
  format: FormatSchema.nullable(),
  topics: z.array(z.string()),
  mode: ModeSchema,
  venueId: z.string().nullable(),
  venue: z.object({ id: z.string(), name: z.string(), neighbourhood: z.string(), address: z.string() }).nullable(),
  placeName: z.string().nullable(),
  placeAddress: z.string().nullable(),
  venueMapUrl: z.string().nullable(),
  onlineUrl: z.string().nullable(),
  registrationUrl: z.string().nullable(),
  approval: z.boolean(),
  waitlist: z.boolean(),
  guestsAllowed: z.number(),
  rsvpClosesAt: z.string().nullable(),
  questions: z.array(QuestionSchema),
  externalLinks: z.object({ meetup: z.string().optional() }),
});

/** What autosave sends: any subset, checked loosely (publishing checks the rest). */
export const DraftPatchSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    summary: z.string().trim().max(140).nullable(),
    description: z.string().max(10_000).nullable(),
    format: FormatSchema.nullable(),
    topics: z.array(z.string().min(1).max(30)).max(5),
    mode: ModeSchema,
    placeName: z.string().trim().max(120).nullable(),
    placeAddress: z.string().trim().max(200).nullable(),
    venueMapUrl: HttpsUrl.nullable(),
    onlineUrl: HttpsUrl.nullable(),
    registration: RegistrationSchema,
    registrationUrl: HttpsUrl.nullable(),
    approval: z.boolean(),
    capacity: z.number().int().min(1).max(5000).nullable(),
    waitlist: z.boolean(),
    guestsAllowed: z.number().int().min(0).max(3),
    rsvpClosesAt: z.iso.datetime().nullable(),
    questions: z.array(QuestionSchema).max(5),
    externalLinks: z.object({
      meetup: HttpsUrl.refine(
        (url) => /^(www\.)?meetup\.com$/.test(new URL(url).hostname),
        "Pegá el link del evento en meetup.com"
      ).optional(),
    }),
    /** Published events move their date here (drafts reserve one instead) */
    schedule: z.object({ day: DaySchema, startTime: ClockSchema, durationMin: DurationSchema }),
  })
  .partial();

export const CreateDraftSchema = z.object({
  communityId: z.string().min(1),
  title: z.string().trim().min(1).max(120).optional(),
  /** Start from a previous event's texts and settings */
  copyFrom: z.string().min(1).optional(),
});

export const SaveEventSchema = z.object({
  communityId: z.string().min(1),
  eventId: z.string().min(1),
  /** The `updatedAt` the editor started from: an older one means someone else saved in between */
  expectedUpdatedAt: z.string(),
  patch: DraftPatchSchema,
});

export const PublishResultSchema = z.object({ event: EditableEventSchema, path: z.string() });

export const CancelEventSchema = EventRefSchema.extend({ reason: z.string().trim().max(500).default("") });

export type EditableEvent = z.infer<typeof EditableEventSchema>;
export type DraftPatch = z.infer<typeof DraftPatchSchema>;

// ---------------------------------------------------------------------------
// The public page
// ---------------------------------------------------------------------------

/** An event as anyone sees it: never the online link; the exact address only when its host allows. */
export const PublicEventSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  summary: z.string().nullable(),
  description: z.string().nullable(),
  format: FormatSchema.nullable(),
  topics: z.array(z.string()),
  startDate: z.string(),
  endDate: z.string(),
  status: EventStatusSchema,
  mode: ModeSchema,
  place: z
    .object({
      name: z.string(),
      area: z.string().nullable(),
      /** Null when the host shows it only to attendees */
      address: z.string().nullable(),
      mapUrl: z.string().nullable(),
    })
    .nullable(),
  registration: RegistrationSchema,
  registrationUrl: z.string().nullable(),
  capacity: z.number().nullable(),
  waitlist: z.boolean(),
  approval: z.boolean(),
  guestsAllowed: z.number(),
  rsvpClosesAt: z.string().nullable(),
  questions: z.array(QuestionSchema),
  /** Seats taken (with +1s) and people waiting, for "quedan 12" */
  taken: z.number(),
  waiting: z.number(),
  /** It has an open-space board (rooms and slots) */
  hasBoard: z.boolean(),
  community: z.object({ slug: z.string(), name: z.string(), logoUrl: z.string().nullable() }),
  meetupUrl: z.string().nullable(),
});

export const EventBySlugSchema = z.object({ communitySlug: z.string().min(1), eventSlug: z.string().min(1) });

export type PublicEvent = z.infer<typeof PublicEventSchema>;

// ---------------------------------------------------------------------------
// The event dashboard
// ---------------------------------------------------------------------------

export const EventStatsSchema = z.object({
  capacity: z.number().nullable(),
  /** Seats taken, with +1s */
  taken: z.number(),
  attending: z.number(),
  waiting: z.number(),
  pending: z.number(),
  cancelled: z.number(),
  checkedIn: z.number(),
});

export const MessageSchema = z.object({
  communityId: z.string().min(1),
  eventId: z.string().min(1),
  /** Who gets it, by where they stand */
  to: z.array(z.enum(["attending", "waiting", "pending"])).min(1),
  subject: z.string().trim().min(3).max(120),
  body: z.string().trim().min(10).max(5000),
});
