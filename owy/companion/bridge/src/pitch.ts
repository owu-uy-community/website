import { createGateway, generateText, Output } from "ai";
import { z } from "zod";
import { BYTES_PER_SAMPLE, DEVICE_SAMPLE_RATE, rmsLevel, toWav } from "./audio/pcm";
import { systemClock, type ClockTimer, type RuntimeClock } from "./clock";
import type { Logger } from "./log";

/**
 * Modo pitch: at the open space's marketplace the knob sits in the middle of
 * the room; a person taps, pitches a talk, taps again. The bridge records the
 * pitch itself (never through the realtime model, whose own end-of-speech
 * detection would cut it at the first pause), then turns the audio into a
 * card in one gateway call, asks once for what it missed (the topic, the
 * name) and places the card. `pitch-flow.ts` is the workflow; this file is
 * the recorder, the extractor and the words — the parts that need no device.
 */

/** A pitch, or the answer to one of Owy's questions about it. */
export type PitchKind = "pitch" | "answer";
/** What Owy may ask for when the pitch did not say it. */
export type PitchField = "topic" | "name";

export interface PitchLimits {
  /** Silence after speech that ends the recording on its own. */
  silenceMs: number;
  /** Hard cap on a recording. */
  maxMs: number;
  /** Less speech than this is a mis-tap, not a pitch. */
  minSpeechMs: number;
  /** Nobody started talking this long after the mic opened: the recording ends (an answer that never came). */
  noSpeechMs?: number;
}

export const PITCH_LIMITS: Record<PitchKind, PitchLimits> = {
  pitch: { silenceMs: 10_000, maxMs: 120_000, minSpeechMs: 2_000 },
  answer: { silenceMs: 3_000, maxMs: 15_000, minSpeechMs: 300, noSpeechMs: 8_000 },
};

/** Frames (20 ms) over the threshold in a row before the recorder believes it is speech, not a buzz. */
const SPEECH_FRAMES = 3;
const BYTES_PER_MS = (DEVICE_SAMPLE_RATE * BYTES_PER_SAMPLE) / 1000;

export interface PitchRecorderOptions {
  /** Picks the default limits; absent = pass `limits` (a voice turn's recorder). */
  kind?: PitchKind;
  clock?: RuntimeClock;
  /** RMS (0..1) a 20 ms frame must exceed to count as speech; the knob's mic has AGC. */
  rmsThreshold?: number;
  limits?: PitchLimits;
  /** Drop the first `ms` of audio: a cue playing on the laptop leaks into the room mic. */
  ignoreMs?: number;
  /** Someone started talking (once). */
  onSpeechStart(): void;
  /** The recording ended on its own (once), or with `repeatSilence` the person paused (every pause). */
  onDone(reason: "silence" | "cap"): void;
  /**
   * A voice turn's recorder: a pause reports `onDone("silence")` but recording
   * goes on (the person may continue); only the cap or `stop()` ends it.
   */
  repeatSilence?: boolean;
}

/** Buffers 16 kHz PCM16 mic frames and watches for speech, silence and the cap (pitches and voice turns). */
export class PitchRecorder {
  readonly limits: PitchLimits;
  private readonly clock: RuntimeClock;
  private readonly threshold: number;
  private readonly chunks: Buffer[] = [];
  private bytes = 0;
  private loudFrames = 0;
  private speechBytes = 0;
  private spoke = false;
  private pausing = false;
  private peakLevel = 0;
  private startedAt = 0;
  private silenceTimer: ClockTimer | null = null;
  private capTimer: ClockTimer | null = null;
  private stopped = false;

  constructor(private readonly options: PitchRecorderOptions) {
    this.clock = options.clock ?? systemClock;
    this.threshold = options.rmsThreshold ?? 0.012;
    this.limits = options.limits ?? PITCH_LIMITS[options.kind ?? "pitch"];
  }

