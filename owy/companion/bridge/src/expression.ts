import { createGateway, experimental_evaluate } from "ai";

import type { Logger } from "./log";

/**
 * What Owy's face says while it talks. Each sentence of a reply gets one of
 * these (owy::EXPRESSION_NAMES on the device), timed to when that sentence
 * becomes audible; the visitor's words get a reaction while Owy thinks.
 *
 * The classifier is TypeSafe's jev on the AI Gateway: a decision model (state
 * + typed question → choice with probabilities), measured at ~0.4 s per call
 * from the venue laptop. It never blocks audio: a local guess covers every
 * sentence instantly and jev's verdict replaces it when it lands.
 *
 * The descriptions double as jev's criteria.
 */
export const EXPRESSIONS = {
  neutral: "Calm, informative: explaining a fact, a time, a place, directions.",
  happy: "Warm and glad: greetings, good news, thanks, something went well.",
  excited: "Enthusiastic, energetic: invitations, celebrations, exclamations, '¡dale!'.",
  curious: "Asking the listener a question or inviting them to answer.",
  thinking: "Unsure or weighing options: 'creo que', 'a ver', 'depende', hedging.",
  empathetic: "Sorry or sympathetic: apologies, bad news, something is not possible.",
  playful: "Joking, teasing, a wink, light irony or a pun.",
  surprised: "Amazed or astonished: 'wow', '¡no sabía!', unexpected facts.",
} as const;
export type Expression = keyof typeof EXPRESSIONS;
export type Verdict = { expression: Expression; confidence: number };
/** `line`: a sentence Owy says; `reaction`: what the visitor just said. */
export type Classifier = (text: string, kind: "line" | "reaction", signal: AbortSignal) => Promise<Verdict>;

const SPEAKER = "Owy, a friendly owl robot at a tech conference in Uruguay";
const INSTRUCTIONS = {
  line: "Which facial expression should Owy show while saying this sentence aloud?",
  reaction:
    "While Owy thinks about its answer, which facial expression reacts naturally to what the visitor just said?",
};

/** jev through the AI Gateway (same key as the realtime model), with a small cache for repeated lines. */
export function jevClassifier({ apiKey, model }: { apiKey?: string; model: string }): Classifier {
  const evaluator = createGateway({ apiKey }).evaluationModel(model);
  const cache = new Map<string, Verdict>();
  return async (text, kind, signal) => {
    const key = `${kind}:${text.trim().toLowerCase()}`;
    const hit = cache.get(key);
    if (hit) return hit;
    const result = await experimental_evaluate({
      model: evaluator,
      state: kind === "line" ? { speaker: SPEAKER, sentence: text } : { listener: SPEAKER, visitorSaid: text },
      questions: { expression: { type: "choice", instructions: INSTRUCTIONS[kind], criteria: EXPRESSIONS } },
      abortSignal: signal,
      // A late verdict is useless: the local guess already covered the line.
      maxRetries: 0,
      // Visitors' words: no retention at the provider.
      providerOptions: { gateway: { zeroDataRetention: true } },
    });
    const answer = result.answers.expression;
    const metadata = result.providerMetadata as { typesafe?: { confidence?: Record<string, number> } } | undefined;
    const confidence = metadata?.typesafe?.confidence?.expression ?? answer.probabilities?.[answer.choice] ?? 0.5;
    const verdict = { expression: answer.choice, confidence };
    if (cache.size >= 300) cache.delete(cache.keys().next().value!);
    cache.set(key, verdict);
    return verdict;
  };
}

