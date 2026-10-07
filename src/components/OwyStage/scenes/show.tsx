"use client";

import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, m } from "motion/react";

import { EASE_OUT } from "app/conf/components/Reveal";
import type { SceneProps } from "lib/owy-stage/scenes";

import { BRAND, H, StageContext, W, useStageFrame } from "../Stage";
import { QrCode } from "./parts";

const rand = (min: number, max: number) => min + Math.random() * (max - min);
const TAU = Math.PI * 2;

// ---------------------------------------------------------------------------
// Donut — donut.c, the torus everyone has seen spinning in a terminal
// ---------------------------------------------------------------------------

const DCOLS = 96;
const DROWS = 40;
const DCHARS = ".,-~:;=!*#$@";

export function Donut() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const angles = useRef({ a: 0, b: 0 });

  useStageFrame((_t, dt) => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    const an = angles.current;
    an.a += dt * 0.0012;
    an.b += dt * 0.0006;
    const out = new Int8Array(DCOLS * DROWS).fill(-1);
    const zb = new Float32Array(DCOLS * DROWS);
    const ca = Math.cos(an.a);
    const sa = Math.sin(an.a);
    const cb = Math.cos(an.b);
    const sb = Math.sin(an.b);
    for (let th = 0; th < TAU; th += 0.07) {
      const ct = Math.cos(th);
      const st = Math.sin(th);
      for (let ph = 0; ph < TAU; ph += 0.02) {
        const cp = Math.cos(ph);
        const sp = Math.sin(ph);
        const cx = 2 + ct;
        const iz = 1 / (sp * cx * sa + st * ca + 5);
        const tt = sp * cx * ca - st * sa;
        const x = Math.floor(DCOLS / 2 + 38 * iz * (cp * cx * cb - tt * sb));
        const y = Math.floor(DROWS / 2 + 19 * iz * (cp * cx * sb + tt * cb));
        const lum = (st * sa - sp * ct * ca) * cb - sp * ct * sa - st * ca - cp * ct * sb;
        if (x < 0 || x >= DCOLS || y < 0 || y >= DROWS) continue;
        const i = y * DCOLS + x;
        if (iz > zb[i]) {
          zb[i] = iz;
          out[i] = Math.max(0, Math.floor(lum * 8));
        }
      }
    }
    ctx.fillStyle = BRAND.black;
    ctx.fillRect(0, 0, W, H);
    ctx.font = "bold 30px 'Geist Mono', ui-monospace, monospace";
    ctx.textBaseline = "top";
    const cw = W / DCOLS;
    const ch = H / DROWS;
    for (let i = 0; i < out.length; i++) {
      const l = out[i];
      if (l < 0) continue;
      ctx.fillStyle = l < 3 ? BRAND.blue : l < 8 ? BRAND.yellow : BRAND.cream;
      ctx.fillText(DCHARS[Math.min(DCHARS.length - 1, l)], (i % DCOLS) * cw + 4, Math.floor(i / DCOLS) * ch + 1);
    }
  });

  return <canvas ref={canvas} className="absolute inset-0 bg-black" height={H} width={W} />;
}

// ---------------------------------------------------------------------------
// Cube — CSS 3D, six brand faces
// ---------------------------------------------------------------------------

const FACES = [
  { t: "rotateY(0deg)", bg: BRAND.yellow, logo: true },
  { t: "rotateY(90deg)", bg: BRAND.blue },
  { t: "rotateY(180deg)", bg: BRAND.cream, logo: true },
  { t: "rotateY(-90deg)", bg: BRAND.black, border: true },
  { t: "rotateX(90deg)", bg: BRAND.blue },
  { t: "rotateX(-90deg)", bg: BRAND.yellow },
];
const SIDE = 520;

