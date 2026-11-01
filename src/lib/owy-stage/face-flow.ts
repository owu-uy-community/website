import type { StickyNote } from "../orpc/tracks/schemas";
import type { Expression, FaceCard, FaceEvent, FaceState, StoredFace } from "./scenes";

/**
 * What the Owy scene shows around the face, reduced from the realtime events
 * (wall clock, so it is testable without a canvas): the transcript typing in
 * and the card that just landed on the board. The face itself is the
 * firmware's model (src/components/OwyStage/Face.tsx): feelings, the happy
 * mood and blinks keep their own time there.
 */

/** A landed card stays this long. */
export const CARD_MS = 12_000;
/** A CARD_CREATE this fresh lands even without the companion's own card post. */
export const RECENT_CREATE_MS = 30_000;
/** The companion's card and the board's event for the same talk are one landing. */
export const DEDUPE_MS = 5_000;
/** A stored face older than this is history, not something to resume. */
export const FACE_RESUME_MS = 60_000;

/** One face on a page: what it is told; the model does the rest. */
export type FaceApi = {
  state: (state: FaceState) => void;
  /** A raw owy::Mood 0..11 (the workbench's knob mirrors its emulator). */
  mood: (mood: number) => void;
  /** A feeling over the state (strength 0..100, 100 by default); `at` = epoch ms when its sentence is heard. */
  express: (name: Expression, strength?: number, at?: number) => void;
  smile: () => void;
  /** Lip shapes: base64url, one char per 40 ms; `at` = epoch ms when the first one is heard. */
  mouth: (frames: string, at: number) => void;
};

/** A companion's face event onto a face, as the device takes it: the state, the feeling on its word, a card is a smile. */
export function applyFaceEvent(face: Pick<FaceApi, "state" | "express" | "smile">, event: FaceEvent) {
  face.state(event.state);
  if (event.expression) face.express(event.expression.name, event.expression.strength, event.expression.at);
  if (event.card) face.smile();
}

/** The Owy whose lip shapes a wall takes: the source of the latest face that is not idle. */
export const followSource = (current: string | undefined, event: Pick<FaceEvent, "state" | "source">) =>
  event.state === "idle" ? current : event.source;

/** `?lag=<ms>` on a stage URL: how late that screen shows the face (positive = its faces act earlier), ±2 s. */
export function parseLag(value: string | string[] | undefined): number {
  const ms = typeof value === "string" && value.trim() ? Number(value) : 0;

  return Number.isFinite(ms) ? Math.max(-2000, Math.min(2000, Math.round(ms))) : 0;
}

/** The stored face a wall picks up on (re)connect, with when it happened; null when it is history. */
export function resumable(stored: StoredFace | null, now: number): { face: FaceEvent; at: number } | null {
  if (!stored) return null;
  const { at: iso, ...face } = stored;
  const at = Date.parse(iso);
  const age = now - at;
  if (!Number.isFinite(age) || age > FACE_RESUME_MS) return null;

  return { face: { ...face, card: age < CARD_MS ? face.card : undefined }, at };
}

export type Landed = FaceCard & { key: string; at: number; roomId?: string; scheduleId?: string; roomColor?: string };

export type Flow = {
  state: FaceState;
  transcript: { key: string; who: "input" | "output"; text: string } | null;
  landed: Landed | null;
};

export type CardChange = { type: string; payload?: { updatedCard?: StickyNote } };

export type FlowEvent =
  | { type: "face"; face: FaceEvent; now: number; captions: boolean }
  | { type: "card_change"; change: CardChange; now: number }
  | { type: "clear_transcript"; key: string }
  | { type: "tick"; now: number };

export const initialFlow = (): Flow => ({ state: "idle", transcript: null, landed: null });

export const landedKey = (card: { title: string; room?: string; timeSlot?: string }) =>
  `${card.title}|${card.room ?? ""}|${card.timeSlot ?? ""}`;

export function reduceFlow(flow: Flow, event: FlowEvent): Flow {
  switch (event.type) {
    case "face": {
      const { face, now, captions } = event;
      let next: Flow = { ...flow, state: face.state };
      // Going back to listening is a new turn: the last card is over.
      if (face.state === "listening" && flow.state !== "listening") {
        next = { ...next, transcript: null, landed: null };
      }
      if (face.transcript?.text && captions) {
        const { who, text } = face.transcript;
        // Same speaker keeps typing into the same caption; a new speaker gets a fresh one.
        const key = next.transcript?.who === who ? next.transcript.key : `${who}-${now}`;
        next = { ...next, transcript: { key, who, text } };
      }
      // The card takes the pitch's place on screen: what was said is now a talk on the board.
      if (face.card) next = { ...next, transcript: null, landed: { ...face.card, key: landedKey(face.card), at: now } };

      return next;
    }
    case "card_change": {
      const { change, now } = event;
      const note = change.payload?.updatedCard;
      if (change.type !== "CARD_CREATE" || !note) return flow;
      if (now - Date.parse(note.createdAt) > RECENT_CREATE_MS) return flow;
      const key = landedKey(note);
      const ids = { roomId: note.roomId, scheduleId: note.scheduleId, roomColor: note.roomColor };
      if (flow.landed?.key === key && now - flow.landed.at < DEDUPE_MS) {
        return { ...flow, landed: { ...flow.landed, ...ids } };
      }

      return {
        ...flow,
        landed: {
          key,
          at: now,
          title: note.title,
          speaker: note.speaker,
          room: note.room,
          timeSlot: note.timeSlot,
          ...ids,
        },
      };
    }
    case "clear_transcript":
      return flow.transcript?.key === event.key ? { ...flow, transcript: null } : flow;
    case "tick":
      return flow.landed && event.now - flow.landed.at >= CARD_MS ? { ...flow, landed: null } : flow;
    default:
      return flow;
  }
}

/** When the scene next has to look at the clock (the card leaving), or null when nothing is timed. */
export const nextTick = (flow: Flow): number | null => (flow.landed ? flow.landed.at + CARD_MS : null);
