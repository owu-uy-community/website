import {
  boolean,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { createId } from "@paralleldrive/cuid2";

/**
 * Reusable timestamp column factory.
 * Prisma maps `DateTime` to `timestamp(3)`; `mode: "date"` returns JS `Date`
 * objects (matching the previous Prisma behaviour the services rely on).
 */
const ts = (name: string) => timestamp(name, { precision: 3, mode: "date" });

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------
export const userRole = pgEnum("UserRole", ["user", "admin"]);
export const userStatus = pgEnum("UserStatus", ["active", "inactive"]);
export const communityRole = pgEnum("CommunityRole", ["owner", "admin", "editor", "member"]);
// Staff coordination (spreadsheet vocabulary: Tarea / Continuo / Agenda)
export const staffTaskType = pgEnum("StaffTaskType", ["task", "ongoing", "milestone"]);
export const staffTaskStatus = pgEnum("StaffTaskStatus", ["pending", "in_progress", "done", "blocked"]);
export const announcementAudience = pgEnum("AnnouncementAudience", ["all", "task"]);

// ---------------------------------------------------------------------------
// Auth tables (managed by Better Auth — timestamps are set by the library,
// so no defaultNow()/$onUpdate here)
// ---------------------------------------------------------------------------
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("emailVerified").notNull(),
  image: text("image"),
  createdAt: ts("createdAt").notNull(),
  updatedAt: ts("updatedAt").notNull(),
  role: userRole("role").notNull().default("user"),
  status: userStatus("status").notNull().default("inactive"),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: ts("expiresAt").notNull(),
  token: text("token").notNull().unique(),
  createdAt: ts("createdAt").notNull(),
  updatedAt: ts("updatedAt").notNull(),
  ipAddress: text("ipAddress"),
  userAgent: text("userAgent"),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("accountId").notNull(),
  providerId: text("providerId").notNull(),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  idToken: text("idToken"),
  accessTokenExpiresAt: ts("accessTokenExpiresAt"),
  refreshTokenExpiresAt: ts("refreshTokenExpiresAt"),
  scope: text("scope"),
  password: text("password"),
  createdAt: ts("createdAt").notNull(),
  updatedAt: ts("updatedAt").notNull(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: ts("expiresAt").notNull(),
  createdAt: ts("createdAt"),
  updatedAt: ts("updatedAt"),
});

/**
 * Better Auth `apiKey` plugin table. Machine callers (today: the Owy bot,
 * see /owy) send their key as `x-api-key` and get a normal session for the
 * user that owns it, so the whole app authorizes them like any other user.
 * Field names follow the plugin's schema — do not rename.
 */
export const apikey = pgTable("apikey", {
  id: text("id").primaryKey(),
  configId: text("configId").notNull().default("default"),
  name: text("name"),
  start: text("start"),
  /** The owning user's id (the plugin's generic owner reference). */
  referenceId: text("referenceId").notNull(),
  prefix: text("prefix"),
  key: text("key").notNull(),
  refillInterval: integer("refillInterval"),
  refillAmount: integer("refillAmount"),
  lastRefillAt: ts("lastRefillAt"),
  enabled: boolean("enabled").default(true),
  rateLimitEnabled: boolean("rateLimitEnabled").default(true),
  rateLimitTimeWindow: integer("rateLimitTimeWindow"),
  rateLimitMax: integer("rateLimitMax"),
  requestCount: integer("requestCount"),
  remaining: integer("remaining"),
  lastRequest: ts("lastRequest"),
  expiresAt: ts("expiresAt"),
  createdAt: ts("createdAt").notNull(),
  updatedAt: ts("updatedAt").notNull(),
  permissions: text("permissions"),
  metadata: text("metadata"),
});

// ---------------------------------------------------------------------------
// Tenancy: communities own events (open spaces)
// ---------------------------------------------------------------------------
export const communities = pgTable("communities", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  logoUrl: text("logoUrl"),
  customDomain: text("customDomain").unique(),
  isActive: boolean("isActive").notNull().default(true),
  // The public directory (/comunidades), imported from Keystatic and edited by each community
  status: text("status").$type<CommunityStatus>().notNull().default("activa"),
  topics: text("topics").array().notNull().default([]),
  links: jsonb("links").$type<CommunityLinks>().notNull().default({}),
  slackChannel: text("slackChannel"),
  /** Names the meetup-bot feed uses for this group, so its events land on the right card. */
  feedNames: text("feedNames").array().notNull().default([]),
  confPartner: boolean("confPartner").notNull().default(false),
  reviewedAt: date("reviewedAt", { mode: "string" }),
  /** Shown in the public directory. OWU itself and demo tenants stay unlisted. */
  listed: boolean("listed").notNull().default(false),
  createdAt: ts("createdAt").notNull().defaultNow(),
  updatedAt: ts("updatedAt")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type CommunityStatus = "activa" | "pausa" | "busca-organizadores";
export type CommunityLinks = { website?: string; linkedin?: string; instagram?: string; meetup?: string };

/** Someone asking to organize a directory community; site staff decide. */
export const communityClaims = pgTable(
  "community_claims",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    communityId: text("communityId").notNull(),
    userId: text("userId").notNull(),
    /** What they do there: organize it, co-organize it, or want to bring it back. */
    relation: text("relation").$type<"organizo" | "coorganizo" | "retomar">().notNull(),
    message: text("message").notNull().default(""),
    link: text("link"),
    status: text("status").$type<"pending" | "approved" | "rejected">().notNull().default("pending"),
    reviewedById: text("reviewedById"),
    reviewedAt: ts("reviewedAt"),
    createdAt: ts("createdAt").notNull().defaultNow(),
  },
  (t) => [
    unique("community_claims_communityId_userId_key").on(t.communityId, t.userId),
    index("community_claims_status_idx").on(t.status),
    foreignKey({
      name: "community_claims_communityId_fk",
      columns: [t.communityId],
      foreignColumns: [communities.id],
    }).onDelete("cascade"),
    foreignKey({ name: "community_claims_userId_fk", columns: [t.userId], foreignColumns: [user.id] }).onDelete(
      "cascade"
    ),
    foreignKey({
      name: "community_claims_reviewedById_fk",
      columns: [t.reviewedById],
      foreignColumns: [user.id],
    }).onDelete("set null"),
  ]
);

export const communityMembers = pgTable(
  "community_members",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    communityId: text("communityId")
      .notNull()
      .references(() => communities.id, { onDelete: "cascade" }),
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: communityRole("role").notNull().default("member"),
    createdAt: ts("createdAt").notNull().defaultNow(),
    updatedAt: ts("updatedAt")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    unique("community_members_communityId_userId_key").on(t.communityId, t.userId),
    index("community_members_userId_idx").on(t.userId),
  ]
);

// ---------------------------------------------------------------------------
// Encuesta de sueldos: one survey per year. Answers carry no user id; who
// already answered lives apart, as a keyed hash, so a person answers once but
// an answer can't be traced back to them.
// ---------------------------------------------------------------------------
export const salarySurveyStatus = pgEnum("SalarySurveyStatus", ["draft", "open", "closed", "published"]);

