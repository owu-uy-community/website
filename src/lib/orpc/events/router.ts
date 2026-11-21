import { openapi } from "@orpc/openapi";
import { ratelimit } from "@orpc/ratelimit";
import * as z from "zod";

import { authed, inCommunity, pub, type AuthedContext } from "../base";
import { limiter } from "../ratelimit";
import {
  AgendaGoSchema,
  AgendaSchema,
  AnswerCohostSchema,
  ApplyTemplateSchema,
  AssignVolunteerSchema,
  CloseOutSchema,
  EventTasksSchema,
  NextDateInputSchema,
  NextDateSchema,
  SaveAgendaSchema,
  SlidesSchema,
  VolunteerSchema,
  CancelEventSchema,
  CohostInvitationSchema,
  CreateDraftSchema,
  EditableEventSchema,
  EventBySlugSchema,
  EventRefSchema,
  EventMessageSchema,
  EventStatsSchema,
  HoldResultSchema,
  HoldSchema,
  ListEventsSchema,
  MessageRefSchema,
  MessageSchema,
  MessageTestSchema,
  ScheduleMessageSchema,
  OrganizerEventSchema,
  PublicEventSchema,
  PublishResultSchema,
  SaveEventSchema,
  SchedulePublishSchema,
  ShowUpSchema,
  UpcomingEventSchema,
} from "./schemas";
import * as Door from "../door/service";
import { DoorLinkSchema } from "../door/schemas";
import * as Cohosts from "./cohosts";
import * as Lifecycle from "./lifecycle";
import * as Messages from "./messages";
import * as Events from "./service";

const docs = (summary: string) => openapi({ tags: ["Organizer events"], summary });

/** Writing to everyone signed up is for real news: ten a day per organizer. */
/** Publishing emails followers and invited co-hosts: a real organizer publishes a few a week. */
const publishLimit = ratelimit({
  limiter: limiter({ prefix: "event-publish:", maxRequests: 10, window: 86_400_000 }),
  key: ({ context }: { context: AuthedContext }) => context.user.id,
});

const messageLimit = ratelimit({
  limiter: limiter({ prefix: "event-message:", maxRequests: 10, window: 86_400_000 }),
  key: ({ context }: { context: AuthedContext }) => context.user.id,
});

/** Tests go to the organizer alone: enough to iterate on a text, not to spam oneself. */
const messageTestLimit = ratelimit({
  limiter: limiter({ prefix: "event-message-test:", maxRequests: 20, window: 3_600_000 }),
  key: ({ context }: { context: AuthedContext }) => context.user.id,
});