export function Cube() {
  return (
    <div className="absolute inset-0 flex items-center justify-center" style={{ perspective: 1600 }}>
      <m.div
        animate={{ rotateX: 360, rotateY: 720 }}
        className="relative"
        style={{ width: SIDE, height: SIDE, transformStyle: "preserve-3d" }}
        transition={{ duration: 18, repeat: Infinity, ease: "linear" }}
      >
        {FACES.map((face) => (
          <div
            key={face.t}
            className="absolute inset-0 flex items-center justify-center"
            style={{
              background: face.bg,
              transform: `${face.t} translateZ(${SIDE / 2}px)`,
              border: face.border ? `12px solid ${BRAND.yellow}` : undefined,
              backfaceVisibility: "hidden",
            }}
          >
            {face.logo && <img alt="OWU CONF" className="w-[400px]" src="/images/logos/conf.webp" />}
          </div>
        ))}
      </m.div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Neon — a sign that buzzes
// ---------------------------------------------------------------------------

export function Neon({ params }: SceneProps<"neon">) {
  const letters = params.text.split("");
  const flicker = useMemo(
    () => new Set([Math.floor(rand(0, letters.length)), Math.floor(rand(0, letters.length))]),
    [letters.length]
  );
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <m.div
        animate={{ opacity: [1, 1, 0.55, 1, 1, 1, 0.8, 1] }}
        className="relative px-[80px] py-[40px]"
        style={{ boxShadow: `0 0 0 6px ${BRAND.blue}, 0 0 40px ${BRAND.blue}, inset 0 0 40px rgba(1,98,200,0.5)` }}
        transition={{ duration: 5, repeat: Infinity, times: [0, 0.3, 0.32, 0.34, 0.7, 0.9, 0.92, 1] }}
      >
        <p className="text-center text-[200px] leading-none font-extrabold tracking-[0.04em] text-[#FBF5E7] uppercase">
          {letters.map((ch, i) => (
            <m.span
              key={i}
              animate={flicker.has(i) ? { opacity: [1, 0.2, 1, 1, 0.4, 1, 1] } : undefined}
              className="inline-block"
              style={{ textShadow: `0 0 12px ${BRAND.yellow}, 0 0 36px ${BRAND.yellow}, 0 0 90px ${BRAND.yellow}` }}
              transition={{ duration: rand(2.5, 4.5), repeat: Infinity, ease: "linear" }}
            >
              {ch === " " ? " " : ch}
            </m.span>
          ))}
        </p>
      </m.div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Kinetic — words hitting the screen one after another
// ---------------------------------------------------------------------------

const KINETIC_THEMES = [
  { bg: BRAND.black, fg: BRAND.yellow },
  { bg: BRAND.yellow, fg: BRAND.black },
  { bg: BRAND.blue, fg: BRAND.cream },
  { bg: BRAND.cream, fg: BRAND.blue },
];

export function Kinetic({ params }: SceneProps<"kinetic">) {
  const { preview } = useContext(StageContext);
  const words = useMemo(
    () =>
      params.words
        .split("|")
        .map((w) => w.trim())
        .filter(Boolean),
    [params.words]
  );
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (preview || words.length < 2) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % words.length), 1900);
    return () => clearInterval(id);
  }, [preview, words.length]);

  const theme = KINETIC_THEMES[index % KINETIC_THEMES.length];
  const word = words[index] ?? "";
  const size = word.length > 12 ? 150 : word.length > 8 ? 210 : 280;

  return (
    <m.div
      animate={{ background: theme.bg }}
      className="absolute inset-0 overflow-hidden"
      transition={{ duration: 0.3 }}
    >
      <AnimatePresence mode="wait">
        <m.p
          key={`${index}-${word}`}
          animate={{ scale: 1, rotate: 0 }}
          className="absolute inset-0 flex items-center justify-center text-center leading-none font-extrabold tracking-[-0.03em] uppercase"
          exit={{ scale: 3, opacity: 0, transition: { duration: 0.35, ease: "easeIn" } }}
          initial={{ scale: 0.6, rotate: -4 }}
          style={{ color: theme.fg, fontSize: size }}
          transition={{ duration: 0.5, ease: EASE_OUT }}
        >
          {word.split("").map((ch, i) => (
            <m.span
              key={i}
              animate={{ y: 0, opacity: 1 }}
              className="inline-block"
              initial={{ y: 80, opacity: 0 }}
              transition={{ duration: 0.4, delay: i * 0.035, ease: EASE_OUT }}
            >
              {ch === " " ? " " : ch}
            </m.span>
          ))}
        </m.p>
      </AnimatePresence>
    </m.div>
  );
}

