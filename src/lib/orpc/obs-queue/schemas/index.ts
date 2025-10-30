import { z } from "zod";

/**
 * Queue item schema
 */
export const QueueItemSchema = z.object({
  id: z.string(),
  sceneName: z.string(),
  delay: z.number().int().min(1).max(300),
  position: z.number().int().min(0),
});

/**
 * Preset item schema
 */
export const PresetItemSchema = z.object({
  id: z.string(),
  sceneName: z.string(),
  delay: z.number().int().min(1).max(300),
  position: z.number().int().min(0),
});

/**
 * Preset schema
 */
export const PresetSchema = z.object({
  id: z.string(),
  name: z.string().min(1, "Preset name is required"),
  items: z.array(PresetItemSchema),
});

/**
 * OBS Queue State schema
 */
export const OBSQueueStateSchema = z.object({
  queueItems: z.array(QueueItemSchema),
  isPlaying: z.boolean(),
  currentItemIndex: z.number().int().min(0),
  directMode: z.boolean(),
  presets: z.array(PresetSchema),
  currentPreset: z.string(),
  version: z.number().int(),
});

/**
 * Schema for getting state by instance ID
 */
export const GetInstanceSchema = z.object({
  instanceId: z.number().int().min(1).max(2), // 1 = admin screen, 2 = standalone app
});

/**
 * Schema for updating OBS queue state
 */
export const UpdateStateSchema = z.object({
  instanceId: z.number().int().min(1).max(2),
  data: z.object({
    queueItems: z.array(QueueItemSchema).optional(),
    isPlaying: z.boolean().optional(),
    currentItemIndex: z.number().int().min(0).optional(),
    directMode: z.boolean().optional(),
    presets: z.array(PresetSchema).optional(),
    currentPreset: z.string().optional(),
  }),
});

// Type exports
export type QueueItem = z.infer<typeof QueueItemSchema>;
export type PresetItem = z.infer<typeof PresetItemSchema>;
export type Preset = z.infer<typeof PresetSchema>;
export type OBSQueueState = z.infer<typeof OBSQueueStateSchema>;
export type GetInstanceInput = z.infer<typeof GetInstanceSchema>;
export type UpdateStateInput = z.infer<typeof UpdateStateSchema>;
