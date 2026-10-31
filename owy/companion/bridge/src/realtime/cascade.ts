import { readFileSync } from "node:fs";
import path from "node:path";
import {
  createGateway,
  experimental_streamSpeech,
  generateText,
  stepCountIs,
  transcribe,
  type ToolSet,
} from "ai";
import { DEVICE_SAMPLE_RATE, GEMINI_OUTPUT_SAMPLE_RATE, Pcm16Resampler, fromWav } from "../audio/pcm";
import type { Logger } from "../log";

/**
 * The voice loop without a realtime model: the turn is recorded by the bridge,
 * then transcribed, answered and spoken with plain gateway calls. Slower than
 * Gemini Live (a few seconds more) but it needs no long-lived socket, so it is
 * what answers when the realtime tiers cannot connect, or a live socket dies
 * mid-turn. Every call has a deadline and gateway-side model fallbacks.
 */
export interface Cascade {
  /** Speech → text, each transcription model in turn. "" = nothing intelligible. */
  transcribe(wav: Buffer, signal: AbortSignal): Promise<string>;
  /** The local brain's answer: the text model with this device's tools and the conversation so far (eve keeps its own). */
  answer(options: {
    text: string;
    history: { role: "user" | "assistant"; content: string }[];
    instructions: string;
    tools: ToolSet;
    signal: AbortSignal;
  }): Promise<string>;
  /** Streaming TTS as 16 kHz PCM16 (the device's rate), chunk by chunk as it is synthesized. */
  speak(text: string, signal: AbortSignal): AsyncIterable<Buffer>;
}

export interface GatewayCascadeOptions {
  apiKey?: string;
  transcribeModels: string[];
  ttsModel: string;
  ttsVoice: string;
  textModel: string;
  textFallbacks: string[];
  logger: Logger;
}

const TRANSCRIBE_TIMEOUT_MS = 8_000;
const ANSWER_TIMEOUT_MS = 20_000;
/** Visitors' words and voices: no retention at the provider. */
const ZDR = { gateway: { zeroDataRetention: true } };

export function gatewayCascade(options: GatewayCascadeOptions): Cascade {
  const gateway = createGateway(options.apiKey ? { apiKey: options.apiKey } : {});
  const log = options.logger;

  return {
    async transcribe(wav, signal) {
      let lastError: unknown = new Error("sin modelos de transcripción");
      for (const id of options.transcribeModels) {
        const started = Date.now();
        try {
          const result = await transcribe({
            model: gateway.transcriptionModel(id),
            audio: wav,
            maxRetries: 0,
            providerOptions: ZDR,
            abortSignal: AbortSignal.any([signal, AbortSignal.timeout(TRANSCRIBE_TIMEOUT_MS)]),
          });
          log.info(`cascada: ${id} transcribió en ${Date.now() - started} ms`);
          return result.text.trim();
        } catch (error) {
          if (signal.aborted) throw error;
          lastError = error;
          log.warn(`cascada: ${id} no transcribió`, error);
        }
      }
      throw lastError;
    },

    async answer({ text, history, instructions, tools, signal }) {
      const result = await generateText({
        model: gateway(options.textModel),
        system: instructions,
        messages: [...history, { role: "user", content: text }],
        tools,
        stopWhen: stepCountIs(5),
        maxRetries: 1,
        providerOptions: {
          gateway: { ...ZDR.gateway, ...(options.textFallbacks.length ? { models: options.textFallbacks } : {}) },
        },
        abortSignal: AbortSignal.any([signal, AbortSignal.timeout(ANSWER_TIMEOUT_MS)]),
      });
      return result.text.trim();
    },

    async *speak(text, signal) {
      const result = experimental_streamSpeech({
        model: gateway.speechModel(options.ttsModel),
        text,
        voice: options.ttsVoice,
        language: "es",
        outputFormat: { type: "audio/pcm", rate: GEMINI_OUTPUT_SAMPLE_RATE },
        abortSignal: signal,
      });
      let resampler: Pcm16Resampler | null = null;
      for await (const part of result.fullStream) {
        if (part.type === "error") throw part.error instanceof Error ? part.error : new Error(String(part.error));
        if (part.type !== "audio" || part.audio.length === 0) continue;
        if (part.audioFormat.type !== "audio/pcm") throw new Error(`TTS devolvió ${part.audioFormat.type}, no PCM`);
        resampler ??= new Pcm16Resampler(part.audioFormat.rate ?? GEMINI_OUTPUT_SAMPLE_RATE, DEVICE_SAMPLE_RATE);
        yield resampler.process(Buffer.from(part.audio));
      }
    },
  };
}

/** Lines the bridge says when the cascade itself cannot help, pre-rendered by `pnpm companion:clips`. */
export const FALLBACK_LINES = {
  offline: "Uy, me quedé sin internet. Probá en un ratito; la grilla está en la pantalla.",
  retry: "Perdón, no te entendí bien. ¿Me lo repetís?",
} as const;
export type FallbackClip = keyof typeof FALLBACK_LINES;

/** 16 kHz PCM of each pre-rendered fallback line that exists on disk (missing ones are skipped). */
export function loadFallbackClips(dir: string, logger: Logger): Partial<Record<FallbackClip, Buffer>> {
  const clips: Partial<Record<FallbackClip, Buffer>> = {};
  for (const id of Object.keys(FALLBACK_LINES) as FallbackClip[]) {
    try {
      const wav = fromWav(readFileSync(path.join(dir, `${id}.wav`)));
      if (wav.sampleRate !== DEVICE_SAMPLE_RATE || wav.channels !== 1) throw new Error(`${wav.sampleRate} Hz`);
      clips[id] = wav.pcm;
    } catch {
      logger.debug(`sin clip pregrabado "${id}"; ese aviso va como texto en pantalla`);
    }
  }
  return clips;
}
