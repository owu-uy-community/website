import * as z from "zod";

export const QuestionKindSchema = z.enum(["nps", "rating", "choice", "text"]);
export type QuestionKind = z.infer<typeof QuestionKindSchema>;

export const MAX_QUESTIONS = 8;
export const MAX_OPTIONS = 8;
export const TEXT_ANSWER_MAX = 2000;

/** A stored question. Shapes only: input rules don't apply to rows already saved. */
export const SurveyQuestionSchema = z.object({
  id: z.string(),
  kind: QuestionKindSchema,
  label: z.string(),
  options: z.array(z.string()).optional(),
});
export type SurveyQuestion = z.infer<typeof SurveyQuestionSchema>;

const QuestionInputSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]{1,40}$/, "Id de pregunta inválido"),
    kind: QuestionKindSchema,
    label: z.string().trim().min(1, "Escribí la pregunta").max(200, "Hasta 200 caracteres"),
    options: z.array(z.string().trim().min(1, "Una opción vacía").max(80)).max(MAX_OPTIONS).optional(),
  })
  .refine((question) => question.kind !== "choice" || (question.options?.length ?? 0) >= 2, {
    message: "Una pregunta de opciones necesita al menos dos",
    path: ["options"],
  });

export const SurveySchema = z.object({
  id: z.string(),
  eventId: z.string(),
  title: z.string(),
  questions: z.array(SurveyQuestionSchema),
  isOpen: z.boolean(),
  responses: z.number(),
  updatedAt: z.string(),
});
export type Survey = z.infer<typeof SurveySchema>;

export const SurveyEventSchema = z.object({ eventId: z.string().min(1) });

/** Creates the survey (with a sensible conf survey for what isn't sent) or changes what is sent. */
export const UpsertSurveySchema = z.object({
  eventId: z.string().min(1),
  title: z.string().trim().min(1, "Poné un título").max(120).optional(),
  questions: z
    .array(QuestionInputSchema)
    .min(1, "Agregá al menos una pregunta")
    .max(MAX_QUESTIONS, `Hasta ${MAX_QUESTIONS} preguntas`)
    .refine((questions) => new Set(questions.map((question) => question.id)).size === questions.length, {
      message: "Hay dos preguntas con el mismo id",
    })
    .optional(),
  isOpen: z.boolean().optional(),
});

export const PublicSurveyInputSchema = z.object({ communitySlug: z.string().min(1), eventSlug: z.string().min(1) });

/** What a phone needs to answer: never who else answered. */
export const PublicSurveySchema = z.object({
  id: z.string(),
  title: z.string(),
  eventName: z.string(),
  communityName: z.string(),
  questions: z.array(SurveyQuestionSchema),
  rooms: z.array(z.object({ id: z.string(), name: z.string() })),
});
export type PublicSurvey = z.infer<typeof PublicSurveySchema>;

export const RespondSchema = z.object({
  surveyId: z.string().min(1),
  /** From a room's feedback QR (`?sala=`). */
  roomId: z.string().min(1).optional(),
  /** A random id the phone keeps: one answer per phone and room. */
  respondent: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/, "Identificador inválido"),
  answers: z.record(z.string(), z.union([z.number(), z.string().max(TEXT_ANSWER_MAX)])),
});
export type RespondInput = z.infer<typeof RespondSchema>;

const ResultBase = { id: z.string(), label: z.string(), answered: z.number() };

export const QuestionResultSchema = z.discriminatedUnion("kind", [
  z.object({
    ...ResultBase,
    kind: z.literal("nps"),
    /** % promoters (9–10) minus % detractors (0–6); null without answers. */
    score: z.number().nullable(),
    promoters: z.number(),
    passives: z.number(),
    detractors: z.number(),
    /** Answers per value, 0 to 10. */
    distribution: z.array(z.number()),
  }),
  z.object({
    ...ResultBase,
    kind: z.literal("rating"),
    average: z.number().nullable(),
    /** Answers per value, 1 to 5. */
    distribution: z.array(z.number()),
  }),
  z.object({
    ...ResultBase,
    kind: z.literal("choice"),
    options: z.array(z.object({ label: z.string(), count: z.number() })),
  }),
  z.object({
    ...ResultBase,
    kind: z.literal("text"),
    latest: z.array(z.object({ text: z.string(), createdAt: z.string(), room: z.string().nullable() })),
  }),
]);
export type QuestionResult = z.infer<typeof QuestionResultSchema>;

export const SurveyResultsSchema = z.object({
  responses: z.number(),
  lastResponseAt: z.string().nullable(),
  /** The first NPS question's score, the headline number. */
  nps: z.number().nullable(),
  questions: z.array(QuestionResultSchema),
  /** Per room (from its QR); `roomId` null is the general link. */
  rooms: z.array(
    z.object({
      roomId: z.string().nullable(),
      name: z.string(),
      responses: z.number(),
      nps: z.number().nullable(),
      /** Average of every 1–5 answer given about it. */
      rating: z.number().nullable(),
    })
  ),
});
export type SurveyResults = z.infer<typeof SurveyResultsSchema>;