// ---------------------------------------------------------------------------
// Crawl — a long time ago, in a community far, far away
// ---------------------------------------------------------------------------

export function Crawl({ params }: SceneProps<"crawl">) {
  const paragraphs = params.text
    .split("|")
    .map((p) => p.trim())
    .filter(Boolean);
  // ~45 px/s up the plane reads like the film; the far end is well past legibility anyway.
  const travel = H + 3600;
  const duration = travel / 45;
  return (
    <div className="absolute inset-0 overflow-hidden bg-black">
      <div className="absolute inset-0" style={{ perspective: 600, perspectiveOrigin: "50% 30%" }}>
        {/* The plane tilts about its bottom edge; the text travels up the plane, into the distance. */}
        <div className="absolute inset-0" style={{ transform: "rotateX(28deg)", transformOrigin: "50% 100%" }}>
          <m.div
            animate={{ y: H - travel }}
            className="absolute top-0 left-1/2 w-[1160px] -translate-x-1/2 text-justify text-[66px] leading-[1.3] font-bold text-[#F5BB03]"
            initial={{ y: H }}
            transition={{ duration, repeat: Infinity, ease: "linear" }}
          >
            <p className="mb-10 text-center text-[80px] uppercase">{params.title}</p>
            {paragraphs.map((p, i) => (
              <p key={i} className="mb-10">
                {p}
              </p>
            ))}
          </m.div>
        </div>
      </div>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[260px] bg-gradient-to-b from-black to-transparent" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Credits — rolling, like the end of a film
// ---------------------------------------------------------------------------

export function Credits({ params }: SceneProps<"credits">) {
  const sections = params.lines
    .split("|")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [role, names] = line.split(":");
      return { role: names ? role.trim() : "", names: (names ?? role).trim() };
    });
  const duration = 10 + sections.length * 4;
  return (
    <div className="absolute inset-0 overflow-hidden bg-black">
      <m.div
        animate={{ y: -(sections.length * 260 + 900) }}
        className="absolute inset-x-0 top-full flex flex-col items-center gap-[110px] text-center"
        initial={{ y: 0 }}
        transition={{ duration, repeat: Infinity, ease: "linear" }}
      >
        <img alt="OWU CONF" className="w-[900px]" src="/images/logos/conf.webp" />
        {sections.map((section, i) => (
          <div key={i}>
            {section.role && (
              <p className="text-[34px] font-semibold tracking-[0.35em] text-[#F5BB03] uppercase">{section.role}</p>
            )}
            <p className="mt-3 text-[66px] leading-[1.15] font-bold text-balance text-[#FBF5E7]">{section.names}</p>
          </div>
        ))}
        <p className="text-[140px] font-extrabold text-[#F5BB03] uppercase">Gracias</p>
      </m.div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Halftone — a dot grid breathing with waves
// ---------------------------------------------------------------------------

const PITCH = 40;

export function Halftone() {
  const canvas = useRef<HTMLCanvasElement>(null);

  useStageFrame((t) => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    const s = t / 1000;
    ctx.fillStyle = BRAND.black;
    ctx.fillRect(0, 0, W, H);
    for (let y = PITCH / 2; y < H; y += PITCH) {
      for (let x = PITCH / 2; x < W; x += PITCH) {
        const wave =
          Math.sin(x * 0.006 + s * 1.2) * Math.sin(y * 0.009 - s * 0.8) + Math.sin((x + y) * 0.004 + s * 0.5) * 0.5;
        const r = Math.max(1, 9 + wave * 7);
        const band = Math.sin(x * 0.0025 - s * 0.6 + y * 0.001);
        ctx.fillStyle = band > 0.75 ? BRAND.cream : band < -0.6 ? BRAND.blue : BRAND.yellow;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, TAU);
        ctx.fill();
      }
    }
  });

  return <canvas ref={canvas} className="absolute inset-0 bg-black" height={H} width={W} />;
}

