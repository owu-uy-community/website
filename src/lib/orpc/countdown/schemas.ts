import * as z from "zod";

export const CountdownStateSchema = z.object({
  isRunning: z.boolean(),
  remainingSeconds: z.number(),
  totalSeconds: z.number(),
  lastUpdated: z.string(),
  soundEnabled: z.boolean(),
  /** When a running countdown reaches zero; screens tick on their own from it. */
  targetTime: z.string().optional(),
});

const eventId = z.string().min(1);
const instant = z.iso.datetime({ offset: true });

export const GetCountdownStateSchema = z.object({ eventId });

export const UpdateCountdownStateSchema = z.discriminatedUnion("action", [
  /** Resume from where it was paused, restart a finished one, or run until `targetTime`. */
  z.object({ eventId, action: z.literal("start"), targetTime: instant.optional() }),
  z.object({ eventId, action: z.literal("pause") }),
  z.object({ eventId, action: z.literal("reset") }),
  z.object({ eventId, action: z.literal("toggleSound") }),
  z.object({
    eventId,
    action: z.literal("setDuration"),
    durationSeconds: z
      .number()
      .int()
      .positive()
      .max(24 * 60 * 60),
  }),
  /** Count down to a moment ("until 18:00"); it starts right away. */
  z.object({ eventId, action: z.literal("setTargetTime"), targetTime: instant }),
]);

export const CountdownEndtimeSchema = z.object({
  /** ISO timestamp, or null when no countdown is running. */
  targetTime: z.string().nullable(),
});

export type CountdownState = z.infer<typeof CountdownStateSchema>;
export type UpdateCountdownStateInput = z.infer<typeof UpdateCountdownStateSchema>;

type WithoutEvent<T> = T extends unknown ? Omit<T, "eventId"> : never;
/** An admin action on a countdown, without the event it applies to. */
export type CountdownAction = WithoutEvent<UpdateCountdownStateInput>;
