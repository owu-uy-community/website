import type { Logger } from "./log";
import {
  PITCH_LINES,
  QUESTION,
  announcementText,
  type PitchAnswer,
  type PitchCard,
  type PitchExtractor,
  type PitchField,
  type PitchKind,
  type PitchLine,
  type PitchRecorder,
} from "./pitch";
import type { ScreenCard } from "./realtime/tools";

/**
 * One visitor's pitch, from the first tap to the card on the board: the pitch,
 * then at most one question for each thing it missed (the topic, the name),
 * then one `createPlaced`. It spans one to three device runs (the board opens
 * its mic by itself for an answer) and reads as the steps it takes; every wait
 * is bounded and every result is checked against the flow still being wanted.
 *
 *   tap → record → tap → extract → [ask topic] → [ask name] → place → confirm
 *
 * `DeviceSession` owns the runs (recording, speaking, the board); this file is
 * the order of things and the rules for what is missing.
 */

/** What Owy says around a pitch: nothing (screen only), where it landed, or that plus a comment on the talk. */
export type PitchVoice = "silent" | "confirm" | "react";

export interface PitchDraft {
  transcript: string;
  title: string | null;
  speaker: string | null;
  description: string | null;
  needsTV: boolean;
  needsWhiteboard: boolean;
  topics: string[];
  /** Each field is asked once. */
  asked: PitchField[];
}
export type CompleteDraft = PitchDraft & { title: string };

const clean = (value: string | null | undefined): string | null => value?.trim() || null;

/** The extractor's card as a draft; null when nobody proposed anything (a greeting, a mic test, noise). */
export function draftFromCard(card: PitchCard): PitchDraft | null {
  const transcript = card.transcript.trim();
  if (card.kind === "not_pitch" || !transcript) return null;
  return {
    transcript,
    title: card.kind === "pitch" ? clean(card.title) : null,
    speaker: clean(card.speaker),
    description: clean(card.description),
    needsTV: card.needsTV,
    needsWhiteboard: card.needsWhiteboard,
    topics: card.topics,
    asked: [],
  };
}

export type PitchStep = { ask: PitchField } | { place: true } | { reject: "unclear" };

/** The topic is required (no title, no card); the name is wanted. Each is asked at most once. */
export function nextStep(draft: PitchDraft, canAsk: boolean): PitchStep {
  if (!draft.title) return canAsk && !draft.asked.includes("topic") ? { ask: "topic" } : { reject: "unclear" };
  if (!draft.speaker && canAsk && !draft.asked.includes("name")) return { ask: "name" };
  return { place: true };
}

/**
 * An answer fills what was asked (a topic answer may also bring the
 * description, and anyone may say their name); it never overwrites what the
 * pitch already said.
 */
export function mergeAnswer(draft: PitchDraft, field: PitchField, answer: PitchAnswer | null): PitchDraft {
  const next: PitchDraft = { ...draft, asked: [...draft.asked, field] };
  if (!answer) return next;
  if (field === "topic") {
    next.title ??= clean(answer.title);
    next.description ??= clean(answer.description);
  }
  next.speaker ??= clean(answer.speaker);
  return next;
}

/** One device run that records (the pitch, or an answer), as the flow sees it. */
export interface PitchRecording {
  kind: PitchKind;
  recorder: PitchRecorder;
  /** The WAV once the recording is complete (tap, silence, cap); null when it was cancelled. */
  done: Promise<Buffer | null>;
  /** This run is over on the device (after whatever Owy said in it). */
  ended: Promise<void>;
  /** Owy can still talk in this run. */
  live(): boolean;
}

export type Placement = ScreenCard | "full" | { denied: string };

/** What the flow needs from the device session. */
export interface PitchPort<R extends PitchRecording = PitchRecording> {
  log: Logger;
  extract: PitchExtractor;
  voice(): PitchVoice;
  /** The board opens its mic for an answer by itself (`pitch_prompt`). */
  canAsk(): boolean;
  /** The transcript, on the knob's pill and the wall. */
  heard(run: R, transcript: string): void;
  /** A fixed line in `run` (spoken, or on screen when silent), ending it; resolves once the run is over. Null run = screen only. */
  say(run: R | null, line: PitchLine): Promise<void>;
  /** The announcement in `run` (silent: just ends it, the card is on screen); resolves once the run is over. */
  announce(run: R | null, text: string): Promise<void>;
  /** The board opens its mic for this answer, or stops inviting one ("idle"). */
  prompt(field: PitchField | "idle"): void;
  place(draft: CompleteDraft, signal: AbortSignal): Promise<Placement>;
  showCard(card: ScreenCard): void;
  /** One warm sentence about the talk ("" when there is none in time). */
  react(draft: CompleteDraft, signal: AbortSignal): Promise<string>;
  /** Keeps a pitch that could not be placed, for the staff. */
  saveFailure(reason: string, draft: PitchDraft | null, wav: Buffer): void;
}

/** The board opens its mic for an answer within a second or two; past this, nobody is coming. */
export const ANSWER_START_MS = 6_000;

export class PitchFlow<R extends PitchRecording = PitchRecording> {
  readonly abort = new AbortController();
  // ponytail: the draft lives in memory; a bridge restart mid-flow loses it (persist it if that ever bites).
  private draft: PitchDraft | null = null;
  private recorded = false;
  /** Interrupted once it had a recording: no more questions or words, but a card with a title is still placed. */
  private detached = false;
  private waiting: { field: PitchField; resolve: (run: R | null) => void } | null = null;

  constructor(private readonly port: PitchPort<R>) {}

  /** The field Owy is waiting for an answer about: the next pitch run is that answer. */
  get awaiting(): PitchField | null {
    return this.waiting?.field ?? null;
  }

