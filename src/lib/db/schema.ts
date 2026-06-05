import { boolean, index, integer, pgEnum, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";
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
// Domain tables
// ---------------------------------------------------------------------------
export const openSpaces = pgTable("open_spaces", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  name: text("name").notNull(),
  description: text("description"),
  startDate: ts("startDate").notNull(),
  endDate: ts("endDate").notNull(),
  isActive: boolean("isActive").notNull().default(true),
  autoHighlightEnabled: boolean("autoHighlightEnabled").notNull().default(false),
  createdAt: ts("createdAt").notNull().defaultNow(),
  updatedAt: ts("updatedAt")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const schedules = pgTable("schedules", {
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
    .references(() => openSpaces.id, { onDelete: "cascade" }),
});

export const rooms = pgTable("rooms", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  name: text("name").notNull(),
  description: text("description"),
  capacity: integer("capacity"),
  hasTV: boolean("hasTV").notNull().default(false),
  hasWhiteboard: boolean("hasWhiteboard").notNull().default(false),
  isActive: boolean("isActive").notNull().default(true),
  createdAt: ts("createdAt").notNull().defaultNow(),
  updatedAt: ts("updatedAt")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  openSpaceId: text("openSpaceId")
    .notNull()
    .references(() => openSpaces.id, { onDelete: "cascade" }),
});

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
      .references(() => openSpaces.id, { onDelete: "cascade" }),
    scheduleId: text("scheduleId")
      .notNull()
      .references(() => schedules.id, { onDelete: "cascade" }),
    roomId: text("roomId")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
  },
  (t) => [unique("tracks_scheduleId_roomId_key").on(t.scheduleId, t.roomId)],
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
  (t) => [index("obs_queue_items_instanceId_position_idx").on(t.instanceId, t.position)],
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
  (t) => [index("obs_preset_items_presetId_position_idx").on(t.presetId, t.position)],
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
// Inferred row types (replace Prisma-generated model types)
// ---------------------------------------------------------------------------
export type OpenSpaceRow = typeof openSpaces.$inferSelect;
export type ScheduleRow = typeof schedules.$inferSelect;
export type RoomRow = typeof rooms.$inferSelect;
export type TrackRow = typeof tracks.$inferSelect;
