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
/**
 * A bridge repeats its face every 4 s; a page that hears nothing from the Owy it follows for this
 * long lets go of it (a crashed or unplugged bridge), so no face keeps talking forever.
 */
export const FACE_LOST_MS = 15_000;

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
  /** The listening mic's level (0..100): the halo and the eyes follow it while Owy listens, like the knob's. */
  level: (level: number) => void;
  /** Pausa: the knob's paused face, over everything. */
  privacy: (on: boolean) => void;
  /** The knob's «animaciones mínimas». */
  reduced: (on: boolean) => void;
  // The knob's screen besides its face: only a face in device mode (the twin) shows these.
  caption: (text: string) => void;
  heard: (text: string) => void;
  card: (card: FaceCard) => void;
  text: (body: string) => void;
  qr: (url: string, caption?: string) => void;
};

/**
 * A companion's face event onto a face, as the device takes it: pausa, the state, the feeling on
 * its word, a card is a smile (and, on the twin, the card itself).
 */
export function applyFaceEvent(
  face: Pick<FaceApi, "state" | "express" | "smile"> & Partial<Pick<FaceApi, "privacy" | "card">>,
  event: FaceEvent
) {
  // A numbered event (a bridge that mirrors pausa) always says whether Owy is paused; an older one never does.
  if (event.boot !== undefined) face.privacy?.(event.privacy === true);
  face.state(event.state);
  if (event.expression) face.express(event.expression.name, event.expression.strength, event.expression.at);
  if (event.card) {
    face.card?.(event.card);
    face.smile();
  }
}

/** What a page heard last from one Owy: its bridge process, its last event's number, when. */
type Heard = { boot?: string; seq: number; at: number; numbered: boolean };

/** The Owy a page follows (the source of the latest face that isn't idle) and what it heard from each. */
export type Follower = { source: string | undefined; heard: Record<string, Heard> };

export const initialFollower = (): Follower => ({ source: undefined, heard: {} });

/**
 * Whether a face event counts on this page, and the follower after it. A page follows one Owy:
 * the source of the latest face that isn't idle; an idle face from another Owy doesn't count. From
 * a bridge that numbers its events, one that arrives late or twice doesn't count either (the
 * socket and the site's fallback can both carry it), and a heartbeat counts only when it says
 * something the page missed. `at`: when it happened (a stored face is older than its arrival).
 */
export function follow(
  follower: Follower,
  event: Pick<FaceEvent, "state" | "source" | "boot" | "seq" | "beat">,
  at: number
): { follower: Follower; take: boolean } {
  const key = event.source ?? "";
  const last = follower.heard[key];
  const numbered = event.boot !== undefined && event.seq !== undefined;
  const fresh = !numbered || !last || last.boot !== event.boot || (event.seq ?? 0) > last.seq;
  const heardAt = Math.max(at, last?.at ?? at);
  const heard: Heard =
    numbered && fresh
      ? { boot: event.boot, seq: event.seq ?? 0, at: heardAt, numbered: true }
      : { boot: last?.boot, seq: last?.seq ?? -1, at: heardAt, numbered: last?.numbered ?? false };
  const take = fresh && (follower.source === undefined || follower.source === key || event.state !== "idle");
  const source = take && event.state !== "idle" ? key : follower.source;

  return { follower: { source, heard: { ...follower.heard, [key]: heard } }, take };
}

/** The followed Owy went quiet: its bridge numbers its events (so it beats) and nothing came for a while. */
export function lost(follower: Follower, now: number): boolean {
  const heard = follower.source === undefined ? undefined : follower.heard[follower.source];

  return !!heard?.numbered && now - heard.at > FACE_LOST_MS;
}

/** The page showed something of its own: whatever each Owy says next (a heartbeat too) counts again. */
export function forget(follower: Follower): Follower {
  const heard = Object.fromEntries(Object.entries(follower.heard).map(([key, last]) => [key, { ...last, seq: -1 }]));

  return { ...follower, heard };
}

/** The page lets go of the Owy it followed; whatever that Owy says next counts again. */
export function release(follower: Follower): Follower {
  const source = follower.source;
  const heard = source === undefined ? undefined : follower.heard[source];
  if (source === undefined || !heard) return { ...follower, source: undefined };

  return { source: undefined, heard: { ...follower.heard, [source]: { ...heard, seq: -1 } } };
}

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
