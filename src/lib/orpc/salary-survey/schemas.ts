import * as z from "zod";

import {
  AMOUNT_RANGE,
  CONTRACTS,
  CURRENCIES,
  DEPARTMENTS,
  EDUCATION,
  EMPLOYERS,
  EXPERIENCE,
  GENDERS,
  HOURS_RANGE,
  MAX_STACKS,
  MODALITIES,
  ROLES,
  SENIORITIES,
  STACKS,
  values,
} from "lib/salary-survey/questions";

export const SurveyStatusSchema = z.enum(["draft", "open", "closed", "published"]);

export const SurveySlugSchema = z
  .string()
  .trim()
  .regex(/^[a-z0-9-]{2,32}$/, "Usá minúsculas, números y guiones (p. ej. 2027)");

export const SurveySchema = z.object({
  slug: z.string(),
  title: z.string(),
  status: SurveyStatusSchema,
  opensAt: z.iso.datetime({ offset: true }).nullable(),
  closesAt: z.iso.datetime({ offset: true }).nullable(),
  responseCount: z.number().int(),
});

export const CurrentSurveySchema = z.object({
  /** The open survey, or else the latest one that has opened; null before the first edition */
  survey: SurveySchema.nullable(),
  /** Whether the caller (if signed in) already answered it */
  answered: z.boolean(),
});

export const AnswersSchema = z
  .object({
    role: z.enum(values(ROLES)),
    seniority: z.enum(values(SENIORITIES)),
    experience: z.enum(values(EXPERIENCE)),
    stacks: z
      .array(z.enum(values(STACKS)))
      .min(1, "Elegí al menos un stack")
      .max(MAX_STACKS, `Elegí hasta ${MAX_STACKS}`)
      .refine((list) => new Set(list).size === list.length, "No repitas un stack"),
    employer: z.enum(values(EMPLOYERS)),
    contract: z.enum(values(CONTRACTS)),
    modality: z.enum(values(MODALITIES)),
    department: z.enum(values(DEPARTMENTS)),
    currency: z.enum(values(CURRENCIES)),
    amount: z.number().int("Sin decimales").positive(),
    hoursPerWeek: z.number().int().min(HOURS_RANGE.min).max(HOURS_RANGE.max),
    /** 1 (not at all) to 5 (very) */
    satisfaction: z.number().int().min(1).max(5),
    gender: z.enum(values(GENDERS)).nullable(),
    education: z.enum(values(EDUCATION)).nullable(),
  })
  .superRefine((answers, ctx) => {
    const range = AMOUNT_RANGE[answers.currency];
    if (answers.amount < range.min || answers.amount > range.max) {
      ctx.addIssue({
        code: "custom",
        path: ["amount"],
        message: `En ${answers.currency} esperamos un monto mensual entre ${range.min.toLocaleString("es-UY")} y ${range.max.toLocaleString("es-UY")}`,
      });
    }
  });

export type Answers = z.infer<typeof AnswersSchema>;

export const SubmitSchema = z.object({ slug: SurveySlugSchema, answers: AnswersSchema });

export const SurveyRefSchema = z.object({ slug: SurveySlugSchema });

export const StatSchema = z.object({
  n: z.number().int(),
  p25: z.number(),
  median: z.number(),
  p75: z.number(),
});

export const BreakdownSchema = z.object({
  groups: z.array(z.object({ key: z.string(), label: z.string(), stat: StatSchema })),
  /** Groups left out because they have fewer answers than the threshold */
  hidden: z.number().int(),
});

export const CurrencyResultsSchema = z.object({
  n: z.number().int(),
  overall: StatSchema.nullable(),
  bySeniority: BreakdownSchema,
  byExperience: BreakdownSchema,
  byRole: BreakdownSchema,
  byStack: BreakdownSchema,
  byModality: BreakdownSchema,
  byContract: BreakdownSchema,
  byMarket: BreakdownSchema,
});

/** Who answered, one dimension at a time; options under the threshold are summed into `other` */
export const ProfileDimensionSchema = z.object({
  key: z.string(),
  label: z.string(),
  /** Answers counted in this dimension (optional questions count only those who answered) */
  answered: z.number().int(),
  groups: z.array(z.object({ key: z.string(), label: z.string(), n: z.number().int() })),
  other: z.number().int(),
});

const MeanGroupSchema = z.object({ key: z.string(), label: z.string(), n: z.number().int(), mean: z.number() });

export const SatisfactionSchema = z.object({
  n: z.number().int(),
  /** Average on the 1–5 scale, one decimal */
  mean: z.number(),
  /** Answers per step, from "nada conforme" (1) to "muy conforme" (5) */
  distribution: z.array(z.number().int()).length(5),
  bySeniority: z.array(MeanGroupSchema),
  byMarket: z.array(MeanGroupSchema),
});

export const ResultsSchema = z.object({
  survey: SurveySchema,
  threshold: z.number().int(),
  currencies: z.object({ UYU: CurrencyResultsSchema, USD: CurrencyResultsSchema }),
  profile: z.array(ProfileDimensionSchema),
  /** Null until enough people answered the satisfaction question */
  satisfaction: SatisfactionSchema.nullable(),
});

export type Stat = z.infer<typeof StatSchema>;
export type Breakdown = z.infer<typeof BreakdownSchema>;
export type CurrencyResults = z.infer<typeof CurrencyResultsSchema>;
export type ProfileDimension = z.infer<typeof ProfileDimensionSchema>;
export type Satisfaction = z.infer<typeof SatisfactionSchema>;
export type SurveyResults = z.infer<typeof ResultsSchema>;
export type Survey = z.infer<typeof SurveySchema>;

/** One row of the open dataset: every answer, coarsened so no row stands out */
export const DatasetRowSchema = z.object({
  rol: z.string(),
  seniority: z.string(),
  experiencia: z.string(),
  stacks: z.array(z.string()),
  para_quien: z.string(),
  mercado: z.string(),
  contratacion: z.string(),
  modalidad: z.string(),
  region: z.string(),
  moneda: z.string(),
  monto_mensual: z.number(),
  horas_semanales: z.string(),
  conformidad: z.number().int().nullable(),
  genero: z.string(),
  educacion: z.string(),
});

export type DatasetRow = z.infer<typeof DatasetRowSchema>;

export const DatasetSchema = z.object({ filename: z.string(), csv: z.string() });

export const DatasetRowsSchema = z.object({
  edition: z.string(),
  threshold: z.number().int(),
  rows: z.array(DatasetRowSchema),
});

export const UpsertSurveySchema = z
  .object({
    slug: SurveySlugSchema,
    title: z.string().trim().min(3).max(120),
    opensAt: z.iso.datetime({ offset: true }).nullable(),
    closesAt: z.iso.datetime({ offset: true }).nullable(),
  })
  .refine(
    ({ opensAt, closesAt }) => !opensAt || !closesAt || Date.parse(opensAt) < Date.parse(closesAt),
    { message: "El cierre tiene que ser después de la apertura", path: ["closesAt"] }
  );

export const SetStatusSchema = z.object({ slug: SurveySlugSchema, status: SurveyStatusSchema });
