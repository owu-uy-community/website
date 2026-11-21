import { createGateway, experimental_decide, generateText, Output } from "ai";
import { z } from "zod";
import { BYTES_PER_SAMPLE, DEVICE_SAMPLE_RATE, rmsLevel, toWav } from "./audio/pcm";
import { systemClock, type ClockTimer, type RuntimeClock } from "./clock";
import type { Logger } from "./log";
import { MODELS } from "../../../agent/lib/models";

/**
 * Modo pitch: at the open space's marketplace the knob sits in the middle of
 * the room; a person taps, pitches a talk, taps again. The bridge records the
 * pitch itself (never through the realtime model, whose own end-of-speech
 * detection would cut it at the first pause), then turns the audio into a
 * card in one gateway call, asks once for what it missed (the topic or a
 * title in the person's words, the name) and places the card. The speaker
 * may be someone else the person puts forward. `pitch-flow.ts` is the
 * workflow; this file is the recorder, the extractor and the words — the
 * parts that need no device.
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
  // A tap with a voice in it goes to the model, which tells a pitch from a greeting or noise
  // (the level detector undercounts a lav that has no AGC); only a near-silent tap stops here.
  pitch: { silenceMs: 10_000, maxMs: 120_000, minSpeechMs: 800 },
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
  /** The title is the person's own words (a title, or the topic in a few words), not one the model put together from a long pitch. */
  titleSaid: z.boolean(),
  /** Who gives the talk: the person, only when they say their name, or someone they put forward by name. */
  speaker: z.string().nullable(),
  /** The speaker is someone else, put forward by the person talking. */
  nominated: z.boolean(),
  needsTV: z.boolean(),
  needsWhiteboard: z.boolean(),
  /** One line on what it is about. */
  description: z.string().nullable(),
  /** One to four keywords. */
  topics: z.array(z.string()),
  /** «Confirma y comenta»: Owy's warm sentence about the talk, written in the same call (no second model on the way). */
  reaction: z.string().nullable(),
  /** The board is public and live: false for something offensive, a joke at someone's expense or spam (same call, no extra time). */
  appropriate: z.boolean(),
});
export type PitchCard = z.infer<typeof PitchCardSchema>;

