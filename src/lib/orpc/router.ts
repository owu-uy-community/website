import { activityRouter } from "./activity/router";
import { assistantRouter } from "./assistant/router";
import { attendeesRouter } from "./attendees/router";
import { calendarRouter } from "./calendar/router";
import { castRouter } from "./cast/router";
import { commsRouter } from "./comms/router";
import { communitiesRouter } from "./communities/router";
import { companionRouter } from "./companion/router";
import { confRouter } from "./conf/router";
import { countdownRouter } from "./countdown/router";
import { dashboardRouter } from "./dashboard/router";
import { doorRouter } from "./door/router";
import { eventbriteRouter } from "./eventbrite/router";
import { eventsRouter } from "./events/router";
import { incidentsRouter } from "./incidents/router";
import { integrationsRouter } from "./integrations/router";
import { obsControlRouter, obsCueRouter } from "./obs-control/router";
import { obsQueueRouter } from "./obs-queue/router";
import { ocrRouter } from "./ocr/router";
import { pollsRouter } from "./polls/router";
import { salarySurveyRouter } from "./salary-survey/router";
import { openSpacesRouter } from "./open-spaces/router";
import { owyStageRouter } from "./owy-stage/router";
import { panelRouter } from "./panel/router";
import { roomsRouter } from "./rooms/router";
import { rsvpsRouter } from "./rsvps/router";
import { runOfShowRouter } from "./run-of-show/router";
import { schedulesRouter } from "./schedules/router";
import { screensRouter } from "./screens/router";
import { semanarioRouter } from "./semanario/router";
import { shellRouter } from "./shell/router";
import { staffTasksRouter } from "./staff-tasks/router";
import { surveysRouter } from "./surveys/router";
import { systemRouter } from "./system/router";
import { tracksRouter } from "./tracks/router";
import { venuesRouter } from "./venues/router";

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

  // Organizá: the shared calendar, and events as organizers make them (drafts, date holds)
  panel: panelRouter,
  calendar: calendarRouter,
  events: eventsRouter,
  venues: venuesRouter,
  rsvps: rsvpsRouter,
  door: doorRouter,
  integrations: integrationsRouter,
  polls: pollsRouter,
  staffTasks: staffTasksRouter,

  // Event-day screens: countdown, cast to screen, the stage wall
  countdown: countdownRouter,
  cast: castRouter,
  owyStage: owyStageRouter,
  // Venue screens: their heartbeat, names, identify and reload
  screens: screensRouter,

  // Physical Owy companions: where each device's mic / audio output live (device or venue laptop)
  companion: companionRouter,

  // OBS desk: the scene loop, the command bus and the rundown
  obsQueue: obsQueueRouter,
  obsControl: obsControlRouter,
  obsCue: obsCueRouter,

  // The guion del día: the run of show, with GO
  runOfShow: runOfShowRouter,

  // OWU CONF site: the ticket release
  conf: confRouter,

  // Encuesta de sueldos: one answer per person, stored without the user
  salarySurvey: salarySurveyRouter,

  // Admin overview and ticketing
  dashboard: dashboardRouter,
  eventbrite: eventbriteRouter,
  attendees: attendeesRouter,

  // The admin shell around every page, and the event's activity log
  shell: shellRouter,
  activity: activityRouter,
  assistant: assistantRouter,

  // Event day: incidents and the room hosts' calls for help
  incidents: incidentsRouter,

  // What Owy tells attendees and staff, and the post-event survey
  comms: commsRouter,
  surveys: surveysRouter,

  // What the server has configured, for the settings pages
  system: systemRouter,

  // The weekly digest: Owy drafts it, the staff publishes it
  semanario: semanarioRouter,
};

export type AppRouter = typeof router;
