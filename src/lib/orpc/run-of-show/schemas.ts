import * as z from "zod";

const id = z.string().min(1);
// "HH:MM" 24h, on the event's wall clock.
const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Formato inválido (HH:MM)");
/** Optional text: blank is the same as nothing. */
const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((value) => value || null);

/** Editable fields without defaults, so a partial update only touches what it was sent. */
const MomentFields = z.object({
  title: z.string().trim().min(1, "El título es obligatorio").max(200),
  plannedStart: clock,
  /** 0 is a cue-like moment: an announcement, a scene change. */
  durationMin: z.number().int().min(0).max(720),
  fixed: z.boolean(),
  ownerId: id.nullable(),
  location: text(120),
  notes: text(2000),
  cueId: id.nullable(),
  owyMessage: text(1000),
});

export const EventRefSchema = z.object({ eventId: id });

export const CreateMomentSchema = MomentFields.extend({
  eventId: id,
  durationMin: MomentFields.shape.durationMin.default(10),
  fixed: z.boolean().default(false),
  ownerId: id.nullable().default(null),
  location: text(120).default(null),
  notes: text(2000).default(null),
  cueId: id.nullable().default(null),
  owyMessage: text(1000).default(null),
});

export const UpdateMomentSchema = z.object({ eventId: id, itemId: id, data: MomentFields.partial() });
export const MomentRefSchema = z.object({ eventId: id, itemId: id });
export const ReorderMomentsSchema = z.object({ eventId: id, orderedIds: z.array(z.string()).max(500) });

/** Without `itemId`, the next moment; the page passes the one it shows, so two operators can't GO twice. */
export const GoSchema = z.object({ eventId: id, itemId: id.optional() });

export const ShiftSchema = z.object({
  eventId: id,
  fromItemId: id,
  minutes: z
    .number()
    .int()
    .min(-180)
    .max(180)
    .refine((minutes) => minutes !== 0, "El corrimiento no puede ser 0"),
});

export const MomentSchema = z.object({
  id: z.string(),
  position: z.number(),
  title: z.string(),
  /** "HH:MM" on the event's wall clock. */
  plannedStart: z.string(),
  durationMin: z.number(),
  fixed: z.boolean(),
  owner: z.object({ id: z.string(), name: z.string(), image: z.string().nullable() }).nullable(),
  location: z.string().nullable(),
  notes: z.string().nullable(),
  /** The OBS cue GO fires: OBS scene, wall scene and sound in one press. */
  cue: z
    .object({
      id: z.string(),
      name: z.string(),
      obsScene: z.string().nullable(),
      stageScene: z.string().nullable(),
      sound: z.string().nullable(),
    })
    .nullable(),
  owyMessage: z.string().nullable(),
  actualStart: z.string().nullable(),
  actualEnd: z.string().nullable(),
  /** Actual start − planned start, in minutes on the event's clock (+ is late); null until it starts. */
  driftMin: z.number().nullable(),
});

export const RunOfShowSchema = z.object({
  timezone: z.string(),
  /** The event's day, "YYYY-MM-DD": the day the planned times are on. */
  day: z.string(),
  moments: z.array(MomentSchema),
});

export const GoResultSchema = z.object({
  /** The moment that started; null when GO only closed the last one. */
  item: MomentSchema.nullable(),
  /** What didn't go out (the cue, Owy's message): the GO itself stands. */
  warnings: z.array(z.string()),
  /** The press changed nothing: that moment was already running (a double press, a second operator). */
  repeated: z.boolean(),
});

export const UndoResultSchema = z.object({
  /** The moment running again, if the undone GO had closed one. */
  item: MomentSchema.nullable(),
});

export const CollisionSchema = z.object({
  momentId: z.string(),
  title: z.string(),
  overMin: z.number(),
  fixed: z.object({ id: z.string(), title: z.string(), plannedStart: z.string() }),
});

export const ShiftResultSchema = z.object({
  moved: z.number(),
  /** Moved moments that now run past the next fixed start. */
  collisions: z.array(CollisionSchema),
});

export type Moment = z.infer<typeof MomentSchema>;
export type RunOfShow = z.infer<typeof RunOfShowSchema>;
export type CreateMomentInput = z.infer<typeof CreateMomentSchema>;
export type UpdateMomentInput = z.infer<typeof UpdateMomentSchema>;
export type GoInput = z.infer<typeof GoSchema>;
export type ShiftInput = z.infer<typeof ShiftSchema>;
