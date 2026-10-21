import { openapi } from "@orpc/openapi";
import { Effect } from "effect";
import * as z from "zod";

import { authed, pub, staff } from "../base";
import {
  CurrentSurveySchema,
  DatasetRowsSchema,
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

/** The open-data endpoints answer plain GETs, so a spreadsheet or a script can read them */
const open = (summary: string, path: `/${string}`) => openapi({ tags: ["Salary survey"], summary, method: "GET", path });

export const salarySurveyRouter = {
  current: pub
    .meta(open("The open edition (or the latest one), its response count and whether the caller already answered", "/salary-survey/current"))
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
    .meta(open("Published results: quartiles per currency and group, the respondents' profile, satisfaction", "/salary-survey/{slug}/results"))
    .input(SurveyRefSchema)
    .output(ResultsSchema)
    .effect(function* ({ input }) {
      return yield* SalarySurvey.getResults(input.slug);
    }),

  dataset: pub
    .meta(open("Published open dataset as CSV, coarsened so no answer stands out", "/salary-survey/{slug}/dataset"))
    .input(SurveyRefSchema)
    .output(DatasetSchema)
    .effect(function* ({ input }) {
      return yield* SalarySurvey.getDataset(input.slug);
    }),

  datasetRows: pub
    .meta(open("The same open dataset as JSON rows", "/salary-survey/{slug}/rows"))
    .input(SurveyRefSchema)
    .output(DatasetRowsSchema)
    .effect(function* ({ input }) {
      return yield* SalarySurvey.getDatasetRows(input.slug);
    }),

  editions: pub
    .meta(open("Every published edition, newest first", "/salary-survey/editions"))
    .output(z.array(SurveySchema))
    .effect(function* () {
      return yield* SalarySurvey.listPublished();
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