export const salarySurveys = pgTable("salary_surveys", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  /** The edition, e.g. "2027"; it's in the URLs */
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  status: salarySurveyStatus("status").notNull().default("draft"),
  opensAt: ts("opensAt"),
  closesAt: ts("closesAt"),
  createdAt: ts("createdAt").notNull().defaultNow(),
  updatedAt: ts("updatedAt")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const salarySurveyResponses = pgTable(
  "salary_survey_responses",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    surveyId: text("surveyId")
      .notNull()
      .references(() => salarySurveys.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    seniority: text("seniority").notNull(),
    experience: text("experience").notNull(),
    stacks: text("stacks").array().notNull(),
    employer: text("employer").notNull(),
    contract: text("contract").notNull(),
    modality: text("modality").notNull(),
    department: text("department").notNull(),
    currency: text("currency").notNull(),
    /** Monthly nominal salary (or billing), whole units of `currency` */
    amount: integer("amount").notNull(),
    hoursPerWeek: integer("hoursPerWeek").notNull(),
    /** How happy with the pay, 1 (not at all) to 5 (very) */
    satisfaction: integer("satisfaction"),
    gender: text("gender"),
    education: text("education"),
    /** The day only: a timestamp would let someone line answers up with who logged in when */
    createdOn: date("createdOn", { mode: "string" }).notNull().defaultNow(),
  },
  (t) => [index("salary_survey_responses_surveyId_idx").on(t.surveyId)]
);

export const salarySurveyParticipants = pgTable(
  "salary_survey_participants",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    surveyId: text("surveyId")
      .notNull()
      .references(() => salarySurveys.id, { onDelete: "cascade" }),
    /** HMAC-SHA256 of survey + user id with a server secret: answers once, without saying who */
    participantHash: text("participantHash").notNull(),
  },
  (t) => [unique("salary_survey_participants_surveyId_hash_key").on(t.surveyId, t.participantHash)]
);

// ---------------------------------------------------------------------------
// Domain tables
// ---------------------------------------------------------------------------
// Physical table stays "open_spaces": db:push cannot express a safe rename
// against prod data. The TypeScript name is the new vocabulary.
export const events = pgTable(
  "open_spaces",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    name: text("name").notNull(),
    description: text("description"),
    startDate: ts("startDate").notNull(),
    endDate: ts("endDate").notNull(),
    isActive: boolean("isActive").notNull().default(true),
    autoHighlightEnabled: boolean("autoHighlightEnabled").notNull().default(false),
    // Multi-tenant columns. Final shape is NOT NULL; the prod cutover applies
    // them nullable first (phase-a SQL), backfills, then SET NOT NULL (phase-c).
    communityId: text("communityId")
      .notNull()
      .references(() => communities.id, { onDelete: "restrict" }),
    slug: text("slug").notNull(),
    timezone: text("timezone").notNull().default("America/Montevideo"),
    eventbriteEventId: text("eventbriteEventId"),
    venueMapUrl: text("venueMapUrl"),
    // Organizá: events made in the organizer panel. Every default keeps existing rows as they were.
    /** Drafts are the organizer's only; existing events are published. */
    status: text("status").$type<EventStatus>().notNull().default("published"),
    /** A draft with a date and `heldUntil` ahead is a date hold: every organizer sees it on the calendar. */
    heldUntil: ts("heldUntil"),
    format: text("format").$type<EventFormat>(),
    /** One line (≤140) for cards, the cover image and Eventbrite. `description` holds the Markdown. */
    summary: text("summary"),
    topics: text("topics").array().notNull().default([]),
    /** The streaming link: only confirmed attendees get it, never a public page. */
    onlineUrl: text("onlineUrl"),
    /** The host space, once one accepted. */
    venueId: text("venueId"),
    mode: text("mode").$type<EventMode>().notNull().default("presencial"),
    /** A place outside the spaces directory (a university room, a bar) */
    placeName: text("placeName"),
    placeAddress: text("placeAddress"),
    /** How people sign up: not at all (open door), with OWU's RSVP, or on another site. */
    registration: text("registration").$type<EventRegistration>().notNull().default("none"),
    registrationUrl: text("registrationUrl"),
    /** Organizers approve each RSVP. */
    approval: boolean("approval").notNull().default(false),
    capacity: integer("capacity"),
    waitlist: boolean("waitlist").notNull().default(true),
    /** How many +1s each person may bring. */
    guestsAllowed: integer("guestsAllowed").notNull().default(0),
    rsvpClosesAt: ts("rsvpClosesAt"),
    questions: jsonb("questions").$type<RsvpQuestion[]>().notNull().default([]),
    externalLinks: jsonb("externalLinks").$type<{ meetup?: string }>().notNull().default({}),
    /** Bumped on every change attendees should hear about, so calendar invites update in place. */
    icsSequence: integer("icsSequence").notNull().default(0),
    /** The sequence attendees last heard about: changes wait 10 minutes, then go out once */
    notifiedSequence: integer("notifiedSequence").notNull().default(0),
    /** Volunteer door links carry it: bumping it revokes every link handed out */
    doorVersion: integer("doorVersion").notNull().default(0),
    publishedAt: ts("publishedAt"),
    createdAt: ts("createdAt").notNull().defaultNow(),
    updatedAt: ts("updatedAt")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    unique("open_spaces_communityId_slug_key").on(t.communityId, t.slug),
    index("open_spaces_communityId_idx").on(t.communityId),
    index("open_spaces_status_startDate_idx").on(t.status, t.startDate),
    foreignKey({ name: "open_spaces_venueId_fk", columns: [t.venueId], foreignColumns: [venues.id] }).onDelete(
      "set null"
    ),
  ]
);

export type EventStatus = "draft" | "published" | "cancelled";
export type EventFormat = "charlas" | "taller" | "open-space" | "social" | "hackathon" | "otro";
export type EventRegistration = "none" | "owu" | "external" | "eventbrite";
export type EventMode = "presencial" | "online" | "hibrido";
export type RsvpQuestion = { id: string; label: string; required: boolean };

/** @deprecated transition alias — use `events`. */
export const openSpaces = events;

/**
 * Per-event live state: countdown + "cast to screen" note. Replaces the
 * global `countdown_state` singleton and the out-of-band Supabase
 * `highlighted_note` table.
 */