  start(): void {
    this.startedAt = this.clock.now();
    this.capTimer = this.clock.setTimeout(() => this.finish("cap"), this.limits.maxMs);
    // The silence timer doubles as "nobody answered" until the first word.
    if (this.limits.noSpeechMs)
      this.silenceTimer = this.clock.setTimeout(() => this.finish("silence"), this.limits.noSpeechMs + (this.options.ignoreMs ?? 0));
  }

  push(pcm16k: Buffer): void {
    if (this.stopped || pcm16k.length === 0) return;
    if (this.clock.now() - this.startedAt < (this.options.ignoreMs ?? 0)) return;
    this.chunks.push(pcm16k);
    this.bytes += pcm16k.length;
    const level = rmsLevel(pcm16k);
    this.peakLevel = Math.max(this.peakLevel, level);
    if (level <= this.threshold) {
      this.loudFrames = 0;
      return;
    }
    this.loudFrames++;
    if (!this.spoke && this.loudFrames >= SPEECH_FRAMES) {
      this.spoke = true;
      this.options.onSpeechStart();
    }
    if (!this.spoke) return;
    this.pausing = false;
    this.speechBytes += pcm16k.length;
    // Silence is measured from the last frame with a voice in it.
    if (this.silenceTimer) this.clock.clearTimeout(this.silenceTimer);
    this.silenceTimer = this.clock.setTimeout(() => this.finish("silence"), this.limits.silenceMs);
  }

  /** Stops watching; what was recorded stays available. */
  stop(): void {
    this.stopped = true;
    if (this.silenceTimer) this.clock.clearTimeout(this.silenceTimer);
    if (this.capTimer) this.clock.clearTimeout(this.capTimer);
    this.silenceTimer = this.capTimer = null;
  }

  /** The second tap's buzz lands in the last frames: drop them before transcribing. */
  trimTailMs(ms: number): void {
    let toDrop = Math.round(ms * BYTES_PER_MS);
    while (toDrop > 0 && this.chunks.length > 0) {
      const last = this.chunks[this.chunks.length - 1];
      if (last.length <= toDrop) {
        this.chunks.pop();
        toDrop -= last.length;
        this.bytes -= last.length;
      } else {
        this.chunks[this.chunks.length - 1] = last.subarray(0, last.length - toDrop);
        this.bytes -= toDrop;
        toDrop = 0;
      }
    }
  }

  /** Someone spoke and has been quiet for `silenceMs` since (or the recording ended). */
  get pausedAfterSpeech(): boolean {
    return this.spoke && (this.pausing || this.stopped);
  }

  get heardSpeech(): boolean {
    return this.spoke;
  }

  get durationMs(): number {
    return this.bytes / BYTES_PER_MS;
  }

  get speechMs(): number {
    return this.speechBytes / BYTES_PER_MS;
  }

  get peak(): number {
    return this.peakLevel;
  }

  get pcm(): Buffer {
    return Buffer.concat(this.chunks);
  }

  wav(): Buffer {
    return toWav(this.pcm, DEVICE_SAMPLE_RATE);
  }

  private finish(reason: "silence" | "cap"): void {
    if (this.stopped) return;
    if (reason === "silence" && this.options.repeatSilence) {
      this.silenceTimer = null;
      this.pausing = true;
      this.options.onDone(reason);
      return;
    }
    this.stop();
    this.options.onDone(reason);
  }
}

// ── Audio → card ──────────────────────────────────────────────────────────

export const PitchCardSchema = z.object({
  /** What was said, faithfully; empty when nothing intelligible was said. */
  transcript: z.string(),
  /** `pitch`: a talk with a clear topic · `unclear`: wants to propose something, the topic is not clear · `not_pitch`: a greeting, a test, noise. */
  kind: z.enum(["pitch", "unclear", "not_pitch"]),
  title: z.string().nullable(),
  /** Only when the person introduced themselves. */
  speaker: z.string().nullable(),
  needsTV: z.boolean(),
  needsWhiteboard: z.boolean(),
  /** One line on what it is about. */
  description: z.string().nullable(),
  /** One to four keywords. */
  topics: z.array(z.string()),
});
export type PitchCard = z.infer<typeof PitchCardSchema>;