  /** The board opened its mic after the question: this run is the answer. */
  takeAnswer(run: R): boolean {
    const waiting = this.waiting;
    if (!waiting) return false;
    this.waiting = null;
    waiting.resolve(run);
    return true;
  }

  /**
   * A newer pitch, the mode switched off, a stop, the board gone. Cancelled
   * while the pitch itself was being recorded, nothing is kept (that is what
   * a stop means); later, what was understood is still placed, silently.
   */
  interrupt(): void {
    if (!this.recorded) return this.cancel();
    if (this.detached) return;
    this.detached = true;
    this.port.log.info("pitch: interrumpido; si ya tiene tema, la charla se carga sin preguntar más");
    this.resolveWaiting(null);
  }

  /** The bridge is stopping. */
  cancel(): void {
    this.abort.abort();
    this.resolveWaiting(null);
  }

  async run(first: R): Promise<void> {
    const signal = this.abort.signal;
    const wav = await first.done;
    if (!wav || signal.aborted) return;
    this.recorded = true;
    let run: R | null = first;
    if (first.recorder.speechMs < first.recorder.limits.minSpeechMs) return this.tell(run, "empty");

    let card: PitchCard;
    try {
      card = await this.port.extract.card(wav, signal);
    } catch (error) {
      if (signal.aborted) return;
      this.port.log.error("pitch: no pude transcribir", error);
      this.port.saveFailure("extract", null, wav);
      return this.tell(run, "failed");
    }
    if (signal.aborted) return;
    const { transcript, ...fields } = card;
    this.port.log.info(`pitch: "${transcript.trim()}" → ${JSON.stringify(fields)}`);
    const draft = draftFromCard(card);
    if (!draft) return this.tell(run, "empty");
    this.draft = draft;
    if (this.live(run)) this.port.heard(first, draft.transcript);

    for (;;) {
      const step = nextStep(this.draft, !this.detached && this.port.canAsk());
      if ("reject" in step) return this.tell(run, "unclear");
      if ("place" in step) break;
      run = await this.ask(run, step.ask);
      if (signal.aborted) return;
      const answer = run ? await this.hear(run, step.ask) : null;
      if (signal.aborted) return;
      this.draft = mergeAnswer(this.draft, step.ask, answer);
    }
    return this.place(run, wav);
  }

  /** Says the question in `run`, then waits for the board to open its mic for the answer. */
  private async ask(run: R | null, field: PitchField): Promise<R | null> {
    const answered = new Promise<R | null>((resolve) => (this.waiting = { field, resolve }));
    await this.port.say(this.live(run), QUESTION[field]);
    if (this.abort.signal.aborted || this.detached) {
      this.resolveWaiting(null);
      return null;
    }
    this.port.log.info(`pitch: falta ${field === "topic" ? "el tema" : "el nombre"}; pregunto`);
    this.port.prompt(field);
    const timer = setTimeout(() => {
      if (this.resolveWaiting(null)) this.port.log.warn("pitch: el dispositivo no abrió el micrófono para la respuesta");
    }, ANSWER_START_MS);
    const answer = await answered;
    clearTimeout(timer);
    if (!answer) this.port.prompt("idle");
    return answer;
  }

  /** The answer, understood (null: nobody answered, it was noise, or the model failed — the field stays empty). */
  private async hear(run: R, field: PitchField): Promise<PitchAnswer | null> {
    const wav = await run.done;
    if (!wav || this.abort.signal.aborted || !this.draft) return null;
    if (run.recorder.speechMs < run.recorder.limits.minSpeechMs) {
      this.port.log.info(`pitch: no hubo respuesta para ${field}`);
      return null;
    }
    try {
      const answer = await this.port.extract.answer(
        wav,
        { field, question: PITCH_LINES[QUESTION[field]], transcript: this.draft.transcript },
        this.abort.signal
      );
      this.port.log.info(`pitch: respuesta (${field}) → ${JSON.stringify(answer)}`);
      return answer;
    } catch (error) {
      if (!this.abort.signal.aborted) this.port.log.warn("pitch: no entendí la respuesta", error);
      return null;
    }
  }

  private async place(run: R | null, wav: Buffer): Promise<void> {
    const draft = this.draft as CompleteDraft;
    const signal = this.abort.signal;
    const reaction =
      this.port.voice() === "react" && this.live(run) ? this.port.react(draft, signal) : Promise.resolve("");
    let placed: Placement;
    try {
      placed = await this.port.place(draft, signal);
    } catch (error) {
      if (signal.aborted) return;
      this.port.log.error("pitch: no pude crear la charla", error);
      this.port.saveFailure("place", draft, wav);
      return this.tell(run, "failed");
    }
    if (signal.aborted) return;
    if (placed === "full") return this.tell(run, "full");
    if ("denied" in placed) return this.port.announce(this.live(run), placed.denied);
    if (this.detached) return;
    this.port.showCard(placed);
    const extra = await reaction;
    await this.port.announce(this.live(run), `${announcementText(placed)}${extra ? ` ${extra}` : ""}`);
  }

  /** A fixed line, unless the flow was interrupted (then the log is enough). */
  private tell(run: R | null, line: PitchLine): Promise<void> {
    if (this.detached) {
      this.port.log.info(`pitch: (interrumpido) ${PITCH_LINES[line]}`);
      return Promise.resolve();
    }
    return this.port.say(this.live(run), line);
  }

  private live(run: R | null): R | null {
    return run && !this.detached && run.live() ? run : null;
  }

  private resolveWaiting(run: R | null): boolean {
    const waiting = this.waiting;
    if (!waiting) return false;
    this.waiting = null;
    waiting.resolve(run);
    return true;
  }
}
