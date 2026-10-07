import { createGateway, generateObject } from "ai";
import { z } from "zod";
import { BYTES_PER_SAMPLE, DEVICE_SAMPLE_RATE, rmsLevel, toWav } from "./audio/pcm";
import { systemClock, type ClockTimer, type RuntimeClock } from "./clock";

/**
 * Modo pitch: at the open space's marketplace the knob sits in the middle of
 * the room; a person taps, pitches a talk, taps again. The bridge records the
 * pitch itself (never through the realtime model, whose own end-of-speech
 * detection would cut it at the first pause), then turns the audio into a
 * card in one gateway call. `DeviceSession` owns the flow; this file is the
 * recorder, the extractor and the words — the parts that need no device.
 */

export type PitchKind = "pitch" | "name";

export interface PitchLimits {
  /** Silence after speech that ends the recording on its own. */
  silenceMs: number;
  /** Hard cap on a recording. */
  maxMs: number;
  /** Less speech than this is a mis-tap, not a pitch. */
  minSpeechMs: number;
}

export const PITCH_LIMITS: Record<PitchKind, PitchLimits> = {
  pitch: { silenceMs: 10_000, maxMs: 120_000, minSpeechMs: 2_000 },
  name: { silenceMs: 3_000, maxMs: 10_000, minSpeechMs: 300 },
};

/** Frames (20 ms) over the threshold in a row before the recorder believes it is speech, not a buzz. */
const SPEECH_FRAMES = 3;
const BYTES_PER_MS = (DEVICE_SAMPLE_RATE * BYTES_PER_SAMPLE) / 1000;

export interface PitchRecorderOptions {
  kind: PitchKind;
  clock?: RuntimeClock;
  /** RMS (0..1) a 20 ms frame must exceed to count as speech; the knob's mic has AGC. */
  rmsThreshold?: number;
  limits?: PitchLimits;
  /** Drop the first `ms` of audio: a cue playing on the laptop leaks into the room mic. */
  ignoreMs?: number;
  /** Someone started talking (once). */
  onSpeechStart(): void;
  /** The recording ended on its own (once). */
  onDone(reason: "silence" | "cap"): void;
}

/** Buffers 16 kHz PCM16 mic frames and watches for speech, silence and the cap. */
export class PitchRecorder {
  readonly limits: PitchLimits;
  private readonly clock: RuntimeClock;
  private readonly threshold: number;
  private readonly chunks: Buffer[] = [];
  private bytes = 0;
  private loudFrames = 0;
  private speechBytes = 0;
  private spoke = false;
  private peakLevel = 0;
  private startedAt = 0;
  private silenceTimer: ClockTimer | null = null;
  private capTimer: ClockTimer | null = null;
  private stopped = false;

  constructor(private readonly options: PitchRecorderOptions) {
    this.clock = options.clock ?? systemClock;
    this.threshold = options.rmsThreshold ?? 0.012;
    this.limits = options.limits ?? PITCH_LIMITS[options.kind];
  }

  start(): void {
    this.startedAt = this.clock.now();
    this.capTimer = this.clock.setTimeout(() => this.finish("cap"), this.limits.maxMs);
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
    this.stop();
    this.options.onDone(reason);
  }
}

// ── Audio → card ──────────────────────────────────────────────────────────

