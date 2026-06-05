import { relations } from "drizzle-orm";
import {
  account,
  obsInstances,
  obsPresetItems,
  obsPresets,
  obsQueueItems,
  openSpaces,
  rooms,
  schedules,
  session,
  tracks,
  user,
} from "./schema";

// ---------------------------------------------------------------------------
// Domain relations (power the `db.query.*.findMany({ with: { ... } })` API)
// ---------------------------------------------------------------------------
export const openSpacesRelations = relations(openSpaces, ({ many }) => ({
  schedules: many(schedules),
  rooms: many(rooms),
  tracks: many(tracks),
}));

export const schedulesRelations = relations(schedules, ({ one, many }) => ({
  openSpace: one(openSpaces, { fields: [schedules.openSpaceId], references: [openSpaces.id] }),
  tracks: many(tracks),
}));

export const roomsRelations = relations(rooms, ({ one, many }) => ({
  openSpace: one(openSpaces, { fields: [rooms.openSpaceId], references: [openSpaces.id] }),
  tracks: many(tracks),
}));

export const tracksRelations = relations(tracks, ({ one }) => ({
  openSpace: one(openSpaces, { fields: [tracks.openSpaceId], references: [openSpaces.id] }),
  schedule: one(schedules, { fields: [tracks.scheduleId], references: [schedules.id] }),
  room: one(rooms, { fields: [tracks.roomId], references: [rooms.id] }),
}));

// ---------------------------------------------------------------------------
// OBS relations
// ---------------------------------------------------------------------------
export const obsInstancesRelations = relations(obsInstances, ({ many }) => ({
  queueItems: many(obsQueueItems),
  presets: many(obsPresets),
}));

export const obsQueueItemsRelations = relations(obsQueueItems, ({ one }) => ({
  instance: one(obsInstances, { fields: [obsQueueItems.instanceId], references: [obsInstances.id] }),
}));

export const obsPresetsRelations = relations(obsPresets, ({ one, many }) => ({
  instance: one(obsInstances, { fields: [obsPresets.instanceId], references: [obsInstances.id] }),
  items: many(obsPresetItems),
}));

export const obsPresetItemsRelations = relations(obsPresetItems, ({ one }) => ({
  preset: one(obsPresets, { fields: [obsPresetItems.presetId], references: [obsPresets.id] }),
}));

// ---------------------------------------------------------------------------
// Auth relations
// ---------------------------------------------------------------------------
export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, { fields: [session.userId], references: [user.id] }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, { fields: [account.userId], references: [user.id] }),
}));
