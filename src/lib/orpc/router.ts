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
import {
  AckCommandSchema,
  ClaimExecutorSchema,
  CreateCueSchema,
  CueIdSchema,
  InstanceSchema,
  ListCommandsSchema,
  ReleaseExecutorSchema,
  ReorderCuesSchema,
  ReportStatusSchema,
  SendCommandSchema,
  StepCueSchema,
  UpdateCueSchema,
  ackCommand,
  claimExecutor,
  createCue,
  fireCue,
  getObsStatus,
  listCommands,
  listCues,
  pendingCommands,
  releaseExecutor,
  removeCue,
  reorderCues,
  reportStatus,
  sendCommand,
  stepCue,
  updateCue,
} from "./obs-control";

import { GetCountdownStateSchema, UpdateCountdownStateSchema } from "./countdown/schemas";
import { GetCastStateSchema, SetHighlightedNoteSchema } from "./cast/schemas";
import { getCastState, setHighlightedNote } from "./cast/services";
import {
  FireEffectSchema,
  GetInputsSchema,
  GetPulseSchema,
  SaveRundownSchema,
  SetFaceSchema,
  SetNowPlayingSchema,
  SetSceneSchema,
} from "./owy-stage/schemas";
import { SubmitInputSchema } from "../owy-stage/scenes";
import { disconnectSpotify, getSpotifyNowPlaying, spotifyStatus } from "../owy-stage/spotify";
import {
  fireEffect,
  getRundown,
  getStageMeetups,
  getStagePulse,
  getInputs,
  getStageState,
  getStageSpeakers,
  getStageWeather,
  setFace,
  saveRundown,
  setNowPlaying,
  setScene,
  submitInput,
} from "./owy-stage/services";
import { getCountdownState } from "./countdown/services/get-state";
import { updateCountdownState } from "./countdown/services/update-state";
import { getCountdownEndtime } from "./countdown/services/get-endtime";

import { getDashboardStats, GetDashboardStatsSchema } from "./dashboard";

import { authed, inCommunity, pub, staff } from "./base";
import { communitiesRouter } from "./communities/router";
import { openSpacesRouter } from "./open-spaces/router";
import { roomsRouter } from "./rooms/router";
import { schedulesRouter } from "./schedules/router";
import { listCommunityMembers } from "./communities/service";
import type { Actor } from "./services";

// Track procedures (public read, admin write)
export const listTracks = pub
  .input(ListTracksByEventSchema)
  .handler(async ({ input }) => getTracksForEvent(input.openSpaceId));

export const getTracksByOpenSpaceHandler = pub
  .input(GetTracksByOpenSpaceSchema)
  .handler(async ({ input }) => getTracksByOpenSpace(input));

export const getTrack = pub.input(GetTrackSchema).handler(async ({ input }) => getTrackById(input));

export const createTrackHandler = staff.input(CreateTrackSchema).handler(async ({ input }) => createTrack(input));

export const updateTrackHandler = staff.input(UpdateTrackInputSchema).handler(async ({ input }) => updateTrack(input));

export const deleteTrackHandler = staff.input(DeleteTrackSchema).handler(async ({ input }) => deleteTrack(input));

export const swapTracksHandler = staff.input(SwapTracksSchema).handler(async ({ input }) => swapTracks(input));

export const bulkUpdateTracksByScheduleHandler = staff
  .input(BulkUpdateTracksByScheduleSchema)
  .handler(async ({ input }) => bulkUpdateTracksBySchedule(input));

/**
 * Eventbrite handlers (admin only)
 */
export const getAttendeesHandler = staff.input(GetAttendeesSchema).handler(async ({ input }) => getAttendees(input));

export const getSummaryHandler = staff.handler(async () => getSummary());

/**
 * OCR handlers (admin only)
 */
export const processImageHandler = staff.input(ProcessImageSchema).handler(async ({ input }) => processImage(input));

export const findFreeSpotHandler = staff.input(FindFreeSpotSchema).handler(async ({ input }) => findFreeSpot(input));

export const processImageWithSuggestionHandler = staff
  .input(ProcessImageWithSuggestionSchema)
  .handler(async ({ input }) => processImageWithSuggestion(input));

// OBS Queue procedures (public read, admin write)
export const getOBSState = pub.input(GetInstanceSchema).handler(async ({ input }) => getState(input));

export const updateOBSState = staff.input(UpdateStateSchema).handler(async ({ input }) => updateState(input));

/** Who queued a command, for the history tab. */
function commandSource(user: Actor): string {
  return user.id === "owy-bot" ? "bot" : `admin:${user.name || user.id}`;
}

// OBS control bus (commands for the executor tab + the status it reports back)
export const sendObsCommand = staff
  .input(SendCommandSchema)
  .handler(async ({ input, context }) => sendCommand(input, commandSource(context.user)));