/** What an answer to «¿de qué va?» / «¿cómo te llamás?» added. */
export const PitchAnswerSchema = z.object({
  title: z.string().nullable(),
  speaker: z.string().nullable(),
  description: z.string().nullable(),
});
export type PitchAnswer = z.infer<typeof PitchAnswerSchema>;

export interface AnswerContext {
  field: PitchField;
  /** The question Owy asked, as said. */
  question: string;
  /** The pitch it is about (so "lo de Rust que te dije" resolves). */
  transcript: string;
}

export interface PitchExtractor {
  card(wav: Buffer, signal: AbortSignal): Promise<PitchCard>;
  answer(wav: Buffer, context: AnswerContext, signal: AbortSignal): Promise<PitchAnswer>;
}

/** The gateway's own retries plus a slow 60 s clip must still fit a visitor's patience. */
const EXTRACT_TIMEOUT_MS = 20_000;

const cardPrompt = (eventName: string) =>
  `Sos el asistente del mercado de ideas del open space de ${eventName}. Te llega una persona proponiendo una charla (entre 20 y 60 segundos), en español rioplatense (a veces en inglés), grabada con un micrófono en una sala con ruido: el audio, o su transcripción.

Devolvé solo el objeto pedido:
- transcript: lo que dijo, fiel, sin inventar ni completar; vacío si no hay habla inteligible.
- kind: "pitch" si propone una charla, taller, debate o tema y se entiende de qué; "unclear" si quiere proponer algo pero no se entiende el tema (se cortó, habló de otra cosa, solo dijo "quiero dar una charla"); "not_pitch" para saludos, pruebas de micrófono, preguntas sueltas o ruido.
- title: un título corto (hasta 60 caracteres) como iría en la card, fiel al tema aunque la persona no lo diga como título; null si kind no es "pitch".
- speaker: SOLO si la persona dice su nombre ("soy Ana", "me llamo…", "mi nombre es…"); si no, null. No inventes nombres.
- needsTV / needsWhiteboard: true solo si lo pide explícitamente (proyector, tele, pantalla / pizarra, pizarrón).
- description: una línea (hasta 140 caracteres) de qué va la charla, en tercera persona; null si no se sabe.
- topics: entre una y cuatro palabras clave en minúsculas; vacío si no es un pitch.`;

const answerPrompt = ({ question, transcript }: AnswerContext) =>
  `En el mercado de ideas de un open space, Owy le preguntó a una persona «${question}» sobre la charla que acaba de proponer. Te llega su respuesta (el audio, o su transcripción), en español rioplatense, con ruido de sala. Lo que había dicho antes: «${transcript.slice(0, 1500)}».

Devolvé solo el objeto pedido, con lo que dice ESTA respuesta:
- title: un título corto (hasta 60 caracteres) para la charla, si la respuesta dice de qué va; si no, null.
- speaker: su nombre tal como se presenta (capitalizado, con apellido si lo dice), solo si lo dice; si no, null. No inventes nombres.
- description: una línea (hasta 140 caracteres) de qué va la charla, en tercera persona, solo si la respuesta lo cuenta; si no, null.`;

export interface GatewayPitchExtractorOptions {
  apiKey?: string;
  /** Audio-capable model: one call per recording, the audio in, the object out. */
  model: string;
  fallbacks?: string[];
  eventName: string;
  /**
   * Second road when the audio model fails (down, timed out): plain
   * transcription (the cascade's models) and a text model on the transcript.
   */
  transcribe?: (wav: Buffer, signal: AbortSignal) => Promise<string>;
  textModel?: string;
  textFallbacks?: string[];
  logger?: Logger;
}

