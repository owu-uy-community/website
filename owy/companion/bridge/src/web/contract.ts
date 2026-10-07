/**
 * Wire contract of the bridge's control API — zod only, no runtime deps on the
 * bridge. The Next.js site imports these values (schemas) and the router
 * *type* from `./rpc`, so its bundle never carries the handlers.
 */
import { z } from "zod";

export const AudioRouteSchema = z.enum(["device", "laptop"]);
export type AudioRoute = z.infer<typeof AudioRouteSchema>;

export const SetAudioRoutingSchema = z.object({
  deviceId: z.string().min(1).max(64),
  mic: AudioRouteSchema.optional(),
  output: AudioRouteSchema.optional(),
});
export type SetAudioRoutingInput = z.infer<typeof SetAudioRoutingSchema>;

/** Modo pitch: every tap records a talk proposal; "reacts" adds Owy's short reaction to the announcement. */
export const PitchSettingsSchema = z.object({
  mode: z.boolean(),
  reacts: z.boolean(),
  source: z.enum(["device", "override", "env"]),
});
export type PitchSettings = z.infer<typeof PitchSettingsSchema>;

export const SetPitchSchema = z.object({
  deviceId: z.string().min(1).max(64),
  mode: z.boolean().optional(),
  reacts: z.boolean().optional(),
});
export type SetPitchInput = z.infer<typeof SetPitchSchema>;

export const DeviceRoutingSchema = z.object({
  id: z.string(),
  connected: z.boolean(),
  mic: AudioRouteSchema,
  output: AudioRouteSchema,
  /** Where the current choice comes from: the device's selects, the settings UI, or env defaults. */
  source: z.enum(["device", "override", "env"]),
  /** A browser is attached as this device's laptop audio (mic + speakers). */
  peer: z.boolean(),
  pitch: PitchSettingsSchema,
});

export const SettingsSnapshotSchema = z.object({ devices: z.array(DeviceRoutingSchema) });
export type SettingsSnapshot = z.infer<typeof SettingsSnapshotSchema>;
