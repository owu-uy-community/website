import { z } from "zod";

import { EffectEventSchema, FaceEventSchema, SCENE_IDS, type SceneId } from "../../owy-stage/scenes";

export const SetSceneSchema = z.object({
  scene: z.enum(SCENE_IDS as [SceneId, ...SceneId[]]),
  params: z.record(z.string(), z.unknown()).optional(),
  eventId: z.string().nullable().optional(),
});

export const FireEffectSchema = EffectEventSchema;
export const SetFaceSchema = FaceEventSchema;

export type SetSceneInput = z.infer<typeof SetSceneSchema>;
export type FireEffectInput = z.infer<typeof FireEffectSchema>;
export type SetFaceInput = z.infer<typeof SetFaceSchema>;

export const GetPulseSchema = z.object({ eventId: z.string().nullable().optional() }).optional();

export const GetInputsSchema = z.object({ round: z.string().trim().max(40) });

/** What a recogniser (Shazam via macOS Shortcuts, SongRec…) reports. */
export const SetNowPlayingSchema = z.object({
  song: z.string().trim().min(1).max(80),
  artist: z.string().trim().max(80).default(""),
  playlist: z.string().trim().max(60).optional(),
});
export type SetNowPlayingInput = z.infer<typeof SetNowPlayingSchema>;
