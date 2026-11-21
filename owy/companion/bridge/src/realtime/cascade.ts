import { readFileSync } from "node:fs";
import path from "node:path";
import {
  createGateway,
  experimental_streamSpeech,
  generateSpeech,
  generateText,
  stepCountIs,
  transcribe,
  type ToolSet,
} from "ai";
import { DEVICE_SAMPLE_RATE, GEMINI_OUTPUT_SAMPLE_RATE, Pcm16Resampler, fromWav } from "../audio/pcm";
import { splitLines } from "../expression";
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
  /**
   * `text` in Owy's voice as 16 kHz PCM16 (the device's rate), a sentence at a time: the
   * next one is synthesized while the current one plays.
   */
  speak(text: string, signal: AbortSignal): AsyncIterable<Buffer>;
}

/** The AI SDK calls the cascade makes (a test swaps them). */
export interface CascadeCalls {
  transcribe: typeof transcribe;
  generateText: typeof generateText;
  generateSpeech: typeof generateSpeech;
  streamSpeech: typeof experimental_streamSpeech;
}

export interface GatewayCascadeOptions {
  apiKey?: string;
  /** Tried in order; each must keep zero data retention (they hear the visitor). */
  transcribeModels: string[];
  /** Per sentence through `generateSpeech`, tried in order, in `speechVoice` (Owy's own: Kore). */
  speechModels: string[];
  speechVoice: string;
  /**
   * The last voice that speaks before the text on screen: a model the gateway streams
   * (only ElevenLabs carries `websocket-speech`), in its own default voice. Empty = none.
   */
  speechStreamModel?: string;
  textModel: string;
  textFallbacks: string[];
  logger: Logger;
  calls?: Partial<CascadeCalls>;
}

const TRANSCRIBE_TIMEOUT_MS = 8_000;
const ANSWER_TIMEOUT_MS = 20_000;
/** One sentence of speech; past this the next model gets the sentence. */
const SPEECH_TIMEOUT_MS = 8_000;
/** After the first sentence (alone, to start fast), sentences travel in chunks about this long. */
const SPEECH_CHUNK_CHARS = 220;
/** Visitors' words and voices: no retention at the provider. */
const ZDR = { gateway: { zeroDataRetention: true } };

/** The first sentence alone (the first audio comes sooner), then the rest in chunks of whole sentences. */
export function speechChunks(text: string): string[] {
  const sentences = splitLines(text, true).map((line) => line.text);
  if (sentences.length === 0) return text.trim() ? [text.trim()] : [];
  const chunks = [sentences[0]];
  let current = "";
  for (const sentence of sentences.slice(1)) {
    if (current && current.length + sentence.length + 1 > SPEECH_CHUNK_CHARS) {
      chunks.push(current);
      current = "";
    }
    current = current ? `${current} ${sentence}` : sentence;
  }
  if (current) chunks.push(current);
  return chunks;
}

/** A synthesized file as 16 kHz mono PCM16: WAV, or raw PCM16 (`audio/pcm`, `audio/L16;rate=…`). */
export function speechPcm(audio: { uint8Array: Uint8Array; mediaType: string }): Buffer {
  const bytes = Buffer.from(audio.uint8Array);
  let pcm: Buffer;
  let rate: number;
  if (bytes.toString("ascii", 0, 4) === "RIFF") {
    const wav = fromWav(bytes);
    if (wav.channels !== 1) throw new Error(`TTS devolvió ${wav.channels} canales`);
    pcm = wav.pcm;
    rate = wav.sampleRate;
  } else if (/pcm|l16/i.test(audio.mediaType)) {
    pcm = bytes;
    rate = Number(/rate=(\d+)/i.exec(audio.mediaType)?.[1] ?? GEMINI_OUTPUT_SAMPLE_RATE);
  } else throw new Error(`TTS devolvió ${audio.mediaType}, ni WAV ni PCM`);
  return rate === DEVICE_SAMPLE_RATE ? pcm : new Pcm16Resampler(rate, DEVICE_SAMPLE_RATE).process(pcm);
}