export function gatewayPitchExtractor(options: GatewayPitchExtractorOptions): PitchExtractor {
  const gateway = createGateway({ apiKey: options.apiKey });
  const ask = async <T>(
    input: { wav: Buffer } | { text: string },
    schema: z.ZodType<T>,
    prompt: string,
    model: string,
    fallbacks: string[] | undefined,
    signal: AbortSignal
  ): Promise<T> => {
    const { output } = await generateText({
      model: gateway(model),
      output: Output.object({ schema }),
      temperature: 0,
      maxRetries: 1,
      messages: [
        {
          role: "user",
          content: [
            "wav" in input
              ? { type: "file", data: input.wav, mediaType: "audio/wav" }
              : { type: "text", text: `Transcripción:\n${input.text || "(nada inteligible)"}` },
            { type: "text", text: prompt },
          ],
        },
      ],
      providerOptions: {
        gateway: {
          ...(fallbacks?.length ? { models: fallbacks } : {}),
          // A visitor's voice: no retention at the provider.
          zeroDataRetention: true,
        },
      },
      abortSignal: AbortSignal.any([signal, AbortSignal.timeout(EXTRACT_TIMEOUT_MS)]),
    });
    return output;
  };
  const extract = async <T>(wav: Buffer, schema: z.ZodType<T>, prompt: string, signal: AbortSignal): Promise<T> => {
    try {
      return await ask({ wav }, schema, prompt, options.model, options.fallbacks, signal);
    } catch (error) {
      if (signal.aborted || !options.transcribe || !options.textModel) throw error;
      options.logger?.warn("pitch: el modelo de audio no respondió; pruebo transcripción + texto", error);
      const text = await options.transcribe(wav, signal);
      return ask({ text }, schema, prompt, options.textModel, options.textFallbacks, signal);
    }
  };
  return {
    card: (wav, signal) => extract(wav, PitchCardSchema, cardPrompt(options.eventName), signal),
    answer: (wav, context, signal) => extract(wav, PitchAnswerSchema, answerPrompt(context), signal),
  };
}

// ── Words ──────────────────────────────────────────────────────────────────

/** A text message the realtime model must say verbatim: the bridge's, not the visitor's. */
export const SCRIPT_PREFIX = "[GUION] ";

export const PITCH_LINES = {
  listen: "Te escucho. Contame tu charla y tocá de nuevo cuando termines.",
  askTopic: "¿De qué va tu charla, en pocas palabras?",
  askName: "¿Cómo te llamás?",
  empty: "No escuché una propuesta. Tocá y contame tu charla.",
  unclear: "No me quedó claro el tema. Tocá y contame de nuevo de qué va tu charla.",
  full: "Justo ahora no queda lugar libre en la grilla; hablá con el staff.",
  failed: "Perdón, se me trabó la propuesta. Probá de nuevo o contale al staff.",
  unconfigured: "El modo pitch no está configurado en este bridge.",
} as const;
export type PitchLine = keyof typeof PITCH_LINES;

/** The fixed lines pre-rendered by `pnpm companion:clips` (public/companion-audio/clips/<id>.wav). */
export const PITCH_CLIPS: Partial<Record<PitchLine, string>> = {
  listen: "pitch-listen",
  askTopic: "pitch-ask-topic",
  askName: "pitch-ask-name",
  empty: "pitch-empty",
  unclear: "pitch-unclear",
  full: "pitch-full",
  failed: "pitch-failed",
};

export const QUESTION: Record<PitchField, PitchLine> = { topic: "askTopic", name: "askName" };

/** What Owy says once the card is on the board. */
export function announcementText(card: {
  title: string;
  speaker?: string | null;
  room?: string | null;
  timeSlot?: string | null;
}): string {
  const start = card.timeSlot?.split(" - ")[0]?.trim();
  const where = [card.room ? `en ${card.room}` : "", start ? `a las ${start}` : ""].filter(Boolean).join(" ");
  return `¡Listo${card.speaker ? `, ${card.speaker}` : ""}! Tu charla «${card.title}» queda ${where || "en la grilla"}.`;
}

/** The device tags a pitch run with `wake_word: "pitch"` (an answer to Owy's question is "pitch-answer"). */
export function isPitchRun(request: { wakeWordPhrase?: string | null }): boolean {
  return /^pitch/i.test(request.wakeWordPhrase ?? "");
}
