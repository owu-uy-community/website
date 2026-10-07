import {
  ProcessImageSchema,
  FindFreeSpotSchema,
  ProcessImageWithSuggestionSchema,
  processImage,
  findFreeSpot,
  processImageWithSuggestion,
} from "./ocr";

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
import { obsControlRouter, obsCueRouter } from "./obs-control/router";
import { obsQueueRouter } from "./obs-queue/router";
import { openSpacesRouter } from "./open-spaces/router";
import { roomsRouter } from "./rooms/router";
import { schedulesRouter } from "./schedules/router";
import { staffTasksRouter } from "./staff-tasks/router";
import { tracksRouter } from "./tracks/router";

/**
 * OCR handlers (admin only)
 */
export const processImageHandler = staff.input(ProcessImageSchema).handler(async ({ input }) => processImage(input));

export const findFreeSpotHandler = staff.input(FindFreeSpotSchema).handler(async ({ input }) => findFreeSpot(input));

export const processImageWithSuggestionHandler = staff
  .input(ProcessImageWithSuggestionSchema)
  .handler(async ({ input }) => processImageWithSuggestion(input));

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

  // OBS desk: the scene loop, the command bus and the rundown
  obsQueue: obsQueueRouter,
  obsControl: obsControlRouter,
  obsCue: obsCueRouter,

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