/** Instant first guess from punctuation and a few rioplatense cues; jev refines it. */
export function guessExpression(text: string): Expression {
  const t = text.toLowerCase();
  if (/perd[oó]n|lamentablemente|lo siento|qu[eé] pena|qu[eé] baj[oó]n|no (se )?puede|no quedan|cerrad[oa]/.test(t))
    return "empathetic";
  if (/ja(ja)+|je(je)+|chiste|broma/.test(t)) return "playful";
  if (/wow|guau|no te (lo )?puedo creer|incre[ií]ble|en serio\?/.test(t)) return "surprised";
  if (/creo que|a ver|mmm|depende|capaz|quiz[aá]s|no s[eé]\b/.test(t)) return "thinking";
  if (/\?\s*$/.test(t)) return "curious";
  const warm = /hola|gracias|genial|qu[eé] bueno|felicit|listo/.test(t);
  // "¡" counts too: a line still streaming may not have its closing "!" yet.
  if (/[!¡]/.test(t)) return warm ? "happy" : "excited";
  return warm ? "happy" : "neutral";
}

export type Line = { start: number; end: number; text: string; complete: boolean };

/** Sentences of `text` with offsets. The last one stays open (still being written) unless `final`. */
export function splitLines(text: string, final = false): Line[] {
  const lines: Line[] = [];
  // A run of terminators followed by whitespace (or a newline) ends a sentence: "15:30" and "3.5" don't.
  const boundary = /[.!?…]+["'»”)]*(?=\s|$)|\n+/g;
  let start = 0;
  for (const match of text.matchAll(boundary)) {
    const end = match.index + match[0].length;
    if (end === text.length && !final) break;
    push(start, end, true);
    start = end;
  }
  push(start, text.length, final);
  return lines;

  function push(from: number, to: number, complete: boolean) {
    const raw = text.slice(from, to);
    const lead = raw.length - raw.trimStart().length;
    const body = raw.trim();
    if (body.length >= 2) lines.push({ start: from + lead, end: to, text: body, complete });
  }
}

const BYTES_PER_SECOND = 32_000; // 16 kHz PCM16, what the pacer sends
const CHARS_PER_SECOND = 14; // Spanish TTS, only when no transcript arrives

type Slot = Line & { guess: Expression; verdict?: Verdict; asked?: boolean };

export interface ExpressionDirectorOptions {
  /** Absent = local guesses only (no key, or COMPANION_EXPRESSIONS=guess). */
  classify?: Classifier;
  /** Deliver one cue: the expression, ms until it should show, strength 0..100. */
  send: (expression: Expression, leadMs: number, strength: number) => void;
  /** ms from a frame leaving the pacer to it being heard (device or laptop). */
  leadMs: () => number;
  log?: Logger;
}

/**
 * One per voice turn. Feed it the visitor's words (`react`), the text Owy will
 * say as it streams (`write`), and the audio as it is queued (`queued`) and
 * leaves the pacer (`played`); it sends one expression per sentence, as that
 * sentence becomes audible.
 */
export class ExpressionDirector {
  private slots: Slot[] = [];
  /** Audio queued up to `bytes` carried the transcript up to `chars`. */
  private marks: { bytes: number; chars: number }[] = [];
  private current = -1;
  private last: { expression: Expression; strength: number } | null = null;
  private reacted = false;
  private readonly abort = new AbortController();

  constructor(private readonly options: ExpressionDirectorOptions) {}

  /** What the visitor said: a reaction while Owy thinks, before the reply starts. */
  react(text: string): void {
    const said = text.trim();
    if (!said || this.reacted || this.current >= 0 || this.abort.signal.aborted) return;
    this.reacted = true;
    if (!this.options.classify) {
      const guess = guessExpression(said);
      if (guess !== "neutral" && guess !== "curious" && guess !== "thinking") this.cue(guess, 0, 60);
      return;
    }
    const started = Date.now();
    this.options
      .classify(said, "reaction", this.abort.signal)
      .then((verdict) => {
        this.options.log?.info(
          `cara reacciona: ${verdict.expression} (${verdict.confidence.toFixed(2)}, ${Date.now() - started} ms)`
        );
        if (this.current < 0 && !this.abort.signal.aborted && verdict.expression !== "neutral")
          this.cue(verdict.expression, 0, strength(verdict.confidence));
      })
      .catch((error) => this.failed(error));
  }

  /** The text Owy says (eve's answer, or the live transcript); grows as it streams. */
  write(text: string, final = false): void {
    if (this.abort.signal.aborted) return;
    splitLines(text, final).forEach((line, i) => {
      const slot = this.slots[i];
      if (slot?.asked) return;
      this.slots[i] = { ...line, guess: guessExpression(line.text), verdict: slot?.verdict };
      if (line.complete) this.ask(i);
    });
  }

  /** Audio up to `bytes` has been queued for playback and carries the transcript up to `chars`. */
  queued(bytes: number, chars: number): void {
    const previous = this.marks.at(-1);
    if (previous && bytes <= previous.bytes) return;
    this.marks.push({ bytes, chars: Math.max(chars, previous?.chars ?? 0) });
  }

  /** Audio up to `bytes` has left for the speaker: cue the sentence it belongs to. */
  played(bytes: number): void {
    if (this.abort.signal.aborted || !this.slots.length) return;
    const position = this.position(bytes);
    let line = this.slots.findIndex((slot) => slot && position < slot.end);
    if (line < 0) line = this.slots.length - 1;
    if (line <= this.current) return;
    this.current = line;
    this.fire(line, false);
  }

  close(): void {
    this.abort.abort();
  }

  /** Where in the script the audio at `bytes` is, from the transcript marks (or speaking rate). */
  private position(bytes: number): number {
    const i = this.marks.findIndex((mark) => mark.bytes >= bytes);
    if (i < 0 || !this.marks[i]!.chars) {
      const last = this.marks.at(-1);
      return last?.chars && i < 0 ? last.chars : (bytes / BYTES_PER_SECOND) * CHARS_PER_SECOND;
    }
    const to = this.marks[i]!;
    const from = this.marks[i - 1] ?? { bytes: 0, chars: 0 };
    const span = to.bytes - from.bytes;
    return from.chars + (span > 0 ? ((bytes - from.bytes) / span) * (to.chars - from.chars) : 0);
  }

  private ask(i: number): void {
    const slot = this.slots[i]!;
    slot.asked = true;
    if (!this.options.classify) return;
    const started = Date.now();
    this.options
      .classify(slot.text, "line", this.abort.signal)
      .then((verdict) => {
        slot.verdict = verdict;
        const late = this.current === i;
        this.options.log?.info(
          `cara: ${verdict.expression} (${verdict.confidence.toFixed(2)}, ${Date.now() - started} ms${late ? ", ya sonando" : ""}) "${slot.text}"`
        );
        // Already audible with the local guess: correct it now.
        if (late) this.fire(i, true);
      })
      .catch((error) => this.failed(error));
  }

  private fire(i: number, late: boolean): void {
    const slot = this.slots[i];
    if (!slot) return;
    const verdict = slot.verdict;
    this.cue(
      verdict?.expression ?? slot.guess,
      late ? 0 : this.options.leadMs(),
      verdict ? strength(verdict.confidence) : 60
    );
  }

  private cue(expression: Expression, leadMs: number, value: number): void {
    if (this.last && this.last.expression === expression && Math.abs(this.last.strength - value) < 10) return;
    this.last = { expression, strength: value };
    this.options.send(expression, leadMs, value);
  }

  private warned = false;
  private failed(error: unknown): void {
    if (this.abort.signal.aborted || this.warned) return;
    this.warned = true;
    this.options.log?.warn(
      `expresiones: jev no respondió, sigo con la cara estimada (${error instanceof Error ? error.message : error})`
    );
  }
}

/** Confident verdicts show fully; unsure ones as a hint of the expression. */
function strength(confidence: number): number {
  return Math.round(100 * Math.min(1, Math.max(0.4, 0.35 + 0.65 * confidence)));
}
