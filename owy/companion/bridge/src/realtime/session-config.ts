import type { Experimental_RealtimeSessionConfig as RealtimeSessionConfig } from "ai";
import { DEVICE_SAMPLE_RATE, GEMINI_OUTPUT_SAMPLE_RATE } from "../audio/pcm";
import type { BridgeConfig } from "../config";
import type { RealtimeProvider } from "./models";

/**
 * What a realtime session is asked for, per provider: shared by the devices,
 * the browser sessions and the CLIs (netcheck, clips, text).
 */

/** Gemini Live (direct) takes the device's 16 kHz as-is; the AI Gateway's realtime endpoint wants 24 kHz PCM16. */
export function sessionInputRate(provider: RealtimeProvider | undefined): number {
  return provider?.provider === "gateway" ? GEMINI_OUTPUT_SAMPLE_RATE : DEVICE_SAMPLE_RATE;
}

export function buildSessionConfig(options: {
  provider: RealtimeProvider;
  instructions: string;
  /** Absent: the provider's own default voice. */
  voice?: string;
  tools: RealtimeSessionConfig["tools"];
  modality: "audio" | "text";
}): RealtimeSessionConfig {
  const base: RealtimeSessionConfig = {
    instructions: options.instructions,
    outputModalities: [options.modality],
    inputAudioFormat: { type: "audio/pcm", rate: sessionInputRate(options.provider) },
    outputAudioFormat: { type: "audio/pcm", rate: GEMINI_OUTPUT_SAMPLE_RATE },
    inputAudioTranscription: {},
    outputAudioTranscription: {},
    tools: options.tools,
  };
  if (options.modality === "audio" && options.voice) base.voice = options.voice;

  const googleOptions = geminiLiveOptions(options.provider.modelId);
  if (options.provider.provider === "google") {
    // Non-`google` keys are merged verbatim into the Gemini `setup` message.
    base.providerOptions = {
      realtimeInputConfig: { automaticActivityDetection: { silenceDurationMs: 600 } },
      contextWindowCompression: { slidingWindow: {} },
      sessionResumption: {},
      ...(googleOptions ? { google: googleOptions } : {}),
    };
  } else if (isGeminiModel(options.provider.modelId)) {
    // The gateway rejects `turnDetection` and Gemini-native setup keys for Gemini Live
    // (its own activity detection applies); `providerOptions.google` does pass through.
    if (googleOptions) base.providerOptions = { google: googleOptions };
  } else {
    // ElevenLabs' realtime models reject `server_vad` ("use semantic_vad or null").
    base.turnDetection = /(^|\/)eleven-/.test(options.provider.modelId ?? "")
      ? { type: "semantic-vad" }
      : { type: "server-vad", silenceDurationMs: 600 };
  }
  return base;
}

/** `google/gemini-3.8-live` through the gateway, or a bare Gemini id on the direct provider. */
export function isGeminiModel(modelId: string | undefined): boolean {
  return /(^|\/)gemini-/.test(modelId ?? "");
}

/** Gemini 3.8 Live only speaks audio (`outputModalities: ["text"]` is rejected); transcripts carry the text. */
export function isAudioOnlyModel(modelId: string | undefined): boolean {
  return /^gemini-\d+\.\d+-live/.test(modelId?.split("/").at(-1) ?? "");
}

/**
 * Gemini 3.8 Live defaults to asynchronous (`NON_BLOCKING`) tool calls; the
 * bridge's turn machine expects the classic blocking flow (call → output →
 * spoken answer), so pin `BLOCKING` on the latency-optimised model. The
 * extended-thinking variant only accepts `NON_BLOCKING`, so it is left alone
 * (the provider adds its mandatory `thinkingLevel: "low"` by itself).
 */
export function geminiLiveOptions(modelId: string | undefined): { defaultToolBehavior: "BLOCKING" } | undefined {
  const name = modelId?.split("/").at(-1) ?? "";
  return /^gemini-\d+\.\d+-live$/.test(name) ? { defaultToolBehavior: "BLOCKING" } : undefined;
}

/**
 * The voice a tier speaks with: its own (`spec#voice` in COMPANION_REALTIME_FALLBACKS), Owy's
 * (COMPANION_VOICE) on Gemini, COMPANION_FALLBACK_VOICE on OpenAI; anything else keeps the
 * provider's default (Gemini and OpenAI voice names don't exist elsewhere).
 */
export function voiceFor(
  provider: RealtimeProvider,
  config: Pick<BridgeConfig, "COMPANION_VOICE" | "COMPANION_FALLBACK_VOICE">
): string | undefined {
  if (provider.voice) return provider.voice;
  if (isGeminiModel(provider.modelId)) return config.COMPANION_VOICE;
  if (/(^|\/)gpt-/.test(provider.modelId)) return config.COMPANION_FALLBACK_VOICE;
  return undefined;
}
