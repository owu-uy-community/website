import { openapi } from "@orpc/openapi";
import * as z from "zod";

import { authed, inCommunity } from "../base";
import { EventRefSchema, HoldResultSchema, HoldSchema, ListEventsSchema, OrganizerEventSchema } from "./schemas";
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

  remove: authed
    .meta(docs("Delete a draft"))
    .input(EventRefSchema)
    .use(inCommunity("editor"))
    .output(z.object({ id: z.string() }))
    .effect(function* ({ input }) {
      return yield* Events.remove(input.eventId);
    }),
};
