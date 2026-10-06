"use client";

import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, m } from "motion/react";

import { EASE_OUT } from "app/conf/components/Reveal";
import type { SceneProps } from "lib/owy-stage/scenes";

import { Confetti } from "../effects";
import { Ambient, BRAND, Caption, H, StageContext, W, useStageFrame } from "../Stage";
import { HAPPY_MS, drawFace, initialSim } from "./OwyFace";
import { MOMENT_PHOTOS, Rise } from "./parts";
import { useNow } from "./useful";

const rand = (min: number, max: number) => min + Math.random() * (max - min);

// ---------------------------------------------------------------------------
// Trivia — a question, four options, reveal after N seconds
// ---------------------------------------------------------------------------

const LETTERS = ["A", "B", "C", "D"] as const;

export function Trivia({ params }: SceneProps<"trivia">) {
  const { preview } = useContext(StageContext);
  const options = [params.a, params.b, params.c, params.d];
  const answer = LETTERS.indexOf(params.answer.trim().toUpperCase() as (typeof LETTERS)[number]);
  const [revealed, setRevealed] = useState(preview);
  const [left, setLeft] = useState(params.seconds);

  useEffect(() => {
    setRevealed(preview || params.seconds === 0);
    setLeft(params.seconds);
    if (preview || params.seconds === 0) return;
    const id = setInterval(() => {
      setLeft((value) => {
        if (value <= 1) {
          clearInterval(id);
          setRevealed(true);
          return 0;
        }
        return value - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [params.question, params.seconds, preview]);

  return (
    <>
      <Ambient />
      <div className="absolute top-[100px] left-[140px] w-[1500px]">
        <Rise className="text-[30px] font-semibold tracking-[0.3em] text-[#F5BB03] uppercase" delay={0.05}>
          Trivia
        </Rise>
        <Rise className="mt-3 text-[72px] leading-[1.05] font-extrabold tracking-[-0.02em] text-balance" delay={0.15}>
          {params.question}
        </Rise>
      </div>
      <div className="absolute top-[400px] right-[140px] left-[340px] grid grid-cols-2 gap-[26px]">
        {options.map((option, i) => {
          const correct = revealed && i === answer;
          const wrong = revealed && i !== answer;
          return (
            <m.div
              key={`${i}-${option}`}
              animate={{ opacity: wrong ? 0.3 : 1, y: 0, scale: correct ? 1.03 : 1 }}
              className={`flex min-h-[200px] items-center gap-8 px-9 py-7 ${correct ? "bg-[#F5BB03] text-black" : "bg-[#FBF5E7]/[0.07]"}`}
              initial={{ opacity: 0, y: 30 }}
              transition={{ duration: 0.5, delay: 0.3 + i * 0.1, ease: EASE_OUT }}
            >
              <span
                className={`flex h-[96px] w-[96px] shrink-0 items-center justify-center rounded-full text-[48px] font-extrabold ${
                  correct
                    ? "bg-black text-[#F5BB03]"
                    : i % 2
                      ? "bg-[#0162C8] text-[#FBF5E7]"
                      : "bg-[#F5BB03] text-black"
                }`}
              >
                {LETTERS[i]}
              </span>
              <span className="text-[56px] leading-[1.1] font-bold text-balance">{option}</span>
            </m.div>
          );
        })}
      </div>
      {!revealed && params.seconds > 0 && (
        <div className="absolute top-[900px] right-[140px] left-[340px] flex items-center gap-8">
          <span className="countdown-font w-[150px] text-[110px] leading-none text-[#F5BB03]">{left}</span>
          <div className="h-[22px] flex-1 bg-[#FBF5E7]/10">
            <div
              className="h-full bg-[#F5BB03] transition-[width] duration-1000 ease-linear"
              style={{ width: `${(left / params.seconds) * 100}%` }}
            />
          </div>
        </div>
      )}
      {revealed && answer >= 0 && !preview && (
        <div className="pointer-events-none absolute inset-0">
          <Confetti />
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Versus — two halves, the room picks a side
// ---------------------------------------------------------------------------

export function Versus({ params }: SceneProps<"versus">) {
  return (
    <>
      <m.div
        animate={{ x: 0 }}
        className="absolute inset-y-0 left-0 flex w-1/2 items-center justify-center bg-[#F5BB03] px-[80px] text-center text-black"
        initial={{ x: "-100%" }}
        transition={{ duration: 0.7, ease: EASE_OUT }}
      >
        <p className="text-[150px] leading-[0.95] font-extrabold tracking-[-0.03em] text-balance uppercase">
          {params.left}
        </p>
      </m.div>
      <m.div
        animate={{ x: 0 }}
        className="absolute inset-y-0 right-0 flex w-1/2 items-center justify-center bg-[#0162C8] px-[80px] text-center text-[#FBF5E7]"
        initial={{ x: "100%" }}
        transition={{ duration: 0.7, ease: EASE_OUT }}
      >
        <p className="text-[150px] leading-[0.95] font-extrabold tracking-[-0.03em] text-balance uppercase">
          {params.right}
        </p>
      </m.div>
      <m.div
        animate={{ scale: [1, 1.08, 1] }}
        className="absolute top-1/2 left-1/2 flex h-[220px] w-[220px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black text-[84px] font-extrabold text-[#FBF5E7] shadow-[0_20px_60px_rgba(0,0,0,0.6)]"
        transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
      >
        VS
      </m.div>
      {params.question && (
        <div className="absolute inset-x-0 top-[70px] text-center">
          <span className="inline-block bg-black px-10 py-4 text-[40px] font-semibold tracking-[0.2em] text-[#FBF5E7] uppercase">
            {params.question}
          </span>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Lineup — the talks block
// ---------------------------------------------------------------------------

export function Lineup({ params }: SceneProps<"lineup">) {
  const talks = [
    [params.h1, params.t1, params.s1],
    [params.h2, params.t2, params.s2],
    [params.h3, params.t3, params.s3],
  ].filter(([, title]) => title.trim());

  return (
    <>
      <Ambient />
      <div className="absolute inset-x-[140px] top-[110px]">
        <Rise className="text-[30px] font-semibold tracking-[0.3em] text-[#F5BB03] uppercase" delay={0.05}>
          {params.eyebrow}
        </Rise>
        <Rise className="mt-3 text-[84px] leading-none font-extrabold tracking-[-0.02em] uppercase" delay={0.15}>
          {params.title}
        </Rise>
      </div>
      <div className="absolute top-[330px] right-[140px] left-[340px] flex flex-col gap-[24px]">
        {talks.map(([time, title, speaker], i) => (
          <m.div
            key={`${time}-${title}`}
            animate={{ opacity: 1, x: 0 }}
            className="flex min-h-[190px] items-center gap-10 border-l-[12px] border-[#F5BB03] bg-[#FBF5E7]/[0.05] px-10 py-8"
            initial={{ opacity: 0, x: -40 }}
            transition={{ duration: 0.6, delay: 0.3 + i * 0.15, ease: EASE_OUT }}
          >
            <span className="w-[210px] shrink-0 text-[64px] font-extrabold text-[#F5BB03] tabular-nums">{time}</span>
            <span className="min-w-0">
              <span className="block text-[60px] leading-[1.1] font-bold text-balance">{title}</span>
              {speaker && <span className="mt-2 block text-[38px] text-[#FBF5E7]/65">{speaker}</span>}
            </span>
          </m.div>
        ))}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Owy says — the face delivers a message written by staff
// ---------------------------------------------------------------------------

export function OwySays({ params }: SceneProps<"owy-says">) {
  const { preview } = useContext(StageContext);
  const canvas = useRef<HTMLCanvasElement>(null);
  const sim = useRef(initialSim());
  const [caption, setCaption] = useState<string | null>(preview ? params.text : null);

  useEffect(() => {
    if (preview) return;
    const s = sim.current;
    s.mood = "thinking";
    const timers = [
      setTimeout(() => {
        s.mood = "speaking";
        setCaption(params.text);
      }, 900),
      setTimeout(
        () => {
          s.mood = "idle";
          s.happyUntil = s.now + HAPPY_MS;
        },
        900 + 1200 + params.text.length * 55
      ),
    ];
    return () => timers.forEach(clearTimeout);
  }, [params.text, preview]);

  useStageFrame((t, dt) => {
    const ctx = canvas.current?.getContext("2d");
    if (ctx) drawFace(ctx, sim.current, t, dt);
  });

  return (
    <>
      <Ambient />
      <canvas ref={canvas} className="absolute inset-0" height={H} width={W} />
      <AnimatePresence>{caption && <Caption key={caption} text={caption} />}</AnimatePresence>
    </>
  );
}

// ---------------------------------------------------------------------------
// Aurora — soft brand blobs drifting
// ---------------------------------------------------------------------------

const BLOBS = [
  { color: BRAND.yellow, size: 1300, x: [200, 700, 300], y: [100, 400, 200], duration: 26 },
  { color: BRAND.blue, size: 1500, x: [1100, 700, 1200], y: [500, 100, 600], duration: 32 },
  { color: BRAND.cream, size: 900, x: [800, 1300, 600], y: [700, 300, 800], duration: 24 },
  { color: BRAND.yellow, size: 1100, x: [1400, 900, 1500], y: [-100, 500, 0], duration: 30 },
];

export function Aurora() {
  return (
    <>
      <div className="absolute inset-0 overflow-hidden bg-black">
        {BLOBS.map((blob, i) => (
          <m.div
            key={i}
            animate={{ x: blob.x, y: blob.y }}
            className="absolute rounded-full opacity-70 mix-blend-screen"
            style={{
              width: blob.size,
              height: blob.size,
              // Gradient instead of filter: blur — a blurred 1000px layer is expensive in OBS's CEF.
              background: `radial-gradient(circle, ${blob.color} 0%, ${blob.color}b3 18%, ${blob.color}59 38%, ${blob.color}1a 56%, transparent 70%)`,
              left: -blob.size / 2,
              top: -blob.size / 2,
            }}
            transition={{ duration: blob.duration, repeat: Infinity, repeatType: "mirror", ease: "easeInOut" }}
          />
        ))}
      </div>
      <img
        alt="OWU CONF"
        className="absolute right-[120px] bottom-[80px] w-[420px] opacity-90"
        src="/images/logos/conf.webp"
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// DVD — the logo bounces; a corner hit is a celebration
// ---------------------------------------------------------------------------

const TINTS = [BRAND.cream, BRAND.yellow, BRAND.blue];
const LOGO_MASK = {
  WebkitMaskImage: "url(/images/logos/conf.webp)",
  WebkitMaskSize: "contain",
  WebkitMaskRepeat: "no-repeat",
  WebkitMaskPosition: "center",
  maskImage: "url(/images/logos/conf.webp)",
  maskSize: "contain",
  maskRepeat: "no-repeat",
  maskPosition: "center",
} as const;
const DVD_W = 420;
const DVD_H = 88;

export function Dvd() {
  const box = useRef<HTMLDivElement>(null);
  const pos = useRef({ x: rand(100, W - DVD_W - 100), y: rand(100, H - DVD_H - 100), vx: 220, vy: 160 });
  const [tint, setTint] = useState(0);
  const [corners, setCorners] = useState(0);
  const [bursts, setBursts] = useState<number[]>([]);

  useStageFrame((_t, dt) => {
    const p = pos.current;
    const s = dt / 1000;
    p.x += p.vx * s;
    p.y += p.vy * s;
    let hits = 0;
    if (p.x <= 0 || p.x + DVD_W >= W) {
      p.vx *= -1;
      p.x = Math.min(Math.max(p.x, 0), W - DVD_W);
      hits++;
    }
    if (p.y <= 0 || p.y + DVD_H >= H) {
      p.vy *= -1;
      p.y = Math.min(Math.max(p.y, 0), H - DVD_H);
      hits++;
    }
    if (hits) setTint((value) => (value + 1) % TINTS.length);
    if (hits === 2) {
      setCorners((value) => value + 1);
      setBursts((list) => [...list.slice(-1), Date.now()]);
    }
    if (box.current) box.current.style.transform = `translate(${p.x}px, ${p.y}px)`;
  });

  return (
    <>
      <div
        ref={box}
        className="absolute top-0 left-0 isolate will-change-transform"
        style={{ width: DVD_W, height: DVD_H }}
      >
        <img alt="OWU CONF" className="h-full w-full object-contain" src="/images/logos/conf.webp" />
        {/* Multiply through the logo's alpha: the cream blob takes the colour, the black letters stay black. */}
        {tint > 0 && (
          <div className="absolute inset-0 mix-blend-multiply" style={{ background: TINTS[tint], ...LOGO_MASK }} />
        )}
      </div>
      <p className="absolute bottom-[40px] left-[60px] font-terminal text-[26px] text-[#FBF5E7]/40">
        esquinas: {corners}
      </p>
      <div className="pointer-events-none absolute inset-0">
        {bursts.map((id) => (
          <Confetti key={id} />
        ))}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Life — Conway, in brand colours
// ---------------------------------------------------------------------------

const CELL = 20;
const COLS = W / CELL;
const ROWS = H / CELL;

function seed(): Uint8Array {
  const grid = new Uint8Array(COLS * ROWS);
  for (let i = 0; i < grid.length; i++) grid[i] = Math.random() < 0.22 ? 1 : 0;
  return grid;
}

export function Life() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const state = useRef({ grid: seed(), age: new Uint16Array(COLS * ROWS), last: 0, born: 0 });

  useStageFrame((t) => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    const s = state.current;
    if (t - s.last >= 120) {
      s.last = t;
      const next = new Uint8Array(COLS * ROWS);
      let alive = 0;
      for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
          let n = 0;
          for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++) {
              if (!dx && !dy) continue;
              n += s.grid[((y + dy + ROWS) % ROWS) * COLS + ((x + dx + COLS) % COLS)];
            }
          const i = y * COLS + x;
          const live = s.grid[i] ? n === 2 || n === 3 : n === 3;
          next[i] = live ? 1 : 0;
          s.age[i] = live ? Math.min(s.age[i] + 1, 60) : 0;
          alive += next[i];
        }
      }
      s.grid = next;
      // Reseed when it settles into still lifes and blinkers.
      if (alive < COLS * ROWS * 0.03 || t - s.born > 90_000) {
        s.grid = seed();
        s.age.fill(0);
        s.born = t;
      }
    }
    ctx.clearRect(0, 0, W, H);
    for (let i = 0; i < s.grid.length; i++) {
      if (!s.grid[i]) continue;
      const age = s.age[i];
      ctx.fillStyle = age < 3 ? BRAND.cream : age < 12 ? BRAND.yellow : BRAND.blue;
      ctx.fillRect((i % COLS) * CELL + 1, Math.floor(i / COLS) * CELL + 1, CELL - 2, CELL - 2);
    }
  });

  return <canvas ref={canvas} className="absolute inset-0 bg-black" height={H} width={W} />;
}

// ---------------------------------------------------------------------------
// Test card — for the AV check before doors open
// ---------------------------------------------------------------------------

const BARS = [BRAND.cream, BRAND.yellow, BRAND.blue, "#7a7a7a", BRAND.yellow, BRAND.cream, BRAND.blue, "#2b2b2b"];

export function TestCard() {
  const now = useNow(1000);
  return (
    <>
      <div className="absolute inset-x-0 top-0 flex h-[620px]">
        {BARS.map((color, i) => (
          <div key={i} className="flex-1" style={{ background: color }} />
        ))}
      </div>
      <div className="absolute inset-x-0 top-[620px] flex h-[80px]">
        {[...BARS].reverse().map((color, i) => (
          <div key={i} className="flex-1" style={{ background: color }} />
        ))}
      </div>
      <div className="absolute inset-x-0 bottom-0 h-[380px] bg-black" />
      <div className="absolute top-[300px] left-1/2 flex h-[520px] w-[520px] -translate-x-1/2 items-center justify-center rounded-full border-[14px] border-[#FBF5E7] bg-black">
        <img alt="OWU CONF" className="w-[380px]" src="/images/logos/conf.webp" />
      </div>
      <div className="absolute bottom-[90px] left-[120px] font-terminal text-[34px] text-[#FBF5E7]">
        <p className="text-[#F5BB03]">OWU CONF 2026 · PRUEBA DE SEÑAL</p>
        <p className="mt-2 text-[#FBF5E7]/70">1920 × 1080 · 16:9 · {now}</p>
      </div>
      <div className="absolute right-[120px] bottom-[90px] flex items-end gap-2">
        {Array.from({ length: 10 }, (_, i) => (
          <div key={i} className="w-[60px] bg-[#FBF5E7]" style={{ height: 20 + i * 14, opacity: 0.15 + i * 0.085 }} />
        ))}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Conduct — the code of conduct, short
// ---------------------------------------------------------------------------

export function Conduct({ params }: SceneProps<"conduct">) {
  const lines = [params.l1, params.l2, params.l3].filter((line) => line.trim());
  return (
    <>
      <Ambient />
      <div className="absolute top-[110px] left-[140px] w-[1300px]">
        <Rise className="text-[30px] font-semibold tracking-[0.3em] text-[#F5BB03] uppercase" delay={0.05}>
          Para que todos la pasen bien
        </Rise>
        <Rise className="mt-3 text-[84px] leading-none font-extrabold tracking-[-0.02em] uppercase" delay={0.15}>
          Código de conducta
        </Rise>
      </div>
      <ul className="absolute top-[350px] right-[140px] left-[340px] flex flex-col gap-[34px]">
        {lines.map((line, i) => (
          <m.li
            key={line}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-8"
            initial={{ opacity: 0, x: 40 }}
            transition={{ duration: 0.6, delay: 0.4 + i * 0.15, ease: EASE_OUT }}
          >
            <span className="h-[26px] w-[26px] shrink-0 rounded-full bg-[#F5BB03]" />
            <span className="text-[50px] leading-[1.15] font-semibold text-balance">{line}</span>
          </m.li>
        ))}
        <m.li
          animate={{ opacity: 1, y: 0 }}
          className="mt-6 border-l-[12px] border-[#0162C8] bg-[#FBF5E7]/[0.06] px-8 py-6 text-[38px] leading-[1.2] font-medium text-[#FBF5E7]/85"
          initial={{ opacity: 0, y: 30 }}
          transition={{ duration: 0.6, delay: 1, ease: EASE_OUT }}
        >
          {params.contact}
        </m.li>
      </ul>
    </>
  );
}

// ---------------------------------------------------------------------------
// Mosaic — six photos, tiles swap one at a time
// ---------------------------------------------------------------------------

export function Mosaic() {
  const { preview } = useContext(StageContext);
  const [tiles, setTiles] = useState(() => MOMENT_PHOTOS.slice(0, 6));
  const order = useMemo(() => MOMENT_PHOTOS.slice(6), []);
  const cursor = useRef(0);

  useEffect(() => {
    if (preview) return;
    const id = setInterval(() => {
      setTiles((current) => {
        const next = [...current];
        const slot = Math.floor(Math.random() * next.length);
        next[slot] = order[cursor.current++ % order.length];
        return next;
      });
    }, 3200);
    return () => clearInterval(id);
  }, [order, preview]);

  return (
    <div className="absolute inset-0 grid grid-cols-3 grid-rows-2 gap-[10px] bg-black p-[10px]">
      {tiles.map((src, i) => (
        <div key={i} className="relative overflow-hidden">
          <AnimatePresence initial={false}>
            <m.img
              key={src}
              alt=""
              animate={{ opacity: 1, scale: 1 }}
              className="absolute inset-0 h-full w-full object-cover"
              exit={{ opacity: 0, transition: { duration: 0.8 } }}
              initial={{ opacity: 0, scale: 1.08 }}
              src={src}
              transition={{ duration: 0.9, ease: EASE_OUT }}
            />
          </AnimatePresence>
        </div>
      ))}
      <img
        alt="OWU CONF"
        className="absolute right-[50px] bottom-[40px] w-[280px] drop-shadow-[0_6px_20px_rgba(0,0,0,0.8)]"
        src="/images/logos/conf.webp"
      />
    </div>
  );
}
