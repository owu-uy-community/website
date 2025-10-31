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
  getAllTracks,
  getTrackById,
  getTracksByOpenSpace,
  createTrack,
  updateTrack,
  deleteTrack,
  swapTracks,
} from "./sticky-notes";

import {
  CreateOpenSpaceSchema,
  GetOpenSpaceSchema,
  UpdateOpenSpaceInputSchema,
  DeleteOpenSpaceSchema,
  getAllOpenSpaces,
  getOpenSpaceById,
  createOpenSpace,
  updateOpenSpace,
  deleteOpenSpace,
} from "./open-spaces";

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
  getAllRooms,
  getRoomById,
  getRoomsByOpenSpace,
  createRoom,
  updateRoom,
  deleteRoom,
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

import { UpdateCountdownStateSchema } from "./countdown/schemas";
import { getCountdownState } from "./countdown/services/get-state";
import { updateCountdownState } from "./countdown/services/update-state";
import { getCountdownEndtime } from "./countdown/services/get-endtime";

import { getDashboardStats } from "./dashboard";

import { withErrorHandling } from "./utilities";
import { requireAdmin } from "./middleware";

// Create admin-protected base with middleware
const adminOs = os.use(requireAdmin);

// OpenSpace procedures (public read, admin write)
export const listOpenSpaces = os.handler(withErrorHandling(async () => getAllOpenSpaces(), "fetch open spaces"));

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
export const listSchedules = os.handler(withErrorHandling(async () => getAllSchedules(), "fetch schedules"));

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
export const listRooms = os.handler(withErrorHandling(async () => getAllRooms(), "fetch rooms"));

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

// Track procedures (public read, admin write)
export const listTracks = os.handler(withErrorHandling(async () => getAllTracks(), "fetch tracks"));

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
export const getCountdownStateHandler = os.handler(
  withErrorHandling(async () => getCountdownState(), "get countdown state")
);

export const getCountdownEndtimeHandler = os.handler(
  withErrorHandling(async () => getCountdownEndtime(), "get countdown endtime")
);

export const updateCountdownStateHandler = adminOs
  .input(UpdateCountdownStateSchema)
  .handler(withErrorHandling(async ({ input }) => updateCountdownState(input), "update countdown state"));

// Dashboard procedures (admin only)
export const getDashboardStatsHandler = adminOs.handler(
  withErrorHandling(async () => getDashboardStats(), "get dashboard statistics")
);

// Main router
export const router = {
  // OpenSpace management
  openSpaces: {
    list: listOpenSpaces,
    get: getOpenSpace,
    create: createOpenSpaceHandler,
    update: updateOpenSpaceHandler,
    delete: deleteOpenSpaceHandler,
  },

  // Schedule management
  schedules: {
    list: listSchedules,
    get: getSchedule,
    getByOpenSpace: getSchedulesByOpenSpaceHandler,
    create: createScheduleHandler,
    update: updateScheduleHandler,
    delete: deleteScheduleHandler,
  },

  // Room management
  rooms: {
    list: listRooms,
    get: getRoom,
    getByOpenSpace: getRoomsByOpenSpaceHandler,
    create: createRoomHandler,
    update: updateRoomHandler,
    delete: deleteRoomHandler,
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

  // Dashboard Statistics
  dashboard: {
    getStats: getDashboardStatsHandler,
  },
};

export type AppRouter = typeof router;
