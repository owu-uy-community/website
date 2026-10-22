import { openapi } from "@orpc/openapi";

import { platform } from "../base";
import { SummarySchema } from "./schemas";
import * as Eventbrite from "./service";
import { EventbriteVerificationSchema, VerifyEventbriteSchema, verifyEvent } from "./verify";

const docs = (summary: string) => openapi({ tags: ["Eventbrite"], summary });

// Reads Eventbrite itself (the Owy bot's stats). The attendee list is OWU's mirror: `attendees.*`.
// Null when Eventbrite isn't set up, BAD_GATEWAY when it is but fails.
export const eventbriteRouter = {
  getSummary: platform("insight:read")
    .meta(docs("The ticketed event and its attendance, counted over every attendee"))
    .output(SummarySchema.nullable())
    .effect(function* () {
      return yield* Eventbrite.getSummary();
    }),

  verify: platform("insight:read")
    .meta(docs("Look an Eventbrite event up by id before linking it: its name and active tickets"))
    .input(VerifyEventbriteSchema)
    .output(EventbriteVerificationSchema)
    .effect(function* ({ input }) {
      return yield* verifyEvent(input.eventbriteEventId);
    }),
};
