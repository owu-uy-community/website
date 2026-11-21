/**
 * Wire contract between the bridge and the site — zod only, no runtime deps on
 * the bridge, so the Next.js site can import it.
 */
import { z } from "zod";

export const AudioRouteSchema = z.enum(["device", "laptop", "host"]);
export type AudioRoute = z.infer<typeof AudioRouteSchema>;
/** A turn's microphone: the device, the attached browser, or `host` — an input of the Mac running the bridge. */
export const MicRouteSchema = z.enum(["device", "laptop", "host"]);
export type MicRoute = z.infer<typeof MicRouteSchema>;

/** What Owy says around a pitch: nothing (the card on screen), where it landed, or that plus a comment on the talk. */
export const PitchVoiceSchema = z.enum(["silent", "confirm", "react"]);

/** Modo pitch: every tap records a talk proposal; `voice` is what Owy says back. */
export const PitchSettingsSchema = z.object({
  mode: z.boolean(),
  voice: PitchVoiceSchema,
  source: z.enum(["device", "override", "env"]),
});
export type PitchSettings = z.infer<typeof PitchSettingsSchema>;

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


/** How a turn was answered: realtime · fallback (backup realtime model) · cascade · offline · pitch. */
export const TurnPathSchema = z.enum(["realtime", "fallback", "cascade", "offline", "pitch"]);
export type TurnPath = z.infer<typeof TurnPathSchema>;

/** A finished turn's timings. */
export const TurnSummarySchema = z.object({
  path: TurnPathSchema,
  /** Time to the first audio Owy played, from the end of the question; null when nothing played. */
  ttfaMs: z.number().nullable(),
  totalMs: z.number(),
  at: z.string(),
});
export type TurnSummary = z.infer<typeof TurnSummarySchema>;