export const eventLiveState = pgTable("event_live_state", {
  eventId: text("eventId")
    .primaryKey()
    .references(() => events.id, { onDelete: "cascade" }),
  countdownTargetTime: ts("countdownTargetTime"),
  countdownRemainingSeconds: integer("countdownRemainingSeconds").notNull().default(0),
  countdownTotalSeconds: integer("countdownTotalSeconds").notNull().default(0),
  countdownSoundEnabled: boolean("countdownSoundEnabled").notNull().default(false),
  highlightedTrackId: text("highlightedTrackId").references(() => tracks.id, { onDelete: "set null" }),
  updatedAt: ts("updatedAt")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const schedules = pgTable(
  "schedules",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    name: text("name").notNull(),
    startTime: text("startTime").notNull(),
    endTime: text("endTime").notNull(),
    date: ts("date").notNull(),
    isActive: boolean("isActive").notNull().default(true),
    highlightInKiosk: boolean("highlightInKiosk").notNull().default(false),
    createdAt: ts("createdAt").notNull().defaultNow(),
    updatedAt: ts("updatedAt")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    openSpaceId: text("openSpaceId")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
  },
  (t) => [index("schedules_openSpaceId_idx").on(t.openSpaceId)]
);

export const rooms = pgTable(
  "rooms",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    name: text("name").notNull(),
    description: text("description"),
    capacity: integer("capacity"),
    hasTV: boolean("hasTV").notNull().default(false),
    hasWhiteboard: boolean("hasWhiteboard").notNull().default(false),
    isActive: boolean("isActive").notNull().default(true),
    /** Optional hex override; UI falls back to a deterministic palette by room id. */
    color: text("color"),
    /** Optional shape key from ROOM_ICONS; null renders no icon. */
    icon: text("icon"),
    /** Board column order within the event. */
    sortOrder: integer("sortOrder").notNull().default(0),
    /** Set by the room's host on the day; kiosks, the agenda and Owy show it. */
    status: text("status").$type<RoomStatus>().notNull().default("open"),
    statusUpdatedAt: ts("statusUpdatedAt"),
    createdAt: ts("createdAt").notNull().defaultNow(),
    updatedAt: ts("updatedAt")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    openSpaceId: text("openSpaceId")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
  },
  (t) => [index("rooms_openSpaceId_idx").on(t.openSpaceId)]
);

export type RoomStatus = "open" | "full" | "evacuate";

export const tracks = pgTable(
  "tracks",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    title: text("title").notNull(),
    speaker: text("speaker"),
    description: text("description"),
    needsTV: boolean("needsTV").notNull().default(false),
    needsWhiteboard: boolean("needsWhiteboard").notNull().default(false),
    createdAt: ts("createdAt").notNull().defaultNow(),
    updatedAt: ts("updatedAt")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    openSpaceId: text("openSpaceId")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    scheduleId: text("scheduleId")
      .notNull()
      .references(() => schedules.id, { onDelete: "cascade" }),
    roomId: text("roomId")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
  },
  (t) => [
    unique("tracks_scheduleId_roomId_key").on(t.scheduleId, t.roomId),
    index("tracks_openSpaceId_idx").on(t.openSpaceId),
  ]
);

// ---------------------------------------------------------------------------
// Semanario OWU: the weekly digest Owy drafts and the staff publishes
// ---------------------------------------------------------------------------
export const semanarioStatus = pgEnum("SemanarioStatus", ["draft", "published"]);

/** What an issue lists; validated by SemanarioSectionsSchema (lib/orpc/semanario/schemas.ts). */
export type SemanarioSections = {
  events: { title: string; group: string; start: string; venue: string | null; url: string }[];
  threads: { channel: string; title: string; permalink: string; replies: number }[];
  jobs: { count: number; channelUrl: string | null } | null;
  newCommunities: { name: string; slug: string }[];
};

export const semanarioIssues = pgTable("semanario_issues", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  /** Given on the first publish and kept on unpublish: the issue lives at /semanario/<number>. */
  number: integer("number").unique(),
  /** Monday (Montevideo) of the week the issue covers; one issue per week. */
  weekStart: date("weekStart", { mode: "string" }).notNull().unique(),
  title: text("title").notNull(),
  /** Markdown */
  intro: text("intro").notNull().default(""),
  sections: jsonb("sections").$type<SemanarioSections>().notNull(),
  status: semanarioStatus("status").notNull().default("draft"),
  publishedAt: ts("publishedAt"),
  /** Who published it: the issue says so. */
  reviewedById: text("reviewedById").references(() => user.id, { onDelete: "set null" }),
  createdAt: ts("createdAt").notNull().defaultNow(),
  updatedAt: ts("updatedAt")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

// ---------------------------------------------------------------------------
// OBS queue state (normalized)
// ---------------------------------------------------------------------------
export const obsInstances = pgTable("obs_instances", {
  id: integer("id").primaryKey(), // 1 = admin screen, 2 = standalone app (manually assigned)
  isPlaying: boolean("isPlaying").notNull().default(false),
  currentItemIndex: integer("currentItemIndex").notNull().default(0),
  directMode: boolean("directMode").notNull().default(false),
  currentPresetId: text("currentPresetId"),
  version: integer("version").notNull().default(1),
  // Live OBS status as reported by the executor tab (see src/lib/orpc/obs-control):
  // the server's only view of what OBS is doing, read by Companion/Stream Deck
  // feedback and by every other admin tab.
  connected: boolean("connected").notNull().default(false),
  programScene: text("programScene"),
  previewScene: text("previewScene"),
  studioMode: boolean("studioMode").notNull().default(false),
  transitionName: text("transitionName"),
  transitionMs: integer("transitionMs"),
  streaming: boolean("streaming").notNull().default(false),
  recording: boolean("recording").notNull().default(false),
  /** Scene names and audio inputs as OBS lists them, so tabs without a socket can act as remotes. */
  scenes: jsonb("scenes").$type<string[]>().notNull().default([]),
  audioInputs: jsonb("audioInputs").$type<{ name: string; muted: boolean }[]>().notNull().default([]),
  /** The one browser tab that executes commands against OBS (heartbeat-elected). */
  executorId: text("executorId"),
  executorSeenAt: ts("executorSeenAt"),
  lastError: text("lastError"),
  statusAt: ts("statusAt"),
  /** Rundown pointer: the cue fired last. */
  currentCueId: text("currentCueId"),
  updatedAt: ts("updatedAt")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  createdAt: ts("createdAt").notNull().defaultNow(),
});

/**
 * Commands for the executor tab (from other admin devices, Companion/Stream
 * Deck via /api/obs, the Owy bot). Persisted so a press that lands while the
 * executor's realtime socket is recycling still runs on reconnect, and as the
 * day-of audit trail ("who took what when").
 */
export const obsCommands = pgTable(
  "obs_commands",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    instanceId: integer("instanceId")
      .notNull()
      .references(() => obsInstances.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    /** `admin:<userId>` | `api-key:<userId>` | `cue:<cueId>` … informational. */
    source: text("source").notNull().default(""),
    status: text("status").$type<"pending" | "done" | "failed" | "skipped">().notNull().default("pending"),
    error: text("error"),
    createdAt: ts("createdAt").notNull().defaultNow(),
    doneAt: ts("doneAt"),
  },
  (t) => [index("obs_commands_instanceId_status_createdAt_idx").on(t.instanceId, t.status, t.createdAt)]
);

/** A rundown entry: one press = OBS scene + wall scene + launchpad sound. */
export const obsCues = pgTable(
  "obs_cues",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    instanceId: integer("instanceId")
      .notNull()
      .references(() => obsInstances.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color"),
    obsScene: text("obsScene"),
    transition: text("transition"),
    transitionMs: integer("transitionMs"),
    stageScene: text("stageScene"),
    stageParams: jsonb("stageParams").$type<Record<string, unknown>>(),
    sound: text("sound"),
    notes: text("notes"),
    hotkey: text("hotkey"),
    position: integer("position").notNull().default(0),
    createdAt: ts("createdAt").notNull().defaultNow(),
    updatedAt: ts("updatedAt")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("obs_cues_instanceId_position_idx").on(t.instanceId, t.position)]
);

export const obsQueueItems = pgTable(
  "obs_queue_items",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    sceneName: text("sceneName").notNull(),
    sceneId: integer("sceneId"),
    delay: integer("delay").notNull().default(5),
    position: integer("position").notNull(),
    instanceId: integer("instanceId")
      .notNull()
      .references(() => obsInstances.id, { onDelete: "cascade" }),
    createdAt: ts("createdAt").notNull().defaultNow(),
    updatedAt: ts("updatedAt")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("obs_queue_items_instanceId_position_idx").on(t.instanceId, t.position)]
);

