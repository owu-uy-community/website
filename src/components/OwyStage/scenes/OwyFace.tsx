"use client";

import { useContext, useEffect, useRef, useState } from "react";
import { AnimatePresence } from "motion/react";

import { useRealtimeChannel } from "hooks/useRealtimeChannel";
import {
  OWY_STAGE_CHANNEL,
  type EffectEvent,
  type FaceEvent,
  type FaceState,
  type SceneProps,
} from "lib/owy-stage/scenes";

import { Ambient, BRAND, Caption, H, StageContext, W, useStageFrame } from "../Stage";

/**
 * Owy's face at wall scale. The geometry, moods and timings are the companion
 * firmware's (owy/companion/firmware/companion_model.h, previewed in
 * owy/companion/docs/experience.html), drawn in the same 466×466 space and
 * scaled up, so the wall Owy and the table Owy are the same character.
 */

const S = 1.9;
const OX = (W - 466 * S) / 2;
const OY = 40;

const EYE_GREY = "#777368";
const DOT_DIM = "#343126";
const HAPPY_MS = 2500;
const BLINK_MS = 160;

type Mood = Exclude<FaceState, "happy">;

type Sim = {
  mood: Mood;
  happyUntil: number;
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

function box(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x - w / 2, y - h / 2, w, h, Math.min(r, h / 2, w / 2));
  ctx.fill();
}

function ease(dt: number, tau: number) {
  return 1 - Math.exp(-dt / tau);
}

function drawFace(ctx: CanvasRenderingContext2D, s: Sim, t: number, dt: number) {
  const { mood } = s;
  const alive = mood !== "offline" && mood !== "error";
  const voice = mood === "listening" || mood === "thinking" || mood === "speaking";
  const happy = alive && !voice && t < s.happyUntil;

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
  let eh = s.eyeH;
  if (alive && !happy) {
    if (t >= s.blinkAt + BLINK_MS) s.blinkAt = t + 2500 + Math.random() * 3500;
    else if (t >= s.blinkAt) eh = 12 + (eh - 12) * Math.abs((2 * (t - s.blinkAt)) / BLINK_MS - 1);
  }
  const rh = mood === "thinking" ? Math.max(12, eh - 18) : eh;

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
  const mw = happy ? 126 : voice ? 76 : 100;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.setTransform(S, 0, 0, S, OX, OY);

  const browTilt = mood === "thinking" ? 8 : 0;
  box(ctx, 139, 83 - browTilt, 48, 12, 3, BRAND.yellow);
  box(ctx, 327, 83 + browTilt, 48, 12, 3, BRAND.blue);

  const eyeColor = mood === "offline" ? EYE_GREY : BRAND.cream;
  box(ctx, 144, 209, 152, eh, 58, eyeColor);
  box(ctx, 322, 209, 152, rh, 58, eyeColor);
  for (const [cx, h] of [
    [144, eh],
    [322, rh],
  ] as const) {
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(cx - 76, 209 - h / 2, 152, h, Math.min(58, h / 2));
    ctx.clip();
    box(ctx, cx + s.px, 209 + s.py, 44, Math.max(1, Math.min(54, h - 20)), 20, BRAND.black);
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
  if (happy) {
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

type Transcript = { key: string; who: "input" | "output"; text: string };

export default function OwyFace({ params }: SceneProps<"owy-face">) {
  const { preview } = useContext(StageContext);
  const canvas = useRef<HTMLCanvasElement>(null);
  const sim = useRef<Sim>({
    mood: "idle",
    happyUntil: 0,
    px: 0,
    py: 0,
    gx: 0,
    gy: 0,
    nextSaccade: 0,
    blinkAt: 2500,
    eyeH: 156,
    mouthH: 28,
  });
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const turn = useRef(0);

  useRealtimeChannel(preview ? null : OWY_STAGE_CHANNEL, (event, payload) => {
    const s = sim.current;
    if (event === "face") {
      const face = payload as FaceEvent;
      if (face.state === "happy") s.happyUntil = performance.now() + HAPPY_MS;
      else s.mood = face.state;
      if (face.transcript && params.captions) {
        const { who, text } = face.transcript;
        // Same speaker keeps typing into the same caption; a new speaker gets a fresh one.
        setTranscript((current) => {
          const key = current?.who === who ? current.key : `${who}-${++turn.current}`;
          return text ? { key, who, text } : current;
        });
      }
    }
    if (event === "effect" && (payload as EffectEvent).effect === "owy-happy") {
      s.happyUntil = performance.now() + HAPPY_MS;
    }
  });

  // Captions linger long enough to be read, then clear; every update extends the timer.
  useEffect(() => {
    if (!transcript) return;
    const id = setTimeout(() => setTranscript(null), 6000 + transcript.text.length * 40);
    return () => clearTimeout(id);
  }, [transcript]);

  useStageFrame((t, dt) => {
    const ctx = canvas.current?.getContext("2d");
    if (ctx) drawFace(ctx, sim.current, t, dt);
  });

  return (
    <>
      <Ambient />
      <canvas ref={canvas} className="absolute inset-0" height={H} width={W} />
      <AnimatePresence>
        {transcript && <Caption key={transcript.key} text={transcript.text} who={transcript.who} />}
      </AnimatePresence>
    </>
  );
}
