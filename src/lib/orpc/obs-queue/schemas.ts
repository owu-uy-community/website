import * as z from "zod";

/** 1 = the admin screen, 2 = the standalone app. */
export const InstanceIdSchema = z.number().int().min(1).max(2);

/** A scene in the loop. Item ids are the server's: ids sent in are only for the client's own bookkeeping. */
export const QueueItemSchema = z.object({
  id: z.string(),
  sceneName: z.string().min(1).max(200),
  delay: z.number().int().min(1).max(300),
  position: z.number().int().min(0),
});

export const PresetSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().min(1, "El preset necesita un nombre").max(100),
  items: z.array(QueueItemSchema).max(200),
});

export const OBSQueueStateSchema = z.object({
  queueItems: z.array(QueueItemSchema),
  isPlaying: z.boolean(),
  currentItemIndex: z.number().int().min(0),
  directMode: z.boolean(),
  presets: z.array(PresetSchema),
  currentPreset: z.string(),
  version: z.number().int(),
});

export const GetInstanceSchema = z.object({ instanceId: InstanceIdSchema });

export const UpdateStateSchema = z.object({
  instanceId: InstanceIdSchema,
  data: z.object({
    queueItems: z.array(QueueItemSchema).max(200).optional(),
    isPlaying: z.boolean().optional(),
    currentItemIndex: z.number().int().min(0).optional(),
    directMode: z.boolean().optional(),
    presets: z.array(PresetSchema).max(50).optional(),
    currentPreset: z.string().optional(),
  }),
});

/** Playback buttons (Stream Deck, the bot): applied to whatever the loop is at that moment. */
export const LoopActionSchema = z.object({
  instanceId: InstanceIdSchema,
  action: z.enum(["play", "pause", "stop", "next", "prev"]),
});

export type QueueItem = z.infer<typeof QueueItemSchema>;
export type Preset = z.infer<typeof PresetSchema>;
export type OBSQueueState = z.infer<typeof OBSQueueStateSchema>;
export type UpdateStateInput = z.infer<typeof UpdateStateSchema>;
export type LoopAction = z.infer<typeof LoopActionSchema>["action"];