export const obsPresets = pgTable("obs_presets", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  name: text("name").notNull(),
  instanceId: integer("instanceId")
    .notNull()
    .references(() => obsInstances.id, { onDelete: "cascade" }),
  createdAt: ts("createdAt").notNull().defaultNow(),
  updatedAt: ts("updatedAt")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const obsPresetItems = pgTable(
  "obs_preset_items",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    sceneName: text("sceneName").notNull(),
    sceneId: integer("sceneId"),
    delay: integer("delay").notNull().default(5),
    position: integer("position").notNull(),
    presetId: text("presetId")
      .notNull()
      .references(() => obsPresets.id, { onDelete: "cascade" }),
    createdAt: ts("createdAt").notNull().defaultNow(),
    updatedAt: ts("updatedAt")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("obs_preset_items_presetId_position_idx").on(t.presetId, t.position)]
);

// ---------------------------------------------------------------------------
// Countdown (global singleton row)
// ---------------------------------------------------------------------------
export const countdownState = pgTable("countdown_state", {
  id: text("id").primaryKey().default("global"),
  targetTime: ts("targetTime"),
  remainingSeconds: integer("remainingSeconds").notNull().default(0),
  totalSeconds: integer("totalSeconds").notNull().default(0),
  soundEnabled: boolean("soundEnabled").notNull().default(false),
  updatedAt: ts("updatedAt")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  createdAt: ts("createdAt").notNull().defaultNow(),
});

/**
 * Owy Stage: what the OWU video wall (OBS browser source at /owy/stage) is
 * showing. A global singleton like the OBS rigs — the wall is OWU's hardware,
 * not per-tenant; `eventId` only feeds the data-driven scenes (cast, countdown).
 */
export const owyStageState = pgTable("owy_stage_state", {
  id: text("id").primaryKey().default("global"),
  scene: text("scene").notNull().default("black"),
  params: jsonb("params").$type<Record<string, unknown>>().notNull().default({}),
  eventId: text("eventId").references(() => events.id, { onDelete: "set null" }),
  /** New nonce on every take; phone submissions are scoped to it. */
  round: text("round").notNull().default(""),
  /** Spotify link for the "now-playing" scene (refresh token never leaves the server). */
  spotify: jsonb("spotify").$type<{ refreshToken: string; account: string; connectedAt: string }>(),
  /** The operator's rundown (ordered steps + seconds on air); see RundownSchema. */
  rundown: jsonb("rundown")
    .$type<{ id: string; scene: string; sec: number; params: Record<string, unknown> }[]>()
    .notNull()
    .default([]),
  /** Owy's last face and the card it announced (never the transcript); see StoredFaceSchema. */
  face: jsonb("face").$type<{ state: string; at: string } & Record<string, unknown>>(),
  /** The operator's desk: what is in preview, the queue behind it and the favorites; see DeskSchema. */
  desk: jsonb("desk")
    .$type<{ preview: unknown; queue: unknown[]; favorites: string[] }>()
    .notNull()
    .default({ preview: null, queue: [], favorites: [] }),
  updatedAt: ts("updatedAt")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

/** What attendees send from /owy/play: votes, words, questions, reactions… */
export const owyStageInputs = pgTable(
  "owy_stage_inputs",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    round: text("round").notNull(),
    key: text("key").notNull(),
    value: text("value").notNull(),
    /** Random id the phone keeps in localStorage; not a person. */
    voter: text("voter").notNull(),
    /** "" for one-per-person keys; a fresh id when the same person may send many. */
    slot: text("slot").notNull().default(""),
    /** Q&A moderation from the admin: hidden never reaches the wall, pinned leads it. */
    moderation: text("moderation").$type<"" | "hidden" | "pinned" | "answered">().notNull().default(""),
    createdAt: ts("createdAt").notNull().defaultNow(),
  },
  (t) => [
    index("owy_stage_inputs_round_idx").on(t.round),
    unique("owy_stage_inputs_one").on(t.round, t.key, t.voter, t.slot),
  ]
);

// ---------------------------------------------------------------------------
// Staff coordination (event-day task board + announcements)
// ---------------------------------------------------------------------------

export const staffTasks = pgTable(
  "staff_tasks",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    openSpaceId: text("openSpaceId")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    /** Long free-form instructions ("Notas" column of the spreadsheet). */
    notes: text("notes"),
    type: staffTaskType("type").notNull().default("task"),
    /** Local midnight of the task's day — events span setup day + event day. */
    dayDate: ts("dayDate").notNull(),
    /** "HH:MM"; milestones and setup-day tasks may have none. */
    startTime: text("startTime"),
    endTime: text("endTime"),
    minPeople: integer("minPeople"),
    location: text("location"),
    status: staffTaskStatus("status").notNull().default("pending"),
    statusUpdatedById: text("statusUpdatedById").references(() => user.id, { onDelete: "set null" }),
    /** Tie-breaker among tasks sharing the same start time. */
    sortOrder: integer("sortOrder").notNull().default(0),
    createdAt: ts("createdAt").notNull().defaultNow(),
    updatedAt: ts("updatedAt")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("staff_tasks_openSpaceId_idx").on(t.openSpaceId)]
);

export const staffTaskAssignments = pgTable(
  "staff_task_assignments",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    taskId: text("taskId")
      .notNull()
      .references(() => staffTasks.id, { onDelete: "cascade" }),
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** An editor marked them absent for this shift; arrival itself is per event (staff_arrivals). */
    noShow: boolean("noShow").notNull().default(false),
    createdAt: ts("createdAt").notNull().defaultNow(),
  },
  (t) => [
    unique("staff_task_assignments_taskId_userId_key").on(t.taskId, t.userId),
    index("staff_task_assignments_userId_idx").on(t.userId),
  ]
);

/** Who is at the venue: one "Llegué" per person and event (from the phone, the admin or Owy). */
export const staffArrivals = pgTable(
  "staff_arrivals",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    eventId: text("eventId")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    arrivedAt: ts("arrivedAt").notNull().defaultNow(),
    /** They went home (or on a long break): no longer counted on shift. */
    leftAt: ts("leftAt"),
  },
  (t) => [unique("staff_arrivals_eventId_userId_key").on(t.eventId, t.userId)]
);

