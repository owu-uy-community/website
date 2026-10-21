import { createHmac } from "node:crypto";

import { and, count, desc, eq } from "drizzle-orm";
import { Effect } from "effect";

import { salarySurveyParticipants, salarySurveyResponses, salarySurveys, type SalarySurveyRow } from "../../db/schema";
import { MIN_GROUP_SIZE } from "../../salary-survey/questions";
import { currencyResults, datasetCsv, type ResponseFacts } from "../../salary-survey/stats";
import { query, transaction } from "../db";
import { Conflict, NotFound } from "../errors";
import { CurrentUser } from "../services";
import type { Answers, Survey, SurveyResults } from "./schemas";

const surveyNotFound = new NotFound({ entity: "salary_survey", message: "Esa edición de la encuesta no existe" });
const notPublished = new NotFound({ entity: "salary_survey", message: "Los resultados todavía no están publicados" });

/**
 * Who answered, without saying who: a keyed hash of survey + user. Keyed with
 * a server secret so the table can't be matched against a list of user ids,
 * and per survey so editions can't be linked to each other.
 */
function participantHash(surveyId: string, userId: string) {
  const secret = process.env.SALARY_SURVEY_SECRET ?? process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("SALARY_SURVEY_SECRET (or BETTER_AUTH_SECRET) must be set");

  return createHmac("sha256", secret).update(`salary-survey:${surveyId}:${userId}`).digest("hex");
}

const toSurvey = (row: SalarySurveyRow, responseCount: number): Survey => ({
  slug: row.slug,
  title: row.title,
  status: row.status,
  opensAt: row.opensAt?.toISOString() ?? null,
  closesAt: row.closesAt?.toISOString() ?? null,
  responseCount,
});

const countResponses = (surveyId: string) =>
  query((db) => db.select({ n: count() }).from(salarySurveyResponses).where(eq(salarySurveyResponses.surveyId, surveyId))).pipe(
    Effect.map(([row]) => row?.n ?? 0)
  );

const findSurvey = (slug: string) =>
  query((db) => db.select().from(salarySurveys).where(eq(salarySurveys.slug, slug))).pipe(
    Effect.flatMap(([row]) => (row ? Effect.succeed(row) : Effect.fail(surveyNotFound)))
  );

/** True while answers are accepted: the status says open and the dates, if set, agree */
const accepting = (row: SalarySurveyRow, now = Date.now()) =>
  row.status === "open" &&
  (!row.opensAt || row.opensAt.getTime() <= now) &&
  (!row.closesAt || row.closesAt.getTime() > now);

/** The open edition, or else the latest that has opened. Drafts never show. */
export const getCurrent = (userId: string | null) =>
  Effect.gen(function* () {
    const rows = yield* query((db) => db.select().from(salarySurveys).orderBy(desc(salarySurveys.slug)));
    const visible = rows.filter((row) => row.status !== "draft");
    const row = visible.find((candidate) => candidate.status === "open") ?? visible[0];
    if (!row) return { survey: null, answered: false };

    const answered = userId
      ? (yield* query((db) =>
          db
            .select({ id: salarySurveyParticipants.id })
            .from(salarySurveyParticipants)
            .where(
              and(
                eq(salarySurveyParticipants.surveyId, row.id),
                eq(salarySurveyParticipants.participantHash, participantHash(row.id, userId))
              )
            )
        )).length > 0
      : false;

    return { survey: toSurvey(row, yield* countResponses(row.id)), answered };
  });

/** Record one answer per person: the participant mark and the answer, both or neither. */
export const submit = (slug: string, answers: Answers) =>
  Effect.gen(function* () {
    const user = yield* CurrentUser;

    return yield* transaction(
      Effect.gen(function* () {
        const row = yield* findSurvey(slug);
        if (!accepting(row)) {
          return yield* new Conflict({ reason: "survey_closed", message: "La encuesta no está recibiendo respuestas" });
        }

        yield* query((db) =>
          db.insert(salarySurveyParticipants).values({ surveyId: row.id, participantHash: participantHash(row.id, user.id) })
        ).pipe(
          Effect.catchTag("UniqueViolation", () =>
            Effect.fail(new Conflict({ reason: "already_answered", message: "Ya respondiste esta edición. ¡Gracias!" }))
          )
        );
        yield* query((db) => db.insert(salarySurveyResponses).values({ surveyId: row.id, ...answers }));

        return { ok: true as const };
      })
    );
  });

