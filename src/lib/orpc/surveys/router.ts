import { openapi } from "@orpc/openapi";
import { ratelimit } from "@orpc/ratelimit";
import * as z from "zod";

import { authed, inCommunity, platform, pub } from "../base";
import { limiter } from "../ratelimit";
import {
  PublicSurveyInputSchema,
  PublicSurveySchema,
  RespondSchema,
  SurveyEventSchema,
  SurveyResultsSchema,
  SurveySchema,
  UpsertSurveySchema,
  type RespondInput,
} from "./schemas";
import * as Surveys from "./service";

const docs = (summary: string) => openapi({ tags: ["Surveys"], summary });

/**
 * A phone answers once per room, so a handful of tries a minute is plenty. ponytail: keyed on
 * the phone's own random id, which a script can rotate — per IP would throttle a whole venue
 * behind one NAT.
 */
const phoneLimit = ratelimit({
  limiter: limiter({ prefix: "survey:", maxRequests: 10, window: 60_000 }),
  key: (_options, input: RespondInput) => input.respondent,
});

// The post-event survey: the event's organizers (editor and up) write it and read the results;
// phones answer it.
export const surveysRouter = {
  get: authed
    .meta(docs("The event's survey with its response count, or null"))
    .input(SurveyEventSchema)
    .use(inCommunity("survey:read"))
    .output(SurveySchema.nullable())
    .effect(function* ({ input }) {
      return yield* Surveys.getSurvey(input.eventId);
    }),

  upsert: authed
    .meta(docs("Create the survey (default questions for what isn't sent) or change it"))
    .input(UpsertSurveySchema)
    .use(inCommunity("survey:write"))
    .output(SurveySchema)
    .effect(function* ({ input }) {
      return yield* Surveys.upsertSurvey(input);
    }),

  clearResponses: platform("survey:delete")
    .meta(docs("Throw away the survey's answers (a test run) and keep its questions"))
    .input(SurveyEventSchema)
    .output(SurveySchema)
    .effect(function* ({ input }) {
      return yield* Surveys.clearResponses(input.eventId);
    }),

  delete: platform("survey:delete")
    .meta(docs("Delete the event's survey with its answers"))
    .input(SurveyEventSchema)
    .output(z.object({ ok: z.literal(true) }))
    .effect(function* ({ input }) {
      return yield* Surveys.deleteSurvey(input.eventId);
    }),

  results: authed
    .meta(docs("NPS, averages, choice counts, the latest comments and the per-room breakdown"))
    .input(SurveyEventSchema)
    .use(inCommunity("survey:read"))
    .output(SurveyResultsSchema.nullable())
    .effect(function* ({ input }) {
      return yield* Surveys.results(input.eventId);
    }),

  public: pub
    .meta(docs("An event's survey while it is open, for phones; null otherwise"))
    .input(PublicSurveyInputSchema)
    .output(PublicSurveySchema.nullable())
    .effect(function* ({ input }) {
      return yield* Surveys.publicSurvey(input);
    }),

  respond: pub
    .meta(docs("Answer the survey: one answer per phone and room"))
    .input(RespondSchema)
    .use(phoneLimit)
    .output(z.object({ ok: z.literal(true) }))
    .effect(function* ({ input }) {
      return yield* Surveys.respond(input);
    }),
};
