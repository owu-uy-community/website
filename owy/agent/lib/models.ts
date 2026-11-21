/**
 * Every model Owy uses, by AI Gateway id: the one place to bump them. The eve agent
 * (agent.ts, the evals), the companion bridge's defaults (companion/bridge/src/config.ts)
 * and its pitch duplicate check read this. Checked against the gateway catalog
 * (`GET https://ai-gateway.vercel.sh/v1/models`) on 2026-11-01; `pnpm companion:netcheck`
 * tries each one through the real code paths.
 */
export const MODELS = {
  /** eve's brain: Slack, Telegram and the companion's eve channel. */
  brain: "anthropic/claude-sonnet-5.5",
  brainFallbacks: ["anthropic/claude-sonnet-5", "anthropic/claude-haiku-5.5"],

  /**
   * Owy's ears and mouth, tried in order. `#voice` is the tier's voice; without it the provider
   * picks its default. Gemini 3.8 Live with Kore is Agustín's choice (2026-10-31 voice eval).
   * gpt-realtime-2, not 2.1: only 2 carries the catalog's `websocket-realtime` tag.
   */
  realtime: "gateway:google/gemini-3.8-live",
  realtimeVoice: "Kore",
  realtimeFallbacks: ["gateway:openai/gpt-realtime-2#marin", "gateway:spacexai/grok-voice-3.0"],

  /**
   * The cascade (no realtime model answers): it hears the visitor, so every transcription
   * model must keep zero data retention on every provider (catalog `zdr: all`).
   */
  transcribe: ["mistral/voxtral-small-transcribe-3", "microsoft/mai-transcribe-2", "spacexai/grok-stt"],
  /** Per sentence through `generateSpeech`, in Owy's own voice (streaming speech only routes ElevenLabs). */
  speech: ["google/gemini-3.8-flash-tts", "google/gemini-3.8-flash-lite-tts"],
  /** The last voice that speaks before the text on screen: another voice, but it streams. */
  speechStream: "elevenlabs/eleven-flash-v2.5",
  /** The local brain's answer in the cascade, then gateway fallbacks. */
  text: "google/gemini-3.8-flash",
  textFallbacks: ["anthropic/claude-haiku-5.5", "google/gemini-3.5-flash"],

  /** Faces while Owy talks: one choice question per sentence. */
  expression: "typesafe-ai/jev",

  /** Modo pitch: audio → card in one multimodal call, a hedge for the tail, gateway fallbacks. */
  pitch: "google/gemini-3.8-flash",
  pitchFallbacks: ["google/gemini-3.5-flash"],
  pitchHedge: "google/gemini-3.5-flash-lite",
  /** «Is this pitch already on the board?»: jev decides, Luna re-decides when jev is unsure, d1 on errors. */
  duplicate: { primary: "typesafe-ai/jev", unsure: "openai/gpt-6-luna-decisions", failover: "liquid/d1" },

  /** The evals' judge. */
  judge: "typesafe-ai/jev",
} as const;

/** The 14 female Gemini Live voices Agustín listened to (2026-10-31); Kore is Owy's. */
export const GEMINI_VOICES = [
  "Kore",
  "Zephyr",
  "Leda",
  "Aoede",
  "Callirrhoe",
  "Autonoe",
  "Despina",
  "Erinome",
  "Laomedeia",
  "Achernar",
  "Gacrux",
  "Pulcherrima",
  "Vindemiatrix",
  "Sulafat",
] as const;
