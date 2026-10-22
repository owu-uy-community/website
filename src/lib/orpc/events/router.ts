import { openapi } from "@orpc/openapi";
import { ratelimit } from "@orpc/ratelimit";
import * as z from "zod";

import { authed, inCommunity, pub, type AuthedContext } from "../base";
import { limiter } from "../ratelimit";
import {
  AnswerCohostSchema,
  CancelEventSchema,
  CohostInvitationSchema,
  CreateDraftSchema,
  EditableEventSchema,
  EventBySlugSchema,
  EventRefSchema,
  EventStatsSchema,
  HoldResultSchema,
  HoldSchema,
  ListEventsSchema,
  MessageSchema,
  OrganizerEventSchema,
  PublicEventSchema,
  PublishResultSchema,
  SaveEventSchema,
  ShowUpSchema,
  UpcomingEventSchema,
} from "./schemas";
import * as Door from "../door/service";
import { DoorLinkSchema } from "../door/schemas";
import * as Cohosts from "./cohosts";
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

/** Events as the organizer panel handles them: drafts, date holds, publishing. */
export const eventsRouter = {
  list: authed
    .meta(docs("A community's events, drafts included, newest first"))
    .input(ListEventsSchema)
    .use(inCommunity("member"))
    .output(z.array(OrganizerEventSchema))
    .effect(function* ({ input }) {
      return yield* Events.list(input.communityId);
    }),

  hold: authed
    .meta(docs("Reserve a date for 14 days, dating a draft or making one; renews an existing hold"))
    .input(HoldSchema)
    .use(inCommunity("editor"))
    .output(HoldResultSchema)
    .effect(function* ({ input }) {
      return yield* Events.hold(input);
    }),

  release: authed
    .meta(docs("Give a reserved date back; the draft stays"))
    .input(EventRefSchema)
    .use(inCommunity("editor"))
    .output(OrganizerEventSchema)
    .effect(function* ({ input }) {
      return yield* Events.release(input.eventId);
    }),

  get: authed
    .meta(docs("One event, as the wizard edits it"))
    .input(EventRefSchema)
    .use(inCommunity("editor"))
    .output(EditableEventSchema)
    .effect(function* ({ input }) {
      return yield* Events.get(input.eventId);
    }),

  createDraft: authed
    .meta(docs("A new draft with a provisional date, optionally copying a previous event"))
    .input(CreateDraftSchema)
    .use(inCommunity("editor"))
    .output(EditableEventSchema)
    .effect(function* ({ input }) {
      return yield* Events.createDraft(input);
    }),

  save: authed
    .meta(docs("Autosave: apply a patch unless someone else saved since (CONFLICT stale)"))
    .input(SaveEventSchema)
    .use(inCommunity("editor"))
    .output(EditableEventSchema)
    .effect(function* ({ input }) {
      return yield* Events.save(input);
    }),

  publish: authed
    .meta(docs("Publish a draft once everything required is in place"))
    .input(EventRefSchema)
    .use(inCommunity("editor"))
    .use(publishLimit)
    .output(PublishResultSchema)
    .effect(function* ({ input }) {
      return yield* Events.publish(input.eventId);
    }),

  cancel: authed
    .meta(docs("Cancel a published event"))
    .input(CancelEventSchema)
    .use(inCommunity("admin"))
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
    .use(inCommunity("editor"))
    .output(PublicEventSchema)
    .effect(function* ({ input }) {
      return yield* Events.preview(input.eventId);
    }),

  cohostInvitations: authed
    .meta(docs("Events other communities invited this one to organize with them"))
    .input(ListEventsSchema)
    .use(inCommunity("editor"))
    .output(z.array(CohostInvitationSchema))
    .effect(function* () {
      return yield* Cohosts.invitations;
    }),

  answerCohost: authed
    .meta(docs("Accept an invitation to co-organize (the event shows on this profile too) or decline it"))
    .input(AnswerCohostSchema)
    .use(inCommunity("editor"))
    .output(z.object({ accepted: z.boolean() }))
    .effect(function* ({ input }) {
      return yield* Cohosts.answer(input);
    }),

  stats: authed
    .meta(docs("How many signed up, wait, came: counts only"))
    .input(EventRefSchema)
    .use(inCommunity("editor"))
    .output(EventStatsSchema)
    .effect(function* ({ input }) {
      return yield* Events.stats(input.eventId);
    }),

  showUp: authed
    .meta(docs("How many of the people with a seat usually come, for this community"))
    .input(z.object({ communityId: z.string().min(1) }))
    .use(inCommunity("editor"))
    .output(ShowUpSchema)
    .effect(function* () {
      return yield* Events.showUp;
    }),

  message: authed
    .meta(docs("Write to the event's people, by where they stand"))
    .input(MessageSchema)
    .use(inCommunity("admin"))
    .use(messageLimit)
    .output(z.object({ sent: z.number() }))
    .effect(function* ({ input }) {
      return yield* Events.message(input);
    }),

  doorLink: authed
    .meta(docs("A link for the volunteers at the door: no account, valid until the night of the event"))
    .input(EventRefSchema)
    .use(inCommunity("admin"))
    .output(DoorLinkSchema)
    .effect(function* ({ input }) {
      return yield* Door.link(input.eventId);
    }),

  revokeDoor: authed
    .meta(docs("Make every door link handed out stop working"))
    .input(EventRefSchema)
    .use(inCommunity("admin"))
    .output(z.object({ ok: z.literal(true) }))
    .effect(function* ({ input }) {
      return yield* Door.revoke(input.eventId);
    }),

  remove: authed
    .meta(docs("Delete a draft"))
    .input(EventRefSchema)
    .use(inCommunity("editor"))
    .output(z.object({ id: z.string() }))
    .effect(function* ({ input }) {
      return yield* Events.remove(input.eventId);
    }),
};