/** Which road Owy's voice is on: staff see at a glance when it is degraded. */
export const VoiceStatusSchema = z.object({
  /** The realtime model the session is on (`gateway:google/gemini-3.8-live`), null when none is connected. */
  tier: z.string().nullable(),
  realtime: z.enum(["disconnected", "connecting", "connected", "error"]),
  lastPath: TurnPathSchema.nullable(),
  /** The last finished turn's timings, for the talk's telemetry chip. */
  lastTurn: TurnSummarySchema.optional(),
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

// ---------------------------------------------------------------------------
// Control plane. The site (/admin/companion → Control) keeps one row per
// setting; the bridge dials out to the site's realtime socket, follows the
// rows, reports what is in effect every 15 s (the reply is every row: a full
// sync), and runs commands. The settings themselves live in ./registry.
// ---------------------------------------------------------------------------

/** The site's realtime channel for the companion (private: `stage:operate`). */
export const COMPANION_CHANNEL = "private:companion";
/** «Owy, en vivo»: the talk console's commands for its seat, and the seat's heartbeat (src/lib/realtime/channels.ts). */
export const OWY_TALK_CHANNEL = "private:owy-talk";

/**
 * One stored setting. `target` is "bridge" or a device id; `setBy` says who wrote it:
 * `admin:<name>`, `dispositivo` (its own screen), `voz` (Owy, asked out loud) or `local`
 * (the bridge's emergency page). The last writer wins, by `setAt`.
 */
export const SettingRowSchema = z.object({
  target: z.string().trim().min(1).max(64),
  key: z.string().trim().min(1).max(64),
  value: z.json(),
  setBy: z.string().trim().min(1).max(120),
  setAt: z.iso.datetime(),
});
export type SettingRow = z.infer<typeof SettingRowSchema>;

/** The Mac's own output (the `host` route), shared by every device of this bridge. */
export const HostSpeakerSchema = z.object({
  /** The output in use, or wanted; null = the system's default output. */
  name: z.string().nullable(),
  health: z.enum(["off", "starting", "open", "gone", "unavailable"]),
  detail: z.string().optional(),
  /** Outputs the Mac has (empty in Docker). */
  available: z.array(z.string()),
  /** Where «la salida del sistema» plays right now (macOS's default output), when known. */
  systemDefault: z.string().optional(),
});
export type HostSpeakerSnapshot = z.infer<typeof HostSpeakerSchema>;

export const DeviceStatusSchema = z.object({
  id: z.string(),
  host: z.string(),
  connected: z.boolean(),
  /** ESPHome version the board reports. */
  firmware: z.string().optional(),
  /** The face the board shows right now (`select.face_state`); absent while it is off the network. */
  face: z.string().optional(),
  /** Where this Owy's turn is, board or not: the virtual knob on the panel shows it. */
  phase: z.enum(["idle", "listening", "thinking", "speaking"]).default("idle"),
  /** A browser is attached as this device's audio. */
  peer: z.boolean(),
  staff: z.boolean(),
  voice: VoiceStatusSchema,
  turns: z.array(TurnSummarySchema).max(5),
  /** Every device setting in effect (registry key → value). */
  values: z.record(z.string(), z.json()),
  /** Keys this board can't hold (no entity, or the option is missing): the bridge keeps them. */
  held: z.array(z.string()),
});
export type DeviceStatus = z.infer<typeof DeviceStatusSchema>;

export const BridgeStatusSchema = z.object({
  /** The bridge's code (git short sha when known). */
  version: z.string().max(40),
  startedAt: z.iso.datetime(),
  /** The Mac it runs on. */
  machine: z.string().max(80),
  /** Every bridge setting in effect. */
  values: z.record(z.string(), z.json()),
  /** Restart-scope keys that changed and wait for a moment without turns. */
  pending: z.array(z.string()),
  /** Rows the bridge could not apply (and why); it runs on the previous value. */
  rejected: z.array(z.object({ target: z.string(), key: z.string(), error: z.string().max(400) })),
  devices: z.array(DeviceStatusSchema),
  hostMic: HostMicSchema.optional(),
  hostSpeaker: HostSpeakerSchema.optional(),
  /** Boards seen on the network by the last «Buscar en la red» (mDNS). */
  found: z.array(z.object({ name: z.string(), host: z.string() })).optional(),
});
export type BridgeStatus = z.infer<typeof BridgeStatusSchema>;

const DeviceIdSchema = z.string().trim().min(1).max(64);

/** What the panel can ask the bridge to do (results come back through `report`). */
export const CompanionCommandSchema = z.discriminatedUnion("type", [
  /**
   * The knob's tap, from the panel (the virtual knob): idle → Owy listens through the Mac;
   * listening → that was all (conversación) or the pitch is sent (pitch); thinking or
   * speaking → Owy stops, with a plain face. Works with the board off: the wall shows the face.
   */
  z.object({ type: z.literal("tap"), deviceId: DeviceIdSchema }),
  /** Modo pitch from the panel: record a pitch now (whatever the mode), or send the one being recorded. */
  z.object({ type: z.literal("pitch"), deviceId: DeviceIdSchema, action: z.enum(["start", "submit"]) }),
  /** A question as text: Owy's brain answers it out loud, with its tools (the talk console's `ask`). */
  z.object({
    type: z.literal("ask"),
    deviceId: DeviceIdSchema,
    text: z.string().trim().min(1).max(600),
    asker: AskerSchema.default("presenter"),
  }),
  /** A short tone on the Mac's output (`target: "mac"`); a board has no speaker any more. */
  z.object({ type: z.literal("tone"), target: DeviceIdSchema }),
  /** Owy says these exact words on that device. */
  z.object({ type: z.literal("say"), deviceId: DeviceIdSchema, text: z.string().trim().min(1).max(600) }),
  /** Stop whatever Owy is saying or doing on that device. */
  z.object({ type: z.literal("hush"), deviceId: DeviceIdSchema }),
  /** Unlock staff on a board (it locks itself after 10 minutes), or lock it now. */
  z.object({ type: z.literal("staff"), deviceId: DeviceIdSchema, on: z.boolean() }),
  /** Record a few seconds from the Mac's input and report the level. */
  z.object({ type: z.literal("probe-mic"), ms: z.number().int().min(500).max(6000).default(4000) }),
  /** Look for boards on the network (mDNS) and report them under `found`. */
  z.object({ type: z.literal("discover") }),
  /** Restart the bridge at the next moment without turns. */
  z.object({ type: z.literal("restart") }),
]);
export type CompanionCommand = z.infer<typeof CompanionCommandSchema>;

export const CommandEnvelopeSchema = z.object({ id: z.string().trim().min(1).max(64), command: CompanionCommandSchema });
export type CommandEnvelope = z.infer<typeof CommandEnvelopeSchema>;

export const CommandResultSchema = z.object({
  id: z.string().trim().min(1).max(64),
  ok: z.boolean(),
  error: z.string().max(400).optional(),
  data: z.json().optional(),
});
export type CommandResult = z.infer<typeof CommandResultSchema>;

/** The bridge's heartbeat (every 15 s and on every change). */
export const ReportSchema = z.object({
  status: BridgeStatusSchema,
  /** Changes made on a board, by voice or on the local page since the last report. */
  changes: z.array(SettingRowSchema).max(200).default([]),
  results: z.array(CommandResultSchema).max(20).default([]),
});
export type Report = z.input<typeof ReportSchema>;

/** The reply to a report: every stored row (the bridge reconciles against all of them). */
export const ReportReplySchema = z.object({ rows: z.array(SettingRowSchema) });
export type ReportReply = z.infer<typeof ReportReplySchema>;

/**
 * Events on COMPANION_CHANNEL. To the bridge: `rows` (changed rows) and `command`.
 * To panels: `rows`, `status` ({status, seenAt}) and `result`.
 */
export type CompanionEvent =
  | { ev: "rows"; pl: { rows: SettingRow[] } }
  | { ev: "command"; pl: CommandEnvelope }
  | { ev: "status"; pl: { status: BridgeStatus; seenAt: string } }
  | { ev: "result"; pl: CommandResult };
