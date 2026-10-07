import * as z from "zod";

import { SCENE_IDS, type SceneId } from "../../owy-stage/scenes";
import { InstanceIdSchema as instanceId } from "../obs-queue/schemas";
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

export const ObsStatusSchema = ObsReportSchema.extend({
  instanceId: z.number(),
  /** The tab executing commands, while it keeps reporting in. */
  executorId: z.string().nullable(),
  executorOnline: z.boolean(),
  statusAt: z.string().nullable(),
  /** The rundown pointer: the cue fired last. */
  currentCueId: z.string().nullable(),
});
export type ObsStatus = z.infer<typeof ObsStatusSchema>;

export const SerializedCommandSchema = z.object({
  id: z.string(),
  instanceId: z.number(),
  type: z.enum(CommandSchema.options.map((option) => option.shape.type.value) as [CommandType, ...CommandType[]]),
  payload: z.record(z.string(), z.unknown()),
  source: z.string(),
  status: z.enum(["pending", "done", "failed", "skipped"]),
  error: z.string().nullable(),
  createdAt: z.string(),
  doneAt: z.string().nullable(),
});
export type SerializedCommand = z.infer<typeof SerializedCommandSchema>;

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

export const CueSchema = z.object({
  id: z.string(),
  instanceId: z.number(),
  name: z.string(),
  color: z.enum(CUE_COLORS).nullable(),
  obsScene: z.string().nullable(),
  transition: z.string().nullable(),
  transitionMs: z.number().nullable(),
  stageScene: z.string().nullable(),
  stageParams: z.record(z.string(), z.unknown()).nullable(),
  sound: z.string().nullable(),
  notes: z.string().nullable(),
  hotkey: z.string().nullable(),
  position: z.number(),
});
export type Cue = z.infer<typeof CueSchema>;

/** What a cue press did: the cue, and the OBS command it queued (if it has an OBS scene). */
export const FiredCueSchema = z.object({ cue: CueSchema, commandId: z.string().nullable() });

export type CreateCueInput = z.infer<typeof CreateCueSchema>;
export type UpdateCueInput = z.infer<typeof UpdateCueSchema>;
