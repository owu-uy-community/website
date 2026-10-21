import { openapi } from "@orpc/openapi";
import { Effect } from "effect";
import * as z from "zod";

import { authed, pub, staff } from "../base";
import {
  CurrentSurveySchema,
  DatasetSchema,
  ResultsSchema,
  SetStatusSchema,
  SubmitSchema,
  SurveyRefSchema,
  SurveySchema,
  UpsertSurveySchema,
} from "./schemas";
import * as SalarySurvey from "./service";

const docs = (summary: string) => openapi({ tags: ["Salary survey"], summary });

export const salarySurveyRouter = {
  current: pub
    .meta(docs("The open edition (or the latest one), its response count and whether the caller already answered"))
    .output(CurrentSurveySchema)
    .effect(function* ({ context }) {
      const session = yield* Effect.promise(() => context.getSession());

      return yield* SalarySurvey.getCurrent(session?.user.id ?? null);
    }),

  submit: authed
    .meta(docs("Answer the open edition, once per person; the answer is stored without the user"))
    .input(SubmitSchema)
    .output(z.object({ ok: z.literal(true) }))
    .effect(function* ({ input }) {
      return yield* SalarySurvey.submit(input.slug, input.answers);
    }),

  results: pub
    .meta(docs("Published results: quartiles per currency and group, small groups hidden"))
    .input(SurveyRefSchema)
    .output(ResultsSchema)
    .effect(function* ({ input }) {
      return yield* SalarySurvey.getResults(input.slug);
    }),

  dataset: pub
    .meta(docs("Published open dataset as CSV, coarsened so no answer stands out"))
    .input(SurveyRefSchema)
    .output(DatasetSchema)
    .effect(function* ({ input }) {
      return yield* SalarySurvey.getDataset(input.slug);
    }),

  list: staff
    .meta(docs("Every edition with its response count (site staff)"))
    .output(z.array(SurveySchema))
    .effect(function* () {
      return yield* SalarySurvey.listSurveys();
    }),

  upsert: staff
    .meta(docs("Create an edition or change its title and dates (site staff)"))
    .input(UpsertSurveySchema)
    .output(SurveySchema)
    .effect(function* ({ input }) {
      return yield* SalarySurvey.upsertSurvey(input);
    }),

  setStatus: staff
    .meta(docs("Open, close or publish an edition (site staff)"))
    .input(SetStatusSchema)
    .output(SurveySchema)
    .effect(function* ({ input }) {
      return yield* SalarySurvey.setStatus(input.slug, input.status);
    }),
};