// ---------------------------------------------------------------------------
// Equalizer — bars that pretend to hear the playlist
// ---------------------------------------------------------------------------

const NBARS = 48;

export function Equalizer({ params }: SceneProps<"equalizer">) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const bars = useMemo(
    () => Array.from({ length: NBARS }, (_, i) => ({ h: 0, peak: 0, f: rand(1.5, 4), p: rand(0, TAU), i })),
    []
  );

  useStageFrame((t, dt) => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    const s = t / 1000;
    ctx.fillStyle = BRAND.black;
    ctx.fillRect(0, 0, W, H);
    const bw = (W - 160) / NBARS;
    const beat = 0.6 + 0.4 * Math.max(0, Math.sin(s * TAU * 2.1));
    for (const b of bars) {
      const shape = 1 - Math.pow(b.i / NBARS, 1.4) * 0.8;
      const target = shape * beat * (0.35 + 0.65 * Math.abs(Math.sin(s * b.f + b.p))) * (0.7 + Math.random() * 0.3);
      b.h += (target - b.h) * (1 - Math.exp(-dt / 70));
      b.peak = Math.max(b.h, b.peak - (dt / 1000) * 0.6);
      const h = b.h * 760;
      const x = 80 + b.i * bw;
      const grad = ctx.createLinearGradient(0, H - 120, 0, H - 120 - 760);
      grad.addColorStop(0, BRAND.yellow);
      grad.addColorStop(0.8, BRAND.cream);
      grad.addColorStop(1, BRAND.blue);
      ctx.fillStyle = grad;
      ctx.fillRect(x, H - 120 - h, bw - 6, h);
      ctx.fillStyle = BRAND.cream;
      ctx.fillRect(x, H - 126 - b.peak * 760, bw - 6, 6);
    }
  });

  return (
    <>
      <canvas ref={canvas} className="absolute inset-0 bg-black" height={H} width={W} />
      <p className="absolute top-[50px] left-[80px] font-terminal text-[30px] tracking-[0.3em] text-[#FBF5E7]/70 uppercase">
        ♪ {params.title}
      </p>
    </>
  );
}

// ---------------------------------------------------------------------------
// Hello world — the same program, many accents
// ---------------------------------------------------------------------------

const HELLOS: [string, string][] = [
  ["C", '#include <stdio.h>\n\nint main(void) {\n  printf("Hello, World!\\n");\n  return 0;\n}'],
  ["Python", 'print("Hello, World!")'],
  ["JavaScript", 'console.log("Hello, World!");'],
  ["TypeScript", 'const greet = (): string => "Hello, World!";\nconsole.log(greet());'],
  ["Rust", 'fn main() {\n    println!("Hello, World!");\n}'],
  ["Go", 'package main\n\nimport "fmt"\n\nfunc main() {\n    fmt.Println("Hello, World!")\n}'],
  ["Ruby", 'puts "Hello, World!"'],
  [
    "Java",
    'public class Hello {\n  public static void main(String[] args) {\n    System.out.println("Hello, World!");\n  }\n}',
  ],
  ["Kotlin", 'fun main() = println("Hello, World!")'],
  ["Swift", 'print("Hello, World!")'],
  ["C#", 'Console.WriteLine("Hello, World!");'],
  ["PHP", '<?php\necho "Hello, World!";'],
  ["Elixir", 'IO.puts("Hello, World!")'],
  ["Haskell", 'main :: IO ()\nmain = putStrLn "Hello, World!"'],
  ["Bash", 'echo "Hello, World!"'],
  ["SQL", "SELECT 'Hello, World!' AS saludo;"],
  ["Lisp", '(format t "Hello, World!~%")'],
  [
    "COBOL",
    '       IDENTIFICATION DIVISION.\n       PROGRAM-ID. HELLO.\n       PROCEDURE DIVISION.\n           DISPLAY "Hello, World!".\n           STOP RUN.',
  ],
  [
    "Brainfuck",
    "++++++++[>++++[>++>+++>+++>+<<<<-]>+>+>->>+[<]<-]>>.>---.+++++++..+++.>>.<-.<.+++.------.--------.>>+.>++.",
  ],
  [
    "x86 asm",
    'section .data\n    msg db "Hello, World!", 10\nsection .text\n    global _start\n_start:\n    mov rax, 1\n    mov rdi, 1\n    mov rsi, msg\n    mov rdx, 14\n    syscall',
  ],
  ["Scratch", "cuando se hace clic en 🏴\n  decir [Hello, World!]"],
  ["HTML", "<h1>Hello, World!</h1>"],
];

