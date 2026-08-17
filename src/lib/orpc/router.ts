import { os } from "@orpc/server";

// Import all feature modules
import {
  // Tracks API
  CreateTrackSchema,
  GetTrackSchema,
  UpdateTrackInputSchema,
  DeleteTrackSchema,
  SwapTracksSchema,
  GetTracksByOpenSpaceSchema,
  ListTracksByEventSchema,
  BulkUpdateTracksByScheduleSchema,
  getTracksForEvent,
  getTrackById,
  getTracksByOpenSpace,
  createTrack,
  updateTrack,
  deleteTrack,
  swapTracks,
  bulkUpdateTracksBySchedule,
} from "./sticky-notes";

import {
  CreateOpenSpaceSchema,
  GetOpenSpaceSchema,
  ListOpenSpacesByCommunitySchema,
  UpdateOpenSpaceInputSchema,
  DeleteOpenSpaceSchema,
  getOpenSpaceById,
  getOpenSpacesByCommunity,
  listEventsForOperator,
  createOpenSpace,
  updateOpenSpace,
  deleteOpenSpace,
} from "./open-spaces";

import {
  AckStaffAnnouncementSchema,
  AssignStaffTaskSchema,
  CreateStaffAnnouncementSchema,
  CreateStaffTaskSchema,
  DeleteStaffTaskSchema,
  JoinStaffTaskSchema,
  ListStaffAnnouncementsSchema,
  ListStaffTasksSchema,
  SetStaffTaskStatusSchema,
  ShiftStaffTasksSchema,
  StaffRosterSchema,
  UpdateStaffTaskSchema,
  ackStaffAnnouncement,
  assignStaffTask,
  createStaffAnnouncement,
  createStaffTask,
  deleteStaffTask,
  joinStaffTask,
  leaveStaffTask,
  listStaffAnnouncements,
  listStaffTasks,
  setStaffTaskStatus,
  shiftStaffTasks,
  unassignStaffTask,
  updateStaffTask,
} from "./staff-tasks";

import {
  CreateScheduleSchema,
  GetScheduleSchema,
  UpdateScheduleInputSchema,
  DeleteScheduleSchema,
  GetSchedulesByOpenSpaceSchema,
  getAllSchedules,
  getScheduleById,
  getSchedulesByOpenSpace,
  createSchedule,
  updateSchedule,
  deleteSchedule,
} from "./schedules";

import {
  CreateRoomSchema,
  GetRoomSchema,
  UpdateRoomInputSchema,
  DeleteRoomSchema,
  GetRoomsByOpenSpaceSchema,
  ReorderRoomsSchema,
  getRoomById,
  getRoomsByOpenSpace,
  createRoom,
  updateRoom,
  deleteRoom,
  reorderRooms,
} from "./rooms";

import { GetAttendeesSchema, GetSummarySchema, getAttendees, getSummary } from "./eventbrite";

import {
  ProcessImageSchema,
  FindFreeSpotSchema,
  ProcessImageWithSuggestionSchema,
  processImage,
  findFreeSpot,
  processImageWithSuggestion,
} from "./ocr";

import { GetInstanceSchema, UpdateStateSchema, getState, updateState } from "./obs-queue";

import { GetCountdownStateSchema, UpdateCountdownStateSchema } from "./countdown/schemas";
import { GetCastStateSchema, SetHighlightedNoteSchema } from "./cast/schemas";
import { getCastState, setHighlightedNote } from "./cast/services";
import {
  AddCommunityMemberSchema,
  CreateCommunitySchema,
  GetCommunityBySlugSchema,
  ListCommunitiesSchema,
  ListCommunityMembersSchema,
  RemoveCommunityMemberSchema,
  UpdateCommunityMemberRoleSchema,
  UpdateCommunitySchema,
} from "./communities/schemas";
import {
  addCommunityMember,
  createCommunity,
  getCommunityBySlug,
  listCommunities,
  listCommunityMembers,
  removeCommunityMember,
  updateCommunity,
  updateCommunityMemberRole,
} from "./communities/services";
import { getCountdownState } from "./countdown/services/get-state";
import { updateCountdownState } from "./countdown/services/update-state";
import { getCountdownEndtime } from "./countdown/services/get-endtime";

import { getDashboardStats, GetDashboardStatsSchema } from "./dashboard";

import { withErrorHandling } from "./utilities";
import { isSiteStaff, requireAdmin, requireAuth, requireCommunityRole, type Context } from "./middleware";

