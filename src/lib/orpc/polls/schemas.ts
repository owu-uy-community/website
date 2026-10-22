import * as z from "zod";

import { ClockSchema, DaySchema, DurationSchema } from "../events/schemas";

export const PollAnswerSchema = z.enum(["yes", "maybe", "no"]);

export const CreatePollSchema = z.object({
  communityId: z.string().min(1),
  title: z.string().trim().min(3).max(120),
  days: z.array(DaySchema).min(2, "Proponé al menos dos fechas").max(6),
  startTime: ClockSchema.default("19:00"),
  durationMin: DurationSchema.default(120),
  invited: z.array(z.string().min(1)).min(1, "Invitá al menos una comunidad").max(8),
});

export const PollListSchema = z.object({ communityId: z.string().min(1) });
export const PollRefSchema = z.object({ communityId: z.string().min(1), pollId: z.string().min(1) });

export const VoteSchema = PollRefSchema.extend({
  votes: z
    .array(z.object({ day: DaySchema, answer: PollAnswerSchema }))
    .min(1)
    .max(6),
});

export const ChooseSchema = PollRefSchema.extend({ day: DaySchema });

export const PollSchema = z.object({
  id: z.string(),
  title: z.string(),
  days: z.array(z.string()),
  startTime: z.string(),
  durationMin: z.number(),
  /** This community asked: it picks the date */
  mine: z.boolean(),
  asker: z.object({ id: z.string(), name: z.string() }),
  /** The one that asks first, then the invited ones, each with its answers by day */
  communities: z.array(z.object({ id: z.string(), name: z.string(), answers: z.record(z.string(), PollAnswerSchema) })),
  chosenDay: z.string().nullable(),
  eventId: z.string().nullable(),
  createdAt: z.string(),
});

export type Poll = z.infer<typeof PollSchema>;
export type CreatePollInput = z.infer<typeof CreatePollSchema>;
