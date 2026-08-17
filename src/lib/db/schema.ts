import { boolean, foreignKey, index, integer, pgEnum, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";
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
  updatedAt: ts("updatedAt")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  createdAt: ts("createdAt").notNull().defaultNow(),
});

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
    createdAt: ts("createdAt").notNull().defaultNow(),
  },
  (t) => [
    unique("staff_task_assignments_taskId_userId_key").on(t.taskId, t.userId),
    index("staff_task_assignments_userId_idx").on(t.userId),
  ]
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
