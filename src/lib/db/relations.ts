import { relations } from "drizzle-orm";
import {
  account,
  communities,
  communityMembers,
  eventLiveState,
  events,
  obsInstances,
  obsPresetItems,
  obsPresets,
  obsQueueItems,
  rooms,
  schedules,
  session,
  staffAnnouncementAcks,
  staffAnnouncements,
  staffTaskAssignments,
  staffTasks,
  tracks,
  user,
} from "./schema";

// ---------------------------------------------------------------------------
// Tenancy relations
// ---------------------------------------------------------------------------
export const communitiesRelations = relations(communities, ({ many }) => ({
  members: many(communityMembers),
  events: many(events),
}));

export const communityMembersRelations = relations(communityMembers, ({ one }) => ({
  community: one(communities, { fields: [communityMembers.communityId], references: [communities.id] }),
  user: one(user, { fields: [communityMembers.userId], references: [user.id] }),
}));

// ---------------------------------------------------------------------------
// Domain relations (power the `db.query.*.findMany({ with: { ... } })` API)
// ---------------------------------------------------------------------------
export const eventsRelations = relations(events, ({ one, many }) => ({
  community: one(communities, { fields: [events.communityId], references: [communities.id] }),
  liveState: one(eventLiveState, { fields: [events.id], references: [eventLiveState.eventId] }),
  schedules: many(schedules),
  rooms: many(rooms),
  tracks: many(tracks),
  staffTasks: many(staffTasks),
  staffAnnouncements: many(staffAnnouncements),
}));

// ---------------------------------------------------------------------------
// Staff coordination relations
// ---------------------------------------------------------------------------
export const staffTasksRelations = relations(staffTasks, ({ one, many }) => ({
  event: one(events, { fields: [staffTasks.openSpaceId], references: [events.id] }),
  statusUpdatedBy: one(user, { fields: [staffTasks.statusUpdatedById], references: [user.id] }),
  assignments: many(staffTaskAssignments),
}));

export const staffTaskAssignmentsRelations = relations(staffTaskAssignments, ({ one }) => ({
  task: one(staffTasks, { fields: [staffTaskAssignments.taskId], references: [staffTasks.id] }),
  user: one(user, { fields: [staffTaskAssignments.userId], references: [user.id] }),
}));

export const staffAnnouncementsRelations = relations(staffAnnouncements, ({ one, many }) => ({
  event: one(events, { fields: [staffAnnouncements.openSpaceId], references: [events.id] }),
  author: one(user, { fields: [staffAnnouncements.authorId], references: [user.id] }),
  task: one(staffTasks, { fields: [staffAnnouncements.taskId], references: [staffTasks.id] }),
  acks: many(staffAnnouncementAcks),
}));

export const staffAnnouncementAcksRelations = relations(staffAnnouncementAcks, ({ one }) => ({
  announcement: one(staffAnnouncements, {
    fields: [staffAnnouncementAcks.announcementId],
    references: [staffAnnouncements.id],
  }),
  user: one(user, { fields: [staffAnnouncementAcks.userId], references: [user.id] }),
}));

export const eventLiveStateRelations = relations(eventLiveState, ({ one }) => ({
  event: one(events, { fields: [eventLiveState.eventId], references: [events.id] }),
  highlightedTrack: one(tracks, { fields: [eventLiveState.highlightedTrackId], references: [tracks.id] }),
}));

export const schedulesRelations = relations(schedules, ({ one, many }) => ({
  event: one(events, { fields: [schedules.openSpaceId], references: [events.id] }),
  tracks: many(tracks),
}));

export const roomsRelations = relations(rooms, ({ one, many }) => ({
  event: one(events, { fields: [rooms.openSpaceId], references: [events.id] }),
  tracks: many(tracks),
}));

export const tracksRelations = relations(tracks, ({ one }) => ({
  event: one(events, { fields: [tracks.openSpaceId], references: [events.id] }),
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
  memberships: many(communityMembers),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, { fields: [session.userId], references: [user.id] }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, { fields: [account.userId], references: [user.id] }),
}));
