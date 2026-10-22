import { openapi } from "@orpc/openapi";
import * as z from "zod";

import { authed, inCommunity } from "../base";
import { CommunityRefSchema, EventIntegrationSchema, EventRefSchema, IntegrationsSchema } from "./schemas";
import * as Integrations from "./service";

const docs = (summary: string) => openapi({ tags: ["Integrations"], summary });

/** A community's accounts on other platforms. Connecting is an OAuth redirect: /api/integrations/eventbrite/connect. */
export const integrationsRouter = {
  list: authed
    .meta(docs("The community's connected accounts (never their tokens)"))
    .input(CommunityRefSchema)
    .use(inCommunity("editor"))
    .output(IntegrationsSchema)
    .effect(function* () {
      return yield* Integrations.list;
    }),

  disconnect: authed
    .meta(docs("Disconnect Eventbrite: its token, webhook and every attendee mirrored from it go"))
    .input(CommunityRefSchema)
    .use(inCommunity("admin"))
    .output(z.object({ events: z.number() }))
    .effect(function* () {
      return yield* Integrations.disconnect;
    }),

  publication: authed
    .meta(docs("How an event's publication on Eventbrite is going"))
    .input(EventRefSchema)
    .use(inCommunity("editor"))
    .output(EventIntegrationSchema)
    .effect(function* ({ input }) {
      return yield* Integrations.publicationOf(input.eventId);
    }),

  retry: authed
    .meta(docs("Push the event to Eventbrite again now"))
    .input(EventRefSchema)
    .use(inCommunity("editor"))
    .output(z.object({ queued: z.boolean() }))
    .effect(function* ({ input }) {
      return yield* Integrations.retry(input.eventId);
    }),
};
