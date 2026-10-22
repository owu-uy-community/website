import { and, asc, count, desc, eq } from "drizzle-orm";
import { Effect } from "effect";
import type * as z from "zod";

import { communities, events, rooms, surveyResponses, surveys } from "../../db/schema";
import { query, transaction } from "../db";
import { Conflict, Invalid, NotFound } from "../errors";
import { opsPing, recordActivity } from "../ops";
import {
  TEXT_ANSWER_MAX,
  type PublicSurvey,
  type QuestionResult,
  type RespondInput,
  type Survey,
  type SurveyQuestion,
  type SurveyResults,
  type UpsertSurveySchema,
} from "./schemas";

type UpsertInput = z.infer<typeof UpsertSurveySchema>;
type Answers = Record<string, string | number>;

const eventNotFound = new NotFound({ entity: "event", message: "Ese evento no existe" });

/** A conf survey that works as is: six questions, two minutes. */
const defaultQuestions = (eventName: string): SurveyQuestion[] => [
  { id: "nps", kind: "nps", label: `¿Qué tan probable es que le recomiendes ${eventName} a alguien?` },
  { id: "te-llevas", kind: "text", label: "¿Qué te llevás?" },
  { id: "open-space", kind: "rating", label: "¿Qué te pareció el open space?" },
  { id: "charlas", kind: "rating", label: "¿Y las charlas?" },
  { id: "volverias", kind: "choice", label: "¿Volverías el año que viene?", options: ["Sí, seguro", "Capaz", "No"] },
  { id: "comentarios", kind: "text", label: "¿Algo más que nos quieras contar?" },
];

const eventRow = (eventId: string) =>
  query((db) => db.select().from(events).where(eq(events.id, eventId))).pipe(
    Effect.flatMap(([event]) => (event ? Effect.succeed(event) : Effect.fail(eventNotFound)))
  );

/** Options only mean something on choice questions. */
const normalize = (question: SurveyQuestion): SurveyQuestion =>
  question.kind === "choice"
    ? { id: question.id, kind: question.kind, label: question.label, options: question.options ?? [] }
    : { id: question.id, kind: question.kind, label: question.label };

// ---------------------------------------------------------------------------
// Staff
// ---------------------------------------------------------------------------

const readSurvey = (eventId: string) =>
  query((db) =>
    db
      .select({ survey: surveys, responses: count(surveyResponses.id) })
      .from(surveys)
      .leftJoin(surveyResponses, eq(surveyResponses.surveyId, surveys.id))
      .where(eq(surveys.eventId, eventId))
      .groupBy(surveys.id)
  ).pipe(
    Effect.map(([row]): Survey | null =>
      row
        ? {
            id: row.survey.id,
            eventId: row.survey.eventId,
            title: row.survey.title,
            questions: row.survey.questions,
            isOpen: row.survey.isOpen,
            responses: row.responses,
            updatedAt: row.survey.updatedAt.toISOString(),
          }
        : null
    )
  );

/** The event's survey with its response count, or null before anyone created it. */
export const getSurvey = (eventId: string) => eventRow(eventId).pipe(Effect.flatMap(() => readSurvey(eventId)));

/**
 * Create the survey or change it. What isn't sent keeps its value; a new survey starts closed,
 * with the default questions. The insert is a no-op when it exists, so two first saves can't
 * collide on the one-per-event index.
 */
export const upsertSurvey = (input: UpsertInput) =>
  Effect.gen(function* () {
    const event = yield* eventRow(input.eventId);
    yield* transaction(
      Effect.gen(function* () {
        const created = yield* query((db) =>
          db
            .insert(surveys)
            .values({
              eventId: event.id,
              title: input.title ?? `¿Qué te pareció ${event.name}?`,
              questions: (input.questions ?? defaultQuestions(event.name)).map(normalize),
              isOpen: input.isOpen ?? false,
            })
            .onConflictDoNothing({ target: surveys.eventId })
            .returning({ id: surveys.id })
        );
        const [before] = yield* query((db) =>
          db.select().from(surveys).where(eq(surveys.eventId, event.id)).for("update")
        );
        if (created.length > 0) {
          return yield* recordActivity({
            eventId: event.id,
            verb: "survey.created",
            entityType: "survey",
            entityId: before.id,
            summary: "creó la encuesta post-evento",
          });
        }

        const patch = {
          ...(input.title === undefined ? {} : { title: input.title }),
          ...(input.questions === undefined ? {} : { questions: input.questions.map(normalize) }),
          ...(input.isOpen === undefined ? {} : { isOpen: input.isOpen }),
        };
        if (Object.keys(patch).length === 0) return;
        yield* query((db) => db.update(surveys).set(patch).where(eq(surveys.id, before.id)));

        const edited = input.title !== undefined || input.questions !== undefined;
        if (!edited && input.isOpen === before.isOpen) return;
        yield* recordActivity({
          eventId: event.id,
          verb: edited ? "survey.updated" : "survey.toggled",
          entityType: "survey",
          entityId: before.id,
          summary: edited ? "editó la encuesta" : `${input.isOpen ? "abrió" : "cerró"} la encuesta`,
        });
      })
    );
    yield* opsPing(event.id, "survey");

    return yield* readSurvey(event.id).pipe(
      Effect.flatMap((survey) => (survey ? Effect.succeed(survey) : Effect.fail(eventNotFound)))
    );
  });