export const staffAnnouncements = pgTable(
  "staff_announcements",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    openSpaceId: text("openSpaceId")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    authorId: text("authorId").references(() => user.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    urgent: boolean("urgent").notNull().default(false),
    audience: announcementAudience("audience").notNull().default("all"),
    /** When audience = "task": the announcement targets that task's assignees. */
    taskId: text("taskId").references(() => staffTasks.id, { onDelete: "set null" }),
    createdAt: ts("createdAt").notNull().defaultNow(),
  },
  (t) => [index("staff_announcements_openSpaceId_createdAt_idx").on(t.openSpaceId, t.createdAt)]
);

export const staffAnnouncementAcks = pgTable(
  "staff_announcement_acks",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    announcementId: text("announcementId").notNull(),
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: ts("createdAt").notNull().defaultNow(),
  },
  (t) => [
    unique("staff_announcement_acks_announcementId_userId_key").on(t.announcementId, t.userId),
    // Explicit short name: the auto-generated one exceeds Postgres' 63-char
    // identifier limit and would drift on every db:push.
    foreignKey({
      columns: [t.announcementId],
      foreignColumns: [staffAnnouncements.id],
      name: "staff_announcement_acks_announcementId_fk",
    }).onDelete("cascade"),
  ]
);

// ---------------------------------------------------------------------------
// Event day: incidents, the run of show, attendees and their check-ins
// ---------------------------------------------------------------------------

export type IncidentSeverity = "low" | "medium" | "high" | "critical";
export type IncidentCategory = "medical" | "conduct" | "technical" | "venue" | "lost" | "other";
export type IncidentStatus = "open" | "in_progress" | "resolved";

export const incidents = pgTable(
  "incidents",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    eventId: text("eventId")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    severity: text("severity").$type<IncidentSeverity>().notNull().default("medium"),
    category: text("category").$type<IncidentCategory>().notNull().default("other"),
    status: text("status").$type<IncidentStatus>().notNull().default("open"),
    roomId: text("roomId").references(() => rooms.id, { onDelete: "set null" }),
    /** Free text when it isn't a room: "baños PB", "entrada". */
    location: text("location"),
    assigneeId: text("assigneeId").references(() => user.id, { onDelete: "set null" }),
    reporterId: text("reporterId").references(() => user.id, { onDelete: "set null" }),
    /** How it arrived: the admin, a staff phone, or Owy (Telegram/Slack). */
    source: text("source").$type<"admin" | "phone" | "owy">().notNull().default("admin"),
    /** Code-of-conduct reports: only organizers (community admin+) and the people on it see them. */
    sensitive: boolean("sensitive").notNull().default(false),
    /** A compressed JPEG data URL from the reporter's phone. */
    photo: text("photo"),
    createdAt: ts("createdAt").notNull().defaultNow(),
    updatedAt: ts("updatedAt")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    resolvedAt: ts("resolvedAt"),
  },
  (t) => [index("incidents_eventId_createdAt_idx").on(t.eventId, t.createdAt)]
);

/** Append-only log on an incident: notes and every status/assignee change. */
export const incidentNotes = pgTable(
  "incident_notes",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    incidentId: text("incidentId")
      .notNull()
      .references(() => incidents.id, { onDelete: "cascade" }),
    authorId: text("authorId").references(() => user.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    createdAt: ts("createdAt").notNull().defaultNow(),
  },
  (t) => [index("incident_notes_incidentId_idx").on(t.incidentId)]
);

/**
 * The run of show ("Guion del día"): every moment of the day, planned and actual kept apart
 * so the day after it is a record, not a rewritten plan. GO fires the moment's OBS cue (which
 * already bundles OBS scene, wall scene and sound) and, optionally, an Owy message.
 */
export const runOfShowItems = pgTable(
  "run_of_show_items",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    eventId: text("eventId")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    title: text("title").notNull(),
    /** "HH:MM" on the event's wall clock. */
    plannedStart: text("plannedStart").notNull(),
    durationMin: integer("durationMin").notNull().default(10),
    /** A start that can't move (a speaker's slot, the venue closing): drift has to fit before it. */
    fixed: boolean("fixed").notNull().default(false),
    ownerId: text("ownerId").references(() => user.id, { onDelete: "set null" }),
    location: text("location"),
    notes: text("notes"),
    cueId: text("cueId").references(() => obsCues.id, { onDelete: "set null" }),
    /** Sent through Owy to the attendee channel when the moment starts. */
    owyMessage: text("owyMessage"),
    actualStart: ts("actualStart"),
    actualEnd: ts("actualEnd"),
    createdAt: ts("createdAt").notNull().defaultNow(),
    updatedAt: ts("updatedAt")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("run_of_show_items_eventId_position_idx").on(t.eventId, t.position)]
);

/**
 * Eventbrite's three, plus OWU's own RSVP: on the waitlist, offered a freed seat (until
 * `offerExpiresAt`), waiting for an organizer's approval, or turned down.
 */
export type AttendeeStatus = "attending" | "cancelled" | "refunded" | "waitlisted" | "offered" | "pending" | "declined";

/**
 * Eventbrite attendees, mirrored per event. Eventbrite's API can't record a check-in, so the
 * door uses the Organizer app and its check-ins arrive here (webhook + `changed_since` poll);
 * OWU's own scanner writes here directly. One row per attendee: a check-in can't count twice.
 */
export const attendees = pgTable(
  "attendees",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    eventId: text("eventId")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    /** Mirrored Eventbrite attendees have it; OWU's own RSVPs don't. */
    eventbriteId: text("eventbriteId"),
    source: text("source").$type<"eventbrite" | "owu">().notNull().default("eventbrite"),
    /** Who RSVP'd, for OWU's own registrations: one row per person and event. */
    userId: text("userId"),
    guests: integer("guests").notNull().default(0),
    answers: jsonb("answers").$type<Record<string, string>>().notNull().default({}),
    /** A freed seat offered from the waitlist is theirs until then. */
    offerExpiresAt: ts("offerExpiresAt"),
    orderId: text("orderId"),
    name: text("name").notNull(),
    email: text("email").notNull().default(""),
    ticketClass: text("ticketClass").notNull().default(""),
    status: text("status").$type<AttendeeStatus>().notNull().default("attending"),
    barcode: text("barcode"),
    checkedInAt: ts("checkedInAt"),
    /** Who recorded the check-in: Eventbrite (Organizer at the door) or OWU's scanner. */
    checkinSource: text("checkinSource").$type<"eventbrite" | "owu">(),
    /** "Escaneo", "Búsqueda", or the scanner's device name. */
    checkinDevice: text("checkinDevice"),
    registeredAt: ts("registeredAt"),
    /** Eventbrite's `changed`, the cursor for the next `changed_since` read. */
    changedAt: ts("changedAt"),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    updatedAt: ts("updatedAt")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    unique("attendees_eventId_eventbriteId_key").on(t.eventId, t.eventbriteId),
    unique("attendees_eventId_userId_key").on(t.eventId, t.userId),
    foreignKey({ name: "attendees_userId_fk", columns: [t.userId], foreignColumns: [user.id] }).onDelete("set null"),
    index("attendees_eventId_checkedInAt_idx").on(t.eventId, t.checkedInAt),
    index("attendees_barcode_idx").on(t.barcode),
  ]
);

