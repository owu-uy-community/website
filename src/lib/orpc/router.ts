import {
  ProcessImageSchema,
  FindFreeSpotSchema,
  ProcessImageWithSuggestionSchema,
  processImage,
  findFreeSpot,
  processImageWithSuggestion,
} from "./ocr";

import { pub, staff } from "./base";
import { castRouter } from "./cast/router";
import { communitiesRouter } from "./communities/router";
import { countdownRouter } from "./countdown/router";
import { dashboardRouter } from "./dashboard/router";
import { eventbriteRouter } from "./eventbrite/router";
import { obsControlRouter, obsCueRouter } from "./obs-control/router";
import { obsQueueRouter } from "./obs-queue/router";
import { owyStageRouter } from "./owy-stage/router";
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
  owyStage: owyStageRouter,

  // Dashboard Statistics
  dashboard: dashboardRouter,

  // Staff coordination (event-day tasks + announcements)
  staffTasks: staffTasksRouter,
};

export type AppRouter = typeof router;
