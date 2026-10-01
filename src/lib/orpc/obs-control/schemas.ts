import { z } from "zod";

import { SCENE_IDS, type SceneId } from "../../owy-stage/scenes";

const instanceId = z.number().int().min(1).max(2);
const sceneName = z.string().trim().min(1).max(200);

/**
 * What a remote caller may ask the executor tab to do in OBS. Discriminated so
 * the executor's switch is exhaustive and the HTTP route can build them by
 * name. Loop (queue rotation) changes go through `obsQueue.updateState`
 * instead — the executor already follows that state.
 */
export const CommandSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("scene"),
    payload: z.object({
      sceneName,
      transition: z.string().max(100).optional(),
      transitionMs: z.number().int().min(0).max(20_000).optional(),
      /** Cue name, for the history tab only. */
      cue: z.string().max(100).optional(),
    }),
  }),
  z.object({ type: z.literal("preview"), payload: z.object({ sceneName }) }),
  z.object({
    type: z.literal("take"),
    payload: z
      .object({
        transition: z.string().max(100).optional(),
        transitionMs: z.number().int().min(0).max(20_000).optional(),
      })
      .default({}),
  }),
  z.object({ type: z.literal("cut"), payload: z.object({}).default({}) }),
  z.object({ type: z.literal("studio"), payload: z.object({ enabled: z.boolean() }) }),
  z.object({
    type: z.literal("transition"),
    payload: z.object({
      name: z.string().max(100).optional(),
      durationMs: z.number().int().min(0).max(20_000).optional(),
    }),
  }),
  z.object({
    type: z.literal("mute"),
    payload: z.object({ inputName: z.string().min(1).max(200), muted: z.boolean().optional() }),
  }),
  z.object({
    type: z.literal("volume"),
    payload: z.object({ inputName: z.string().min(1).max(200), db: z.number().min(-100).max(26) }),
  }),
  z.object({ type: z.literal("stream"), payload: z.object({ action: z.enum(["start", "stop", "toggle"]) }) }),
  z.object({ type: z.literal("record"), payload: z.object({ action: z.enum(["start", "stop", "toggle"]) }) }),
]);
export type Command = z.infer<typeof CommandSchema>;
export type CommandType = Command["type"];

export const SendCommandSchema = z.intersection(z.object({ instanceId: instanceId.default(1) }), CommandSchema);
export type SendCommandInput = z.infer<typeof SendCommandSchema>;

export const InstanceSchema = z.object({ instanceId: instanceId.default(1) });
export const AckCommandSchema = z.object({
  id: z.string(),
  ok: z.boolean(),
  error: z.string().max(500).optional(),
});
export const ClaimExecutorSchema = z.object({
  instanceId: instanceId.default(1),
  executorId: z.string().min(1).max(60),
  force: z.boolean().default(false),
});
export const ReleaseExecutorSchema = z.object({
  instanceId: instanceId.default(1),
  executorId: z.string().min(1).max(60),
});

/** What the executor knows about OBS; the server stores the latest copy. */
export const ObsReportSchema = z.object({
  connected: z.boolean(),
  programScene: z.string().nullable().default(null),
  previewScene: z.string().nullable().default(null),
  studioMode: z.boolean().default(false),
  transitionName: z.string().nullable().default(null),
  transitionMs: z.number().int().nullable().default(null),
  streaming: z.boolean().default(false),
  recording: z.boolean().default(false),
  lastError: z.string().max(500).nullable().default(null),
  scenes: z.array(z.string().max(200)).max(300).default([]),
  audioInputs: z
    .array(z.object({ name: z.string().max(200), muted: z.boolean() }))
    .max(100)
    .default([]),
});
export type ObsReport = z.infer<typeof ObsReportSchema>;

export const ReportStatusSchema = z.object({
  instanceId: instanceId.default(1),
  executorId: z.string().min(1).max(60),
  status: ObsReportSchema,
});

export const ListCommandsSchema = z.object({
  instanceId: instanceId.default(1),
  limit: z.number().int().min(1).max(200).default(50),
});

// ---------------------------------------------------------------------------
// Cues
// ---------------------------------------------------------------------------

export const CUE_COLORS = ["yellow", "red", "green", "blue", "purple", "gray"] as const;
export type CueColor = (typeof CUE_COLORS)[number];

const cueFields = {
  name: z.string().trim().min(1).max(80),
  color: z.enum(CUE_COLORS).nullable().default(null),
  obsScene: sceneName.nullable().default(null),
  transition: z.string().max(100).nullable().default(null),
  transitionMs: z.number().int().min(0).max(20_000).nullable().default(null),
  stageScene: z
    .enum(SCENE_IDS as [SceneId, ...SceneId[]])
    .nullable()
    .default(null),
  stageParams: z.record(z.string(), z.unknown()).nullable().default(null),
  sound: z.string().max(10).nullable().default(null),
  notes: z.string().max(500).nullable().default(null),
  /** One letter A–Z, fired from the keyboard on the director page. */
  hotkey: z
    .string()
    .regex(/^[A-Z]$/)
    .nullable()
    .default(null),
};

export const CreateCueSchema = z.object({ instanceId: instanceId.default(1), ...cueFields });
export const UpdateCueSchema = z.object({ id: z.string(), ...cueFields });
export const CueIdSchema = z.object({ id: z.string() });
export const ReorderCuesSchema = z.object({ instanceId: instanceId.default(1), ids: z.array(z.string()).max(500) });
export const StepCueSchema = z.object({ instanceId: instanceId.default(1), direction: z.enum(["next", "prev"]) });

export type CreateCueInput = z.infer<typeof CreateCueSchema>;
export type UpdateCueInput = z.infer<typeof UpdateCueSchema>;
