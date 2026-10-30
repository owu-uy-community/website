"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { AnimatePresence, m } from "motion/react";

import type { EffectEvent, EffectId } from "lib/owy-stage/scenes";
import { BRAND, Caption, H, W, useStageFrame } from "./Stage";

/** How long each one-shot stays mounted; owy-happy is consumed by the face scene. */
const TTL: Record<EffectId, number> = { confetti: 3500, flash: 500, caption: 7000, emoji: 5000, "owy-happy": 0 };

type QueuedEffect = EffectEvent & { id: number };

export function useEffectQueue() {
  const [fx, setFx] = useState<QueuedEffect[]>([]);
  const push = useCallback((event: EffectEvent) => {
    const ttl = TTL[event.effect];
    if (!ttl) return;
    const id = Date.now() + Math.random();
    setFx((queue) => [...queue, { ...event, id }]);
    setTimeout(() => setFx((queue) => queue.filter((item) => item.id !== id)), ttl);
  }, []);

  return [fx, push] as const;
}

export function Effects({ fx }: { fx: QueuedEffect[] }) {
  return (
    <div className="pointer-events-none absolute inset-0">
      <AnimatePresence>
        {fx.map((effect) => {
          if (effect.effect === "confetti") return <Confetti key={effect.id} />;
          if (effect.effect === "flash") {
            return (
              <m.div
                key={effect.id}
                animate={{ opacity: 0 }}
                className="absolute inset-0 bg-[#FBF5E7]"
                initial={{ opacity: 0.95 }}
                transition={{ duration: 0.45, ease: "easeOut" }}
              />
            );
          }
          if (effect.effect === "caption") return <Caption key={effect.id} text={effect.payload?.text ?? ""} />;
          if (effect.effect === "emoji") return <EmojiRain key={effect.id} chars={effect.payload?.text || "👏"} />;
          return null;
        })}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Confetti — two cannons in the bottom corners, brand shapes, ~3 s
// ---------------------------------------------------------------------------

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vrot: number;
  w: number;
  h: number;
  color: string;
  kind: 0 | 1 | 2;
  wobble: number;
};

const COLORS = [BRAND.yellow, BRAND.blue, BRAND.cream];
const GRAVITY = 900;
const LIFE_MS = 3200;

function burst(count: number): Particle[] {
  const particles: Particle[] = [];
  for (let i = 0; i < count; i++) {
    const left = i % 2 === 0;
    const angle = ((left ? -64 : -116) + (Math.random() - 0.5) * 44) * (Math.PI / 180);
    const speed = 1400 + Math.random() * 900;
    particles.push({
      x: left ? 40 : W - 40,
      y: H + 10,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      rot: Math.random() * Math.PI,
      vrot: (Math.random() - 0.5) * 12,
      w: 18 + Math.random() * 16,
      h: 10 + Math.random() * 10,
      color: COLORS[i % COLORS.length],
      kind: (i % 3) as 0 | 1 | 2,
      wobble: Math.random() * Math.PI * 2,
    });
  }
  return particles;
}

export function Confetti() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const particles = useMemo(() => burst(260), []);
  const started = useRef(0);

  useStageFrame((t, dt) => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    if (!started.current) started.current = t;
    const age = t - started.current;
    const s = dt / 1000;
    const alpha = 1 - Math.min(1, Math.max(0, (age - 2200) / (LIFE_MS - 2200)));

    ctx.clearRect(0, 0, W, H);
    ctx.globalAlpha = alpha;
    for (const p of particles) {
      p.vy += GRAVITY * s;
      p.vx *= 0.992;
      p.vy *= 0.992;
      p.x += p.vx * s + Math.sin(t / 180 + p.wobble) * 40 * s;
      p.y += p.vy * s;
      p.rot += p.vrot * s;
      if (p.y > H + 40) continue;

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      if (p.kind === 0) {
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      } else if (p.kind === 1) {
        ctx.beginPath();
        ctx.moveTo(-p.w / 2, p.h / 2);
        ctx.lineTo(p.w / 2, p.h / 2);
        ctx.lineTo(0, -p.h);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, p.h / 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  });

  return <canvas ref={canvas} className="absolute inset-0" height={H} width={W} />;
}

// ---------------------------------------------------------------------------
// Emoji rain — 👏 🧉 🎉 falling for a few seconds
// ---------------------------------------------------------------------------

type Drop = { x: number; y: number; vy: number; size: number; char: string; sway: number; spin: number; rot: number };

/** The largest drop, plus room for the glyph's overhang. */
const SPRITE_PX = 150;

/**
 * Each emoji drawn once into a bitmap: a colour glyph at a new size and angle
 * is rasterized from scratch, which made the rain cost ~3.5 ms a frame.
 */
function emojiSprite(char: string) {
  const sprite = document.createElement("canvas");
  sprite.width = SPRITE_PX;
  sprite.height = SPRITE_PX;
  const ctx = sprite.getContext("2d");
  if (ctx) {
    ctx.font = `120px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(char, SPRITE_PX / 2, SPRITE_PX / 2);
  }
  return sprite;
}

export function EmojiRain({ chars, count = 70 }: { chars: string; count?: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const sprites = useRef(new Map<string, HTMLCanvasElement>());
  const drops = useMemo<Drop[]>(() => {
    const glyphs = Array.from(chars.trim() || "👏");
    return Array.from({ length: count }, (_, i) => ({
      x: Math.random() * W,
      y: -100 - Math.random() * H * 1.4,
      vy: 260 + Math.random() * 340,
      size: 56 + Math.random() * 64,
      char: glyphs[i % glyphs.length],
      sway: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 1.6,
      rot: (Math.random() - 0.5) * 0.6,
    }));
  }, [chars, count]);

  useStageFrame((t, dt) => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    const s = dt / 1000;
    ctx.clearRect(0, 0, W, H);
    for (const d of drops) {
      d.y += d.vy * s;
      d.x += Math.sin(t / 700 + d.sway) * 30 * s;
      d.rot += d.spin * s;
      if (d.y > H + 80) continue;
      let sprite = sprites.current.get(d.char);
      if (!sprite) sprites.current.set(d.char, (sprite = emojiSprite(d.char)));
      // The sprite's 120 px glyph, scaled to this drop's size
      const box = (d.size * SPRITE_PX) / 120;
      ctx.save();
      ctx.translate(d.x, d.y);
      ctx.rotate(d.rot);
      ctx.drawImage(sprite, -box / 2, -box / 2, box, box);
      ctx.restore();
    }
  });

  return <canvas ref={canvas} className="absolute inset-0" height={H} width={W} />;
}