/**
 * Every scan from OWU's scanner, including the ones that didn't let anyone in (a repeat, an
 * unknown code). The phone's nonce makes an offline queue safe to replay.
 */
export const attendeeScans = pgTable(
  "attendee_scans",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    eventId: text("eventId")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    attendeeId: text("attendeeId").references(() => attendees.id, { onDelete: "set null" }),
    code: text("code").notNull(),
    result: text("result").$type<"ok" | "repeat" | "unknown" | "cancelled">().notNull(),
    device: text("device").notNull().default(""),
    userId: text("userId").references(() => user.id, { onDelete: "set null" }),
    nonce: text("nonce").notNull().unique(),
    scannedAt: ts("scannedAt").notNull().defaultNow(),
  },
  (t) => [index("attendee_scans_eventId_scannedAt_idx").on(t.eventId, t.scannedAt)]
);

/** Where the attendee mirror stands per event. */
export const attendeeSync = pgTable("attendee_sync", {
  eventId: text("eventId")
    .primaryKey()
    .references(() => events.id, { onDelete: "cascade" }),
  syncedAt: ts("syncedAt"),
  /** The newest `changed` seen; the next poll asks for what changed since. */
  cursor: ts("cursor"),
  webhookAt: ts("webhookAt"),
  error: text("error"),
});

/** Raffles drawn from the people who checked in, reproducible from their seed. */
export const raffles = pgTable(
  "raffles",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    eventId: text("eventId")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    prize: text("prize").notNull(),
    seed: text("seed").notNull(),
    createdAt: ts("createdAt").notNull().defaultNow(),
  },
  (t) => [index("raffles_eventId_idx").on(t.eventId)]
);

export const raffleDraws = pgTable(
  "raffle_draws",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    raffleId: text("raffleId")
      .notNull()
      .references(() => raffles.id, { onDelete: "cascade" }),
    attendeeId: text("attendeeId")
      .notNull()
      .references(() => attendees.id, { onDelete: "cascade" }),
    /** pending → claimed, or redrawn when nobody comes up. */
    status: text("status").$type<"pending" | "claimed" | "redrawn">().notNull().default("pending"),
    /** How many people were in the hat for this draw. */
    poolSize: integer("poolSize").notNull(),
    drawnAt: ts("drawnAt").notNull().defaultNow(),
  },
  (t) => [unique("raffle_draws_raffleId_attendeeId_key").on(t.raffleId, t.attendeeId)]
);

/** The post-event survey (≤ 8 questions) and per-room feedback, answered from a public link. */
export const surveys = pgTable("surveys", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  eventId: text("eventId")
    .notNull()
    .unique()
    .references(() => events.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  questions: jsonb("questions")
    .$type<{ id: string; kind: "nps" | "rating" | "choice" | "text"; label: string; options?: string[] }[]>()
    .notNull()
    .default([]),
  isOpen: boolean("isOpen").notNull().default(false),
  createdAt: ts("createdAt").notNull().defaultNow(),
  updatedAt: ts("updatedAt")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const surveyResponses = pgTable(
  "survey_responses",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    surveyId: text("surveyId")
      .notNull()
      .references(() => surveys.id, { onDelete: "cascade" }),
    /** Set when the answer came from a room's feedback QR. */
    roomId: text("roomId").references(() => rooms.id, { onDelete: "set null" }),
    answers: jsonb("answers").$type<Record<string, string | number>>().notNull().default({}),
    /** Random id the phone keeps; one answer per phone and room. */
    respondent: text("respondent").notNull(),
    createdAt: ts("createdAt").notNull().defaultNow(),
  },
  (t) => [unique("survey_responses_one").on(t.surveyId, t.respondent, t.roomId).nullsNotDistinct()]
);

/** Screens at the venue (kiosks, the wall, countdowns): named, and seen through a heartbeat. */
export const screens = pgTable("screens", {
  /** The id the display keeps in localStorage. */
  id: text("id").primaryKey(),
  name: text("name").notNull().default(""),
  eventId: text("eventId").references(() => events.id, { onDelete: "set null" }),
  /** What it is showing: the display route it reported last. */
  path: text("path").notNull().default(""),
  userAgent: text("userAgent").notNull().default(""),
  lastSeenAt: ts("lastSeenAt").notNull().defaultNow(),
  createdAt: ts("createdAt").notNull().defaultNow(),
});

/** Messages through Owy and the staff, sent now or when their time comes. */
export const outboundMessages = pgTable(
  "outbound_messages",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    eventId: text("eventId")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    /**
     * Attendees on Owy's Telegram channel, the community Slack channel, or staff DMs. `email` is
     * never sent from here: it records the Eventbrite email someone sent by hand (T-7).
     */
    channel: text("channel").$type<"telegram" | "slack" | "staff_dm" | "email">().notNull(),
    body: text("body").notNull(),
    /** For staff DMs: who gets it. */
    recipientIds: jsonb("recipientIds").$type<string[]>().notNull().default([]),
    scheduledAt: ts("scheduledAt"),
    status: text("status").$type<"scheduled" | "sending" | "sent" | "failed">().notNull().default("scheduled"),
    sentAt: ts("sentAt"),
    error: text("error"),
    /** A cadence step this message fulfils ("t-7", "t-1", "morning", "t+1"), if any. */
    step: text("step"),
    createdById: text("createdById").references(() => user.id, { onDelete: "set null" }),
    createdAt: ts("createdAt").notNull().defaultNow(),
  },
  (t) => [index("outbound_messages_eventId_status_idx").on(t.eventId, t.status)]
);

/**
 * What happened, in order: one row per change, written in the same transaction as the change.
 * Feeds the activity feed on Hoy, each entity's history, and the post-event report.
 */
export const activity = pgTable(
  "activity",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    eventId: text("eventId").references(() => events.id, { onDelete: "cascade" }),
    actorId: text("actorId").references(() => user.id, { onDelete: "set null" }),
    /** "track.created", "incident.resolved", "rundown.go"… */
    verb: text("verb").notNull(),
    entityType: text("entityType").notNull(),
    entityId: text("entityId"),
    /** One Spanish line, written when it happened: "movió «Testing» a Sala 2 · 16:30". */
    summary: text("summary").notNull(),
    createdAt: ts("createdAt").notNull().defaultNow(),
  },
  (t) => [
    index("activity_eventId_createdAt_idx").on(t.eventId, t.createdAt),
    index("activity_entity_idx").on(t.entityType, t.entityId),
  ]
);

// ---------------------------------------------------------------------------
// Inferred row types (replace Prisma-generated model types)
// ---------------------------------------------------------------------------
export type CommunityRow = typeof communities.$inferSelect;
export type CommunityMemberRow = typeof communityMembers.$inferSelect;
export type CommunityClaimRow = typeof communityClaims.$inferSelect;

