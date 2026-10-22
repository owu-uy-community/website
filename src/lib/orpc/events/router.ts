import { openapi } from "@orpc/openapi";
import * as z from "zod";

import { authed, inCommunity } from "../base";
import {
  CancelEventSchema,
  CreateDraftSchema,
  EditableEventSchema,
  EventRefSchema,
  HoldResultSchema,
  HoldSchema,
  ListEventsSchema,
  OrganizerEventSchema,
  PublishResultSchema,
  SaveEventSchema,
} from "./schemas";
import * as Events from "./service";

const docs = (summary: string) => openapi({ tags: ["Organizer events"], summary });

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

  remove: authed
    .meta(docs("Delete a draft"))
    .input(EventRefSchema)
    .use(inCommunity("editor"))
    .output(z.object({ id: z.string() }))
    .effect(function* ({ input }) {
      return yield* Events.remove(input.eventId);
    }),
};
