/**
 * Wire contract of the bridge's control API — zod only, no runtime deps on the
 * bridge. The Next.js site imports these values (schemas) and the router
 * *type* from `./rpc`, so its bundle never carries the handlers.
 */
import { z } from "zod";

export const AudioRouteSchema = z.enum(["device", "laptop"]);
export type AudioRoute = z.infer<typeof AudioRouteSchema>;
/** A turn's microphone: the device, the attached browser, or `host` — an input of the Mac running the bridge. */
export const MicRouteSchema = z.enum(["device", "laptop", "host"]);
export type MicRoute = z.infer<typeof MicRouteSchema>;

export const SetAudioRoutingSchema = z.object({
  deviceId: z.string().min(1).max(64),
  mic: MicRouteSchema.optional(),
  output: AudioRouteSchema.optional(),
});
export type SetAudioRoutingInput = z.infer<typeof SetAudioRoutingSchema>;

/** What Owy says around a pitch: nothing (the card on screen), where it landed, or that plus a comment on the talk. */
export const PitchVoiceSchema = z.enum(["silent", "confirm", "react"]);

/** Modo pitch: every tap records a talk proposal; `voice` is what Owy says back. */
export const PitchSettingsSchema = z.object({
  mode: z.boolean(),
  voice: PitchVoiceSchema,
  source: z.enum(["device", "override", "env"]),
});
export type PitchSettings = z.infer<typeof PitchSettingsSchema>;

export const SetPitchSchema = z.object({
  deviceId: z.string().min(1).max(64),
  mode: z.boolean().optional(),
  voice: PitchVoiceSchema.optional(),
});
export type SetPitchInput = z.infer<typeof SetPitchSchema>;

export const HostMicChannelSchema = z.enum(["L", "R", "mix"]);

/** The Mac's own microphone (the `host` route), shared by every device of this bridge. */
export const HostMicSchema = z.object({
  /** The input in use, or wanted; null = the built-in mic. */
  name: z.string().nullable(),
  channel: HostMicChannelSchema,
  health: z.enum(["off", "starting", "open", "no-signal", "gone", "unavailable"]),
  detail: z.string().optional(),
  /** Inputs ffmpeg sees (empty in Docker). */
  available: z.array(z.string()),
});
export type HostMicSnapshot = z.infer<typeof HostMicSchema>;

export const SetHostMicSchema = z.object({
  /** Name (or part of it, "DJI"); null = the built-in mic. */
  name: z.string().trim().max(120).nullable().optional(),
  channel: HostMicChannelSchema.optional(),
});
export type SetHostMicInput = z.infer<typeof SetHostMicSchema>;

/** Which road Owy's voice is on: staff see at a glance when it is degraded. */
export const VoiceStatusSchema = z.object({
  /** The realtime model the session is on (`gateway:google/gemini-3.8-live`), null when none is connected. */
  tier: z.string().nullable(),
  realtime: z.enum(["disconnected", "connecting", "connected", "error"]),
  /** How the last turn was answered: realtime · fallback (backup realtime model) · cascade · offline · pitch. */
  lastPath: z.enum(["realtime", "fallback", "cascade", "offline", "pitch"]).nullable(),
  /** The last finished turn's timings, for the talk's telemetry chip. */
  lastTurn: z
    .object({
      path: z.enum(["realtime", "fallback", "cascade", "offline", "pitch"]),
      /** Time to the first audio Owy played, from the end of the question; null when nothing played. */
      ttfaMs: z.number().nullable(),
      totalMs: z.number(),
      at: z.string(),
    })
    .optional(),
});
export type VoiceStatus = z.infer<typeof VoiceStatusSchema>;

export const DeviceRoutingSchema = z.object({
  id: z.string(),
  connected: z.boolean(),
  mic: MicRouteSchema,
  output: AudioRouteSchema,
  /** Where the current choice comes from: the device's selects, the settings UI, or env defaults. */
  source: z.enum(["device", "override", "env"]),
  /** A browser is attached as this device's laptop audio (mic + speakers). */
  peer: z.boolean(),
  pitch: PitchSettingsSchema,
  voice: VoiceStatusSchema.optional(),
});

export type DeviceRouting = z.infer<typeof DeviceRoutingSchema>;

export const SettingsSnapshotSchema = z.object({
  devices: z.array(DeviceRoutingSchema),
  /** Absent from bridges older than the `host` route. */
  hostMic: HostMicSchema.optional(),
});
export type SettingsSnapshot = z.infer<typeof SettingsSnapshotSchema>;

// ---------------------------------------------------------------------------
// The talk console («Owy, en vivo»): what an attached browser may send on the
// web bridge socket besides audio, always aimed at the device it is attached
// to. The site imports these as types only (its bundle never resolves zod here).
// ---------------------------------------------------------------------------

/** Who Owy is answering in a talk: the presenter's mic (TX1) or the audience's handheld (TX2). */
export const AskerSchema = z.enum(["presenter", "audience"]);
export type Asker = z.infer<typeof AskerSchema>;

/** The talk around the next turns (the slide on screen, who is asking); null = talk mode off. */
export const TalkContextSchema = z.object({ slide: z.string().trim().max(600), asker: AskerSchema }).nullable();
export type TalkContext = z.infer<typeof TalkContextSchema>;

export const TalkMessageSchema = z.discriminatedUnion("type", [
  /** Owy says these exact words; `clip` is the recorded take for when the live voice is down. */
  z.object({
    type: z.literal("say"),
    text: z.string().trim().min(1).max(600),
    clip: z
      .string()
      .regex(/^[\w-]{1,40}$/)
      .optional(),
  }),
  /** A question as text (a phone, the console): Owy's brain answers it out loud, with tools. */
  z.object({ type: z.literal("ask"), text: z.string().trim().min(1).max(600), asker: AskerSchema.default("presenter") }),
  /** Stop whatever Owy is saying or doing on the attached device. */
  z.object({ type: z.literal("hush") }),
  z.object({ type: z.literal("talk"), talk: TalkContextSchema }),
  z.object({ type: z.literal("route"), mic: AudioRouteSchema.optional(), output: AudioRouteSchema.optional() }),
  z.object({ type: z.literal("pitch"), mode: z.boolean() }),
  /** Answered with a `status` reply. */
  z.object({ type: z.literal("status") }),
]);
export type TalkMessage = z.input<typeof TalkMessageSchema>;

/** The bridge's answers to talk messages, on the same socket. A failed command never closes it. */
export type TalkReply =
  | { type: "status"; device: DeviceRouting; talk: TalkContext }
  | { type: "notice"; level: "info" | "warn" | "error"; message: string };
