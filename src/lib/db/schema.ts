import {
  boolean,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
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
  createdAt: ts("createdAt").notNull().defaultNow(),
  updatedAt: ts("updatedAt")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

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
    createdAt: ts("createdAt").notNull().defaultNow(),
    updatedAt: ts("updatedAt")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    unique("open_spaces_communityId_slug_key").on(t.communityId, t.slug),
    index("open_spaces_communityId_idx").on(t.communityId),
  ]
);

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
  /**
   * The operator's desk: what is in preview, the queue behind it and the presets; see DeskSchema. The
   * default still says `favorites`, as desks did before presets: readDesk carries them over.
   */
  desk: jsonb("desk")
    .$type<{ preview: unknown; queue: unknown[]; presets?: unknown[]; favorites?: string[] }>()
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
    /** The last edit, shown as «editado»; null while it reads as sent. */
    editedAt: ts("editedAt"),
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
    /**
     * `note`: typed by someone; its author or an editor can fix or delete it. `change`: the log
     * line of an edit, which stays as it was. Rows from before this column read as `change`: the
     * log was append-only then, and stays so for them.
     */
    kind: text("kind").$type<"note" | "change">().notNull().default("change"),
    createdAt: ts("createdAt").notNull().defaultNow(),
    /** A note fixed after the fact, shown as «editado». */
    editedAt: ts("editedAt"),
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

export type AttendeeStatus = "attending" | "cancelled" | "refunded";

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
    eventbriteId: text("eventbriteId").notNull(),
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
/** Where a sent message landed: Telegram's chat and message id, or Slack's channel and ts. */
export type RemoteRef =
  | { service: "telegram"; chatId: string; messageId: number }
  | { service: "slack"; channel: string; ts: string };

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
    /**
     * Where it landed (Telegram's chat and message id, Slack's channel and ts; one per staff DM), so
     * editing or deleting it changes it there too. Empty for what went out before this was kept.
     */
    remoteRefs: jsonb("remoteRefs").$type<RemoteRef[]>().notNull().default([]),
    /** The last edit after it went out, shown as «editado». */
    editedAt: ts("editedAt"),
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
export type CommunityRoleValue = CommunityMemberRow["role"];
export type EventRow = typeof events.$inferSelect;
export type EventLiveStateRow = typeof eventLiveState.$inferSelect;
/** @deprecated transition alias — use `EventRow`. */
export type OpenSpaceRow = EventRow;
export type ScheduleRow = typeof schedules.$inferSelect;
export type RoomRow = typeof rooms.$inferSelect;
export type TrackRow = typeof tracks.$inferSelect;
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