/**
 * The email outbox. A change and the email it causes commit together; the dispatcher sends the
 * queue. `dedupeKey` makes each email exist once ("claim_decided:<claimId>"), and the row id is the
 * Resend idempotency key, so a retried send never doubles.
 */
export const emailDeliveries = pgTable(
  "email_deliveries",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    kind: text("kind").notNull(),
    to: text("to").notNull(),
    subject: text("subject").notNull(),
    html: text("html").notNull(),
    text: text("text").notNull(),
    headers: jsonb("headers").$type<Record<string, string>>().notNull().default({}),
    /** Base64 files, like the calendar invite */
    attachments: jsonb("attachments").$type<EmailAttachment[]>().notNull().default([]),
    dedupeKey: text("dedupeKey").notNull(),
    /** Lower goes first: 1 for codes and seat offers, 5 for the rest. */
    priority: integer("priority").notNull().default(5),
    status: text("status").$type<"queued" | "sending" | "sent" | "failed">().notNull().default("queued"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: ts("nextAttemptAt").notNull().defaultNow(),
    claimedAt: ts("claimedAt"),
    providerId: text("providerId"),
    error: text("error"),
    sentAt: ts("sentAt"),
    createdAt: ts("createdAt").notNull().defaultNow(),
  },
  (t) => [
    unique("email_deliveries_dedupeKey_key").on(t.dedupeKey),
    index("email_deliveries_queue_idx").on(t.status, t.nextAttemptAt),
  ]
);

export type EmailDeliveryRow = typeof emailDeliveries.$inferSelect;
export type EmailAttachment = { filename: string; content: string; contentType: string };

/**
 * People who asked not to get reminders and feedback emails (one-click unsubscribe). Essential
 * mail (a confirmation, a cancellation, a sign-in code) still goes out.
 */
export const emailSuppressions = pgTable(
  "email_suppressions",
  {
    email: text("email").notNull(),
    scope: text("scope").$type<"reminders">().notNull().default("reminders"),
    createdAt: ts("createdAt").notNull().defaultNow(),
  },
  (t) => [unique("email_suppressions_email_scope_key").on(t.email, t.scope)]
);

// ---------------------------------------------------------------------------
// Espacios: companies that host meetups, their (private) contacts and the requests
// ---------------------------------------------------------------------------

export type VenueAmenity = "proyector" | "microfono" | "wifi" | "accesible" | "comida";

/**
 * A space that hosts meetups. `requestable` ones take requests through OWU (their contact
 * consented); the rest are "Lo gestiona OWU": staff coordinate by hand.
 */
export const venues = pgTable(
  "venues",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    /** The company or institution */
    name: text("name").notNull(),
    neighbourhood: text("neighbourhood").notNull().default(""),
    city: text("city").notNull().default("Montevideo"),
    /** The street address: organizers see it once a request is accepted */
    address: text("address").notNull().default(""),
    mapUrl: text("mapUrl"),
    capacity: integer("capacity"),
    amenities: text("amenities").array().$type<VenueAmenity[]>().notNull().default([]),
    /** Weekdays they host (0 = Sunday … 6 = Saturday); empty means any */
    hostDays: integer("hostDays").array().notNull().default([]),
    availability: text("availability").notNull().default(""),
    /** How far ahead a request must come */
    leadDays: integer("leadDays").notNull().default(14),
    /** At most this many meetups a month; null means no cap */
    monthlyCap: integer("monthlyCap"),
    /** Whether attendees see the exact address on the event page, or only the neighbourhood */
    addressVisibility: text("addressVisibility").$type<"public" | "attendees">().notNull().default("attendees"),
    logoUrl: text("logoUrl"),
    notes: text("notes").notNull().default(""),
    status: text("status").$type<"pending" | "active" | "archived">().notNull().default("pending"),
    requestable: boolean("requestable").notNull().default(false),
    submittedById: text("submittedById"),
    createdAt: ts("createdAt").notNull().defaultNow(),
    updatedAt: ts("updatedAt")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("venues_status_idx").on(t.status),
    foreignKey({ name: "venues_submittedById_fk", columns: [t.submittedById], foreignColumns: [user.id] }).onDelete(
      "set null"
    ),
  ]
);

/** Who answers a space's requests. Read by site staff and the request emails only, never listed. */
export const venueContacts = pgTable(
  "venue_contacts",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    venueId: text("venueId").notNull(),
    userId: text("userId"),
    name: text("name").notNull(),
    email: text("email").notNull(),
    /** When they agreed to receive requests from organizers (Ley 18.331) */
    consentAt: ts("consentAt").notNull(),
    consentNote: text("consentNote").notNull().default(""),
    createdAt: ts("createdAt").notNull().defaultNow(),
  },
  (t) => [
    unique("venue_contacts_venueId_email_key").on(t.venueId, t.email),
    foreignKey({ name: "venue_contacts_venueId_fk", columns: [t.venueId], foreignColumns: [venues.id] }).onDelete(
      "cascade"
    ),
    foreignKey({ name: "venue_contacts_userId_fk", columns: [t.userId], foreignColumns: [user.id] }).onDelete(
      "set null"
    ),
  ]
);

export type VenueRequestOption = { start: string; end: string };

/** An organizer asking a space to host: 1–3 ranked dates, answered from a signed link within 72 h. */
export const venueRequests = pgTable(
  "venue_requests",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    venueId: text("venueId").notNull(),
    communityId: text("communityId").notNull(),
    eventId: text("eventId"),
    requestedById: text("requestedById"),
    options: jsonb("options").$type<VenueRequestOption[]>().notNull(),
    expectedAttendees: integer("expectedAttendees").notNull(),
    message: text("message").notNull().default(""),
    status: text("status")
      .$type<"pending" | "accepted" | "declined" | "expired" | "cancelled">()
      .notNull()
      .default("pending"),
    /** Which option the host took */
    chosenOption: integer("chosenOption"),
    /** Access notes, a counter-proposal or the reason, from the host */
    hostMessage: text("hostMessage"),
    /** The host agreed to share their contact with the organizer */
    shareContact: boolean("shareContact").notNull().default(false),
    respondedAt: ts("respondedAt"),
    expiresAt: ts("expiresAt").notNull(),
    createdAt: ts("createdAt").notNull().defaultNow(),
  },
  (t) => [
    index("venue_requests_venueId_status_idx").on(t.venueId, t.status),
    index("venue_requests_communityId_idx").on(t.communityId),
    foreignKey({ name: "venue_requests_venueId_fk", columns: [t.venueId], foreignColumns: [venues.id] }).onDelete(
      "cascade"
    ),
    foreignKey({
      name: "venue_requests_communityId_fk",
      columns: [t.communityId],
      foreignColumns: [communities.id],
    }).onDelete("cascade"),
    foreignKey({ name: "venue_requests_eventId_fk", columns: [t.eventId], foreignColumns: [events.id] }).onDelete(
      "set null"
    ),
    foreignKey({
      name: "venue_requests_requestedById_fk",
      columns: [t.requestedById],
      foreignColumns: [user.id],
    }).onDelete("set null"),
  ]
);