const npsOf = (values: number[]) => {
  if (values.length === 0) return null;
  const promoters = values.filter((value) => value >= 9).length;
  const detractors = values.filter((value) => value <= 6).length;

  return Math.round(((promoters - detractors) / values.length) * 100);
};

const averageOf = (values: number[]) =>
  values.length === 0 ? null : Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;

type ResponseRow = { roomId: string | null; answers: Answers; createdAt: Date };

/** The numbers behind the survey: per question, and per room for the rooms' QR. */
function summarize(
  questions: SurveyQuestion[],
  responses: ResponseRow[],
  roomNames: Map<string, string>
): SurveyResults {
  const numbers = (question: SurveyQuestion, rows: ResponseRow[]) =>
    rows.map((row) => row.answers[question.id]).filter((value): value is number => typeof value === "number");
  const firstNps = questions.find((question) => question.kind === "nps");
  const ratings = questions.filter((question) => question.kind === "rating");

  const perQuestion = questions.map((question): QuestionResult => {
    const base = { id: question.id, label: question.label };
    if (question.kind === "nps" || question.kind === "rating") {
      const values = numbers(question, responses);
      const range = question.kind === "nps" ? { from: 0, size: 11 } : { from: 1, size: 5 };
      const distribution = Array.from(
        { length: range.size },
        (_, index) => values.filter((value) => value === range.from + index).length
      );
      if (question.kind === "rating") {
        return { ...base, kind: "rating", answered: values.length, average: averageOf(values), distribution };
      }
      return {
        ...base,
        kind: "nps",
        answered: values.length,
        score: npsOf(values),
        promoters: values.filter((value) => value >= 9).length,
        passives: values.filter((value) => value === 7 || value === 8).length,
        detractors: values.filter((value) => value <= 6).length,
        distribution,
      };
    }

    const texts = responses
      .map((row) => ({ row, value: row.answers[question.id] }))
      .filter((entry): entry is { row: ResponseRow; value: string } => typeof entry.value === "string");
    if (question.kind === "choice") {
      return {
        ...base,
        kind: "choice",
        answered: texts.length,
        options: (question.options ?? []).map((label) => ({
          label,
          count: texts.filter((entry) => entry.value === label).length,
        })),
      };
    }
    return {
      ...base,
      kind: "text",
      answered: texts.length,
      latest: texts.slice(0, 12).map(({ row, value }) => ({
        text: value,
        createdAt: row.createdAt.toISOString(),
        room: row.roomId ? (roomNames.get(row.roomId) ?? null) : null,
      })),
    };
  });

  const bucket = (roomId: string | null, name: string) => {
    const rows = responses.filter((row) => row.roomId === roomId);
    return {
      roomId,
      name,
      responses: rows.length,
      nps: firstNps ? npsOf(numbers(firstNps, rows)) : null,
      rating: averageOf(ratings.flatMap((question) => numbers(question, rows))),
    };
  };
  const general = responses.some((row) => row.roomId === null) ? [bucket(null, "Link general")] : [];

  return {
    responses: responses.length,
    lastResponseAt: responses[0]?.createdAt.toISOString() ?? null,
    nps: firstNps ? npsOf(numbers(firstNps, responses)) : null,
    questions: perQuestion,
    rooms: [...general, ...[...roomNames].map(([id, name]) => bucket(id, name))],
  };
}

/** NPS, averages, choice counts, the latest comments and the per-room breakdown. Null without a survey. */
export const results = (eventId: string) =>
  Effect.gen(function* () {
    yield* eventRow(eventId);
    const [survey] = yield* query((db) => db.select().from(surveys).where(eq(surveys.eventId, eventId)));
    if (!survey) return null;

    const [responses, roomRows] = yield* Effect.all(
      [
        query((db) =>
          db
            .select({
              roomId: surveyResponses.roomId,
              answers: surveyResponses.answers,
              createdAt: surveyResponses.createdAt,
            })
            .from(surveyResponses)
            .where(eq(surveyResponses.surveyId, survey.id))
            .orderBy(desc(surveyResponses.createdAt))
        ),
        query((db) =>
          db
            .select({ id: rooms.id, name: rooms.name })
            .from(rooms)
            .where(eq(rooms.openSpaceId, eventId))
            .orderBy(asc(rooms.sortOrder), asc(rooms.name))
        ),
      ],
      { concurrency: "unbounded" }
    );

    return summarize(survey.questions, responses, new Map(roomRows.map((room) => [room.id, room.name])));
  });