/** What an answer to «¿de qué va?» / «¿cómo te llamás?» added. */
export const PitchAnswerSchema = z.object({
  title: z.string().nullable(),
  speaker: z.string().nullable(),
  nominated: z.boolean(),
  description: z.string().nullable(),
  appropriate: z.boolean(),
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
  `Sos el asistente del mercado de ideas del open space de ${eventName}. Te llega una persona proponiendo una charla (entre 20 y 60 segundos), suya o de otra persona a la que postula para darla, en español rioplatense (a veces en inglés), grabada con un micrófono en una sala con ruido: el audio, o su transcripción.

La grabación puede empezar con Owy (la mascota) diciendo «${PITCH_LINES.listen}»: eso NO es parte del pitch, ignoralo; la persona puede hablar encima.

Devolvé solo el objeto pedido:
- transcript: lo que dijo la persona, fiel, sin inventar ni completar (sin la frase de Owy); vacío si no hay habla inteligible.
- kind: "pitch" si propone una charla, taller, debate o tema y se entiende de qué; "unclear" si quiere proponer algo pero no se entiende el tema (se cortó, habló de otra cosa, solo dijo "quiero dar una charla"); "not_pitch" para saludos, pruebas de micrófono, preguntas sueltas o ruido.
- title: un título corto (hasta 60 caracteres) como iría en la card, fiel al tema aunque la persona no lo diga como título; null si kind no es "pitch".
- titleSaid: true si la persona dijo el título ("se llama…", "el título sería…") o su tema concreto en pocas palabras ("quiero hablar de Kubernetes para gente que nunca lo usó"), aunque vos lo reescribas como título; false si nunca lo dijo así y lo tuviste que deducir de una explicación larga o difusa, o si title es null.
- speaker: quién da la charla: la propia persona SOLO si dice su nombre ("soy Ana", "me llamo…", "mi nombre es…"), u otra persona si la postula con nombre ("propongo que Juan Pérez cuente…", "estaría bueno que Ana hable de…"); si no se dice ningún nombre, null. No inventes nombres.
- nominated: true si el speaker es otra persona, postulada por quien habla; false si es la propia persona o si speaker es null.
- needsTV / needsWhiteboard: true solo si lo pide explícitamente (proyector, tele, pantalla / pizarra, pizarrón).
- description: una línea (hasta 140 caracteres) de qué va la charla, en tercera persona; null si no se sabe.
- topics: entre una y cuatro palabras clave en minúsculas; vacío si no es un pitch.
- reaction: si es un pitch, lo que Owy (la mascota de OWU: cálida, rioplatense) le diría a quien le está hablando en UNA frase corta (hasta 15 palabras) sobre el tema; sin repetir el título, sin sala ni horario, sin preguntas, sin emojis. null si no es un pitch.
- appropriate: false SOLO si es ofensivo, discriminatorio, sexual, una burla hacia alguien o spam/publicidad; un tema polémico pero serio, informal o con humor sano es true. Ante la duda, true.`;

const answerPrompt = ({ question, transcript }: AnswerContext) =>
  `En el mercado de ideas de un open space, Owy le preguntó a una persona «${question}» sobre la charla que acaba de proponer. Te llega su respuesta (el audio, o su transcripción), en español rioplatense, con ruido de sala. Lo que había dicho antes: «${transcript.slice(0, 1500)}».

Devolvé solo el objeto pedido, con lo que dice ESTA respuesta:
- title: un título corto (hasta 60 caracteres) para la charla, si la respuesta dice de qué va o cómo se llama (si dice el título, usalo tal cual); si no, null.
- speaker: quién da la charla, capitalizado y con apellido si lo dice: su nombre tal como se presenta, o el de otra persona si dice que la da otra ("la da mi compañera Lucía"); solo si lo dice; si no, null. No inventes nombres.
- nominated: true si el speaker es otra persona y no quien responde; si no, false.
- description: una línea (hasta 140 caracteres) de qué va la charla, en tercera persona, solo si la respuesta lo cuenta; si no, null.
- appropriate: false SOLO si la respuesta (un título o un nombre que iría en la card pública) es ofensiva, discriminatoria, sexual, una burla o spam. Ante la duda, true.`;

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
  /** Gemini 3 reasons before answering by default ("medium"); an extraction needs little of it. */
  thinking?: Thinking;
  /**
   * Tail latency: when the main model has not answered after `hedgeAfterMs`
   * (or failed), this faster model is asked too and the first answer wins.
   */
  hedgeModel?: string;
  hedgeAfterMs?: number;
  logger?: Logger;
}

type Thinking = "minimal" | "low" | "medium" | "high";

/**
 * The first of two attempts to answer: `primary` now, `hedge` after `afterMs`
 * (or as soon as `primary` fails). The loser is aborted; both failing throws
 * the primary's error.
 */
export async function hedged<T>(
  primary: (signal: AbortSignal) => Promise<T>,
  hedge: ((signal: AbortSignal) => Promise<T>) | undefined,
  afterMs: number,
  signal: AbortSignal,
  onHedge?: (why: "slow" | "failed") => void
): Promise<{ value: T; by: "primary" | "hedge" }> {
  const primaryAbort = new AbortController();
  const hedgeAbort = new AbortController();
  const first = primary(AbortSignal.any([signal, primaryAbort.signal]));
  if (!hedge) return { value: await first, by: "primary" };
  let timer: NodeJS.Timeout | undefined;
  let started = false;
  const second = new Promise<T>((resolve, reject) => {
    const start = (why: "slow" | "failed") => {
      if (started || signal.aborted) return;
      started = true;
      clearTimeout(timer);
      onHedge?.(why);
      hedge(AbortSignal.any([signal, hedgeAbort.signal])).then(resolve, reject);
    };
    timer = setTimeout(() => start("slow"), afterMs);
    first.catch(() => start("failed"));
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  });
  try {
    return await Promise.any([first.then((value) => ({ value, by: "primary" as const })), second.then((value) => ({ value, by: "hedge" as const }))]);
  } catch {
    throw await first.then(
      () => new Error("unreachable"),
      (error: unknown) => error
    );
  } finally {
    clearTimeout(timer);
    primaryAbort.abort();
    hedgeAbort.abort();
  }
}

export function gatewayPitchExtractor(options: GatewayPitchExtractorOptions): PitchExtractor {
  const gateway = createGateway({ apiKey: options.apiKey });
  const ask = async <T>(
    input: { wav: Buffer } | { text: string },
    schema: z.ZodType<T>,
    prompt: string,
    model: string,
    fallbacks: string[] | undefined,
    signal: AbortSignal,
    thinking: Thinking | undefined
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
        ...(thinking ? { google: { thinkingConfig: { thinkingLevel: thinking } } } : {}),
      },
      abortSignal: AbortSignal.any([signal, AbortSignal.timeout(EXTRACT_TIMEOUT_MS)]),
    });
    return output;
  };
  const extract = async <T>(wav: Buffer, schema: z.ZodType<T>, prompt: string, signal: AbortSignal): Promise<T> => {
    try {
      const started = Date.now();
      const hedgeModel = options.hedgeModel;
      const { value, by } = await hedged(
        (attempt) => ask({ wav }, schema, prompt, options.model, options.fallbacks, attempt, options.thinking),
        hedgeModel ? (attempt) => ask({ wav }, schema, prompt, hedgeModel, undefined, attempt, undefined) : undefined,
        options.hedgeAfterMs ?? 5_000,
        signal,
        (why) => options.logger?.info(`pitch: ${why === "slow" ? "el modelo tarda" : "el modelo falló"}; pido también a ${hedgeModel}`)
      );
      options.logger?.info(`pitch: extracción en ${Date.now() - started} ms (${by === "primary" ? options.model : hedgeModel})`);
      return value;
    } catch (error) {
      if (signal.aborted || !options.transcribe || !options.textModel) throw error;
      options.logger?.warn("pitch: el modelo de audio no respondió; pruebo transcripción + texto", error);
      const text = await options.transcribe(wav, signal);
      return ask({ text }, schema, prompt, options.textModel, options.textFallbacks, signal, undefined);
    }
  };
  return {
    card: (wav, signal) => extract(wav, PitchCardSchema, cardPrompt(options.eventName), signal),
    answer: (wav, context, signal) => extract(wav, PitchAnswerSchema, answerPrompt(context), signal),
  };
}

