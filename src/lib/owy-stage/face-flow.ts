import type { StickyNote } from "../orpc/tracks/schemas";
import type { Expression, FaceCard, FaceEvent, FaceState } from "./scenes";

/**
 * What the Owy scene shows around the face, reduced from the realtime events
 * (wall clock, so it is testable without a canvas): the transcript typing in,
 * a feeling that fades, and the card that just landed on the board.
 */

/** A landed card stays this long. */
export const CARD_MS = 12_000;
/** A CARD_CREATE this fresh lands even without the companion's own card post. */
export const RECENT_CREATE_MS = 30_000;
/** The companion's card and the board's event for the same talk are one landing. */
export const DEDUPE_MS = 5_000;
/** A feeling hint fades after this. */
export const EXPRESSION_MS = 2_500;
/** A stored face older than this is history, not something to resume. */
export const FACE_RESUME_MS = 60_000;

export type Landed = FaceCard & { key: string; at: number; roomId?: string; scheduleId?: string; roomColor?: string };

export type Flow = {
  state: FaceState;
  transcript: { key: string; who: "input" | "output"; text: string } | null;
  expression: { name: Expression; strength: number; until: number } | null;
  landed: Landed | null;
};

export type CardChange = { type: string; payload?: { updatedCard?: StickyNote } };

export type FlowEvent =
  | { type: "face"; face: FaceEvent; now: number; captions: boolean }
  | { type: "card_change"; change: CardChange; now: number }
  | { type: "clear_transcript"; key: string }
  | { type: "tick"; now: number };

export const initialFlow = (): Flow => ({ state: "idle", transcript: null, expression: null, landed: null });

export const landedKey = (card: { title: string; room?: string; timeSlot?: string }) =>
  `${card.title}|${card.room ?? ""}|${card.timeSlot ?? ""}`;

export function reduceFlow(flow: Flow, event: FlowEvent): Flow {
  switch (event.type) {
    case "face": {
      const { face, now, captions } = event;
      let next: Flow = { ...flow, state: face.state };
      // Going back to listening is a new turn: the last card and feeling are over.
      if (face.state === "listening" && flow.state !== "listening") {
        next = { ...next, transcript: null, expression: null, landed: null };
      }
      if (face.transcript?.text && captions) {
        const { who, text } = face.transcript;
        // Same speaker keeps typing into the same caption; a new speaker gets a fresh one.
        const key = next.transcript?.who === who ? next.transcript.key : `${who}-${now}`;
        next = { ...next, transcript: { key, who, text } };
      }
      if (face.expression) next = { ...next, expression: { ...face.expression, until: now + EXPRESSION_MS } };
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
    case "tick": {
      const landed = flow.landed && event.now - flow.landed.at >= CARD_MS ? null : flow.landed;
      const expression = flow.expression && event.now >= flow.expression.until ? null : flow.expression;

      return landed === flow.landed && expression === flow.expression ? flow : { ...flow, landed, expression };
    }
    default:
      return flow;
  }
}

/** When the scene next has to look at the clock, or null when nothing is timed. */
export function nextTick(flow: Flow): number | null {
  const times = [flow.landed ? flow.landed.at + CARD_MS : null, flow.expression?.until ?? null].filter(
    (time): time is number => time !== null
  );

  return times.length > 0 ? Math.min(...times) : null;
}