/** Events as the organizer panel handles them: drafts, date holds, publishing. */
export const eventsRouter = {
  list: authed
    .meta(docs("A community's events, drafts included, newest first"))
    .input(ListEventsSchema)
    .use(inCommunity("event:list"))
    .output(z.array(OrganizerEventSchema))
    .effect(function* ({ input }) {
      return yield* Events.list(input.communityId);
    }),

  hold: authed
    .meta(docs("Reserve a date for 14 days, dating a draft or making one; renews an existing hold"))
    .input(HoldSchema)
    .use(inCommunity("event:hold"))
    .output(HoldResultSchema)
    .effect(function* ({ input }) {
      return yield* Events.hold(input);
    }),

  release: authed
    .meta(docs("Give a reserved date back; the draft stays"))
    .input(EventRefSchema)
    .use(inCommunity("event:hold"))
    .output(OrganizerEventSchema)
    .effect(function* ({ input }) {
      return yield* Events.release(input.eventId);
    }),

  get: authed
    .meta(docs("One event, as the wizard edits it"))
    .input(EventRefSchema)
    .use(inCommunity("event:read"))
    .output(EditableEventSchema)
    .effect(function* ({ input }) {
      return yield* Events.get(input.eventId);
    }),

  createDraft: authed
    .meta(docs("A new draft with a provisional date, or a repeat of a previous event (held ~4 weeks after it)"))
    .input(CreateDraftSchema)
    .use(inCommunity("event:create"))
    .output(EditableEventSchema)
    .effect(function* ({ input }) {
      return input.copyFrom ? yield* Lifecycle.repeat(input.copyFrom, input.title) : yield* Events.createDraft(input);
    }),

  nextDate: authed
    .meta(docs("The day «Repetir» would propose (same weekday and time, ~4 weeks later), scored by the calendar"))
    .input(NextDateInputSchema)
    .use(inCommunity("event:read"))
    .output(NextDateSchema)
    .effect(function* ({ input }) {
      return yield* Lifecycle.nextDate(input.eventId);
    }),

  closeOut: authed
    .meta(docs("Mark the close-out done (or open it again): Inicio stops asking"))
    .input(CloseOutSchema)
    .use(inCommunity("event:update"))
    .output(EditableEventSchema)
    .effect(function* ({ input }) {
      return yield* Lifecycle.closeOut(input);
    }),

  tasks: authed
    .meta(docs("The event's tasks with their template, the template that fits, and a hint when one person does it all"))
    .input(EventRefSchema)
    .use(inCommunity("event:read"))
    .output(EventTasksSchema)
    .effect(function* ({ input }) {
      return yield* Lifecycle.tasks(input.eventId);
    }),

  applyTemplate: authed
    .meta(docs("Add a template's tasks, dated from the event's start; applying it twice adds nothing"))
    .input(ApplyTemplateSchema)
    .use(inCommunity("event:update"))
    .output(EventTasksSchema)
    .effect(function* ({ input }) {
      return yield* Lifecycle.applyTemplate(input);
    }),

  volunteers: authed
    .meta(docs("People with a seat who offered a hand, and the job each got"))
    .input(EventRefSchema)
    .use(inCommunity("attendee:read"))
    .output(z.array(VolunteerSchema))
    .effect(function* ({ input }) {
      return yield* Lifecycle.volunteers(input.eventId);
    }),

  assignVolunteer: authed
    .meta(docs("Give a volunteer a job (one email each) or take it back"))
    .input(AssignVolunteerSchema)
    .use(inCommunity("attendee:tag"))
    .output(VolunteerSchema)
    .effect(function* ({ input }) {
      return yield* Lifecycle.assignVolunteer(input);
    }),

  thankVolunteers: authed
    .meta(docs("After the event: thanks to each volunteer who came, once"))
    .input(EventRefSchema)
    .use(inCommunity("event:message"))
    .output(z.object({ sent: z.number() }))
    .effect(function* ({ input }) {
      return yield* Lifecycle.thankVolunteers(input.eventId);
    }),

  agenda: authed
    .meta(docs("The meetup's agenda (the run of show), in order"))
    .input(EventRefSchema)
    .use(inCommunity("event:read"))
    .output(AgendaSchema)
    .effect(function* ({ input }) {
      return yield* Lifecycle.agenda(input.eventId);
    }),

  generateAgenda: authed
    .meta(docs("A first agenda from the talks: doors, welcome, talks by length, lightning talks, networking"))
    .input(EventRefSchema)
    .use(inCommunity("event:update"))
    .output(AgendaSchema)
    .effect(function* ({ input }) {
      return yield* Lifecycle.generateAgenda(input.eventId);
    }),

  saveAgenda: authed
    .meta(docs("The agenda as a whole: order, titles and lengths; the starts follow"))
    .input(SaveAgendaSchema)
    .use(inCommunity("event:update"))
    .output(AgendaSchema)
    .effect(function* ({ input }) {
      return yield* Lifecycle.saveAgenda(input);
    }),

  agendaGo: authed
    .meta(docs("MC mode's «Siguiente»: the current moment ends and the next one starts"))
    .input(AgendaGoSchema)
    .use(inCommunity("event:update"))
    .output(AgendaSchema)
    .effect(function* ({ input }) {
      return yield* Lifecycle.agendaGo(input);
    }),

  slides: authed
    .meta(docs("What the welcome slides show, wifi included: organizers only"))
    .input(EventRefSchema)
    .use(inCommunity("event:read"))
    .output(SlidesSchema)
    .effect(function* ({ input }) {
      return yield* Lifecycle.slides(input.eventId);
    }),

  save: authed
    .meta(docs("Autosave: apply a patch unless someone else saved since (CONFLICT stale)"))
    .input(SaveEventSchema)
    .use(inCommunity("event:update"))
    .output(EditableEventSchema)
    .effect(function* ({ input }) {
      return yield* Events.save(input);
    }),

  publish: authed
    .meta(docs("Publish a draft once everything required is in place"))
    .input(EventRefSchema)
    .use(inCommunity("event:publish"))
    .use(publishLimit)
    .output(PublishResultSchema)
    .effect(function* ({ input }) {
      return yield* Events.publish(input.eventId);
    }),

  schedulePublish: authed
    .meta(docs("Publish a draft later by itself, with the same checks (null takes it back)"))
    .input(SchedulePublishSchema)
    .use(inCommunity("event:publish"))
    .use(publishLimit)
    .output(EditableEventSchema)
    .effect(function* ({ input }) {
      return yield* Events.schedulePublish(input);
    }),

  cancel: authed
    .meta(docs("Cancel a published event"))
    .input(CancelEventSchema)
    .use(inCommunity("event:cancel"))
    .output(EditableEventSchema)
    .effect(function* ({ input }) {
      return yield* Events.cancel(input);
    }),

  upcoming: pub
    .meta(
      openapi({
        tags: ["Organizer events"],
        summary: "OWU's own published events still ahead, soonest first (for meetup-bot and calendars)",
        method: "GET",
        path: "/events/upcoming",
      })
    )
    .output(z.array(UpcomingEventSchema))
    .effect(function* () {
      return yield* Events.upcoming;
    }),

  public: pub
    .meta(docs("A published event as anyone sees it (no online link; the address as its host allows)"))
    .input(EventBySlugSchema)
    .output(PublicEventSchema)
    .effect(function* ({ input }) {
      return yield* Events.publicEvent(input.communitySlug, input.eventSlug);
    }),

  preview: authed
    .meta(docs("Any of the community's events as its public page will show it, drafts included"))
    .input(EventRefSchema)
    .use(inCommunity("event:read"))
    .output(PublicEventSchema)
    .effect(function* ({ input }) {
      return yield* Events.preview(input.eventId);
    }),

  cohostInvitations: authed
    .meta(docs("Events other communities invited this one to organize with them"))
    .input(ListEventsSchema)
    .use(inCommunity("event:cohost"))
    .output(z.array(CohostInvitationSchema))
    .effect(function* () {
      return yield* Cohosts.invitations;
    }),

  answerCohost: authed
    .meta(docs("Accept an invitation to co-organize (the event shows on this profile too) or decline it"))
    .input(AnswerCohostSchema)
    .use(inCommunity("event:cohost"))
    .output(z.object({ accepted: z.boolean() }))
    .effect(function* ({ input }) {
      return yield* Cohosts.answer(input);
    }),

  stats: authed
    .meta(docs("How many signed up, wait, came: counts only"))
    .input(EventRefSchema)
    .use(inCommunity("event:stats"))
    .output(EventStatsSchema)
    .effect(function* ({ input }) {
      return yield* Events.stats(input.eventId);
    }),

  showUp: authed
    .meta(docs("How many of the people with a seat usually come, for this community"))
    .input(z.object({ communityId: z.string().min(1) }))
    .use(inCommunity("event:stats"))
    .output(ShowUpSchema)
    .effect(function* () {
      return yield* Events.showUp;
    }),

  message: authed
    .meta(docs("Write to the event's people, by where they stand or whether they came"))
    .input(MessageSchema)
    .use(inCommunity("event:message"))
    .use(messageLimit)
    .output(z.object({ sent: z.number() }))
    .effect(function* ({ input }) {
      return yield* Messages.message(input);
    }),

  scheduleMessage: authed
    .meta(docs("Write to the event's people at a set time: the tick sends it"))
    .input(ScheduleMessageSchema)
    .use(inCommunity("event:message"))
    .use(messageLimit)
    .output(EventMessageSchema)
    .effect(function* ({ input }) {
      return yield* Messages.schedule(input);
    }),

  cancelMessage: authed
    .meta(docs("Call off a scheduled message before it goes out"))
    .input(MessageRefSchema)
    .use(inCommunity("event:message"))
    .output(EventMessageSchema)
    .effect(function* ({ input }) {
      return yield* Messages.cancelScheduled(input);
    }),

  messages: authed
    .meta(docs("The event's messages: sent, scheduled and called off, newest first"))
    .input(EventRefSchema)
    .use(inCommunity("event:message"))
    .output(z.array(EventMessageSchema))
    .effect(function* ({ input }) {
      return yield* Messages.list(input.eventId);
    }),

  messageTest: authed
    .meta(docs("The message as written, to the organizer asking only, marked [Prueba]"))
    .input(MessageTestSchema)
    .use(inCommunity("event:message"))
    .use(messageTestLimit)
    .output(z.object({ to: z.string() }))
    .effect(function* ({ input }) {
      return yield* Messages.test(input);
    }),

  doorLink: authed
    .meta(docs("A link for the volunteers at the door: no account, valid until the night of the event"))
    .input(EventRefSchema)
    .use(inCommunity("event:door-link"))
    .output(DoorLinkSchema)
    .effect(function* ({ input }) {
      return yield* Door.link(input.eventId);
    }),

  revokeDoor: authed
    .meta(docs("Make every door link handed out stop working"))
    .input(EventRefSchema)
    .use(inCommunity("event:door-link"))
    .output(z.object({ ok: z.literal(true) }))
    .effect(function* ({ input }) {
      return yield* Door.revoke(input.eventId);
    }),

  remove: authed
    .meta(docs("Delete a draft"))
    .input(EventRefSchema)
    .use(inCommunity("event:delete"))
    .output(z.object({ id: z.string() }))
    .effect(function* ({ input }) {
      return yield* Events.remove(input.eventId);
    }),
};
