"use client";

import { createContext, useContext, useEffect, useReducer, useRef, useState, type ReactNode } from "react";

import { useRealtimeChannel } from "hooks/useRealtimeChannel";
import { EXPRESSION_MS, initialFlow, nextTick, reduceFlow, type Flow } from "lib/owy-stage/face-flow";
import {
  OWY_STAGE_CHANNEL,
  type EffectEvent,
  type Expression,
  type FaceEvent,
  type FaceState,
} from "lib/owy-stage/scenes";

import { StageContext, useStageFrame } from "../../Stage";
import { HAPPY_MS, drawFace, initialSim, squareView, type Mood, type Sim } from "../OwyFace";

/**
 * Owy's face as the talk sees it: one subscription to the face events for the whole deck, read
 * by every mini face (the corner Owy, the devices, the Q&A), the captions, the live diagram and
 * the tool chips. Each canvas keeps its own Sim (its own clock) and copies the mood from here.
 */

type Live = {
  mood: Mood;
  /** Wall-clock times of the last smile and feeling, so each canvas starts them on its own clock. */
  happyAt: number;
  expression: { name: Expression; strength: number; at: number } | null;
};

/** One turn's timings, measured on the wall: thinking → first words, and the whole turn. */
export type Timing = { ttfa: number | null; total: number | null; running: boolean };

export type Feed = {
  flow: Flow;
  state: FaceState;
  /** The tool running now (thinking), and every tool this turn used. */
  tool: string | null;
  tools: string[];
  timing: Timing;
  live: React.RefObject<Live>;
};

const FeedContext = createContext<Feed | null>(null);

export function useFeed(): Feed {
  const feed = useContext(FeedContext);
  if (!feed) throw Error("useFeed outside OwyFeed");
  return feed;
}

export function OwyFeed({ children }: { children: ReactNode }) {
  const { preview } = useContext(StageContext);
  const [flow, dispatch] = useReducer(reduceFlow, undefined, initialFlow);
  const live = useRef<Live>({ mood: "idle", happyAt: 0, expression: null });
  const [tool, setTool] = useState<string | null>(null);
  const [tools, setTools] = useState<string[]>([]);
  const [timing, setTiming] = useState<Timing>({ ttfa: null, total: null, running: false });
  const turn = useRef<{ start: number; thinking: number; speaking: number } | null>(null);

  useRealtimeChannel(preview ? null : OWY_STAGE_CHANNEL, (event, payload) => {
    if (event === "effect" && (payload as EffectEvent).effect === "owy-happy") live.current.happyAt = Date.now();
    if (event !== "face") return;
    const face = payload as FaceEvent;
    const now = Date.now();
    if (face.state === "happy" || face.card) live.current.happyAt = now;
    if (face.state !== "happy") live.current.mood = face.state;
    if (face.expression) live.current.expression = { ...face.expression, at: now };
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
    <FeedContext.Provider value={{ flow, state: flow.state, tool, tools, timing, live }}>
      {children}
    </FeedContext.Provider>
  );
}

/** A square Owy face fed by the talk's face events; `drive` takes over the face instead (the expressions slide). */
export function MiniFace({
  size,
  className = "",
  drive,
}: {
  size: number;
  className?: string;
  drive?: (sim: Sim, t: number) => void;
}) {
  const { live } = useFeed();
  const canvas = useRef<HTMLCanvasElement>(null);
  const sim = useRef<Sim>(initialSim());
  const seen = useRef({ happy: 0, expression: 0 });
  const view = squareView(size);

  useStageFrame((t, dt) => {
    const s = sim.current;
    s.now = t;
    if (drive) drive(s, t);
    else {
      const l = live.current;
      s.mood = l.mood;
      if (l.happyAt > seen.current.happy) {
        seen.current.happy = l.happyAt;
        s.happyUntil = t + HAPPY_MS - (Date.now() - l.happyAt);
      }
      if (l.expression && l.expression.at > seen.current.expression) {
        seen.current.expression = l.expression.at;
        const { name, strength } = l.expression;
        s.expression = { name, strength, until: t + EXPRESSION_MS - (Date.now() - l.expression.at) };
      }
    }
    const ctx = canvas.current?.getContext("2d");
    if (ctx) drawFace(ctx, s, t, dt, view);
  });

  return <canvas ref={canvas} className={className} height={size} width={size} />;
}

/** Owy is in the middle of a turn (listening, thinking or speaking). */
export const isTalking = (state: FaceState) => state === "listening" || state === "thinking" || state === "speaking";

/** "0,9 s" in the Spanish the wall speaks. */
export const seconds = (ms: number | null) =>
  ms === null
    ? "—"
    : `${(ms / 1000).toLocaleString("es-UY", { maximumFractionDigits: 1, minimumFractionDigits: 1 })} s`;