// Create admin-protected base with middleware
const adminOs = os.use(requireAdmin);

// OpenSpace procedures (public read, admin write)
export const listOpenSpacesByCommunity = os
  .input(ListOpenSpacesByCommunitySchema)
  .handler(
    withErrorHandling(async ({ input }) => getOpenSpacesByCommunity(input.communityId), "fetch community events")
  );

/**
 * Event list for the switcher and the staff "Tareas" page. Site staff sees
 * every event; community members see the events of their communities.
 */
export const listEventsForAdminHandler = os.use(requireAuth).handler(
  withErrorHandling(async ({ context }) => {
    const user = (context as Context).user!;
    return listEventsForOperator(isSiteStaff(user) ? null : user.id);
  }, "list events for operator")
);

export const getOpenSpace = os
  .input(GetOpenSpaceSchema)
  .handler(withErrorHandling(async ({ input }) => getOpenSpaceById(input), "fetch open space"));

export const createOpenSpaceHandler = adminOs
  .input(CreateOpenSpaceSchema)
  .handler(withErrorHandling(async ({ input }) => createOpenSpace(input), "create open space"));

export const updateOpenSpaceHandler = adminOs
  .input(UpdateOpenSpaceInputSchema)
  .handler(withErrorHandling(async ({ input }) => updateOpenSpace(input), "update open space"));

export const deleteOpenSpaceHandler = adminOs
  .input(DeleteOpenSpaceSchema)
  .handler(withErrorHandling(async ({ input }) => deleteOpenSpace(input), "delete open space"));

// Schedule procedures (public read, admin write)
export const getSchedulesByOpenSpaceHandler = os
  .input(GetSchedulesByOpenSpaceSchema)
  .handler(withErrorHandling(async ({ input }) => getSchedulesByOpenSpace(input), "fetch schedules by open space"));

export const getSchedule = os
  .input(GetScheduleSchema)
  .handler(withErrorHandling(async ({ input }) => getScheduleById(input), "fetch schedule"));

export const createScheduleHandler = adminOs
  .input(CreateScheduleSchema)
  .handler(withErrorHandling(async ({ input }) => createSchedule(input), "create schedule"));

export const updateScheduleHandler = adminOs
  .input(UpdateScheduleInputSchema)
  .handler(withErrorHandling(async ({ input }) => updateSchedule(input), "update schedule"));

export const deleteScheduleHandler = adminOs
  .input(DeleteScheduleSchema)
  .handler(withErrorHandling(async ({ input }) => deleteSchedule(input), "delete schedule"));

// Room procedures (public read, admin write)
export const getRoomsByOpenSpaceHandler = os
  .input(GetRoomsByOpenSpaceSchema)
  .handler(withErrorHandling(async ({ input }) => getRoomsByOpenSpace(input), "fetch rooms by open space"));

export const getRoom = os
  .input(GetRoomSchema)
  .handler(withErrorHandling(async ({ input }) => getRoomById(input), "fetch room"));

export const createRoomHandler = adminOs
  .input(CreateRoomSchema)
  .handler(withErrorHandling(async ({ input }) => createRoom(input), "create room"));

export const updateRoomHandler = adminOs
  .input(UpdateRoomInputSchema)
  .handler(withErrorHandling(async ({ input }) => updateRoom(input), "update room"));

export const deleteRoomHandler = adminOs
  .input(DeleteRoomSchema)
  .handler(withErrorHandling(async ({ input }) => deleteRoom(input), "delete room"));

export const reorderRoomsHandler = adminOs
  .input(ReorderRoomsSchema)
  .handler(withErrorHandling(async ({ input }) => reorderRooms(input), "reorder rooms"));

// Track procedures (public read, admin write)
export const listTracks = os
  .input(ListTracksByEventSchema)
  .handler(withErrorHandling(async ({ input }) => getTracksForEvent(input.openSpaceId), "fetch event tracks"));

export const getTracksByOpenSpaceHandler = os
  .input(GetTracksByOpenSpaceSchema)
  .handler(withErrorHandling(async ({ input }) => getTracksByOpenSpace(input), "fetch tracks by open space"));

export const getTrack = os
  .input(GetTrackSchema)
  .handler(withErrorHandling(async ({ input }) => getTrackById(input), "fetch track"));

export const createTrackHandler = adminOs
  .input(CreateTrackSchema)
  .handler(withErrorHandling(async ({ input }) => createTrack(input), "create track"));