export const pendingObsCommands = staff.input(InstanceSchema).handler(async ({ input }) => pendingCommands(input));

export const ackObsCommand = staff.input(AckCommandSchema).handler(async ({ input }) => ackCommand(input));

export const claimObsExecutor = staff.input(ClaimExecutorSchema).handler(async ({ input }) => claimExecutor(input));

export const releaseObsExecutor = staff
  .input(ReleaseExecutorSchema)
  .handler(async ({ input }) => releaseExecutor(input));

export const reportObsStatus = staff.input(ReportStatusSchema).handler(async ({ input }) => reportStatus(input));

export const getObsStatusHandler = staff.input(InstanceSchema).handler(async ({ input }) => getObsStatus(input));

export const listObsCommands = staff.input(ListCommandsSchema).handler(async ({ input }) => listCommands(input));

// Cues (rundown)
export const listObsCues = staff.input(InstanceSchema).handler(async ({ input }) => listCues(input));

export const createObsCue = staff.input(CreateCueSchema).handler(async ({ input }) => createCue(input));

export const updateObsCue = staff.input(UpdateCueSchema).handler(async ({ input }) => updateCue(input));

export const removeObsCue = staff.input(CueIdSchema).handler(async ({ input }) => removeCue(input));

export const reorderObsCues = staff.input(ReorderCuesSchema).handler(async ({ input }) => reorderCues(input));

export const fireObsCue = staff
  .input(CueIdSchema)
  .handler(async ({ input, context }) => fireCue(input, commandSource(context.user)));

export const stepObsCue = staff
  .input(StepCueSchema)
  .handler(async ({ input, context }) => stepCue(input, commandSource(context.user)));

// Countdown procedures (public read, admin write)
export const getCountdownStateHandler = pub
  .input(GetCountdownStateSchema)
  .handler(async ({ input }) => getCountdownState(input?.eventId));

export const getCountdownEndtimeHandler = pub
  .input(GetCountdownStateSchema)
  .handler(async ({ input }) => getCountdownEndtime(input?.eventId));

export const updateCountdownStateHandler = staff
  .input(UpdateCountdownStateSchema)
  .handler(async ({ input }) => updateCountdownState(input));

// Cast-to-screen procedures (public read for displays, admin write)
export const getCastStateHandler = pub
  .input(GetCastStateSchema)
  .handler(async ({ input }) => getCastState(input?.eventId));

export const setHighlightedNoteHandler = staff
  .input(SetHighlightedNoteSchema)
  .handler(async ({ input }) => setHighlightedNote(input));

// Owy Stage procedures (public read for the OBS pages, admin write — the
// companion bridge writes through its x-api-key admin session)
export const getStageStateHandler = pub.handler(async () => getStageState());

export const setSceneHandler = staff.input(SetSceneSchema).handler(async ({ input }) => setScene(input));

export const getRundownHandler = staff.handler(async () => getRundown());

export const saveRundownHandler = staff.input(SaveRundownSchema).handler(async ({ input }) => saveRundown(input.steps));

export const fireEffectHandler = staff.input(FireEffectSchema).handler(async ({ input }) => fireEffect(input));

export const setFaceHandler = staff.input(SetFaceSchema).handler(async ({ input }) => setFace(input));

// Aggregates only (counts), safe for the public wall pages
export const getStagePulseHandler = pub
  .input(GetPulseSchema)
  .handler(async ({ input }) => getStagePulse(input?.eventId));

export const getStageMeetupsHandler = pub.handler(async () => getStageMeetups());

export const getStageWeatherHandler = pub.handler(async () => getStageWeather());
export const getStageSpeakersHandler = pub.handler(async () => getStageSpeakers());
export const getStageSpotifyHandler = pub.handler(async () => getSpotifyNowPlaying());
export const spotifyStatusHandler = staff.handler(async () => spotifyStatus());
export const disconnectSpotifyHandler = staff.handler(async () => {
  await disconnectSpotify();
  return { ok: true };
});
export const setNowPlayingHandler = staff.input(SetNowPlayingSchema).handler(async ({ input }) => setNowPlaying(input));
export const submitStageInputHandler = pub.input(SubmitInputSchema).handler(async ({ input }) => submitInput(input));
export const getStageInputsHandler = pub.input(GetInputsSchema).handler(async ({ input }) => getInputs(input.round));

// Dashboard procedures (admin only)
export const getDashboardStatsHandler = staff
  .input(GetDashboardStatsSchema)
  .handler(async ({ input }) => getDashboardStats(input?.eventId));

// Staff coordination (event-day tasks + announcements).
// Reads and self-service actions: any community member. Editing: editor+.
export const listStaffTasksHandler = authed
  .input(ListStaffTasksSchema)
  .use(inCommunity("member"))
  .handler(async ({ input }) => listStaffTasks(input));