export const PitchCardSchema = z.object({
  /** What was said, faithfully; empty when nothing intelligible was said. */
  transcript: z.string(),
  /** Someone proposed a talk, workshop or debate (not a greeting, a test or noise). */
  isPitch: z.boolean(),
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

export const PitchNameSchema = z.object({ name: z.string().nullable() });

export interface PitchExtractor {
  card(wav: Buffer, signal: AbortSignal): Promise<PitchCard>;
  name(wav: Buffer, signal: AbortSignal): Promise<{ name: string | null }>;
}

/** The gateway's own retries plus a slow 60 s clip must still fit a visitor's patience. */
const EXTRACT_TIMEOUT_MS = 20_000;

const cardPrompt = (eventName: string) =>
  `Sos el asistente del mercado de ideas del open space de ${eventName}. El audio es una persona proponiendo una charla (entre 20 y 60 segundos), en español rioplatense (a veces en inglés), con un micrófono en una sala con ruido.

Devolvé solo el objeto pedido:
- transcript: lo que dijo, fiel, sin inventar ni completar; vacío si no hay habla inteligible.
- isPitch: true solo si propone una charla, taller, debate o tema para el open space. Saludos, pruebas de micrófono, preguntas sueltas o ruido son false.
- title: un título corto (hasta 60 caracteres) como iría en la card, fiel al tema aunque la persona no lo diga como título; null si no es un pitch.
- speaker: SOLO si la persona se presenta ("soy Ana", "me llamo…", "mi nombre es…"); si no, null. No inventes nombres.
- needsTV / needsWhiteboard: true solo si lo pide explícitamente (proyector, tele, pantalla / pizarra, pizarrón).
- description: una línea (hasta 140 caracteres) de qué va la charla, en tercera persona; null si no es un pitch.
- topics: entre una y cuatro palabras clave en minúsculas.`;

const namePrompt =
  "El audio es la respuesta de una persona a «¿Cómo te llamás?». Devolvé name con el nombre tal como se presenta (capitalizado, con apellido si lo dice), o null si no dice un nombre.";

/** One multimodal gateway call per recording: the audio in, the card out. */
export function gatewayPitchExtractor(options: {
  apiKey?: string;
  model: string;
  fallbacks?: string[];
  eventName: string;
}): PitchExtractor {
  const gateway = createGateway({ apiKey: options.apiKey });
  const ask = async <T>(wav: Buffer, schema: z.ZodType<T>, prompt: string, signal: AbortSignal): Promise<T> => {
    const result = await generateObject({
      model: gateway(options.model),
      schema,
      temperature: 0,
      maxRetries: 1,
      messages: [
        {
          role: "user",
          content: [
            { type: "file", data: wav, mediaType: "audio/wav" },
            { type: "text", text: prompt },
          ],
        },
      ],
      providerOptions: {
        gateway: {
          ...(options.fallbacks?.length ? { models: options.fallbacks } : {}),
          // A visitor's voice: no retention at the provider.
          zeroDataRetention: true,
        },
      },
      abortSignal: AbortSignal.any([signal, AbortSignal.timeout(EXTRACT_TIMEOUT_MS)]),
    });
    return result.object;
  };
  return {
    card: (wav, signal) => ask(wav, PitchCardSchema, cardPrompt(options.eventName), signal),
    name: (wav, signal) => ask(wav, PitchNameSchema, namePrompt, signal),
  };
}

// ── Words ──────────────────────────────────────────────────────────────────

/** A text message the realtime model must say verbatim: the bridge's, not the visitor's. */
export const SCRIPT_PREFIX = "[GUION] ";

export const PITCH_LINES = {
  listen: "Te escucho. Contame tu charla y tocá de nuevo cuando termines.",
  askName: "¿Cómo te llamás? Tocá, decime tu nombre y tocá de nuevo.",
  empty: "No escuché una propuesta. Tocá y contame tu charla.",
  noName: "No te escuché el nombre; la charla queda igual, sin nombre.",
  full: "Justo ahora no queda lugar libre en la grilla; hablá con el staff.",
  failed: "Perdón, se me trabó la propuesta. Tocá y probá de nuevo.",
  unconfigured: "El modo pitch no está configurado en este bridge.",
} as const;

/** What Owy says once the card is on the board. */
export function announcementText(
  card: { title: string; speaker?: string | null; room?: string | null; timeSlot?: string | null },
  options: { askName: boolean }
): string {
  const start = card.timeSlot?.split(" - ")[0]?.trim();
  const where = [card.room ? `en ${card.room}` : "", start ? `a las ${start}` : ""].filter(Boolean).join(" ");
  const parts = [`¡Listo${card.speaker ? `, ${card.speaker}` : ""}! Tu charla «${card.title}» queda ${where || "en la grilla"}.`];
  if (options.askName) parts.push(PITCH_LINES.askName);
  return parts.join(" ");
}

/** The device tags a pitch run with `wake_word: "pitch"` (the name step may say "pitch-name"). */
export function isPitchRun(request: { wakeWordPhrase?: string | null }): boolean {
  return /^pitch/i.test(request.wakeWordPhrase ?? "");
}