const responseFacts = (surveyId: string) =>
  query((db) =>
    db
      .select({
        role: salarySurveyResponses.role,
        seniority: salarySurveyResponses.seniority,
        experience: salarySurveyResponses.experience,
        stacks: salarySurveyResponses.stacks,
        employer: salarySurveyResponses.employer,
        contract: salarySurveyResponses.contract,
        modality: salarySurveyResponses.modality,
        department: salarySurveyResponses.department,
        currency: salarySurveyResponses.currency,
        amount: salarySurveyResponses.amount,
        hoursPerWeek: salarySurveyResponses.hoursPerWeek,
        gender: salarySurveyResponses.gender,
        education: salarySurveyResponses.education,
      })
      .from(salarySurveyResponses)
      .where(eq(salarySurveyResponses.surveyId, surveyId))
  );

const publishedSurvey = (slug: string) =>
  findSurvey(slug).pipe(Effect.flatMap((row) => (row.status === "published" ? Effect.succeed(row) : Effect.fail(notPublished))));

/**
 * Quartiles per currency (never converted) and per group; groups under the
 * threshold are counted but not shown.
 * ponytail: aggregates in memory; fine for thousands of answers, move to SQL
 * percentile_cont if an edition ever gets far beyond that.
 */
export const getResults = (slug: string) =>
  Effect.gen(function* () {
    const row = yield* publishedSurvey(slug);
    const facts: ResponseFacts[] = yield* responseFacts(row.id);

    const results: SurveyResults = {
      survey: toSurvey(row, facts.length),
      threshold: MIN_GROUP_SIZE,
      currencies: {
        UYU: currencyResults(facts.filter((fact) => fact.currency === "UYU")),
        USD: currencyResults(facts.filter((fact) => fact.currency === "USD")),
      },
    };

    return results;
  });

export const getDataset = (slug: string) =>
  Effect.gen(function* () {
    const row = yield* publishedSurvey(slug);
    const facts = yield* responseFacts(row.id);

    return { filename: `encuesta-sueldos-owu-${row.slug}.csv`, csv: datasetCsv(facts) };
  });

// ---------------------------------------------------------------------------
// Staff
// ---------------------------------------------------------------------------

export const listSurveys = () =>
  Effect.gen(function* () {
    const rows = yield* query((db) =>
      db
        .select({ survey: salarySurveys, responses: count(salarySurveyResponses.id) })
        .from(salarySurveys)
        .leftJoin(salarySurveyResponses, eq(salarySurveyResponses.surveyId, salarySurveys.id))
        .groupBy(salarySurveys.id)
        .orderBy(desc(salarySurveys.slug))
    );

    return rows.map(({ survey, responses }) => toSurvey(survey, responses));
  });

export const upsertSurvey = (input: { slug: string; title: string; opensAt: string | null; closesAt: string | null }) =>
  Effect.gen(function* () {
    const values = {
      title: input.title,
      opensAt: input.opensAt ? new Date(input.opensAt) : null,
      closesAt: input.closesAt ? new Date(input.closesAt) : null,
    };
    const [row] = yield* query((db) =>
      db
        .insert(salarySurveys)
        .values({ slug: input.slug, ...values })
        .onConflictDoUpdate({ target: salarySurveys.slug, set: values })
        .returning()
    );

    return toSurvey(row, yield* countResponses(row.id));
  });

export const setStatus = (slug: string, status: SalarySurveyRow["status"]) =>
  Effect.gen(function* () {
    const [row] = yield* query((db) => db.update(salarySurveys).set({ status }).where(eq(salarySurveys.slug, slug)).returning());
    if (!row) return yield* surveyNotFound;

    return toSurvey(row, yield* countResponses(row.id));
  });
