import { z } from "zod";
import {
  AudioRouteSchema,
  BridgeStatusSchema,
  CompanionCommandSchema,
  DeviceRoutingSchema,
  HostMicSchema,
  MicRouteSchema,
  PitchVoiceSchema,
  ReportReplySchema,
  ReportSchema,
  SetAudioRoutingSchema,
  SetHostMicSchema,
  SetPitchSchema,
  SettingRowSchema,
  type BridgeStatus,
  type CommandEnvelope,
  type CommandResult,
  type CompanionCommand,
  type CompanionEvent,
  type SettingRow,
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

// ---------------------------------------------------------------------------
// Control plane: the site keeps the settings (owy/companion/bridge/src/web/registry.ts) and the
// bridge's last report; the bridge follows the rows and runs commands (see ./control.ts).
// ---------------------------------------------------------------------------
export { BridgeStatusSchema, CompanionCommandSchema, ReportReplySchema, ReportSchema, SettingRowSchema };
export type { BridgeStatus, CommandEnvelope, CommandResult, CompanionCommand, CompanionEvent, SettingRow };
export type ReportInput = z.infer<typeof ReportSchema>;

/** "bridge", or a device's id (`owy-knob`). */
export const SettingTargetSchema = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/, "Dispositivo inválido");

export const SetSettingsSchema = z.object({
  changes: z
    .array(z.object({ target: SettingTargetSchema, key: z.string().min(1).max(64), value: z.json() }))
    .min(1)
    .max(50),
});
export type SettingChange = z.infer<typeof SetSettingsSchema>["changes"][number];

export const SettingRowsSchema = z.object({ rows: z.array(SettingRowSchema) });

export const CompanionStateSchema = z.object({
  /** Every stored setting. */
  rows: z.array(SettingRowSchema),
  /** The bridge's last report; null before the first one. */
  status: BridgeStatusSchema.nullable(),
  /** When it arrived (the site's clock). */
  seenAt: z.iso.datetime().nullable(),
});
export type CompanionState = z.infer<typeof CompanionStateSchema>;

export const SendCommandSchema = z.object({ command: CompanionCommandSchema });
/** `delivered: false` — the bridge hasn't reported for 30 s: nothing was sent (commands never wait). */
export const CommandSentSchema = z.object({ id: z.string(), delivered: z.boolean() });
