import { openapi } from "@orpc/openapi";

import { staff } from "../base";
import { AttendeesPageSchema, GetAttendeesSchema, SummarySchema } from "./schemas";
import * as Eventbrite from "./service";

const docs = (summary: string) => openapi({ tags: ["Eventbrite"], summary });

// Both answer null when Eventbrite isn't set up, and BAD_GATEWAY when it is but fails.
export const eventbriteRouter = {
  getAttendees: staff
    .meta(docs("One page of the ticketed event's attendees"))
    .input(GetAttendeesSchema)
    .output(AttendeesPageSchema.nullable())
    .effect(function* ({ input }) {
      return yield* Eventbrite.listAttendees(input);
    }),

  getSummary: staff
    .meta(docs("The ticketed event and its attendance, counted over every attendee"))
    .output(SummarySchema.nullable())
    .effect(function* () {
      return yield* Eventbrite.getSummary();
    }),
};