// ── Is it already on the board? ───────────────────────────────────────────

/** A card already on the board, as the duplicate check sees it. */
export interface BoardCard {
  title: string;
  speaker?: string | null;
  description?: string | null;
}

export interface DuplicateFinder {
  /** Index in `board` of the card that is this same talk, or null. */
  find(talk: { title: string; description: string | null; transcript: string }, board: BoardCard[], signal: AbortSignal): Promise<number | null>;
}

/**
 * Same models as the site's placement (src/lib/orpc/ocr/models.ts): jev decides, Luna re-decides
 * when jev sits on the fence, d1 answers if a provider errors. One yes/no per card: asking a
 * decision model to pick among many cards was measurably useless (it takes the first).
 */
export const DUPLICATE_MODEL = {
  ...MODELS.duplicate,
  // Wider than the placement's: a doubtful "yes" here turns a visitor away, so Luna (sharper:
  // 0.99 where jev said 0.72 on a real duplicate, 2026-11-01) re-decides anything that is not clearly no.
  unsureBand: [0.35, 0.8] as [number, number],
};
/** P(same talk) at or above this turns the pitch away; a wrong "yes" costs a visitor their card, so it has to be clear. */
// ponytail: set by reasoning, not measured; tune on real duplicates if staff report misses or false hits.
export const DUPLICATE_THRESHOLD = 0.8;
/** Past this, the card is placed without the check (a slow decision never holds a visitor). */
const DUPLICATE_TIMEOUT_MS = 4_000;
/** The newest cards are the likely duplicates; a long day's board stays one bounded call. */
const DUPLICATE_MAX_CARDS = 60;

