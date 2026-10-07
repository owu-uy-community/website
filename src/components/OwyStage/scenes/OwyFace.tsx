"use client";

import { Fragment, useCallback, useContext, useEffect, useReducer, useRef, useState } from "react";
import { AnimatePresence, m } from "motion/react";

import { EASE_OUT } from "app/conf/components/Reveal";
import { useRealtimeChannel } from "hooks/useRealtimeChannel";
import { client, type Room, type Schedule, type StickyNote } from "lib/orpc";
import {
  CARD_MS,
  EXPRESSION_MS,
  FACE_RESUME_MS,
  initialFlow,
  nextTick,
  reduceFlow,
  type CardChange,
  type Landed,
} from "lib/owy-stage/face-flow";
import {
  OWY_STAGE_CHANNEL,
  type EffectEvent,
  type Expression,
  type FaceEvent,
  type FaceState,
  type SceneProps,
} from "lib/owy-stage/scenes";
import { eventChannel } from "lib/realtime/channels";
import { roomColorFor } from "lib/rooms/palette";

import { Ambient, BRAND, Caption, Flag, H, StageContext, W, useStageFrame, useTyped } from "../Stage";

/**
 * Owy's face at wall scale. The geometry, moods and timings are the companion
 * firmware's (owy/companion/firmware/companion_model.h, previewed in
 * owy/companion/docs/experience.html), drawn in the same 466×466 space and
 * scaled up, so the wall Owy and the table Owy are the same character.
 *
 * Around the face, what the companion is doing: the transcript typing in, a
 * feeling per sentence, and — at the open space's marketplace — the pitch it
 * just heard landing on the board as a card.
 */

const S = 1.9;
const OX = (W - 466 * S) / 2;
const OY = 40;

const EYE_GREY = "#777368";
const DOT_DIM = "#343126";
const BLINK_MS = 160;

export type Mood = Exclude<FaceState, "happy">;

export type Sim = {
  mood: Mood;
  /** Last frame time on the scene clock (motion's time-since-mount, not performance.now). */
  now: number;
  happyUntil: number;
  /** The companion's per-sentence feeling, fading out at `until` (scene clock). */
  expression: { name: Expression; strength: number; until: number } | null;
  /** Smoothed gaze offset and its target. */
  px: number;
  py: number;
  gx: number;
  gy: number;
  nextSaccade: number;
  blinkAt: number;
  eyeH: number;
  mouthH: number;
};

const EYE_H: Record<Mood, number> = { idle: 156, listening: 176, thinking: 142, speaking: 156, error: 88, offline: 94 };
const HAPPY_EYE_H = 56;

/** How a feeling bends the face: eye height, brow lift (negative = up), pupil size, right-eye squint, mouth width. */
type Tweak = {
  eye: number;
  browL: number;
  browR: number;
  pupil: number;
  squintR: number;
  mouth: number;
  cheeks: boolean;
};
const NO_TWEAK: Tweak = { eye: 0, browL: 0, browR: 0, pupil: 1, squintR: 1, mouth: 0, cheeks: false };
const TWEAKS: Record<Expression, Partial<Tweak>> = {
  neutral: {},
  happy: { eye: -40, mouth: 16, cheeks: true },
  excited: { eye: 12, browL: -10, browR: -10, mouth: 26, cheeks: true },
  curious: { eye: 4, browL: -14, browR: 4 },
  thinking: { eye: -12, browL: -6, browR: 10 },
  empathetic: { eye: -16, browL: 10, browR: -10 },
  playful: { squintR: 0.5, browR: -8, mouth: 8 },
  surprised: { eye: 24, browL: -20, browR: -20, pupil: 0.78, mouth: -6 },
};

function box(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x - w / 2, y - h / 2, w, h, Math.min(r, h / 2, w / 2));
  ctx.fill();
}

function ease(dt: number, tau: number) {
  return 1 - Math.exp(-dt / tau);
}

