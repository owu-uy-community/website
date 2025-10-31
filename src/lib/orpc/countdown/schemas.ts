import { z } from "zod";

export const CountdownStateSchema = z.object({
  isRunning: z.boolean(),
  remainingSeconds: z.number(),
  totalSeconds: z.number(),
  lastUpdated: z.string(),
  soundEnabled: z.boolean().default(false),
  targetTime: z.string().optional(), // ISO timestamp for countdown to specific time
});

export const UpdateCountdownStateSchema = z.object({
  action: z.enum(["start", "pause", "reset", "setDuration", "toggleSound", "setTargetTime"]),
  durationSeconds: z.number().optional(),
  targetTime: z.string().optional(), // ISO timestamp or time string
});

export const CountdownEndtimeSchema = z.object({
  targetTime: z.string().nullable(), // ISO timestamp or null if no countdown is active
});

export type CountdownState = z.infer<typeof CountdownStateSchema>;
export type UpdateCountdownStateInput = z.infer<typeof UpdateCountdownStateSchema>;
export type CountdownEndtime = z.infer<typeof CountdownEndtimeSchema>;