export function gatewayDuplicateFinder(options: { apiKey?: string; threshold?: number }): DuplicateFinder {
  const gateway = createGateway({ apiKey: options.apiKey });
  const threshold = options.threshold ?? DUPLICATE_THRESHOLD;
  return {
    async find(talk, board, signal) {
      const cards = board.slice(-DUPLICATE_MAX_CARDS);
      const offset = board.length - cards.length;
      if (cards.length === 0) return null;
      const ids = cards.map((_, index) => `card${index}`);
      const questions = Object.fromEntries(
        cards.map((card, index) => [
          ids[index],
          {
            type: "boolean" as const,
            // Measured: asking for "the same talk (topic and approach), title worded differently" took jev from
            // 0.72 to 0.91 on a real duplicate, with a same-area different talk still at 0.18.
            instructions: `¿La charla nueva y esta charla de la grilla son la misma charla (el mismo tema y enfoque, aunque el título esté escrito distinto)? «${card.title}»${card.speaker ? ` (de ${card.speaker})` : ""}${card.description ? ` — ${card.description}` : ""}`,
            criteria: {
              true: "Sí: es la misma charla propuesta otra vez, por la misma persona o por otra",
              false: "No: es otra charla, aunque sea de un tema parecido o del mismo área",
            },
          },
        ])
      );
      const result = await experimental_decide({
        model: gateway.decisionModel(DUPLICATE_MODEL.primary),
        state: {
          charlaNueva: {
            titulo: talk.title,
            ...(talk.description ? { descripcion: talk.description } : {}),
            loQueDijo: talk.transcript.slice(0, 800),
          },
        },
        questions,
        maxRetries: 0,
        abortSignal: AbortSignal.any([signal, AbortSignal.timeout(DUPLICATE_TIMEOUT_MS)]),
        providerOptions: {
          gateway: {
            models: [
              {
                model: DUPLICATE_MODEL.unsure,
                when: { any: ids.map((question) => ({ question, probabilityBetween: DUPLICATE_MODEL.unsureBand })) },
              },
              DUPLICATE_MODEL.failover,
            ],
          },
        },
      });
      let best: number | null = null;
      let bestProbability = threshold;
      ids.forEach((id, index) => {
        const answer = result.answers[id];
        const probability = answer?.type === "boolean" ? answer.probability : 0;
        if (probability >= bestProbability) {
          best = offset + index;
          bestProbability = probability;
        }
      });
      return best;
    },
  };
}

// ── Words ──────────────────────────────────────────────────────────────────

/** A text message the realtime model must say verbatim: the bridge's, not the visitor's. */
export const SCRIPT_PREFIX = "[GUION] ";

export const PITCH_LINES = {
  listen: "Te escucho.",
  askTopic: "¿De qué va tu charla, en pocas palabras?",
  askTitle: "¿Cómo se llamaría tu charla, en pocas palabras?",
  askName: "¿Cómo te llamás?",
  empty: "No escuché una propuesta. Tocá y contame tu charla.",
  unclear: "No me quedó claro el tema. Tocá y contame de nuevo de qué va tu charla.",
  full: "Justo ahora no queda lugar libre en la grilla; hablá con el staff.",
  failed: "Perdón, se me trabó la propuesta. Probá de nuevo o contale al staff.",
  declined: "Esa propuesta no la puedo cargar en la grilla. Si te parece un error, hablá con el staff.",
  unconfigured: "El modo pitch no está configurado en este bridge.",
} as const;
export type PitchLine = keyof typeof PITCH_LINES;

/** The fixed lines pre-rendered by `pnpm companion:clips` (public/companion-audio/clips/<id>.wav). */
export const PITCH_CLIPS: Partial<Record<PitchLine, string>> = {
  listen: "pitch-listen",
  askTopic: "pitch-ask-topic",
  askTitle: "pitch-ask-title",
  askName: "pitch-ask-name",
  empty: "pitch-empty",
  unclear: "pitch-unclear",
  full: "pitch-full",
  failed: "pitch-failed",
  declined: "pitch-declined",
};

/** What Owy says once the card is on the board; a speaker someone else put forward is not the one listening. */
export function announcementText(
  card: { title: string; speaker?: string | null; room?: string | null; timeSlot?: string | null },
  nominated = false
): string {
  const start = card.timeSlot?.split(" - ")[0]?.trim();
  const where = [card.room ? `en ${card.room}` : "", start ? `a las ${start}` : ""].filter(Boolean).join(" ");
  const talk = nominated && card.speaker ? `La charla de ${card.speaker}, «${card.title}»,` : `Tu charla «${card.title}»`;
  return `¡Listo${card.speaker && !nominated ? `, ${card.speaker}` : ""}! ${talk} queda ${where || "en la grilla"}.`;
}

/** The pitch is already on the board: Owy says where, instead of making a second card. */
export function duplicateText(card: { title: string; room?: string | null; timeSlot?: string | null }): string {
  const start = card.timeSlot?.split(" - ")[0]?.trim();
  const where = [card.room ? `en ${card.room}` : "", start ? `a las ${start}` : ""].filter(Boolean).join(" ");
  return `Esa charla ya está en la grilla: «${card.title}»${where ? `, ${where}` : ""}.`;
}

/** The device tags a pitch run with `wake_word: "pitch"` (an answer to Owy's question is "pitch-answer"). */
export function isPitchRun(request: { wakeWordPhrase?: string | null }): boolean {
  return /^pitch/i.test(request.wakeWordPhrase ?? "");
}
