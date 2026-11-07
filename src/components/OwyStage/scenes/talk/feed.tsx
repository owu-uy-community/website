"use client";

import { createContext, useCallback, useContext, useEffect, useReducer, useRef, useState, type ReactNode } from "react";

import { applyFaceEvent, initialFlow, nextTick, reduceFlow, type Flow } from "lib/owy-stage/face-flow";
import type { FaceState } from "lib/owy-stage/scenes";

import { OwyFace, useFaceEvents, type FaceApi, type FaceBoard } from "../../Face";

/**
 * Owy's face as the talk sees it: one subscription to the face events for the whole deck, read
 * by every mini face (the corner Owy, the devices, the Q&A), the captions, the live diagram and
 * the tool chips. Each face is the device's own (Face.tsx): it joins the feed in Owy's current
 * state and gets every event, feeling and lip shape after that.
 */

/** One turn's timings, measured on the wall: thinking → first words, and the whole turn. */
export type Timing = { ttfa: number | null; total: number | null; running: boolean };

export type Feed = {
  flow: Flow;
  state: FaceState;
  /** The tool running now (thinking), and every tool this turn used. */
  tool: string | null;
  tools: string[];
  timing: Timing;
  /** A face joins the feed (a callback ref) and leaves it when it unmounts. */
  connect: (face: FaceApi | null) => (() => void) | undefined;
};

const FeedContext = createContext<Feed | null>(null);

export function useFeed(): Feed {
  const feed = useContext(FeedContext);
  if (!feed) throw Error("useFeed outside OwyFeed");
  return feed;
}

export function OwyFeed({ children }: { children: ReactNode }) {
  const [flow, dispatch] = useReducer(reduceFlow, undefined, initialFlow);
  const faces = useRef(new Set<FaceApi>());
  const state = useRef<FaceState>("idle");
  const [tool, setTool] = useState<string | null>(null);
  const [tools, setTools] = useState<string[]>([]);
  const [timing, setTiming] = useState<Timing>({ ttfa: null, total: null, running: false });
  const turn = useRef<{ start: number; thinking: number; speaking: number } | null>(null);

  const connect = useCallback((face: FaceApi | null) => {
    if (!face) return;
    faces.current.add(face);
    face.state(state.current);
    return () => {
      faces.current.delete(face);
    };
  }, []);

  useFaceEvents({
    face: (face, now) => {
      state.current = face.state;
      for (const each of faces.current) applyFaceEvent(each, face);
      dispatch({ type: "face", face, now, captions: true });

      // A new turn starts when Owy listens, or thinks without listening first (a typed question).
      const t = turn.current;
      if (face.state === "listening" && (!t || t.speaking || t.thinking)) {
        turn.current = { start: now, thinking: 0, speaking: 0 };
        setTools([]);
        setTiming({ ttfa: null, total: null, running: true });
      }
      if (face.state === "thinking") {
        if (!turn.current || turn.current.speaking) {
          turn.current = { start: now, thinking: now, speaking: 0 };
          setTools([]);
          setTiming({ ttfa: null, total: null, running: true });
        } else if (!turn.current.thinking) turn.current.thinking = now;
      }
      if (face.state === "speaking" && turn.current && !turn.current.speaking) {
        turn.current.speaking = now;
        const from = turn.current.thinking || turn.current.start;
        setTiming((current) => ({ ...current, ttfa: now - from }));
      }
      if ((face.state === "idle" || face.state === "happy") && turn.current?.speaking) {
        const start = turn.current.start;
        setTiming((current) => ({ ...current, total: now - start, running: false }));
        turn.current = null;
      }
      if (face.state === "error" || face.state === "offline") {
        turn.current = null;
        setTiming((current) => ({ ...current, running: false }));
      }

      const running = face.state === "thinking" ? (face.tool ?? null) : null;
      setTool(running);
      if (running) setTools((list) => (list.includes(running) ? list : [...list, running]));
    },
    mouth: (frames, at) => {
      for (const each of faces.current) each.mouth(frames, at);
    },
    level: (level) => {
      for (const each of faces.current) each.level(level);
    },
    smile: () => {
      for (const each of faces.current) each.smile();
    },
  });

  // Captions linger long enough to be read, then clear (same timing as the owy-face scene).
  useEffect(() => {
    const transcript = flow.transcript;
    if (!transcript) return;
    const id = setTimeout(
      () => dispatch({ type: "clear_transcript", key: transcript.key }),
      6000 + transcript.text.length * 40
    );
    return () => clearTimeout(id);
  }, [flow.transcript]);

  useEffect(() => {
    const at = nextTick(flow);
    if (at === null) return;
    const id = setTimeout(() => dispatch({ type: "tick", now: Date.now() }), Math.max(30, at - Date.now()));
    return () => clearTimeout(id);
  }, [flow]);

  return (
    <FeedContext.Provider value={{ flow, state: flow.state, tool, tools, timing, connect }}>
      {children}
    </FeedContext.Provider>
  );
}

/** Owy's face, square, fed by the talk's face events. */
export function MiniFace({ size, board, className }: { size: number; board?: FaceBoard; className?: string }) {
  const { connect } = useFeed();
  return <OwyFace ref={connect} board={board} className={className} size={size} />;
}

/** Owy is in the middle of a turn (listening, thinking or speaking). */
export const isTalking = (state: FaceState) => state === "listening" || state === "thinking" || state === "speaking";

/** "0,9 s" in the Spanish the wall speaks. */
export const seconds = (ms: number | null) =>
  ms === null
    ? "—"
    : `${(ms / 1000).toLocaleString("es-UY", { maximumFractionDigits: 1, minimumFractionDigits: 1 })} s`;