export const updateTrackHandler = adminOs
  .input(UpdateTrackInputSchema)
  .handler(withErrorHandling(async ({ input }) => updateTrack(input), "update track"));

export const deleteTrackHandler = adminOs
  .input(DeleteTrackSchema)
  .handler(withErrorHandling(async ({ input }) => deleteTrack(input), "delete track"));

export const swapTracksHandler = adminOs
  .input(SwapTracksSchema)
  .handler(withErrorHandling(async ({ input }) => swapTracks(input), "swap tracks"));

export const bulkUpdateTracksByScheduleHandler = adminOs
  .input(BulkUpdateTracksByScheduleSchema)
  .handler(withErrorHandling(async ({ input }) => bulkUpdateTracksBySchedule(input), "bulk update tracks by schedule"));

/**
 * Eventbrite handlers (admin only)
 */
export const getAttendeesHandler = adminOs
  .input(GetAttendeesSchema)
  .handler(withErrorHandling(async ({ input }) => getAttendees(input), "fetch Eventbrite attendees"));

export const getSummaryHandler = adminOs.handler(
  withErrorHandling(async () => getSummary(), "fetch Eventbrite summary")
);

/**
 * OCR handlers (admin only)
 */
export const processImageHandler = adminOs
  .input(ProcessImageSchema)
  .handler(withErrorHandling(async ({ input }) => processImage(input), "process image with OCR"));

export const findFreeSpotHandler = adminOs
  .input(FindFreeSpotSchema)
  .handler(withErrorHandling(async ({ input }) => findFreeSpot(input), "find free spot with AI"));

export const processImageWithSuggestionHandler = adminOs
  .input(ProcessImageWithSuggestionSchema)
  .handler(
    withErrorHandling(async ({ input }) => processImageWithSuggestion(input), "process image with OCR and suggest spot")
  );

// OBS Queue procedures (public read, admin write)
export const getOBSState = os
  .input(GetInstanceSchema)
  .handler(withErrorHandling(async ({ input }) => getState(input), "get OBS queue state"));

export const updateOBSState = adminOs
  .input(UpdateStateSchema)
  .handler(withErrorHandling(async ({ input }) => updateState(input), "update OBS queue state"));

// Countdown procedures (public read, admin write)
export const getCountdownStateHandler = os
  .input(GetCountdownStateSchema)
  .handler(withErrorHandling(async ({ input }) => getCountdownState(input?.eventId), "get countdown state"));

export const getCountdownEndtimeHandler = os
  .input(GetCountdownStateSchema)
  .handler(withErrorHandling(async ({ input }) => getCountdownEndtime(input?.eventId), "get countdown endtime"));

export const updateCountdownStateHandler = adminOs
  .input(UpdateCountdownStateSchema)
  .handler(withErrorHandling(async ({ input }) => updateCountdownState(input), "update countdown state"));

// Community procedures (public read; per-community roles for management)
export const listCommunitiesHandler = os
  .input(ListCommunitiesSchema)
  .handler(withErrorHandling(async ({ input }) => listCommunities(input?.includeInactive), "list communities"));

export const getCommunityBySlugHandler = os
  .input(GetCommunityBySlugSchema)
  .handler(withErrorHandling(async ({ input }) => getCommunityBySlug(input.communitySlug), "get community by slug"));

export const createCommunityHandler = adminOs
  .input(CreateCommunitySchema)
  .handler(
    withErrorHandling(
      async ({ input, context }) => createCommunity(input, (context as Context).user!.id),
      "create community"
    )
  );

export const updateCommunityHandler = os
  .input(UpdateCommunitySchema)
  .use(requireCommunityRole("admin"))
  .handler(withErrorHandling(async ({ input }) => updateCommunity(input), "update community"));

export const listCommunityMembersHandler = os
  .input(ListCommunityMembersSchema)
  .use(requireCommunityRole("admin"))
  .handler(withErrorHandling(async ({ input }) => listCommunityMembers(input), "list community members"));

export const addCommunityMemberHandler = os
  .input(AddCommunityMemberSchema)
  .use(requireCommunityRole("admin"))
  .handler(
    withErrorHandling(
      async ({ input, context }) =>
        addCommunityMember(input, {
          userId: (context as Context).user!.id,
          isSiteStaff: isSiteStaff((context as Context).user!),
        }),
      "add community member"
    )
  );