export function gatewayCascade(options: GatewayCascadeOptions): Cascade {
  const gateway = createGateway(options.apiKey ? { apiKey: options.apiKey } : {});
  const log = options.logger;
  const calls: CascadeCalls = {
    transcribe,
    generateText,
    generateSpeech,
    streamSpeech: experimental_streamSpeech,
    ...options.calls,
  };

  /** One chunk in Owy's voice: each speech model in turn. */
  async function synthesize(text: string, signal: AbortSignal): Promise<Buffer> {
    let lastError: unknown = new Error("sin modelos de voz");
    for (const id of options.speechModels) {
      const started = Date.now();
      try {
        const result = await calls.generateSpeech({
          model: gateway.speechModel(id),
          text,
          voice: options.speechVoice,
          language: "es",
          outputFormat: "wav",
          maxRetries: 0,
          providerOptions: ZDR,
          abortSignal: AbortSignal.any([signal, AbortSignal.timeout(SPEECH_TIMEOUT_MS)]),
        });
        const pcm = speechPcm(result.audio);
        log.debug(`cascada: ${id} dijo ${text.length} caracteres en ${Date.now() - started} ms`);
        return pcm;
      } catch (error) {
        if (signal.aborted) throw error;
        lastError = error;
        log.warn(`cascada: ${id} no habló`, error);
      }
    }
    throw lastError;
  }

  /** The rest of the answer through the streaming model (another voice): better than silence. */
  async function* stream(text: string, signal: AbortSignal): AsyncGenerator<Buffer> {
    if (!options.speechStreamModel) throw new Error("sin voz de respaldo");
    // ponytail: no zero data retention here (no provider offers it for this model); it reads
    // Owy's own answer, not the visitor's voice.
    const result = calls.streamSpeech({
      model: gateway.speechModel(options.speechStreamModel),
      text,
      language: "es",
      outputFormat: { type: "audio/pcm", rate: GEMINI_OUTPUT_SAMPLE_RATE },
      abortSignal: AbortSignal.any([signal, AbortSignal.timeout(ANSWER_TIMEOUT_MS)]),
    });
    let resampler: Pcm16Resampler | null = null;
    for await (const part of result.fullStream) {
      if (part.type === "error") throw part.error instanceof Error ? part.error : new Error(String(part.error));
      if (part.type !== "audio" || part.audio.length === 0) continue;
      if (part.audioFormat.type !== "audio/pcm") throw new Error(`TTS devolvió ${part.audioFormat.type}, no PCM`);
      resampler ??= new Pcm16Resampler(part.audioFormat.rate ?? GEMINI_OUTPUT_SAMPLE_RATE, DEVICE_SAMPLE_RATE);
      yield resampler.process(Buffer.from(part.audio));
    }
  }

  return {
    async transcribe(wav, signal) {
      let lastError: unknown = new Error("sin modelos de transcripción");
      for (const id of options.transcribeModels) {
        const started = Date.now();
        try {
          const result = await calls.transcribe({
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
      const result = await calls.generateText({
        model: gateway(options.textModel),
        instructions,
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
      const chunks = speechChunks(text);
      // Each chunk starts synthesizing while the one before it plays; a settled result is kept,
      // so a prefetch that fails is never an unhandled rejection.
      const start = (chunk: string) =>
        synthesize(chunk, signal).then(
          (pcm) => ({ pcm }),
          (error: unknown) => ({ error })
        );
      let next = chunks.length ? start(chunks[0]) : null;
      for (const index of chunks.keys()) {
        const result = await next!;
        next = index + 1 < chunks.length ? start(chunks[index + 1]) : null;
        if ("pcm" in result) {
          yield result.pcm;
          continue;
        }
        if (signal.aborted) throw result.error;
        // Owy's voice is gone: the rest of the answer in the streaming voice, else the caller shows the text.
        log.warn("cascada: sin la voz de Owy; el resto va con la voz de respaldo");
        yield* stream(chunks.slice(index).join(" "), signal);
        return;
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