// ---------------------------------------------------------------------------
// Public
// ---------------------------------------------------------------------------

/** An event's survey while it is open, for phones; null otherwise. */
export const publicSurvey = (input: { communitySlug: string; eventSlug: string }) =>
  Effect.gen(function* () {
    const [row] = yield* query((db) =>
      db
        .select({ survey: surveys, eventName: events.name, communityName: communities.name })
        .from(surveys)
        .innerJoin(events, eq(events.id, surveys.eventId))
        .innerJoin(communities, eq(communities.id, events.communityId))
        .where(
          and(
            eq(communities.slug, input.communitySlug),
            eq(events.slug, input.eventSlug),
            eq(communities.isActive, true),
            eq(events.isActive, true)
          )
        )
    );
    if (!row?.survey.isOpen) return null;

    const roomRows = yield* query((db) =>
      db
        .select({ id: rooms.id, name: rooms.name })
        .from(rooms)
        .where(and(eq(rooms.openSpaceId, row.survey.eventId), eq(rooms.isActive, true)))
        .orderBy(asc(rooms.sortOrder), asc(rooms.name))
    );

    return {
      id: row.survey.id,
      title: row.survey.title,
      eventName: row.eventName,
      communityName: row.communityName,
      questions: row.survey.questions,
      rooms: roomRows,
    } satisfies PublicSurvey;
  });

const between = (value: string | number, min: number, max: number) =>
  typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;

const fits = (question: SurveyQuestion, value: string | number) => {
  switch (question.kind) {
    case "nps":
      return between(value, 0, 10);
    case "rating":
      return between(value, 1, 5);
    case "choice":
      return typeof value === "string" && (question.options ?? []).includes(value);
    case "text":
      return typeof value === "string" && value.length <= TEXT_ANSWER_MAX;
  }
};

/** Keep the answers that fit their question; anything else is a mistake worth saying. */
const checkAnswers = (questions: SurveyQuestion[], answers: Answers) => {
  const byId = new Map(questions.map((question) => [question.id, question]));
  const issues: string[] = [];
  const clean: Answers = {};

  for (const [id, value] of Object.entries(answers)) {
    const question = byId.get(id);
    if (!question) {
      issues.push(`«${id}» no es una pregunta de esta encuesta`);
      continue;
    }
    if (!fits(question, value)) {
      issues.push(`La respuesta a «${question.label}» no es válida`);
      continue;
    }
    const kept = typeof value === "string" ? value.trim() : value;
    if (kept !== "") clean[id] = kept;
  }

  if (issues.length > 0) return Effect.fail(new Invalid({ message: issues[0], issues }));
  if (Object.keys(clean).length === 0) return Effect.fail(new Invalid({ message: "Respondé al menos una pregunta" }));
  return Effect.succeed(clean);
};

/** One answer per phone and room, while the survey is open. */
export const respond = (input: RespondInput) =>
  Effect.gen(function* () {
    const [survey] = yield* query((db) => db.select().from(surveys).where(eq(surveys.id, input.surveyId)));
    if (!survey) return yield* new NotFound({ entity: "survey", message: "Esa encuesta no existe" });
    if (!survey.isOpen) return yield* new Conflict({ reason: "survey_closed", message: "La encuesta está cerrada" });
    const roomId = input.roomId ?? null;
    if (roomId) {
      const [room] = yield* query((db) =>
        db
          .select({ id: rooms.id })
          .from(rooms)
          .where(and(eq(rooms.id, roomId), eq(rooms.openSpaceId, survey.eventId)))
      );
      if (!room) return yield* new Invalid({ message: "Esa sala no es de este evento" });
    }

    const answers = yield* checkAnswers(survey.questions, input.answers);
    yield* query((db) =>
      db.insert(surveyResponses).values({ surveyId: survey.id, roomId, respondent: input.respondent, answers })
    ).pipe(
      Effect.catchTag("UniqueViolation", () =>
        Effect.fail(
          new Conflict({ reason: "already_answered", message: "Ya respondiste esta encuesta desde este teléfono" })
        )
      )
    );
    yield* opsPing(survey.eventId, "survey");

    return { ok: true as const };
  });