export const updateCommunityMemberRoleHandler = os
  .input(UpdateCommunityMemberRoleSchema)
  .use(requireCommunityRole("admin"))
  .handler(
    withErrorHandling(
      async ({ input, context }) =>
        updateCommunityMemberRole(input, {
          userId: (context as Context).user!.id,
          isSiteStaff: isSiteStaff((context as Context).user!),
        }),
      "update community member role"
    )
  );

export const removeCommunityMemberHandler = os
  .input(RemoveCommunityMemberSchema)
  .use(requireCommunityRole("admin"))
  .handler(
    withErrorHandling(
      async ({ input, context }) =>
        removeCommunityMember(input, {
          userId: (context as Context).user!.id,
          isSiteStaff: isSiteStaff((context as Context).user!),
        }),
      "remove community member"
    )
  );

// Cast-to-screen procedures (public read for displays, admin write)
export const getCastStateHandler = os
  .input(GetCastStateSchema)
  .handler(withErrorHandling(async ({ input }) => getCastState(input?.eventId), "get cast state"));

export const setHighlightedNoteHandler = adminOs
  .input(SetHighlightedNoteSchema)
  .handler(withErrorHandling(async ({ input }) => setHighlightedNote(input), "set highlighted note"));

// Dashboard procedures (admin only)
export const getDashboardStatsHandler = adminOs
  .input(GetDashboardStatsSchema)
  .handler(withErrorHandling(async ({ input }) => getDashboardStats(input?.eventId), "get dashboard statistics"));

// Staff coordination (event-day tasks + announcements).
// Reads and self-service actions: any community member. Editing: editor+.
export const listStaffTasksHandler = os
  .input(ListStaffTasksSchema)
  .use(requireCommunityRole("member"))
  .handler(withErrorHandling(async ({ input }) => listStaffTasks(input), "list staff tasks"));

export const createStaffTaskHandler = os
  .input(CreateStaffTaskSchema)
  .use(requireCommunityRole("editor"))
  .handler(withErrorHandling(async ({ input }) => createStaffTask(input), "create staff task"));

export const updateStaffTaskHandler = os
  .input(UpdateStaffTaskSchema)
  .use(requireCommunityRole("editor"))
  .handler(withErrorHandling(async ({ input }) => updateStaffTask(input), "update staff task"));

export const deleteStaffTaskHandler = os
  .input(DeleteStaffTaskSchema)
  .use(requireCommunityRole("editor"))
  .handler(withErrorHandling(async ({ input }) => deleteStaffTask(input), "delete staff task"));

export const setStaffTaskStatusHandler = os
  .input(SetStaffTaskStatusSchema)
  .use(requireCommunityRole("member"))
  .handler(
    withErrorHandling(
      async ({ input, context }) => setStaffTaskStatus(input, (context as Context).user!.id),
      "set staff task status"
    )
  );

export const joinStaffTaskHandler = os
  .input(JoinStaffTaskSchema)
  .use(requireCommunityRole("member"))
  .handler(
    withErrorHandling(
      async ({ input, context }) => joinStaffTask(input, (context as Context).user!.id),
      "join staff task"
    )
  );

export const leaveStaffTaskHandler = os
  .input(JoinStaffTaskSchema)
  .use(requireCommunityRole("member"))
  .handler(
    withErrorHandling(
      async ({ input, context }) => leaveStaffTask(input, (context as Context).user!.id),
      "leave staff task"
    )
  );

export const assignStaffTaskHandler = os
  .input(AssignStaffTaskSchema)
  .use(requireCommunityRole("editor"))
  .handler(withErrorHandling(async ({ input }) => assignStaffTask(input), "assign staff task"));

export const unassignStaffTaskHandler = os
  .input(AssignStaffTaskSchema)
  .use(requireCommunityRole("editor"))
  .handler(withErrorHandling(async ({ input }) => unassignStaffTask(input), "unassign staff task"));

export const shiftStaffTasksHandler = os
  .input(ShiftStaffTasksSchema)
  .use(requireCommunityRole("editor"))
  .handler(withErrorHandling(async ({ input }) => shiftStaffTasks(input), "shift staff tasks"));

export const staffRosterHandler = os
  .input(StaffRosterSchema)
  .use(requireCommunityRole("member"))
  .handler(
    withErrorHandling(
      async ({ context }) => listCommunityMembers({ communityId: (context as Context).scope!.communityId }),
      "list staff roster"
    )
  );

