"use client";

import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, m } from "motion/react";

import { EASE_OUT } from "app/conf/components/Reveal";
import type { SceneProps } from "lib/owy-stage/scenes";

import { Confetti } from "../effects";
import { Ambient, BRAND, H, StageContext, W, useStageFrame } from "../Stage";
import { Rise } from "./parts";
import { parseProgram, secondsUntil, useNow } from "./useful";

const rand = (min: number, max: number) => min + Math.random() * (max - min);
const TAU = Math.PI * 2;
const COLORS = [BRAND.yellow, BRAND.blue, BRAND.cream];
const splitList = (value: string, sep = "|") =>
  value
    .split(sep)
    .map((v) => v.trim())
    .filter(Boolean);

// ---------------------------------------------------------------------------
// Poll — results typed in by hand
// ---------------------------------------------------------------------------

export function Poll({ params }: SceneProps<"poll">) {
  const options = splitList(params.options);
  const votes = splitList(params.votes).map((v) => Math.max(0, Number(v) || 0));
  const total = options.reduce((sum, _, i) => sum + (votes[i] ?? 0), 0) || 1;
  const max = Math.max(...options.map((_, i) => votes[i] ?? 0));

  return (
    <>
      <Ambient />
      <div className="absolute top-[100px] left-[140px] w-[1500px]">
        <Rise className="text-[30px] font-semibold tracking-[0.3em] text-[#F5BB03] uppercase" delay={0.05}>
          Encuesta · {total} votos
        </Rise>
        <Rise className="mt-3 text-[72px] leading-[1.05] font-extrabold tracking-[-0.02em] text-balance" delay={0.15}>
          {params.question}
        </Rise>
      </div>
      <div className="absolute top-[340px] right-[140px] left-[340px] flex flex-col gap-[22px]">
        {options.map((option, i) => {
          const n = votes[i] ?? 0;
          const pct = Math.round((n / total) * 100);
          const leader = n === max && n > 0;
          return (
            <div key={`${i}-${option}`}>
              <div className="flex items-end justify-between px-2">
                <span className={`text-[48px] font-bold ${leader ? "text-[#F5BB03]" : "text-[#FBF5E7]"}`}>
                  {option}
                </span>
                <span className="text-[48px] font-extrabold text-[#FBF5E7] tabular-nums">
                  {pct}% <span className="text-[28px] font-medium opacity-60">({n})</span>
                </span>
              </div>
              <div className="mt-2 h-[44px] bg-[#FBF5E7]/[0.08]">
                <m.div
                  animate={{ width: `${Math.max(1, pct)}%` }}
                  className={`h-full ${leader ? "bg-[#F5BB03]" : "bg-[#0162C8]"}`}
                  initial={{ width: 0 }}
                  transition={{ duration: 1.1, delay: 0.3 + i * 0.12, ease: EASE_OUT }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Wheel — spins, lands, confetti
// ---------------------------------------------------------------------------

const RADIUS = 440;

export function Wheel({ params }: SceneProps<"wheel">) {
  const { preview } = useContext(StageContext);
  const canvas = useRef<HTMLCanvasElement>(null);
  const names = useMemo(() => splitList(params.names, ","), [params.names]);
  const spin = useRef({ from: 0, to: 0, start: 0, end: 0, angle: 0 });
  const [winner, setWinner] = useState<string | null>(null);
  const [round, setRound] = useState(0);

  useStageFrame((t) => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx || !names.length) return;
    const s = spin.current;
    if (!preview) {
      if (!s.end) {
        s.start = t + 800;
        s.end = s.start + 7000;
        s.from = s.angle;
        s.to = s.angle + rand(6, 9) * TAU;
      }
      if (t >= s.start && t <= s.end) {
        const k = (t - s.start) / (s.end - s.start);
        s.angle = s.from + (s.to - s.from) * (1 - Math.pow(1 - k, 3));
      } else if (t > s.end) {
        s.angle = s.to;
        const n = names.length;
        // Pointer sits at the top (−90°); find the segment under it.
        const at = (((-Math.PI / 2 - s.angle) % TAU) + TAU) % TAU;
        const index = Math.floor((at / TAU) * n);
        if (winner !== names[index]) setWinner(names[index]);
        if (params.loop && t > s.end + 8000) {
          s.end = 0;
          setWinner(null);
          setRound((r) => r + 1);
        }
      }
    }
    ctx.clearRect(0, 0, W, H);
    const cx = 700;
    const cy = H / 2;
    const n = names.length;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(s.angle);
    names.forEach((name, i) => {
      const a0 = (i / n) * TAU;
      const a1 = ((i + 1) / n) * TAU;
      ctx.fillStyle = COLORS[i % 3 === 2 && n % 3 === 0 ? 2 : i % 2];
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, RADIUS, a0, a1);
      ctx.closePath();
      ctx.fill();
      ctx.save();
      ctx.rotate((a0 + a1) / 2);
      ctx.fillStyle = BRAND.black;
      ctx.font = `bold ${Math.min(40, 1800 / n)}px Poppins, sans-serif`;
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillText(name.slice(0, 18), RADIUS - 30, 0);
      ctx.restore();
    });
    ctx.restore();
    ctx.fillStyle = BRAND.black;
    ctx.beginPath();
    ctx.arc(cx, cy, 40, 0, TAU);
    ctx.fill();
    ctx.fillStyle = BRAND.cream;
    ctx.beginPath();
    ctx.moveTo(cx - 34, cy - RADIUS - 30);
    ctx.lineTo(cx + 34, cy - RADIUS - 30);
    ctx.lineTo(cx, cy - RADIUS + 40);
    ctx.closePath();
    ctx.fill();
  });

  return (
    <>
      <canvas ref={canvas} className="absolute inset-0" height={H} width={W} />
      <div className="absolute top-[300px] right-[120px] w-[560px]">
        <p className="text-[30px] font-semibold tracking-[0.3em] text-[#F5BB03] uppercase">{params.title}</p>
        <AnimatePresence mode="wait">
          {winner ? (
            <m.p
              key={`${round}-${winner}`}
              animate={{ opacity: 1, scale: 1 }}
              className="mt-6 text-[110px] leading-[1] font-extrabold tracking-[-0.02em] text-balance"
              exit={{ opacity: 0 }}
              initial={{ opacity: 0, scale: 0.7 }}
              transition={{ duration: 0.5, ease: EASE_OUT }}
            >
              {winner}
            </m.p>
          ) : (
            <m.p
              key="spinning"
              animate={{ opacity: 1 }}
              className="mt-6 text-[60px] font-bold text-[#FBF5E7]/50"
              exit={{ opacity: 0 }}
            >
              Girando…
            </m.p>
          )}
        </AnimatePresence>
      </div>
      {winner && !preview && (
        <div className="pointer-events-none absolute inset-0">
          <Confetti key={round} />
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Coin — heads or tails, decided on the wall
// ---------------------------------------------------------------------------

export function Coin({ params }: SceneProps<"coin">) {
  const { preview } = useContext(StageContext);
  const [flip, setFlip] = useState<{ n: number; tails: boolean }>({ n: 0, tails: false });
  const [landed, setLanded] = useState(preview);

  useEffect(() => {
    if (preview) return;
    let cancelled = false;
    const go = () => {
      if (cancelled) return;
      setLanded(false);
      setFlip((f) => ({ n: f.n + 1, tails: Math.random() < 0.5 }));
      setTimeout(() => {
        if (!cancelled) setLanded(true);
      }, 2600);
    };
    go();
    const id = setInterval(go, 8000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [preview]);

  const face = "absolute inset-0 flex items-center justify-center rounded-full text-[64px] font-extrabold uppercase";
  return (
    <>
      <Ambient />
      <div className="absolute inset-0 flex items-center justify-center" style={{ perspective: 1800 }}>
        <m.div
          key={flip.n}
          animate={{ rotateY: 1800 + (flip.tails ? 180 : 0), y: [0, -320, 0] }}
          className="relative h-[520px] w-[520px]"
          initial={{ rotateY: 0, y: 0 }}
          style={{ transformStyle: "preserve-3d" }}
          transition={{ duration: preview ? 0 : 2.5, ease: [0.2, 0.7, 0.2, 1] }}
        >
          <div className={`${face} bg-[#F5BB03] text-black`} style={{ backfaceVisibility: "hidden" }}>
            {params.heads}
          </div>
          <div
            className={`${face} bg-[#0162C8] text-[#FBF5E7]`}
            style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
          >
            {params.tails}
          </div>
        </m.div>
      </div>
      <div className="absolute inset-x-0 bottom-[110px] text-center">
        <AnimatePresence>
          {landed && (
            <m.p
              key={flip.n}
              animate={{ opacity: 1, y: 0 }}
              className="text-[96px] font-extrabold tracking-[-0.02em] uppercase"
              exit={{ opacity: 0 }}
              initial={{ opacity: 0, y: 30 }}
            >
              {flip.tails ? params.tails : params.heads}
            </m.p>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Scoreboard
// ---------------------------------------------------------------------------

function Score({ value, color }: { value: number; color: string }) {
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <m.span
        key={value}
        animate={{ y: 0, opacity: 1 }}
        className="countdown-font block text-[420px] leading-none"
        exit={{ y: 80, opacity: 0 }}
        initial={{ y: -80, opacity: 0 }}
        style={{ color }}
        transition={{ duration: 0.35, ease: EASE_OUT }}
      >
        {value}
      </m.span>
    </AnimatePresence>
  );
}

export function Scoreboard({ params }: SceneProps<"scoreboard">) {
  return (
    <>
      <div className="absolute inset-y-0 left-0 w-1/2 bg-[#F5BB03]/10" />
      <div className="absolute inset-y-0 right-0 w-1/2 bg-[#0162C8]/15" />
      <p className="absolute inset-x-0 top-[70px] text-center text-[40px] font-semibold tracking-[0.3em] text-[#FBF5E7]/70 uppercase">
        {params.title}
      </p>
      {[
        { name: params.a, score: params.scoreA, color: BRAND.yellow, side: "left-0" },
        { name: params.b, score: params.scoreB, color: BRAND.blue, side: "right-0" },
      ].map((team) => (
        <div key={team.side} className={`absolute top-[180px] ${team.side} flex w-1/2 flex-col items-center`}>
          <p className="max-w-[760px] text-center text-[72px] leading-[1] font-extrabold text-balance uppercase">
            {team.name}
          </p>
          <div className="mt-6 overflow-hidden">
            <Score color={team.color} value={team.score} />
          </div>
        </div>
      ))}
      <div className="absolute top-[520px] left-1/2 h-[220px] w-[8px] -translate-x-1/2 bg-[#FBF5E7]/30" />
    </>
  );
}

// ---------------------------------------------------------------------------
// Talk timer — for the speaker's confidence monitor
// ---------------------------------------------------------------------------

export function TalkTimer({ params }: SceneProps<"talk-timer">) {
  const { preview } = useContext(StageContext);
  const [left, setLeft] = useState(params.minutes * 60);
  const startedAt = useRef(0);

  useStageFrame((t) => {
    if (preview) return;
    if (!startedAt.current) startedAt.current = t;
    const remaining = Math.max(0, Math.round(params.minutes * 60 - (t - startedAt.current) / 1000));
    setLeft((v) => (v === remaining ? v : remaining));
  });

  const total = params.minutes * 60 || 1;
  const warn = left <= params.warn * 60 && left > 0;
  const over = left === 0;
  const mm = String(Math.floor(left / 60)).padStart(2, "0");
  const ss = String(left % 60).padStart(2, "0");

  return (
    <m.div
      animate={{ background: over ? [BRAND.blue, BRAND.black, BRAND.blue] : BRAND.black }}
      className="absolute inset-0"
      transition={{ duration: 1, repeat: over ? Infinity : 0 }}
    >
      <p className="absolute inset-x-0 top-[80px] text-center text-[40px] font-semibold tracking-[0.3em] text-[#FBF5E7]/70 uppercase">
        {params.title}
      </p>
      <p
        className={`countdown-font absolute inset-x-0 top-[240px] text-center text-[460px] leading-none ${
          over ? "text-[#FBF5E7]" : warn ? "animate-timer-pulse text-[#F5BB03]" : "text-[#FBF5E7]"
        }`}
      >
        {over ? "00:00" : `${mm}:${ss}`}
      </p>
      <p className="absolute inset-x-0 top-[800px] text-center text-[64px] font-extrabold uppercase">
        {over ? "Tiempo · gracias" : warn ? `Últimos ${Math.ceil(left / 60)} min` : ""}
      </p>
      <div className="absolute inset-x-[140px] bottom-[80px] h-[24px] bg-[#FBF5E7]/10">
        <div
          className={`h-full ${warn || over ? "bg-[#F5BB03]" : "bg-[#0162C8]"}`}
          style={{ width: `${(left / total) * 100}%` }}
        />
      </div>
    </m.div>
  );
}

// ---------------------------------------------------------------------------
// Traffic light — moderator's cue to the speaker
// ---------------------------------------------------------------------------

const LAMPS = [
  { id: "rojo", color: "#EF4444", label: (p: { red: string }) => p.red },
  { id: "amarillo", color: BRAND.yellow, label: (p: { yellow: string }) => p.yellow },
  { id: "verde", color: "#22C55E", label: (p: { green: string }) => p.green },
];

export function TrafficLight({ params }: SceneProps<"traffic-light">) {
  const active = LAMPS.find((l) => l.id === params.state.trim().toLowerCase()) ?? LAMPS[2];
  return (
    <>
      <Ambient />
      <div className="absolute top-[120px] left-[560px] flex flex-col gap-[40px] rounded-[80px] bg-[#111] p-[50px]">
        {LAMPS.map((lamp) => {
          const on = lamp === active;
          return (
            <m.div
              key={lamp.id}
              animate={{ opacity: on ? 1 : 0.16, scale: on ? 1 : 0.94 }}
              className="h-[240px] w-[240px] rounded-full"
              style={{ background: lamp.color, boxShadow: on ? `0 0 80px ${lamp.color}` : "none" }}
              transition={{ duration: 0.4 }}
            />
          );
        })}
      </div>
      <div className="absolute top-[380px] right-[120px] left-[980px]">
        <AnimatePresence mode="wait">
          <m.p
            key={active.id}
            animate={{ opacity: 1, x: 0 }}
            className="text-[120px] leading-[1] font-extrabold tracking-[-0.02em] text-balance uppercase"
            exit={{ opacity: 0, x: -30 }}
            initial={{ opacity: 0, x: 30 }}
            style={{ color: active.color }}
            transition={{ duration: 0.4, ease: EASE_OUT }}
          >
            {active.label(params)}
          </m.p>
        </AnimatePresence>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Wordle — OWUrdle
// ---------------------------------------------------------------------------

type Mark = "hit" | "near" | "miss";

function grade(guess: string, word: string): Mark[] {
  const marks: Mark[] = Array(word.length).fill("miss");
  const pool = word.split("");
  guess.split("").forEach((ch, i) => {
    if (word[i] === ch) {
      marks[i] = "hit";
      pool[i] = "";
    }
  });
  guess.split("").forEach((ch, i) => {
    if (marks[i] === "hit") return;
    const at = pool.indexOf(ch);
    if (at >= 0) {
      marks[i] = "near";
      pool[at] = "";
    }
  });
  return marks;
}

const MARK_STYLE: Record<Mark, string> = {
  hit: "bg-[#F5BB03] text-black",
  near: "bg-[#0162C8] text-[#FBF5E7]",
  miss: "bg-[#2b2b2b] text-[#FBF5E7]",
};

export function Wordle({ params }: SceneProps<"wordle">) {
  const word = params.word.trim().toUpperCase();
  const guesses = splitList(params.guesses).map((g) => g.toUpperCase().padEnd(word.length).slice(0, word.length));
  const rows = [...guesses];
  if (!rows.includes(word)) rows.push(word);
  const solvedAt = rows.length - 1;
  const cell = Math.min(150, 1200 / word.length);

  return (
    <>
      <Ambient />
      <div className="absolute top-[70px] left-[140px]">
        <Rise className="text-[30px] font-semibold tracking-[0.3em] text-[#F5BB03] uppercase" delay={0.05}>
          OWUrdle
        </Rise>
        <Rise className="mt-2 text-[64px] leading-none font-extrabold uppercase" delay={0.15}>
          {params.title}
        </Rise>
      </div>
      <div className="absolute top-[230px] left-1/2 flex -translate-x-1/2 flex-col gap-[14px]">
        {rows.slice(0, 6).map((guess, r) => (
          <div key={r} className="flex gap-[14px]">
            {grade(guess, word).map((mark, c) => (
              <m.div
                key={c}
                animate={{ rotateX: [90, 0] }}
                className={`flex items-center justify-center text-[64px] font-extrabold ${MARK_STYLE[mark]}`}
                initial={{ rotateX: 90 }}
                style={{ width: cell, height: cell }}
                transition={{ duration: 0.45, delay: 0.6 + r * 1.1 + c * 0.18 }}
              >
                {guess[c]}
              </m.div>
            ))}
          </div>
        ))}
      </div>
      <m.p
        animate={{ opacity: 1, y: 0 }}
        className="absolute inset-x-0 bottom-[70px] text-center text-[54px] font-bold text-[#F5BB03]"
        initial={{ opacity: 0, y: 20 }}
        transition={{ delay: 0.6 + solvedAt * 1.1 + word.length * 0.18 + 0.4 }}
      >
        ¡Genial! {solvedAt + 1}/6
      </m.p>
    </>
  );
}

// ---------------------------------------------------------------------------
// Pipeline — the programme as a CI run
// ---------------------------------------------------------------------------

export function Pipeline({ params }: SceneProps<"pipeline">) {
  const now = useNow(1000);
  const stages = parseProgram(params.items);
  let running = -1;
  stages.forEach((stage, i) => {
    if (stage.time <= now) running = i;
  });
  const elapsed = running >= 0 ? -secondsUntil(stages[running].time) : 0;
  const clock = `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`;

  return (
    <div className="absolute inset-0 bg-black">
      <div className="font-terminal absolute top-[80px] left-[120px] text-[30px] text-[#FBF5E7]/60">
        <span className="text-[#F5BB03]">owu-conf-2026</span> · pipeline #2026 · rama{" "}
        <span className="text-[#0162C8]">main</span> · {now}
      </div>
      <div className="absolute top-[300px] right-[120px] left-[120px] flex items-start">
        {stages.map((stage, i) => {
          const status = i < running ? "done" : i === running ? "running" : "pending";
          return (
            <div key={stage.time} className="relative flex flex-1 flex-col items-center">
              {i > 0 && (
                <div
                  className={`absolute top-[46px] right-1/2 left-[-50%] h-[8px] ${i <= running ? "bg-[#F5BB03]" : "bg-[#FBF5E7]/15"}`}
                />
              )}
              <div
                className={`relative z-10 flex h-[100px] w-[100px] items-center justify-center rounded-full text-[46px] font-extrabold ${
                  status === "done"
                    ? "bg-[#F5BB03] text-black"
                    : status === "running"
                      ? "bg-[#0162C8] text-[#FBF5E7]"
                      : "border-[6px] border-[#FBF5E7]/25 bg-black text-[#FBF5E7]/40"
                }`}
              >
                {status === "done" ? (
                  "✓"
                ) : status === "running" ? (
                  <m.span
                    animate={{ rotate: 360 }}
                    className="block h-[54px] w-[54px] rounded-full border-[7px] border-[#FBF5E7] border-t-transparent"
                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  />
                ) : (
                  i + 1
                )}
              </div>
              <p
                className={`font-terminal mt-6 text-[26px] ${status === "pending" ? "text-[#FBF5E7]/40" : "text-[#F5BB03]"}`}
              >
                {stage.time}
              </p>
              <p
                className={`mt-2 line-clamp-2 max-w-[210px] text-center text-[26px] leading-[1.2] font-semibold text-balance ${
                  status === "pending" ? "text-[#FBF5E7]/40" : "text-[#FBF5E7]"
                }`}
              >
                {stage.title}
              </p>
            </div>
          );
        })}
      </div>
      <div className="font-terminal absolute right-[120px] bottom-[110px] left-[120px] border-l-[8px] border-[#0162C8] bg-[#FBF5E7]/[0.05] px-10 py-8 text-[34px] leading-[1.6] text-[#FBF5E7]/85">
        {running < 0 ? (
          <p>$ esperando al primer job… ({stages[0]?.time ?? "--:--"})</p>
        ) : (
          <>
            <p>
              <span className="text-[#F5BB03]">▶ {stages[running].title}</span> · corriendo hace {clock}
            </p>
            <p className="text-[#FBF5E7]/50">
              {running + 1 < stages.length
                ? `siguiente: ${stages[running + 1].title} a las ${stages[running + 1].time}`
                : "último job del día"}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Update — do not turn off the conference
// ---------------------------------------------------------------------------

export function Update({ params }: SceneProps<"update">) {
  const [pct, setPct] = useState(0);
  const start = useRef(0);

  useStageFrame((t) => {
    if (!start.current) start.current = t;
    const age = (t - start.current) / 1000;
    // Rushes to the nineties, then crawls, then (eventually) done.
    const p = age < 70 ? Math.min(99, Math.floor(100 * (1 - Math.exp(-age / 14)))) : 100;
    setPct((v) => (v === p ? v : p));
    if (age > 78) start.current = t;
  });

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0162C8] text-[#FBF5E7]">
      <m.div
        animate={{ rotate: 360 }}
        className="relative h-[120px] w-[120px]"
        transition={{ duration: 1.6, repeat: Infinity, ease: "linear" }}
      >
        {Array.from({ length: 6 }, (_, i) => (
          <span
            key={i}
            className="absolute top-1/2 left-1/2 h-[14px] w-[14px] rounded-full bg-[#FBF5E7]"
            style={{ transform: `rotate(${i * 45}deg) translateY(-52px)`, opacity: 0.3 + i * 0.12 }}
          />
        ))}
      </m.div>
      <p className="mt-16 text-[60px] font-semibold">
        {pct < 100 ? `Instalando OWU CONF 2026: ${pct}%` : "Listo. Reiniciando la conferencia…"}
      </p>
      <p className="mt-6 text-[40px] text-[#FBF5E7]/80">{params.message}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Captcha — prove you are not a bot
// ---------------------------------------------------------------------------

const OTHERS = ["🍔", "☕", "🍺", "🌮", "🥐", "🍕", "🐧", "💻", "🧀", "🥑"];
const ROUND_MS = 9500;

function makeGrid() {
  const mates = new Set<number>();
  while (mates.size < 4) mates.add(Math.floor(Math.random() * 9));
  return Array.from({ length: 9 }, (_, i) => (mates.has(i) ? "🧉" : OTHERS[Math.floor(Math.random() * OTHERS.length)]));
}

export function Captcha() {
  const { preview } = useContext(StageContext);
  const [grid, setGrid] = useState<string[]>(() => makeGrid());
  const [clock, setClock] = useState(preview ? 3000 : 0);
  const round = useRef(0);

  useStageFrame((t) => {
    if (preview) return;
    const r = Math.floor(t / ROUND_MS);
    if (r !== round.current) {
      round.current = r;
      setGrid(makeGrid());
    }
    const local = Math.floor((t % ROUND_MS) / 50) * 50;
    setClock((v) => (v === local ? v : local));
  });

  const mates = grid.map((e, i) => (e === "🧉" ? i : -1)).filter((i) => i >= 0);
  const picked = mates.filter((_, k) => clock > 1000 + k * 700);
  const verifying = clock > 4600;
  const passed = clock > 5900;

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-[#FBF5E7]">
      <div className="w-[760px] bg-white shadow-[0_30px_90px_rgba(0,0,0,0.25)]">
        <div className="bg-[#0162C8] px-8 py-7 text-[#FBF5E7]">
          <p className="text-[26px]">Seleccioná todas las imágenes con</p>
          <p className="text-[52px] font-extrabold">mate 🧉</p>
        </div>
        <div className="grid grid-cols-3 gap-[6px] p-[6px]">
          {grid.map((emoji, i) => {
            const on = picked.includes(i);
            return (
              <div
                key={`${round.current}-${i}`}
                className="relative flex h-[210px] items-center justify-center bg-[#eee] text-[110px]"
              >
                <m.span animate={{ scale: on ? 0.78 : 1 }}>{emoji}</m.span>
                {on && (
                  <m.span
                    animate={{ scale: 1 }}
                    className="absolute top-3 left-3 flex h-[52px] w-[52px] items-center justify-center rounded-full bg-[#0162C8] text-[30px] font-bold text-white"
                    initial={{ scale: 0 }}
                  >
                    ✓
                  </m.span>
                )}
              </div>
            );
          })}
        </div>
        <div className="flex items-center justify-between px-8 py-6">
          <span className="text-[22px] text-black/50">OWU CAPTCHA</span>
          <span
            className={`px-10 py-4 text-[28px] font-bold uppercase ${
              passed ? "bg-[#22C55E] text-white" : verifying ? "bg-[#0162C8]/60 text-white" : "bg-[#0162C8] text-white"
            }`}
          >
            {passed ? "✓ Sos humano" : verifying ? "Verificando…" : "Verificar"}
          </span>
        </div>
      </div>
      <AnimatePresence>
        {passed && (
          <m.p
            animate={{ opacity: 1, y: 0 }}
            className="absolute inset-x-0 bottom-[80px] text-center text-[64px] font-extrabold text-black"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0, y: 20 }}
          >
            Bienvenido a OWU CONF 🧉
          </m.p>
        )}
      </AnimatePresence>
    </div>
  );
}