// ---------------------------------------------------------------------------
// Integraciones: a community's Eventbrite account and the events published there
// ---------------------------------------------------------------------------

/**
 * A community's account on another platform, connected by one of its admins. The token is
 * encrypted (INTEGRATIONS_SECRET); `webhookKey` is the secret path its webhooks come to.
 */
export const integrationConnections = pgTable(
  "integration_connections",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    communityId: text("communityId").notNull(),
    platform: text("platform").$type<"eventbrite">().notNull().default("eventbrite"),
    /** `error` once the platform rejects the token: an admin has to connect again */
    status: text("status").$type<"active" | "error">().notNull().default("active"),
    token: text("token").notNull(),
    organizationId: text("organizationId").notNull(),
    accountName: text("accountName").notNull().default(""),
    webhookKey: text("webhookKey").notNull(),
    webhookId: text("webhookId"),
    error: text("error"),
    connectedById: text("connectedById"),
    createdAt: ts("createdAt").notNull().defaultNow(),
    updatedAt: ts("updatedAt")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    unique("integration_connections_communityId_platform_key").on(t.communityId, t.platform),
    unique("integration_connections_webhookKey_key").on(t.webhookKey),
    foreignKey({
      name: "integration_connections_communityId_fk",
      columns: [t.communityId],
      foreignColumns: [communities.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "integration_connections_connectedById_fk",
      columns: [t.connectedById],
      foreignColumns: [user.id],
    }).onDelete("set null"),
  ]
);

/** The platform's ids for what a publication created, kept as each one is made. */
export type PublicationIds = {
  venueId?: string;
  /** The place the venue was made for: a new one is made when it changes */
  venueKey?: string;
  ticketClassId?: string;
  published?: boolean;
  /** Cancelled on the platform, or renamed CANCELADO when it had orders */
  cancelled?: boolean;
};

/**
 * An event published on another platform. `nextAttemptAt` set means there's something to push
 * (a publish, an edit, a cancel); the sweep pushes it, backing off on failures.
 */
export const eventPublications = pgTable(
  "event_publications",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    eventId: text("eventId").notNull(),
    connectionId: text("connectionId").notNull(),
    platform: text("platform").$type<"eventbrite">().notNull().default("eventbrite"),
    /** `failed` after the last retry: it waits for "Reintentar" */
    status: text("status").$type<"pending" | "published" | "failed">().notNull().default("pending"),
    externalId: text("externalId"),
    externalUrl: text("externalUrl"),
    ids: jsonb("ids").$type<PublicationIds>().notNull().default({}),
    /** What was last pushed: an edit that changes nothing the platform shows pushes nothing */
    pushedHash: text("pushedHash"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: ts("nextAttemptAt"),
    /** Being pushed since: nothing else claims it until it settles (or this is 5 minutes old) */
    claimedAt: ts("claimedAt"),
    error: text("error"),
    createdAt: ts("createdAt").notNull().defaultNow(),
    updatedAt: ts("updatedAt")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    unique("event_publications_eventId_platform_key").on(t.eventId, t.platform),
    index("event_publications_nextAttemptAt_idx").on(t.nextAttemptAt),
    foreignKey({ name: "event_publications_eventId_fk", columns: [t.eventId], foreignColumns: [events.id] }).onDelete(
      "cascade"
    ),
    foreignKey({
      name: "event_publications_connectionId_fk",
      columns: [t.connectionId],
      foreignColumns: [integrationConnections.id],
    }).onDelete("cascade"),
  ]
);

/** People who follow a community: they hear about each event it publishes. */
export const communityFollowers = pgTable(
  "community_followers",
  {
    communityId: text("communityId").notNull(),
    userId: text("userId").notNull(),
    createdAt: ts("createdAt").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ name: "community_followers_pkey", columns: [t.communityId, t.userId] }),
    index("community_followers_userId_idx").on(t.userId),
    foreignKey({
      name: "community_followers_communityId_fk",
      columns: [t.communityId],
      foreignColumns: [communities.id],
    }).onDelete("cascade"),
    foreignKey({ name: "community_followers_userId_fk", columns: [t.userId], foreignColumns: [user.id] }).onDelete(
      "cascade"
    ),
  ]
);

/**
 * Other communities organizing an event with its own. One the organizer also runs joins at once;
 * any other is invited, and the event shows on its profile only once it accepts.
 */
export const eventHosts = pgTable(
  "event_hosts",
  {
    eventId: text("eventId").notNull(),
    communityId: text("communityId").notNull(),
    status: text("status").$type<"invited" | "accepted">().notNull().default("invited"),
    invitedById: text("invitedById"),
    createdAt: ts("createdAt").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ name: "event_hosts_pkey", columns: [t.eventId, t.communityId] }),
    index("event_hosts_communityId_idx").on(t.communityId),
    foreignKey({ name: "event_hosts_eventId_fk", columns: [t.eventId], foreignColumns: [events.id] }).onDelete(
      "cascade"
    ),
    foreignKey({
      name: "event_hosts_communityId_fk",
      columns: [t.communityId],
      foreignColumns: [communities.id],
    }).onDelete("cascade"),
    foreignKey({ name: "event_hosts_invitedById_fk", columns: [t.invitedById], foreignColumns: [user.id] }).onDelete(
      "set null"
    ),
  ]
);

export type IntegrationConnectionRow = typeof integrationConnections.$inferSelect;
export type EventPublicationRow = typeof eventPublications.$inferSelect;

export type VenueRow = typeof venues.$inferSelect;
export type VenueContactRow = typeof venueContacts.$inferSelect;
export type VenueRequestRow = typeof venueRequests.$inferSelect;

export type CommunityRoleValue = CommunityMemberRow["role"];
export type EventRow = typeof events.$inferSelect;
export type EventLiveStateRow = typeof eventLiveState.$inferSelect;
/** @deprecated transition alias — use `EventRow`. */
export type OpenSpaceRow = EventRow;
export type ScheduleRow = typeof schedules.$inferSelect;
export type RoomRow = typeof rooms.$inferSelect;
export type TrackRow = typeof tracks.$inferSelect;
export type SemanarioIssueRow = typeof semanarioIssues.$inferSelect;
export type StaffTaskRow = typeof staffTasks.$inferSelect;
export type StaffTaskAssignmentRow = typeof staffTaskAssignments.$inferSelect;
export type StaffAnnouncementRow = typeof staffAnnouncements.$inferSelect;
export type StaffAnnouncementAckRow = typeof staffAnnouncementAcks.$inferSelect;
export type IncidentRow = typeof incidents.$inferSelect;
export type RunOfShowItemRow = typeof runOfShowItems.$inferSelect;
export type AttendeeRow = typeof attendees.$inferSelect;
export type ScreenRow = typeof screens.$inferSelect;
export type OutboundMessageRow = typeof outboundMessages.$inferSelect;
export type ActivityRow = typeof activity.$inferSelect;
export type SalarySurveyRow = typeof salarySurveys.$inferSelect;
export type SalarySurveyResponseRow = typeof salarySurveyResponses.$inferSelect;
