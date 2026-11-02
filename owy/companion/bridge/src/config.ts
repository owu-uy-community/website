import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { MODELS } from "../../../agent/lib/models";

/**
 * Bridge configuration, read once from the environment.
 *
 * The bridge runs on a laptop at the venue, on the same Wi-Fi as the companion
 * device(s). It reuses the agent's own variables for the site API
 * (`OWU_API_URL`, `OWY_API_KEY`, `OWY_EVENT_ID` — see `agent/lib/owu-api.ts`
 * and `agent/lib/board.ts`) and adds the `COMPANION_*` set below.
 */

const boolFromEnv = z
  .string()
  .optional()
  .transform((value) => value !== undefined && ["1", "true", "yes", "on"].includes(value.trim().toLowerCase()));

export const DeviceSpecSchema = z.object({
  /** Stable id used in logs, session keys and tool context (`device:<id>`). */
  id: z.string().min(1),
  /** Hostname or IP of the ESPHome device (native API, port 6053). */
  host: z.string().min(1),
  port: z.number().int().positive().default(6053),
  /** Base64 `api.encryption.key` from the firmware; null = plaintext API. */
  psk: z.string().nullable().default(null),
});
export type DeviceSpec = z.infer<typeof DeviceSpecSchema>;

export const EnvSchema = z.object({
  // --- Realtime model (ears + mouth) ---
  COMPANION_REALTIME_MODEL: z.string().default(MODELS.realtime),
  COMPANION_VOICE: z.string().default(MODELS.realtimeVoice),
  GOOGLE_GENERATIVE_AI_API_KEY: z.string().optional(),
  AI_GATEWAY_API_KEY: z.string().optional(),

  // --- Fallbacks (the venue network is unknown) ---
  /**
   * Realtime models tried in order when the primary cannot connect (comma-separated specs; empty
   * = none). `spec#voice` picks a tier's voice; without it Gemini gets COMPANION_VOICE, OpenAI
   * COMPANION_FALLBACK_VOICE and any other vendor its own default.
   */
  COMPANION_REALTIME_FALLBACKS: z.string().default(MODELS.realtimeFallbacks.join(",")),
  /** Voice for OpenAI tiers without their own `#voice` (Gemini voice names do not exist there). */
  COMPANION_FALLBACK_VOICE: z.string().default("marin"),
  /** Per tier: how long a token may take, and the whole handshake. */
  COMPANION_TOKEN_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60_000).default(8000),
  COMPANION_REALTIME_CONNECT_MS: z.coerce.number().int().min(2000).max(60_000).default(12_000),
  /**
   * `on`: a tap is never declined because the realtime model is down — the turn is
   * recorded, transcribed, answered and spoken through plain gateway calls
   * (needs AI_GATEWAY_API_KEY). `off`: the old behaviour (decline when no model).
   */
  COMPANION_CASCADE: z.enum(["on", "off"]).default("on"),
  /** Transcription models for the cascade, tried in order; each must keep zero data retention. */
  COMPANION_TRANSCRIBE_MODELS: z.string().default(MODELS.transcribe.join(",")),
  /** Speech for the cascade, a sentence at a time in COMPANION_TTS_VOICE (default: COMPANION_VOICE), tried in order. */
  COMPANION_TTS_MODELS: z.string().default(MODELS.speech.join(",")),
  /** Older single-model form of COMPANION_TTS_MODELS; wins when set. */
  COMPANION_TTS_MODEL: z.string().optional(),
  /** The last voice that speaks before the text on screen (streams; its own voice). Empty = none. */
  COMPANION_TTS_STREAM_MODEL: z.string().default(MODELS.speechStream),
  COMPANION_TTS_VOICE: z.string().optional(),
  /** Local brain in the cascade: the text model, then gateway model fallbacks (comma-separated). */
  COMPANION_TEXT_MODEL: z.string().default(MODELS.text),
  COMPANION_TEXT_FALLBACK_MODELS: z.string().default(MODELS.textFallbacks.join(",")),
  /**
   * A realtime model that says nothing this long after the person paused (twice
   * this once the turn is handed over, tools excluded) is a dead socket or a
   * stalled gateway: the turn moves to the cascade.
   */
  COMPANION_ACK_MS: z.coerce.number().int().min(500).max(20_000).default(2500),
  /** Audio the pacer keeps ahead of real time; raise it on a jittery venue LAN (calibration knob). */
  COMPANION_PACER_LEAD_MS: z.coerce.number().int().min(20).max(1000).default(100),

  // --- Brain ---
  /**
   * `eve`: every turn goes to the eve Owy (agent/channels/companion.ts) — same
   * memory, tools and staff gating as Slack/Telegram; the realtime model only
   * transcribes and speaks. `local`: the realtime model is the brain, with the
   * agent's tools run in-process (the original mode; no eve deployment needed).
   * Defaults to `eve` when COMPANION_EVE_URL is set.
   */
  COMPANION_BRAIN: z.enum(["eve", "local"]).optional(),
  COMPANION_EVE_URL: z.string().url().optional(),
  /**
   * Seconds of silence after which the device's conversation is retired, on either
   * brain (eve session reset; the local brain's history and realtime context
   * dropped): until then every tap remembers the taps before it.
   */
  COMPANION_EVE_IDLE_RESET_S: z.coerce.number().int().min(10).default(180),
  /** Laptop audio: ms from a frame leaving the pacer to it being heard in the browser (mouth sync). */
  COMPANION_MOUTH_LATENCY_MS: z.coerce.number().int().min(0).max(2000).default(250),
  /** Faces while Owy talks: `jev` (TypeSafe on the AI Gateway, local guess as fallback), `guess` (local only), `off`. */
  COMPANION_EXPRESSIONS: z.enum(["jev", "guess", "off"]).default("jev"),
  COMPANION_EXPRESSION_MODEL: z.string().default(MODELS.expression),
  /** Shown to the agent as where the device stands. */
  COMPANION_EVENT_NAME: z.string().default("OWU Conf 2026"),

  // --- Modo pitch (the open space's marketplace: tap, pitch a talk, tap → a card on the board) ---
  /** Fallbacks for boards without `switch.pitch_mode` / `select.pitch_voice` (web lab, text REPL). */
  COMPANION_PITCH_MODE: boolFromEnv,
  /**
   * What Owy says around a pitch: `silent` (the card on screen, questions as text),
   * `confirm` (says where it landed, asks what is missing), `react` (+ one warm
   * sentence about the talk). Unset = `react` when the old COMPANION_PITCH_REACTS is on, else `confirm`.
   */
  COMPANION_PITCH_VOICE: z.enum(["silent", "confirm", "react"]).optional(),
  COMPANION_PITCH_REACTS: boolFromEnv,
  /** Audio → card, one multimodal call through the gateway. */
  COMPANION_PITCH_MODEL: z.string().default(MODELS.pitch),
  /** Gateway model fallbacks for the pitch extractor (comma-separated, audio-capable). */
  COMPANION_PITCH_FALLBACK_MODELS: z.string().default(MODELS.pitchFallbacks.join(",")),
  /**
   * How much the extractor reasons first. Measured on Gemini 3.8 Flash (2026-11-01): the default
   * (medium) takes 5–7 s per pitch, `low` 3–4 s with the same cards and names; `minimal` is rejected.
   */
  COMPANION_PITCH_THINKING: z.enum(["low", "medium", "high"]).default("low"),
  /**
   * Tail latency: past COMPANION_PITCH_HEDGE_MS without an answer (or on a failure) this faster
   * model is asked too and the first answer wins (flash-lite: ~1.7 s, but worse at names). Empty = off.
   */
  COMPANION_PITCH_HEDGE_MODEL: z.string().default(MODELS.pitchHedge),
  COMPANION_PITCH_HEDGE_MS: z.coerce.number().int().min(500).max(20_000).default(5_000),
  /**
   * Before placing, a decision model (jev, Luna when unsure) asks per card on the board «is this the
   * same talk?»: a repeated pitch gets "ya está en la grilla" instead of a second card. ~0.5 s,
   * overlapped with the name question when there is one.
   */
  COMPANION_PITCH_DEDUPE: z.enum(["on", "off"]).default("on"),
  /** Seconds of silence after speech that end a pitch on their own, and the hard cap. */
  COMPANION_PITCH_SILENCE_S: z.coerce.number().min(3).max(60).default(10),
  // The board's own watchdog gives a pitch run 180 s (recording + thinking): keep the cap well under it.
  COMPANION_PITCH_MAX_S: z.coerce.number().min(20).max(150).default(120),
  /** RMS a 20 ms mic frame must exceed (three in a row) to count as speech. */
  // ponytail: the knob's mic has AGC; calibrate on the device if the ring never lights, or lights on room noise.
  COMPANION_PITCH_VAD_RMS: z.coerce.number().min(0.001).max(0.2).default(0.012),

  // --- Devices ---
  /**
   * JSON array of DeviceSpec, or shorthand `id@host[:port][#psk]` entries separated by commas.
   * `#secrets` as the psk reads `api_key` from companion/firmware/secrets.yaml.
   */
  COMPANION_DEVICES: z.string().default(""),
  COMPANION_WEB_BRIDGE: boolFromEnv,
  COMPANION_WEB_PORT: z.coerce.number().int().min(1).max(65535).default(3312),
  /** Origins whose pages may open a voice session (the site's /admin/companion, the talk console). */
  COMPANION_WEB_ORIGINS: z.string().default("http://localhost:3000,http://127.0.0.1:3000"),
  COMPANION_BRIDGE_SECRET: z.string().optional(),
  COMPANION_BRIDGE_PUBLIC_URL: z.string().optional(),

  // --- Site (same names as the agent) ---
  OWU_API_URL: z.string().optional(),
  OWY_API_KEY: z.string().optional(),
  OWY_EVENT_ID: z.string().optional(),
  /** The event modo pitch places cards into (id or slug), when it isn't OWY_EVENT_ID — a demo grid for a talk. */
  COMPANION_PITCH_EVENT_ID: z.string().trim().min(1).optional(),
  COMPANION_PUBLIC_SITE_URL: z.string().default("https://owu.uy"),
  COMPANION_SITE_WS_URL: z.string().optional(),

  // --- Behaviour ---
  /** Fallbacks used when the device does not expose the mode switches (text REPL, tests). */
  COMPANION_MARKETPLACE_OPEN: boolFromEnv,
  COMPANION_STAFF_MODE: boolFromEnv,
  /** Seconds a person must wait between two proposals from the same device (staff exempt). */
  COMPANION_PROPOSAL_COOLDOWN_S: z.coerce.number().int().nonnegative().default(60),
  /** Directory for opt-in JSONL transcripts; unset = no transcript persisted. */
  // --- Audio routing defaults (a board's mic_source / audio_output selects win) ---
  /** `host` = an input of the Mac running the bridge (COMPANION_HOST_MIC), captured with ffmpeg; macOS only, not in Docker. */
  COMPANION_MIC_SOURCE: z.enum(["device", "laptop", "host"]).default("device"),
  /** The Mac input for the `host` route, by name or part of it ("DJI"); unset = the built-in mic. */
  COMPANION_HOST_MIC: z.string().trim().min(1).optional(),
  /** Side of a stereo input that feeds Owy (a DJI receiver in stereo mode: one transmitter per side). */
  COMPANION_HOST_MIC_CHANNEL: z.enum(["L", "R", "mix"]).default("mix"),
  /**
   * Gain on the Mac's input. A DJI receiver has no AGC and arrives far quieter than a board's mic
   * (its noise-cancelled silence stays near zero): +12 dB puts a voice over COMPANION_PITCH_VAD_RMS.
   */
  // ponytail: one gain for whichever Mac input is chosen; per-input gains if the venue mixes mics.
  COMPANION_HOST_MIC_GAIN_DB: z.coerce.number().min(-12).max(30).default(0),
  COMPANION_FFMPEG: z.string().default("ffmpeg"),
  /** The Mac output for the `host` route (the room's PA), by name or part of it; unset = the system's default output. */
  COMPANION_HOST_SPEAKER: z.string().trim().min(1).optional(),
  /** ms from a frame leaving the pacer to it being heard from the Mac's output (mouth and face sync; calibrate by ear). */
  COMPANION_HOST_SPEAKER_LATENCY_MS: z.coerce.number().int().min(0).max(1000).default(150),
  /** After Owy speaks on the Mac, its mic stays deaf this long more: the room's echo (no echo cancellation). */
  COMPANION_HOST_SPEAKER_TAIL_MS: z.coerce.number().int().min(0).max(2000).default(300),
  /** `host` = the Mac's own output (COMPANION_HOST_SPEAKER), played with ffmpeg; macOS only, not in Docker. */
  COMPANION_AUDIO_OUTPUT: z.enum(["device", "laptop", "host"]).default("device"),
  COMPANION_SETTINGS_PORT: z.coerce.number().int().min(1).max(65535).default(3313),
  /** Interface the web bridge and the settings UI listen on. The Docker image sets 0.0.0.0 and publishes both on the host's 127.0.0.1 only. */
  COMPANION_BIND_HOST: z.string().default("127.0.0.1"),
  COMPANION_LOG_DIR: z.string().optional(),
  COMPANION_LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type BridgeConfig = z.infer<typeof EnvSchema> & { devices: DeviceSpec[] };

/** Parses `id@host[:port][#psk]` (shorthand) or a JSON array of DeviceSpec. */
export function parseDevices(raw: string): DeviceSpec[] {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return [];

  if (trimmed.startsWith("[")) {
    return z.array(DeviceSpecSchema).parse(JSON.parse(trimmed));
  }

  return trimmed
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map((entry) => {
      const match = /^(?<id>[^@#]+)@(?<host>[^:#]+)(?::(?<port>\d+))?(?:#(?<psk>.+))?$/.exec(entry);
      if (!match?.groups) {
        throw new Error(`COMPANION_DEVICES: entrada inválida "${entry}" (esperado id@host[:port][#psk])`);
      }
      return DeviceSpecSchema.parse({
        id: match.groups.id,
        host: match.groups.host,
        port: match.groups.port ? Number(match.groups.port) : undefined,
        psk: match.groups.psk ?? null,
      });
    });
}

/** Firmware secrets file the `#secrets` psk shorthand reads `api_key` from (never logged). */
export const FIRMWARE_SECRETS_PATH = path.resolve(import.meta.dirname, "../../firmware/secrets.yaml");

/** Resolves the `#secrets` shorthand to the firmware's `api_key`, so the key never has to be typed or exported. */
export function resolveDevicePsk(psk: string | null, secretsPath = FIRMWARE_SECRETS_PATH): string | null {
  if (psk !== "secrets") return psk;
  let text: string;
  try {
    text = readFileSync(secretsPath, "utf8");
  } catch {
    throw new Error(`COMPANION_DEVICES usa #secrets pero no se pudo leer ${secretsPath}`);
  }
  const match = /^\s*api_key:\s*["']?([^"'\n#]+)["']?/m.exec(text);
  if (!match) throw new Error(`No hay api_key en ${secretsPath}`);
  return match[1].trim();
}

/** `owy/.env.local` — the same file `eve dev` reads; existing variables win. */
export const ENV_LOCAL_PATH = path.resolve(import.meta.dirname, "../../../.env.local");

/** Loads `owy/.env.local` into process.env when present (Node ≥ 21 built-in, never overrides). */
export function loadEnvLocal(file = ENV_LOCAL_PATH): boolean {
  try {
    process.loadEnvFile(file);
    return true;
  } catch {
    return false;
  }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): BridgeConfig {
  if (env === process.env) loadEnvLocal();
  const parsed = EnvSchema.parse(env);
  const devices = parseDevices(parsed.COMPANION_DEVICES).map((device) => ({
    ...device,
    psk: resolveDevicePsk(device.psk),
  }));
  return { ...parsed, devices };
}
