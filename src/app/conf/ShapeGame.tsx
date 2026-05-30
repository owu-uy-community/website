"use client";

import { useEffect, useRef, useState } from "react";

const YELLOW = "#F5BB03";
const BLUE = "#0162C8";
const WHITE = "#F6F6F6";
const COLORS = [YELLOW, BLUE, WHITE, YELLOW, BLUE];
const TYPES = ["triangle", "circle", "square"] as const;
type ShapeType = (typeof TYPES)[number];

type Shape = { x: number; y: number; vy: number; r: number; rot: number; vrot: number; type: ShapeType; color: string };
type Particle = { x: number; y: number; vx: number; vy: number; life: number; color: string };
type Phase = "ready" | "playing" | "over";

const BEST_KEY = "owu-shape-best";

export default function ShapeGame({ onClose }: { onClose: () => void }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const startRef = useRef<() => void>(() => {});
  const [phase, setPhase] = useState<Phase>("ready");
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);

  const g = useRef({
    w: 0,
    h: 0,
    paddleX: 0,
    targetX: 0,
    paddleW: 110,
    paddleY: 0,
    shapes: [] as Shape[],
    parts: [] as Particle[],
    score: 0,
    lives: 3,
    elapsed: 0,
    lastSpawn: 0,
    last: 0,
    flash: 0,
    keys: { left: false, right: false },
    raf: 0,
    running: false,
  });

  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    try {
      const b = Number(localStorage.getItem(BEST_KEY) || "0");
      if (b) setBest(b);
    } catch {}

    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

    const size = () => {
      const s = g.current;
      const rect = wrap.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      s.w = rect.width;
      s.h = rect.height;
      canvas.width = Math.round(s.w * dpr);
      canvas.height = Math.round(s.h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      s.paddleY = s.h - 30;
      s.paddleW = clamp(s.w * 0.22, 64, 120);
      if (!s.paddleX) {
        s.paddleX = s.w / 2;
        s.targetX = s.w / 2;
      } else {
        s.paddleX = clamp(s.paddleX, s.paddleW / 2, s.w - s.paddleW / 2);
        s.targetX = clamp(s.targetX, s.paddleW / 2, s.w - s.paddleW / 2);
      }
    };
    size();
    const ro = new ResizeObserver(size);
    ro.observe(wrap);

    const spawn = () => {
      const s = g.current;
      const r = 9 + Math.random() * 9;
      s.shapes.push({
        x: r + Math.random() * (s.w - r * 2),
        y: -r,
        vy: 95 + Math.random() * 55,
        r,
        rot: Math.random() * Math.PI,
        vrot: (Math.random() - 0.5) * 3,
        type: TYPES[(Math.random() * TYPES.length) | 0],
        color: COLORS[(Math.random() * COLORS.length) | 0],
      });
    };

    const burst = (x: number, y: number, color: string) => {
      const s = g.current;
      for (let i = 0; i < 8; i += 1) {
        const a = Math.random() * Math.PI * 2;
        const sp = 50 + Math.random() * 120;
        s.parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 30, life: 1, color });
      }
    };

    const drawShape = (sh: Shape) => {
      ctx.save();
      ctx.translate(sh.x, sh.y);
      ctx.rotate(sh.rot);
      ctx.fillStyle = sh.color;
      if (sh.type === "circle") {
        ctx.beginPath();
        ctx.arc(0, 0, sh.r, 0, Math.PI * 2);
        ctx.fill();
      } else if (sh.type === "square") {
        const a = sh.r * 1.7;
        ctx.fillRect(-a / 2, -a / 2, a, a);
      } else {
        ctx.beginPath();
        ctx.moveTo(0, -sh.r);
        ctx.lineTo(sh.r * 0.92, sh.r * 0.72);
        ctx.lineTo(-sh.r * 0.92, sh.r * 0.72);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    };

    const draw = () => {
      const s = g.current;
      ctx.clearRect(0, 0, s.w, s.h);
      if (s.flash > 0) {
        ctx.fillStyle = `rgba(255,60,60,${s.flash * 0.16})`;
        ctx.fillRect(0, 0, s.w, s.h);
      }
      s.shapes.forEach(drawShape);
      s.parts.forEach((p) => {
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
      });
      ctx.globalAlpha = 1;

      const px = s.paddleX - s.paddleW / 2;
      ctx.fillStyle = YELLOW;
      ctx.shadowColor = "rgba(245,187,3,0.5)";
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.roundRect(px, s.paddleY, s.paddleW, 11, 6);
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.textBaseline = "top";
      ctx.fillStyle = "rgba(255,255,255,0.4)";
      ctx.font = "600 9px Poppins, sans-serif";
      ctx.fillText("PUNTOS", 14, 12);
      ctx.fillStyle = "#fff";
      ctx.font = "800 24px Poppins, sans-serif";
      ctx.fillText(String(s.score), 14, 22);
    };

    const gameOver = () => {
      const s = g.current;
      s.running = false;
      s.flash = 0;
      cancelAnimationFrame(s.raf);
      ctx.clearRect(0, 0, s.w, s.h);
      setScore(s.score);
      setBest((prev) => {
        const nb = Math.max(prev, s.score);
        try {
          localStorage.setItem(BEST_KEY, String(nb));
        } catch {}
        return nb;
      });
      setPhase("over");
    };

    const loop = (t: number) => {
      const s = g.current;
      if (!s.running) return;
      if (!s.last) {
        s.last = t;
        s.lastSpawn = t;
      }
      const dt = Math.min(34, t - s.last) / 1000;
      s.last = t;
      s.elapsed += dt;
      if (s.flash > 0) s.flash = Math.max(0, s.flash - dt * 3);

      const speed = 1 + s.elapsed / 26;
      const spawnEvery = Math.max(420, 900 - s.elapsed * 10);
      if (t - s.lastSpawn > spawnEvery) {
        s.lastSpawn = t;
        spawn();
      }

      const kb = 620;
      if (s.keys.left) s.targetX -= kb * dt;
      if (s.keys.right) s.targetX += kb * dt;
      s.targetX = clamp(s.targetX, s.paddleW / 2, s.w - s.paddleW / 2);
      s.paddleX += (s.targetX - s.paddleX) * Math.min(1, dt * 22);

      s.shapes = s.shapes.filter((sh) => {
        sh.y += sh.vy * dt * speed;
        sh.rot += sh.vrot * dt;
        if (
          sh.y + sh.r >= s.paddleY &&
          sh.y - sh.r <= s.paddleY + 14 &&
          Math.abs(sh.x - s.paddleX) <= s.paddleW / 2 + sh.r * 0.4
        ) {
          s.score += 1;
          burst(sh.x, s.paddleY, sh.color);
          return false;
        }
        if (sh.y - sh.r > s.h) {
          s.lives -= 1;
          s.flash = 1;
          if (s.lives <= 0) gameOver();
          return false;
        }
        return true;
      });

      s.parts = s.parts.filter((p) => {
        p.life -= dt * 1.7;
        p.vy += 360 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        return p.life > 0;
      });

      draw();
      if (s.running) s.raf = requestAnimationFrame(loop);
    };

    const start = () => {
      const s = g.current;
      s.shapes = [];
      s.parts = [];
      s.score = 0;
      s.lives = 3;
      s.elapsed = 0;
      s.last = 0;
      s.lastSpawn = 0;
      s.flash = 0;
      s.paddleX = s.w / 2;
      s.targetX = s.w / 2;
      s.running = true;
      setScore(0);
      setPhase("playing");
      cancelAnimationFrame(s.raf);
      s.raf = requestAnimationFrame(loop);
    };
    startRef.current = start;

    const onPointer = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      g.current.targetX = clamp(e.clientX - rect.left, g.current.paddleW / 2, g.current.w - g.current.paddleW / 2);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
      if (e.key === "ArrowLeft" || e.key === "a") {
        g.current.keys.left = true;
        if (g.current.running) e.preventDefault();
      }
      if (e.key === "ArrowRight" || e.key === "d") {
        g.current.keys.right = true;
        if (g.current.running) e.preventDefault();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === "a") g.current.keys.left = false;
      if (e.key === "ArrowRight" || e.key === "d") g.current.keys.right = false;
    };

    canvas.addEventListener("pointermove", onPointer, { passive: true });
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    return () => {
      cancelAnimationFrame(g.current.raf);
      g.current.running = false;
      ro.disconnect();
      canvas.removeEventListener("pointermove", onPointer);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  return (
    <div className="w-full max-w-2xl overflow-hidden rounded-lg border border-white/15 bg-black text-left shadow-[0_10px_40px_rgba(0,0,0,0.5)] [view-transition-name:conf-window]">
      <div className="flex items-center gap-1.5 border-b border-white/10 px-3 py-2">
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="group/dot relative flex h-2.5 w-2.5 items-center justify-center rounded-full bg-[#FF5F56] outline-none transition-transform hover:scale-110 focus-visible:scale-110"
        >
          <span className="font-terminal text-[7px] leading-none text-black/0 transition-colors group-hover/dot:text-black/60">
            ✕
          </span>
        </button>
        <span className="h-2.5 w-2.5 rounded-full bg-[#FFBD2E]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#27C93F]" />
        <span className="ml-2 font-terminal text-[0.65rem] tracking-tight text-white/35">owu@conf: ~/game</span>
      </div>

      <div ref={wrapRef} className="relative h-[clamp(240px,40dvh,360px)] w-full">
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />

        {phase !== "playing" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/55 px-6 text-center backdrop-blur-[2px]">
            {phase === "ready" ? (
              <>
                <span className="font-display text-[0.65rem] font-semibold uppercase tracking-[0.3em] text-[#F5BB03]">
                  Easter egg
                </span>
                <h3 className="font-display text-2xl font-extrabold uppercase leading-none tracking-tight sm:text-3xl">
                  Lluvia de <span className="text-[#F5BB03]">formas</span>
                </h3>
                <p className="max-w-sm text-sm text-white/65">
                  Atrapá las formas con la barra. Mouse, dedo o flechas. 3 vidas.
                </p>
              </>
            ) : (
              <>
                <span className="font-display text-[0.65rem] font-semibold uppercase tracking-[0.3em] text-[#0162C8]">
                  Game over
                </span>
                <div className="flex items-end gap-6">
                  <div>
                    <p className="font-display text-[0.6rem] uppercase tracking-[0.2em] text-white/45">Puntos</p>
                    <p className="font-display text-4xl font-extrabold leading-none text-[#F5BB03]">{score}</p>
                  </div>
                  <div>
                    <p className="font-display text-[0.6rem] uppercase tracking-[0.2em] text-white/45">Récord</p>
                    <p className="font-display text-2xl font-bold leading-none text-white/80">{best}</p>
                  </div>
                </div>
              </>
            )}
            <button
              type="button"
              onClick={() => startRef.current()}
              className="mt-1 rounded-full bg-[#F5BB03] px-7 py-2.5 font-display text-sm font-extrabold uppercase tracking-wide text-black transition-transform duration-150 ease-out hover:-translate-y-0.5"
            >
              {phase === "ready" ? "Jugar" : "Jugar de nuevo"}
            </button>
            {phase === "ready" && best > 0 && (
              <p className="font-display text-xs uppercase tracking-[0.2em] text-white/40">Récord: {best}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