export const listStaffAnnouncementsHandler = os
  .input(ListStaffAnnouncementsSchema)
  .use(requireCommunityRole("member"))
  .handler(
    withErrorHandling(
      async ({ input, context }) =>
        listStaffAnnouncements(input, (context as Context).user!.id, (context as Context).scope!.communityId),
      "list staff announcements"
    )
  );

export const createStaffAnnouncementHandler = os
  .input(CreateStaffAnnouncementSchema)
  .use(requireCommunityRole("editor"))
  .handler(
    withErrorHandling(
      async ({ input, context }) => createStaffAnnouncement(input, (context as Context).user!.id),
      "create staff announcement"
    )
  );

export const ackStaffAnnouncementHandler = os
  .input(AckStaffAnnouncementSchema)
  .use(requireCommunityRole("member"))
  .handler(
    withErrorHandling(
      async ({ input, context }) => ackStaffAnnouncement(input, (context as Context).user!.id),
      "ack staff announcement"
    )
  );

// Main router
export const router = {
  // OpenSpace management
  openSpaces: {
    listByCommunity: listOpenSpacesByCommunity,
    listForAdmin: listEventsForAdminHandler,
    get: getOpenSpace,
    create: createOpenSpaceHandler,
    update: updateOpenSpaceHandler,
    delete: deleteOpenSpaceHandler,
  },

  // Schedule management
  schedules: {
    get: getSchedule,
    getByOpenSpace: getSchedulesByOpenSpaceHandler,
    create: createScheduleHandler,
    update: updateScheduleHandler,
    delete: deleteScheduleHandler,
  },

  // Room management
  rooms: {
    get: getRoom,
    getByOpenSpace: getRoomsByOpenSpaceHandler,
    create: createRoomHandler,
    update: updateRoomHandler,
    delete: deleteRoomHandler,
    reorder: reorderRoomsHandler,
  },

  // Track management
  tracks: {
    list: listTracks,
    get: getTrack,
    getByOpenSpace: getTracksByOpenSpaceHandler,
    create: createTrackHandler,
    update: updateTrackHandler,
    delete: deleteTrackHandler,
    swap: swapTracksHandler,
    bulkUpdateBySchedule: bulkUpdateTracksByScheduleHandler,
  },

  // Eventbrite integration
  eventbrite: {
    getAttendees: getAttendeesHandler,
    getSummary: getSummaryHandler,
  },

  // OCR for extracting talk information from images
  ocr: {
    processImage: processImageHandler,
    findFreeSpot: findFreeSpotHandler,
    processImageWithSuggestion: processImageWithSuggestionHandler,
  },

  // OBS Queue State Management
  obsQueue: {
    getState: getOBSState,
    updateState: updateOBSState,
  },

  // Countdown Timer Management
  countdown: {
    getState: getCountdownStateHandler,
    getEndtime: getCountdownEndtimeHandler,
    updateState: updateCountdownStateHandler,
  },

  // Communities (tenants)
  communities: {
    list: listCommunitiesHandler,
    getBySlug: getCommunityBySlugHandler,
    create: createCommunityHandler,
    update: updateCommunityHandler,
    members: {
      list: listCommunityMembersHandler,
      add: addCommunityMemberHandler,
      updateRole: updateCommunityMemberRoleHandler,
      remove: removeCommunityMemberHandler,
    },
  },

  // Cast to screen (sticky note display)
  cast: {
    getState: getCastStateHandler,
    setHighlightedNote: setHighlightedNoteHandler,
  },

  // Dashboard Statistics
  dashboard: {
    getStats: getDashboardStatsHandler,
  },

  // Staff coordination (event-day tasks + announcements)
  staffTasks: {
    list: listStaffTasksHandler,
    create: createStaffTaskHandler,
    update: updateStaffTaskHandler,
    delete: deleteStaffTaskHandler,
    setStatus: setStaffTaskStatusHandler,
    join: joinStaffTaskHandler,
    leave: leaveStaffTaskHandler,
    assign: assignStaffTaskHandler,
    unassign: unassignStaffTaskHandler,
    shiftFrom: shiftStaffTasksHandler,
    roster: staffRosterHandler,
    announcements: {
      list: listStaffAnnouncementsHandler,
      create: createStaffAnnouncementHandler,
      ack: ackStaffAnnouncementHandler,
    },
  },
};

export type AppRouter = typeof router;
