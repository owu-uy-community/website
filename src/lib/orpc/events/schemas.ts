import * as z from "zod";

import { VenueFactsSchema } from "../../organizar/venue-facts";

const PublicVenueFactsSchema = VenueFactsSchema.pick({
  stepFree: true,
  elevator: true,
  accessibleRestroom: true,
  genderNeutralRestroom: true,
  parking: true,
  transit: true,
  idRequired: true,
  foodRules: true,
});

export const DaySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Usá AAAA-MM-DD")
  .refine((day) => {
    const date = new Date(`${day}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(day);
  }, "Esa fecha no existe");
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
  registration: z.enum(["none", "owu", "external", "eventbrite"]),
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
export const RegistrationSchema = z.enum(["none", "owu", "external", "eventbrite"]);
const HttpsUrl = z.url({ protocol: /^https$/, message: "Usá un link https://" });

/** How many people they expect; venues are matched on it */
export const SIZE_BUCKETS = ["hasta-30", "30-60", "60-120", "120+"] as const;
export const SizeBucketSchema = z.enum(SIZE_BUCKETS);

/** A talk; a row being typed may still be empty (the page skips it) */
export const TalkSchema = z.object({
  title: z.string().max(160),
  speaker: z.string().max(120),
});

/** Where Owy posts it when it's published; the text is written from the event, never by hand */
export const AnnouncementSchema = z.object({
  channels: z
    .array(z.enum(["slack", "telegram"]))
    .max(4)
    .transform((channels) => [...new Set(channels)])
    .optional(),
});

export const QuestionSchema = z.object({
  id: z.string().min(1).max(20),
  label: z.string().trim().min(1).max(200),
  required: z.boolean(),
  /** One Organizá reads (lib/organizar/presets): diet for the food, photos at the door, the ID (sensitive) */
  preset: z.enum(["dieta", "accesibilidad", "foto", "ci"]).optional(),
  /** Pick one of these instead of typing */
  options: z.array(z.string().trim().min(1).max(60)).max(8).optional(),
});

/** The hands an event asks attendees for */
export const VolunteerRoleSchema = z.enum(["recepcion", "puerta", "comida", "fotos", "mc", "cierre"]);

/** A recording, slides or a link, for the public page once the event is over. */
export const MaterialSchema = z.object({
  kind: z.enum(["grabacion", "slides", "link"]),
  title: z.string().trim().min(1).max(120),
  url: HttpsUrl,
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
  venue: z
    .object({
      id: z.string(),
      name: z.string(),
      neighbourhood: z.string(),
      address: z.string(),
      /** Access and AV notes, for the team */
      facts: VenueFactsSchema,
      /** The building asks for a list of IDs: the sign-up can ask for the cédula */
      idRequired: z.boolean(),
    })
    .nullable(),
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
  sizeBucket: SizeBucketSchema.nullable(),
  needs: z.array(z.string()),
  talks: z.array(TalkSchema),
  announcement: AnnouncementSchema,
  /** Where Owy can post (each needs its bot credentials on the server) */
  announceChannels: z.object({ slack: z.boolean(), telegram: z.boolean() }),
  /** A scheduled publish */
  publishAt: z.string().nullable(),
  /** Owy's posts about it, once published */
  announcements: z.array(
    z.object({
      channel: z.enum(["slack", "telegram"]),
      status: z.enum(["scheduled", "sending", "sent", "failed"]),
      sentAt: z.string().nullable(),
    })
  ),
  reminderNote: z.string().nullable(),
  /** A second "¿Seguís viniendo?" 24 h before, to people who didn't answer "Voy" */
  confirmPing: z.boolean(),
  /** The hands it asks attendees for on the RSVP card */
  volunteerRoles: z.array(VolunteerRoleSchema),
  /** The community's setting: a friendly note after someone's second silent no-show */
  noShowNudge: z.boolean(),
  /** Why it was cancelled */
  cancelReason: z.string(),
  materials: z.array(MaterialSchema),
  /** Other communities organizing it; an invited one shows on its profile once it accepts */
  cohosts: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      slug: z.string(),
      status: z.enum(["invited", "accepted", "declined"]),
    })
  ),
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
    sizeBucket: SizeBucketSchema.nullable(),
    /** Venue amenities (AMENITIES in venues/schemas, which imports this file) */
    needs: z.array(z.string().min(1).max(30)).max(5),
    talks: z.array(TalkSchema).max(12),
    announcement: AnnouncementSchema,
    /** In the 48 h and 2 h reminders: how to get in, what to bring */
    reminderNote: z.string().trim().max(500).nullable(),
    confirmPing: z.boolean(),
    volunteerRoles: z
      .array(VolunteerRoleSchema)
      .max(6)
      .transform((roles) => [...new Set(roles)]),
    materials: z.array(MaterialSchema).max(10),
    /** The other communities organizing it (ids), up to 3 */
    cohosts: z.array(z.string().min(1)).max(3),
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

/** Publish later by itself (null takes the schedule back) */
export const SchedulePublishSchema = EventRefSchema.extend({ publishAt: z.iso.datetime().nullable() });

/** The reason is required: the attendees' email and the public page say it. */
export const CancelEventSchema = EventRefSchema.extend({
  reason: z.string().trim().min(3, "Contá en una línea por qué se cancela: les llega a quienes se anotaron").max(500),
});

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
      /** A directory space's access and ID facts (see publicFacts); null for other places */
      facts: PublicVenueFactsSchema.nullable(),
      /** The host space's logo, credited on the page */
      logoUrl: z.string().nullable(),
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
  /** People with a seat (anotados, without their +1s) */
  attending: z.number(),
  /** How many came in, once it's over and only when the door was used */
  came: z.number().nullable(),
  /** Why it was cancelled ("" when it wasn't, or nobody said) */
  cancelReason: z.string(),
  /** The hands it asks for: the RSVP card offers them */
  volunteerRoles: z.array(VolunteerRoleSchema),
  /** It has an open-space board (rooms and slots) */
  hasBoard: z.boolean(),
  community: z.object({ slug: z.string(), name: z.string(), logoUrl: z.string().nullable() }),
  /** Other communities organizing it with this one (those that accepted) */
  cohosts: z.array(z.object({ slug: z.string(), name: z.string() })),
  meetupUrl: z.string().nullable(),
  /** Recordings, slides, links: the page shows them once the event is over */
  materials: z.array(MaterialSchema),
  /** «Quiénes van»: the first 12 who chose to show it, as "Ana G." */
  going: z.array(z.string()),
  /** The talks, those with a title */
  talks: z.array(TalkSchema),
});

export const CohostInvitationSchema = z.object({
  eventId: z.string(),
  name: z.string(),
  startDate: z.string(),
  /** The community that invited */
  host: z.string(),
});

export const AnswerCohostSchema = z.object({
  communityId: z.string().min(1),
  /** The invited event (not `eventId`: it belongs to the other community) */
  hostedEventId: z.string().min(1),
  accept: z.boolean(),
});

export const EventBySlugSchema = z.object({ communitySlug: z.string().min(1), eventSlug: z.string().min(1) });

/** An upcoming event made in OWU, for other sites and bots (meetup-bot, calendars). */
export const UpcomingEventSchema = z.object({
  id: z.string(),
  name: z.string(),
  summary: z.string().nullable(),
  startDate: z.string(),
  endDate: z.string(),
  url: z.string(),
  community: z.object({ slug: z.string(), name: z.string() }),
  mode: ModeSchema,
  /** The space's name; null for online events */
  place: z.string().nullable(),
  meetupUrl: z.string().nullable(),
});

export type PublicEvent = z.infer<typeof PublicEventSchema>;

// ---------------------------------------------------------------------------
// The event dashboard
// ---------------------------------------------------------------------------

/** Of the people with a seat, the share that came; null until the community has 3 events with check-in. */
export const ShowUpSchema = z.object({ rate: z.number().nullable(), events: z.number() });

/** "Cuántos esperamos" and "Comida para ~N", each with what it's based on */
export const TurnoutSchema = z.object({
  low: z.number(),
  likely: z.number(),
  high: z.number(),
  rate: z.number(),
  /** The rate is the community's own (3+ events with the door); else the 55% default */
  fromHistory: z.boolean(),
  /** Events the community's rate comes from */
  events: z.number(),
  food: z.object({ pizzas: z.number(), veggie: z.number(), glutenFree: z.number(), drinks: z.number() }),
  /** Answers to the diet question among the people with a seat */
  diets: z.object({ vegetarian: z.number(), glutenFree: z.number(), answered: z.number() }),
});

export const EventStatsSchema = z.object({
  capacity: z.number().nullable(),
  /** Seats taken, with +1s */
  taken: z.number(),
  attending: z.number(),
  /** Waitlisted plus offered (kept for older screens); the split is below */
  waiting: z.number(),
  pending: z.number(),
  cancelled: z.number(),
  checkedIn: z.number(),
  /** The +1s of the people with a seat */
  guests: z.number(),
  /** Seats offered to the waitlist and not taken yet */
  offered: z.number(),
  waitlisted: z.number(),
  /** Of the people with a seat, those who answered "Voy" */
  confirmed: z.number(),
  /** Had a seat and didn't come in (only meaningful once the door was used) */
  missed: z.number(),
  turnout: TurnoutSchema,
  /** Seats taken (with +1s) at the end of each day with sign-ups, Montevideo days, oldest first */
  series: z.array(z.object({ day: z.string(), total: z.number() })),
  /** The automatic emails so far, per kind: sent, and still in the queue */
  emails: z.record(
    z.enum(["confirmed", "reminder_48h", "confirm_ping", "reminder_2h", "feedback"]),
    z.object({ sent: z.number(), queued: z.number() })
  ),
  /** A volunteer door link was made and not revoked since */
  doorLink: z.boolean(),
});

export type EventStats = z.infer<typeof EventStatsSchema>;
export type Material = z.infer<typeof MaterialSchema>;

/**
 * Who a message goes to: by where they stand now, and after the event by whether they came
 * ("came" and "missed" only once the door was used) or waited without getting in.
 */
export const AudienceSchema = z.enum(["attending", "waiting", "pending", "came", "missed", "waitlist-left"]);
export type Audience = z.infer<typeof AudienceSchema>;

const Subject = z.string().trim().min(3).max(120);
const Body = z.string().trim().min(10).max(5000);

export const MessageSchema = z.object({
  communityId: z.string().min(1),
  eventId: z.string().min(1),
  /** Who gets it */
  to: z.array(AudienceSchema).min(1),
  /** Only these people (a selection in Inscriptos), still within `to` */
  ids: z.array(z.string().min(1)).min(1).max(500).optional(),
  subject: Subject,
  body: Body,
});

/** Send it later by itself (the tick sends what's due) */
export const ScheduleMessageSchema = EventRefSchema.extend({
  to: AudienceSchema,
  subject: Subject,
  body: Body,
  sendAt: z.iso.datetime(),
});

/** The message as written, to the organizer only, marked [Prueba] */
export const MessageTestSchema = EventRefSchema.extend({ subject: Subject, body: Body });

export const MessageRefSchema = EventRefSchema.extend({ messageId: z.string().min(1) });

/** A message in the event's log: sent, waiting for its time, or called off */
export const EventMessageSchema = z.object({
  id: z.string(),
  audience: z.string(),
  subject: z.string(),
  body: z.string(),
  status: z.enum(["scheduled", "sending", "sent", "cancelled"]),
  sendAt: z.string(),
  sentAt: z.string().nullable(),
  recipients: z.number(),
  by: z.string().nullable(),
});

export type EventMessage = z.infer<typeof EventMessageSchema>;