export function HelloWorld() {
  const { preview } = useContext(StageContext);
  const [index, setIndex] = useState(0);
  const [typed, setTyped] = useState(preview ? HELLOS[0][1].length : 0);

  useEffect(() => {
    if (preview) return;
    setTyped(0);
    const code = HELLOS[index][1];
    const typing = setInterval(() => setTyped((n) => Math.min(code.length, n + 2)), 18);
    const next = setTimeout(() => setIndex((i) => (i + 1) % HELLOS.length), 1200 + code.length * 9 + 2600);
    return () => {
      clearInterval(typing);
      clearTimeout(next);
    };
  }, [index, preview]);

  const [lang, code] = HELLOS[index];
  const shown = code.slice(0, typed);
  const parts = shown.split(/(Hello, World!?)/);

  return (
    <div className="absolute inset-0 bg-black">
      <div className="absolute top-[110px] left-[140px] flex items-center gap-8">
        <span className="bg-[#F5BB03] px-8 py-3 text-[40px] font-extrabold tracking-[0.1em] text-black uppercase">
          {lang}
        </span>
        <span className="font-terminal text-[30px] text-[#FBF5E7]/50">
          {index + 1} / {HELLOS.length}
        </span>
      </div>
      <pre className="absolute top-[240px] right-[140px] left-[140px] font-terminal text-[52px] leading-[1.35] break-all whitespace-pre-wrap text-[#FBF5E7]">
        {parts.map((part, i) => (
          <span key={i} className={part.startsWith("Hello") ? "text-[#F5BB03]" : undefined}>
            {part}
          </span>
        ))}
        <span className="animate-pulse text-[#0162C8]">▌</span>
      </pre>
    </div>
  );
}

// ---------------------------------------------------------------------------
// BSOD — the classic, in brand blue
// ---------------------------------------------------------------------------

export function Bsod({ params }: SceneProps<"bsod">) {
  const { preview } = useContext(StageContext);
  const [pct, setPct] = useState(preview ? 42 : 0);

  useEffect(() => {
    if (preview) return;
    const id = setInterval(() => setPct((p) => (p >= 100 ? 0 : p + (Math.random() < 0.5 ? 1 : 3))), 400);
    return () => clearInterval(id);
  }, [preview]);

  return (
    <div className="absolute inset-0 bg-[#0162C8] px-[200px] pt-[150px] text-[#FBF5E7]">
      <p className="text-[260px] leading-none">:(</p>
      <p className="mt-10 max-w-[1500px] text-[54px] leading-[1.3] text-balance">{params.message}</p>
      <p className="mt-10 text-[54px]">{Math.min(100, pct)}% completado</p>
      <div className="mt-16 flex items-center gap-10">
        <div className="bg-[#FBF5E7] p-3">
          <QrCode size={180} value="https://owu.uy/conf" />
        </div>
        <div className="text-[30px] leading-[1.5] text-[#FBF5E7]/85">
          <p>Para más información sobre este problema, escaneá el código o preguntale a Owy.</p>
          <p className="mt-6 font-terminal">Código de detención: {params.code}</p>
        </div>
      </div>
    </div>
  );
}
