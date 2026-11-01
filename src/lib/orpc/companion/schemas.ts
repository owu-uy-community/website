import { z } from "zod";
import {
  AudioRouteSchema,
  DeviceRoutingSchema,
  HostMicSchema,
  MicRouteSchema,
  PitchVoiceSchema,
  SetAudioRoutingSchema,
  SetHostMicSchema,
  SetPitchSchema,
} from "../../../../owy/companion/bridge/src/web/contract";

// The bridge owns the contract (owy/companion/bridge/src/web/contract.ts, zod only);
// the site re-exports it and adds reachability, since the bridge may simply be off.
export { AudioRouteSchema, MicRouteSchema, PitchVoiceSchema, SetAudioRoutingSchema, SetHostMicSchema, SetPitchSchema };
export type AudioRoute = z.infer<typeof AudioRouteSchema>;
export type MicRoute = z.infer<typeof MicRouteSchema>;
export type PitchVoice = z.infer<typeof PitchVoiceSchema>;
export type SetAudioRoutingInput = z.infer<typeof SetAudioRoutingSchema>;
export type SetPitchInput = z.infer<typeof SetPitchSchema>;
export type SetHostMicInput = z.infer<typeof SetHostMicSchema>;

export const AudioRoutingSnapshotSchema = z.object({
  reachable: z.boolean(),
  error: z.string().optional(),
  devices: z.array(DeviceRoutingSchema),
  /** The Mac's own mic (the `host` route); absent when the bridge has none (an older bridge). */
  hostMic: HostMicSchema.optional(),
});
export type AudioRoutingSnapshot = z.infer<typeof AudioRoutingSnapshotSchema>;

export const ProbeHostMicSchema = z.object({ ms: z.number().int().min(500).max(6000).default(4000) });
export const HostMicProbeSchema = z.object({
  reachable: z.boolean(),
  error: z.string().optional(),
  /** Loudest 20 ms frame and the average, RMS 0..1. */
  peak: z.number(),
  rms: z.number(),
  seconds: z.number(),
  health: HostMicSchema.shape.health.optional(),
});
export type HostMicProbe = z.infer<typeof HostMicProbeSchema>;