export const createStaffTaskHandler = authed
  .input(CreateStaffTaskSchema)
  .use(inCommunity("editor"))
  .handler(async ({ input }) => createStaffTask(input));

export const updateStaffTaskHandler = authed
  .input(UpdateStaffTaskSchema)
  .use(inCommunity("editor"))
  .handler(async ({ input }) => updateStaffTask(input));

export const deleteStaffTaskHandler = authed
  .input(DeleteStaffTaskSchema)
  .use(inCommunity("editor"))
  .handler(async ({ input }) => deleteStaffTask(input));

export const setStaffTaskStatusHandler = authed
  .input(SetStaffTaskStatusSchema)
  .use(inCommunity("member"))
  .handler(async ({ input, context }) => setStaffTaskStatus(input, context.user.id));

export const joinStaffTaskHandler = authed
  .input(JoinStaffTaskSchema)
  .use(inCommunity("member"))
  .handler(async ({ input, context }) => joinStaffTask(input, context.user.id));

export const leaveStaffTaskHandler = authed
  .input(JoinStaffTaskSchema)
  .use(inCommunity("member"))
  .handler(async ({ input, context }) => leaveStaffTask(input, context.user.id));

export const assignStaffTaskHandler = authed
  .input(AssignStaffTaskSchema)
  .use(inCommunity("editor"))
  .handler(async ({ input }) => assignStaffTask(input));

export const unassignStaffTaskHandler = authed
  .input(AssignStaffTaskSchema)
  .use(inCommunity("editor"))
  .handler(async ({ input }) => unassignStaffTask(input));

export const shiftStaffTasksHandler = authed
  .input(ShiftStaffTasksSchema)
  .use(inCommunity("editor"))
  .handler(async ({ input }) => shiftStaffTasks(input));

export const staffRosterHandler = authed
  .input(StaffRosterSchema)
  .use(inCommunity("member"))
  .effect(function* ({ context }) {
    return yield* listCommunityMembers(context.scope.communityId);
  });

export const listStaffAnnouncementsHandler = authed
  .input(ListStaffAnnouncementsSchema)
  .use(inCommunity("member"))
  .handler(async ({ input, context }) => listStaffAnnouncements(input, context.user.id, context.scope.communityId));

export const createStaffAnnouncementHandler = authed
  .input(CreateStaffAnnouncementSchema)
  .use(inCommunity("editor"))
  .handler(async ({ input, context }) => createStaffAnnouncement(input, context.user.id));

export const ackStaffAnnouncementHandler = authed
  .input(AckStaffAnnouncementSchema)
  .use(inCommunity("member"))
  .handler(async ({ input, context }) => ackStaffAnnouncement(input, context.user.id));

// Main router
export const router = {
  openSpaces: openSpacesRouter,
  schedules: schedulesRouter,
  rooms: roomsRouter,

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

  // OBS control bus + cues (see src/lib/orpc/obs-control)
  obsControl: {
    send: sendObsCommand,
    pending: pendingObsCommands,
    ack: ackObsCommand,
    claim: claimObsExecutor,
    release: releaseObsExecutor,
    report: reportObsStatus,
    status: getObsStatusHandler,
    history: listObsCommands,
  },
  obsCue: {
    list: listObsCues,
    create: createObsCue,
    update: updateObsCue,
    remove: removeObsCue,
    reorder: reorderObsCues,
    fire: fireObsCue,
    step: stepObsCue,
  },

  // Countdown Timer Management
  countdown: {
    getState: getCountdownStateHandler,
    getEndtime: getCountdownEndtimeHandler,
    updateState: updateCountdownStateHandler,
  },

  // Communities (tenants)
  communities: communitiesRouter,

  // Cast to screen (sticky note display)
  cast: {
    getState: getCastStateHandler,
    setHighlightedNote: setHighlightedNoteHandler,
  },

  // Owy Stage (video wall scenes)
  owyStage: {
    getState: getStageStateHandler,
    setScene: setSceneHandler,
    getRundown: getRundownHandler,
    saveRundown: saveRundownHandler,
    fireEffect: fireEffectHandler,
    setFace: setFaceHandler,
    getPulse: getStagePulseHandler,
    getMeetups: getStageMeetupsHandler,
    getWeather: getStageWeatherHandler,
    getSpeakers: getStageSpeakersHandler,
    submit: submitStageInputHandler,
    inputs: getStageInputsHandler,
    nowPlaying: setNowPlayingHandler,
    getSpotify: getStageSpotifyHandler,
    spotifyStatus: spotifyStatusHandler,
    disconnectSpotify: disconnectSpotifyHandler,
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
