import { castRouter } from "./cast/router";
import { communitiesRouter } from "./communities/router";
import { companionRouter } from "./companion/router";
import { confRouter } from "./conf/router";
import { countdownRouter } from "./countdown/router";
import { dashboardRouter } from "./dashboard/router";
import { eventbriteRouter } from "./eventbrite/router";
import { obsControlRouter, obsCueRouter } from "./obs-control/router";
import { obsQueueRouter } from "./obs-queue/router";
import { ocrRouter } from "./ocr/router";
import { openSpacesRouter } from "./open-spaces/router";
import { owyStageRouter } from "./owy-stage/router";
import { roomsRouter } from "./rooms/router";
import { schedulesRouter } from "./schedules/router";
import { staffTasksRouter } from "./staff-tasks/router";
import { tracksRouter } from "./tracks/router";

/**
 * Every procedure, by the path clients call. Keys are part of the wire
 * contract (the site, the Owy bot, scripts): renaming one breaks a caller.
 */
export const router = {
  openSpaces: openSpacesRouter,
  schedules: schedulesRouter,
  rooms: roomsRouter,
  tracks: tracksRouter,

  // Talk cards: read a photo, suggest a place on the board
  ocr: ocrRouter,

  // Communities (tenants) and their event-day staff coordination
  communities: communitiesRouter,
  staffTasks: staffTasksRouter,

  // Event-day screens: countdown, cast to screen, the stage wall
  countdown: countdownRouter,
  cast: castRouter,
  owyStage: owyStageRouter,

  // Physical Owy companions: where each device's mic / audio output live (device or venue laptop)
  companion: companionRouter,

  // OBS desk: the scene loop, the command bus and the rundown
  obsQueue: obsQueueRouter,
  obsControl: obsControlRouter,
  obsCue: obsCueRouter,

  // OWU CONF site: the ticket release
  conf: confRouter,

  // Admin overview and ticketing
  dashboard: dashboardRouter,
  eventbrite: eventbriteRouter,
};

export type AppRouter = typeof router;