export function drawFace(ctx: CanvasRenderingContext2D, s: Sim, t: number, dt: number) {
  s.now = t;
  const { mood } = s;
  const alive = mood !== "offline" && mood !== "error";
  const voice = mood === "listening" || mood === "thinking" || mood === "speaking";
  const happy = alive && !voice && t < s.happyUntil;

  // A feeling fades over its last 400 ms; its strength scales every tweak.
  const feeling = s.expression && t < s.expression.until ? s.expression : null;
  const k = feeling ? (feeling.strength / 100) * Math.min(1, (feeling.until - t) / 400) : 0;
  const tweak = { ...NO_TWEAK, ...(feeling ? TWEAKS[feeling.name] : {}) };

  // Gaze: idle looks around (drift + saccades); voice states face the speaker.
  if (!alive || voice) {
    s.gx = 0;
    s.gy = 0;
  } else if (t >= s.nextSaccade) {
    s.gx = (Math.random() - 0.5) * 64;
    s.gy = (Math.random() - 0.5) * 50;
    s.nextSaccade = t + 1800 + Math.random() * 3200;
  }
  const tx = s.gx + (alive && !voice ? Math.sin(t / 2400) * 4 : 0);
  const ty = s.gy + (alive && !voice ? Math.sin(t / 1000) * 1.5 : 0);
  s.px += (tx - s.px) * (dt / (32 + dt));
  s.py += (ty - s.py) * (dt / (32 + dt));

  // Eye height eases between moods; blinks override it for 160 ms.
  s.eyeH += ((happy ? HAPPY_EYE_H : EYE_H[mood]) - s.eyeH) * ease(dt, 70);
  let eh = Math.max(12, s.eyeH + tweak.eye * k);
  if (alive && !happy) {
    if (t >= s.blinkAt + BLINK_MS) s.blinkAt = t + 2500 + Math.random() * 3500;
    else if (t >= s.blinkAt) eh = 12 + (eh - 12) * Math.abs((2 * (t - s.blinkAt)) / BLINK_MS - 1);
  }
  const rh = Math.max(12, (mood === "thinking" ? Math.max(12, eh - 18) : eh) * (1 - (1 - tweak.squintR) * k));

  // Mouth: procedural syllables while speaking (no level is streamed to the wall).
  let mouthTarget = 28;
  if (happy) mouthTarget = 42;
  else if (mood === "speaking") {
    const gate = Math.sin(t / 97) * Math.sin(t / 151) > -0.2 ? 1 : 0.15;
    mouthTarget = 14 + 40 * gate * (0.6 + 0.4 * Math.abs(Math.sin(t / 60)));
  } else if (voice) mouthTarget = 14;
  else if (!alive) mouthTarget = 8;
  s.mouthH += (mouthTarget - s.mouthH) * ease(dt, 45);
  const mh = s.mouthH;
  const mw = (happy ? 126 : voice ? 76 : 100) + tweak.mouth * k;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.setTransform(S, 0, 0, S, OX, OY);

  // Listening: the knob's rim, a blue halo breathing around the face.
  if (mood === "listening") {
    ctx.save();
    ctx.globalAlpha = 0.22 + 0.16 * Math.sin(t / 420);
    ctx.strokeStyle = BRAND.blue;
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(233, 233, 250, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  const browTilt = mood === "thinking" ? 8 : 0;
  box(ctx, 139, 83 - browTilt + tweak.browL * k, 48, 12, 3, BRAND.yellow);
  box(ctx, 327, 83 + browTilt + tweak.browR * k, 48, 12, 3, BRAND.blue);

  const eyeColor = mood === "offline" ? EYE_GREY : BRAND.cream;
  box(ctx, 144, 209, 152, eh, 58, eyeColor);
  box(ctx, 322, 209, 152, rh, 58, eyeColor);
  const pupil = 1 - (1 - tweak.pupil) * k;
  for (const [cx, h] of [
    [144, eh],
    [322, rh],
  ] as const) {
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(cx - 76, 209 - h / 2, 152, h, Math.min(58, h / 2));
    ctx.clip();
    box(ctx, cx + s.px, 209 + s.py, 44 * pupil, Math.max(1, Math.min(54, h - 20)) * pupil, 20, BRAND.black);
    ctx.restore();
  }

  const mx = 233 + s.px / 3;
  box(ctx, mx, 349, mw, mh, 18, BRAND.cream);
  if (mood === "idle" || happy) {
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(mx - mw / 2, 349 - mh / 2, mw, mh, Math.min(18, mh / 2));
    ctx.clip();
    box(ctx, mx, 341, mw - 20, mh - 4, 12, BRAND.black);
    ctx.restore();
  }
  if (happy || (tweak.cheeks && k > 0.2)) {
    box(ctx, 82, 317, 30, 14, 4, BRAND.yellow);
    box(ctx, 384, 317, 30, 14, 4, BRAND.blue);
  }
  if (mood === "thinking") {
    const active = Math.floor(t / 350) % 3;
    for (let i = 0; i < 3; i++) box(ctx, 209 + 24 * i, 401, 10, 10, 5, i === active ? BRAND.yellow : DOT_DIM);
  }
  if (mood === "listening") {
    box(ctx, 233, 401, 14, 24, 7, BRAND.blue);
    box(ctx, 233, 417, 4, 12, 0, BRAND.cream);
    box(ctx, 233, 423, 18, 4, 2, BRAND.cream);
  }
}

export function initialSim(): Sim {
  return {
    mood: "idle",
    now: 0,
    happyUntil: 0,
    expression: null,
    px: 0,
    py: 0,
    gx: 0,
    gy: 0,
    nextSaccade: 0,
    blinkAt: 2500,
    eyeH: 156,
    mouthH: 28,
  };
}

export const HAPPY_MS = 2500;

/** The face slides left to make room for the pitch panel or the landed card. */
const ASIDE_PX = 380;

export default function OwyFace({ params, eventId }: SceneProps<"owy-face">) {
  const { preview } = useContext(StageContext);
  const canvas = useRef<HTMLCanvasElement>(null);
  const sim = useRef<Sim>(initialSim());
  const [flow, dispatch] = useReducer(reduceFlow, undefined, initialFlow);
  const captions = params.captions;

  const applyFace = useCallback(
    (face: FaceEvent, now: number) => {
      const s = sim.current;
      if (face.state === "happy" || face.card) s.happyUntil = s.now + HAPPY_MS;
      if (face.state !== "happy") s.mood = face.state;
      if (face.expression) s.expression = { ...face.expression, until: s.now + EXPRESSION_MS };
      dispatch({ type: "face", face, now, captions });
    },
    [captions]
  );

  const { isConnected } = useRealtimeChannel(preview ? null : OWY_STAGE_CHANNEL, (event, payload) => {
    if (event === "face") applyFace(payload as FaceEvent, Date.now());
    if (event === "effect" && (payload as EffectEvent).effect === "owy-happy") {
      sim.current.happyUntil = sim.current.now + HAPPY_MS;
    }
  });
  // The board's own event for a new card: it lands even if the companion's post never arrives.
  useRealtimeChannel(eventId && !preview ? eventChannel(eventId, "sync") : null, (event, payload) => {
    if (event === "card_change") dispatch({ type: "card_change", change: payload as CardChange, now: Date.now() });
  });

  // A wall that (re)connects mid-conversation picks up the last face and, if recent, its card.
  useEffect(() => {
    if (preview || !isConnected) return;
    let live = true;
    client.owyStage
      .getState()
      .then(({ face }) => {
        if (!live || !face) return;
        const at = Date.parse(face.at);
        const age = Date.now() - at;
        if (!Number.isFinite(age) || age > FACE_RESUME_MS) return;
        applyFace({ ...face, card: age < CARD_MS ? face.card : undefined }, at);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [preview, isConnected, applyFace]);

  // Captions linger long enough to be read, then clear; every update extends the timer.
  useEffect(() => {
    const transcript = flow.transcript;
    if (!transcript) return;
    const id = setTimeout(
      () => dispatch({ type: "clear_transcript", key: transcript.key }),
      6000 + transcript.text.length * 40
    );
    return () => clearTimeout(id);
  }, [flow.transcript]);

  // The card and the feeling expire on the wall clock.
  useEffect(() => {
    const at = nextTick(flow);
    if (at === null) return;
    const id = setTimeout(() => dispatch({ type: "tick", now: Date.now() }), Math.max(30, at - Date.now()));
    return () => clearTimeout(id);
  }, [flow]);

  useStageFrame((t, dt) => {
    const ctx = canvas.current?.getContext("2d");
    if (ctx) drawFace(ctx, sim.current, t, dt);
  });

  const transcript = flow.transcript;
  const panel = transcript !== null && flow.landed === null && transcript.text.length > 160;
  const aside = panel || flow.landed !== null;

  return (
    <>
      <Ambient />
      <canvas
        ref={canvas}
        className="absolute inset-0 transition-transform duration-700 ease-out"
        height={H}
        style={{ transform: aside ? `translateX(-${ASIDE_PX}px)` : undefined }}
        width={W}
      />
      <AnimatePresence>
        {transcript && !panel && flow.landed === null && (
          <Caption key={transcript.key} text={transcript.text} who={transcript.who} />
        )}
        {transcript && panel && <PitchPanel key={transcript.key} text={transcript.text} who={transcript.who} />}
        {flow.landed && <LandedCard key={flow.landed.key} card={flow.landed} eventId={eventId} />}
      </AnimatePresence>
    </>
  );
}

/** A long transcript (a pitch) beside the face instead of the lower third: the tail, typed in. */
function PitchPanel({ text, who }: { text: string; who: "input" | "output" }) {
  const { bg } = useContext(StageContext);
  const shown = text.length > 700 ? `…${text.slice(-700)}` : text;
  const typed = useTyped(shown);
  const accent = who === "input" ? BRAND.blue : BRAND.yellow;

  return (
    <m.div
      animate={{ x: 0, opacity: 1 }}
      className="absolute top-[120px] right-[96px] flex w-[760px] items-start gap-6"
      exit={{ x: 24, opacity: 0, transition: { duration: 0.35, ease: "easeIn" } }}
      initial={{ x: 40, opacity: 0 }}
      transition={{ duration: 0.55, ease: EASE_OUT }}
    >
      <Flag className="mt-2 h-[56px] w-[56px] shrink-0" fill={accent} />
      <p
        className="text-[34px] leading-[1.2] font-semibold tracking-[-0.01em] text-[#FBF5E7]"
        style={bg === "transparent" ? { textShadow: "0 2px 24px rgba(0,0,0,0.85)" } : undefined}
      >
        {typed}
      </p>
    </m.div>
  );
}

type BoardSnapshot = { rooms: Room[]; schedules: Schedule[]; tracks: StickyNote[] };

/** The board once, when a card lands (the create already happened, so the new talk is in it). */
function useBoardSnapshot(eventId: string | null) {
  const [data, setData] = useState<BoardSnapshot | null>(null);
  useEffect(() => {
    if (!eventId) return;
    let live = true;
    Promise.all([
      client.rooms.getByOpenSpace({ openSpaceId: eventId }),
      client.schedules.getByOpenSpace({ openSpaceId: eventId }),
      client.tracks.list({ openSpaceId: eventId }),
    ])
      .then(([rooms, schedules, tracks]) => live && setData({ rooms, schedules, tracks }))
      .catch((error) => console.error("[stage] board", error));
    return () => {
      live = false;
    };
  }, [eventId]);

  return data;
}

const sameName = (a: string | undefined, b: string | undefined) =>
  Boolean(a && b && a.trim().toLowerCase() === b.trim().toLowerCase());

/** The talk that just landed, as a sticky note in its room's colour, with its place on a mini board. */
function LandedCard({ card, eventId }: { card: Landed; eventId: string | null }) {
  const board = useBoardSnapshot(eventId);
  const room =
    board?.rooms.find((candidate) => candidate.id === card.roomId) ??
    board?.rooms.find((candidate) => sameName(candidate.name, card.room));
  const slot =
    board?.schedules.find((candidate) => candidate.id === card.scheduleId) ??
    board?.schedules.find((candidate) => `${candidate.startTime} - ${candidate.endTime}` === card.timeSlot);
  const color = roomColorFor(room?.id ?? card.roomId ?? "", card.roomColor ?? room?.color);
  const start = card.timeSlot?.split(" - ")[0];

  return (
    <m.div
      animate={{ opacity: 1 }}
      className="absolute top-[110px] right-[96px] flex w-[720px] flex-col gap-6"
      exit={{ opacity: 0, y: 20, transition: { duration: 0.4, ease: "easeIn" } }}
      initial={{ opacity: 0 }}
    >
      <m.div
        animate={{ scale: 1, y: 0, opacity: 1, rotate: 1.5 }}
        className="rounded-[28px] px-10 py-8 text-[#1F1F1F] shadow-[0_30px_80px_rgba(0,0,0,0.45)]"
        initial={{ scale: 0.6, y: 120, opacity: 0, rotate: -6 }}
        style={{ background: color }}
        transition={{ duration: 0.7, ease: EASE_OUT }}
      >
        <p className="text-[20px] font-semibold tracking-[0.18em] uppercase opacity-70">Nueva charla</p>
        <h2 className="mt-2 line-clamp-2 text-[46px] leading-[1.05] font-black tracking-[-0.02em] text-balance">
          {card.title}
        </h2>
        {card.speaker && <p className="mt-3 text-[30px] font-semibold">{card.speaker}</p>}
        {(card.room || start) && (
          <p className="mt-5 text-[34px] font-bold">→ {[card.room, start].filter(Boolean).join(" · ")}</p>
        )}
        {card.reasoning && <p className="mt-3 line-clamp-2 text-[20px] leading-snug opacity-75">{card.reasoning}</p>}
      </m.div>
      {board && room && slot && <MiniBoard board={board} roomId={room.id} scheduleId={slot.id} />}
    </m.div>
  );
}

/** Rooms across, blocks down, the landed cell pulsing in its room's colour. */
function MiniBoard({ board, roomId, scheduleId }: { board: BoardSnapshot; roomId: string; scheduleId: string }) {
  const rooms = board.rooms.filter((room) => room.isActive).slice(0, 6);
  const all = board.schedules
    .filter((slot) => slot.isActive)
    .toSorted((a, b) => a.startTime.localeCompare(b.startTime));
  const at = Math.max(
    0,
    all.findIndex((slot) => slot.id === scheduleId)
  );
  const from = Math.max(0, Math.min(at - 2, all.length - 5));
  const slots = all.slice(from, from + 5);
  const taken = new Set(board.tracks.map((track) => `${track.roomId}|${track.scheduleId}`));

  return (
    <m.div
      animate={{ opacity: 1, y: 0 }}
      className="rounded-[20px] bg-black/40 p-5 backdrop-blur"
      initial={{ opacity: 0, y: 24 }}
      transition={{ delay: 0.5, duration: 0.5, ease: EASE_OUT }}
    >
      <div className="grid gap-2" style={{ gridTemplateColumns: `88px repeat(${rooms.length}, minmax(0, 1fr))` }}>
        <div />
        {rooms.map((room) => (
          <div key={room.id} className="truncate text-center text-[16px] font-semibold text-[#FBF5E7]/80">
            {room.name}
          </div>
        ))}
        {slots.map((slot) => (
          <Fragment key={slot.id}>
            <div className="self-center text-[16px] font-semibold text-[#FBF5E7]/70">{slot.startTime}</div>
            {rooms.map((room) => {
              const here = room.id === roomId && slot.id === scheduleId;
              const busy = taken.has(`${room.id}|${slot.id}`);

              return (
                <m.div
                  key={room.id}
                  animate={here ? { scale: [1, 1.12, 1] } : undefined}
                  className="h-[44px] rounded-[10px]"
                  style={{
                    background: here || busy ? roomColorFor(room.id, room.color) : "rgba(251,245,231,0.08)",
                    opacity: here ? 1 : busy ? 0.4 : 1,
                  }}
                  transition={here ? { duration: 0.9, repeat: 2, delay: 0.8 } : undefined}
                />
              );
            })}
          </Fragment>
        ))}
      </div>
    </m.div>
  );
}
