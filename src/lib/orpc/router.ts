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

import { pub, staff } from "./base";
import { castRouter } from "./cast/router";
import { communitiesRouter } from "./communities/router";
import { countdownRouter } from "./countdown/router";
import { dashboardRouter } from "./dashboard/router";
import { eventbriteRouter } from "./eventbrite/router";
import { openSpacesRouter } from "./open-spaces/router";
import { roomsRouter } from "./rooms/router";
import { schedulesRouter } from "./schedules/router";
import { staffTasksRouter } from "./staff-tasks/router";
import { tracksRouter } from "./tracks/router";
import type { Actor } from "./services";

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

// Main router
export const router = {
  openSpaces: openSpacesRouter,
  schedules: schedulesRouter,
  rooms: roomsRouter,

  tracks: tracksRouter,

  // Eventbrite integration
  eventbrite: eventbriteRouter,

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
  countdown: countdownRouter,

  // Communities (tenants)
  communities: communitiesRouter,

  // Cast to screen (sticky note display)
  cast: castRouter,

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
  dashboard: dashboardRouter,

  // Staff coordination (event-day tasks + announcements)
  staffTasks: staffTasksRouter,
};

export type AppRouter = typeof router;
