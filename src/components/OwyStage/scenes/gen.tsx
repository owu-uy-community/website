"use client";

import { useMemo, useRef } from "react";

import { BRAND, H, W, useStageFrame } from "../Stage";
import { LogoReveal } from "./parts";

const rand = (min: number, max: number) => min + Math.random() * (max - min);
const TAU = Math.PI * 2;

// ---------------------------------------------------------------------------
// Pixel canvas — the demoscene way: compute a small frame, scale it up
// ---------------------------------------------------------------------------

/** Brand palette as 256 RGB triplets: black → blue → yellow → cream. */
export const PALETTE = (() => {
  const stops = [
    [0, 0, 0],
    [1, 98, 200],
    [245, 187, 3],
    [251, 245, 231],
  ];
  const out = new Uint8Array(256 * 3);
  for (let i = 0; i < 256; i++) {
    const f = (i / 255) * (stops.length - 1);
    const a = stops[Math.floor(f)];
    const b = stops[Math.min(stops.length - 1, Math.floor(f) + 1)];
    const k = f - Math.floor(f);
    for (let c = 0; c < 3; c++) out[i * 3 + c] = a[c] + (b[c] - a[c]) * k;
  }
  return out;
})();

export const RGB = {
  black: [0, 0, 0],
  blue: [1, 98, 200],
  yellow: [245, 187, 3],
  cream: [251, 245, 231],
} as const;

/** Writes palette entry `c` (0–255) at pixel `i`. */
export function paint(px: Uint8ClampedArray, i: number, c: number) {
  const p = Math.max(0, Math.min(255, c | 0)) * 3;
  const o = i * 4;
  px[o] = PALETTE[p];
  px[o + 1] = PALETTE[p + 1];
  px[o + 2] = PALETTE[p + 2];
  px[o + 3] = 255;
}

export function paintRgb(px: Uint8ClampedArray, i: number, rgb: readonly number[], k = 1) {
  const o = i * 4;
  px[o] = rgb[0] * k;
  px[o + 1] = rgb[1] * k;
  px[o + 2] = rgb[2] * k;
  px[o + 3] = 255;
}

export type PixelDraw = (px: Uint8ClampedArray, t: number, dt: number) => void;

/** Renders `draw` into a w×h buffer every frame and scales it to the wall. */
export function Pixels({ w, h, draw, smooth = true }: { w: number; h: number; draw: PixelDraw; smooth?: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const buffer = useRef<{ octx: CanvasRenderingContext2D; image: ImageData } | null>(null);

  useStageFrame((t, dt) => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    if (!buffer.current) {
      const off = document.createElement("canvas");
      off.width = w;
      off.height = h;
      const octx = off.getContext("2d");
      if (!octx) return;
      buffer.current = { octx, image: new ImageData(w, h) };
    }
    const { octx, image } = buffer.current;
    draw(image.data, t, dt);
    octx.putImageData(image, 0, 0);
    ctx.imageSmoothingEnabled = smooth;
    ctx.drawImage(octx.canvas, 0, 0, W, H);
  });

  return <canvas ref={canvas} className="absolute inset-0 bg-black" height={H} width={W} />;
}

// ---------------------------------------------------------------------------
// Plasma
// ---------------------------------------------------------------------------

const PW = 320;
const PH = 180;

export function Plasma() {
  const draw = useMemo<PixelDraw>(
    () => (px, t) => {
      const s = t / 1000;
      const cx = PW / 2 + Math.sin(s / 2) * 60;
      const cy = PH / 2 + Math.cos(s / 3) * 40;
      for (let y = 0; y < PH; y++) {
        for (let x = 0; x < PW; x++) {
          const v =
            Math.sin(x / 16 + s) +
            Math.sin(y / 9 - s * 0.7) +
            Math.sin((x + y) / 20 + s * 0.5) +
            Math.sin(Math.hypot(x - cx, y - cy) / 10 - s);
          // Mirror the palette so both ends (black and cream) show up as bands.
          const c = ((v + 4) / 8) * 510;
          paint(px, y * PW + x, c > 255 ? 510 - c : c);
        }
      }
    },
    []
  );
  return <Pixels draw={draw} h={PH} w={PW} />;
}

// ---------------------------------------------------------------------------
// Tunnel
// ---------------------------------------------------------------------------

const TW = 320;
const TH = 180;

export function Tunnel() {
  const draw = useMemo<PixelDraw>(() => {
    const dist = new Float32Array(TW * TH);
    const ang = new Float32Array(TW * TH);
    const shade = new Float32Array(TW * TH);
    for (let y = 0; y < TH; y++) {
      for (let x = 0; x < TW; x++) {
        const i = y * TW + x;
        const dx = x - TW / 2;
        const dy = y - TH / 2;
        const d = Math.hypot(dx, dy) || 0.001;
        dist[i] = 1600 / d;
        ang[i] = (Math.atan2(dy, dx) / Math.PI + 1) * 32;
        shade[i] = Math.min(1, d / 90);
      }
    }
    return (px, t) => {
      const s = t / 1000;
      const su = s * 12;
      const sv = s * 70;
      for (let i = 0; i < TW * TH; i++) {
        const u = Math.floor(ang[i] + su) & 63;
        const v = Math.floor(dist[i] + sv) & 63;
        const line = (u & 15) < 2 || (v & 15) < 2;
        const rgb = line ? RGB.cream : ((u >> 4) ^ (v >> 4)) & 1 ? RGB.yellow : RGB.blue;
        paintRgb(px, i, rgb, shade[i]);
      }
    };
  }, []);
  return <Pixels draw={draw} h={TH} w={TW} />;
}

// ---------------------------------------------------------------------------
// Fire — the Doom one
// ---------------------------------------------------------------------------

const FW = 240;
const FH = 135;

export function Fire() {
  const draw = useMemo<PixelDraw>(() => {
    const heat = new Uint8Array(FW * FH);
    let acc = 0;
    return (px, _t, dt) => {
      acc += dt;
      // Fixed steps so the flames climb at the same speed at 15 and 60 fps.
      while (acc > 0) {
        acc -= 33;
        for (let x = 0; x < FW; x++) heat[(FH - 1) * FW + x] = Math.random() < 0.9 ? 255 : 160;
        for (let y = 1; y < FH; y++) {
          for (let x = 0; x < FW; x++) {
            const src = y * FW + x;
            const r = (Math.random() * 3) | 0;
            const dst = Math.max(0, src - FW - r + 1);
            heat[dst] = Math.max(0, heat[src] - ((r & 1) * 5 + 1));
          }
        }
      }
      // A 3-tap blur when painting hides the per-pixel dice rolls.
      for (let i = 0; i < heat.length; i++)
        paint(px, i, (heat[i - 1] ?? heat[i]) * 0.3 + heat[i] * 0.4 + (heat[i + 1] ?? heat[i]) * 0.3);
    };
  }, []);
  return <Pixels draw={draw} h={FH} w={FW} />;
}

// ---------------------------------------------------------------------------
// Metaballs
// ---------------------------------------------------------------------------

const MW = 240;
const MH = 135;

export function Metaballs() {
  const draw = useMemo<PixelDraw>(() => {
    const balls = Array.from({ length: 6 }, () => ({
      fx: rand(0.2, 0.55),
      fy: rand(0.2, 0.55),
      px: rand(0, TAU),
      py: rand(0, TAU),
      r2: rand(14, 26) ** 2,
    }));
    const xs = new Float32Array(balls.length);
    const ys = new Float32Array(balls.length);
    return (px, t) => {
      const s = t / 1000;
      balls.forEach((b, k) => {
        xs[k] = MW / 2 + Math.sin(s * b.fx + b.px) * MW * 0.38;
        ys[k] = MH / 2 + Math.cos(s * b.fy + b.py) * MH * 0.38;
      });
      for (let y = 0; y < MH; y++) {
        for (let x = 0; x < MW; x++) {
          let f = 0;
          for (let k = 0; k < balls.length; k++) {
            const dx = x - xs[k];
            const dy = y - ys[k];
            f += balls[k].r2 / (dx * dx + dy * dy + 1);
          }
          paint(px, y * MW + x, f * 110);
        }
      }
    };
  }, []);
  return <Pixels draw={draw} h={MH} w={MW} />;
}

// ---------------------------------------------------------------------------
// Voronoi
// ---------------------------------------------------------------------------

const VW = 240;
const VH = 135;
const VORONOI_COLORS = [RGB.yellow, RGB.blue, RGB.cream, [40, 40, 40]] as const;

export function Voronoi() {
  const draw = useMemo<PixelDraw>(() => {
    const seeds = Array.from({ length: 16 }, (_, i) => ({
      x: rand(0, VW),
      y: rand(0, VH),
      vx: rand(-9, 9),
      vy: rand(-9, 9),
      rgb: VORONOI_COLORS[i % VORONOI_COLORS.length],
    }));
    return (px, _t, dt) => {
      const s = dt / 1000;
      for (const seed of seeds) {
        seed.x += seed.vx * s;
        seed.y += seed.vy * s;
        if (seed.x < 0 || seed.x > VW) seed.vx *= -1;
        if (seed.y < 0 || seed.y > VH) seed.vy *= -1;
      }
      for (let y = 0; y < VH; y++) {
        for (let x = 0; x < VW; x++) {
          let best = Infinity;
          let second = Infinity;
          let bi = 0;
          for (let k = 0; k < seeds.length; k++) {
            const dx = x - seeds[k].x;
            const dy = y - seeds[k].y;
            const d = dx * dx + dy * dy;
            if (d < best) {
              second = best;
              best = d;
              bi = k;
            } else if (d < second) second = d;
          }
          const i = y * VW + x;
          if (Math.sqrt(second) - Math.sqrt(best) < 1.6) paintRgb(px, i, RGB.black);
          else paintRgb(px, i, seeds[bi].rgb, 1 - Math.min(0.6, Math.sqrt(best) / 80));
        }
      }
    };
  }, []);
  return <Pixels draw={draw} h={VH} w={VW} />;
}

// ---------------------------------------------------------------------------
// Reaction–diffusion (Gray–Scott)
// ---------------------------------------------------------------------------

const RW = 192;
const RH = 108;

export function ReactionDiffusion() {
  const draw = useMemo<PixelDraw>(() => {
    let a = new Float32Array(RW * RH);
    let b = new Float32Array(RW * RH);
    let a2 = new Float32Array(RW * RH);
    let b2 = new Float32Array(RW * RH);
    const seed = () => {
      a.fill(1);
      b.fill(0);
      for (let n = 0; n < 6; n++) {
        const x0 = Math.floor(rand(10, RW - 16));
        const y0 = Math.floor(rand(10, RH - 16));
        for (let y = y0; y < y0 + 6; y++) for (let x = x0; x < x0 + 6; x++) b[y * RW + x] = 1;
      }
    };
    seed();
    let age = 0;
    const f = 0.055;
    const k = 0.062;
    return (px, _t, dt) => {
      age += dt;
      if (age > 150_000) {
        seed();
        age = 0;
      }
      for (let step = 0; step < 6; step++) {
        for (let y = 1; y < RH - 1; y++) {
          for (let x = 1; x < RW - 1; x++) {
            const i = y * RW + x;
            const la =
              (a[i - 1] + a[i + 1] + a[i - RW] + a[i + RW]) * 0.2 +
              (a[i - RW - 1] + a[i - RW + 1] + a[i + RW - 1] + a[i + RW + 1]) * 0.05 -
              a[i];
            const lb =
              (b[i - 1] + b[i + 1] + b[i - RW] + b[i + RW]) * 0.2 +
              (b[i - RW - 1] + b[i - RW + 1] + b[i + RW - 1] + b[i + RW + 1]) * 0.05 -
              b[i];
            const abb = a[i] * b[i] * b[i];
            a2[i] = Math.min(1, Math.max(0, a[i] + la - abb + f * (1 - a[i])));
            b2[i] = Math.min(1, Math.max(0, b[i] + lb * 0.5 + abb - (k + f) * b[i]));
          }
        }
        [a, a2] = [a2, a];
        [b, b2] = [b2, b];
      }
      for (let i = 0; i < b.length; i++) paint(px, i, b[i] * 640);
    };
  }, []);
  return <Pixels draw={draw} h={RH} w={RW} />;
}

// ---------------------------------------------------------------------------
// Julia set — c walks around the circle
// ---------------------------------------------------------------------------

const JW = 240;
const JH = 135;

export function Julia() {
  const draw = useMemo<PixelDraw>(
    () => (px, t) => {
      const s = t / 1000;
      const cr = 0.7885 * Math.cos(s * 0.22);
      const ci = 0.7885 * Math.sin(s * 0.22);
      for (let y = 0; y < JH; y++) {
        for (let x = 0; x < JW; x++) {
          let zx = (x / JW - 0.5) * 3.4;
          let zy = (y / JH - 0.5) * 3.4 * (JH / JW);
          let n = 0;
          while (n < 40 && zx * zx + zy * zy < 4) {
            const nx = zx * zx - zy * zy + cr;
            zy = 2 * zx * zy + ci;
            zx = nx;
            n++;
          }
          paint(px, y * JW + x, n === 40 ? 0 : Math.sqrt(n / 40) * 255);
        }
      }
    },
    []
  );
  return <Pixels draw={draw} h={JH} w={JW} />;
}

// ---------------------------------------------------------------------------
// Flow field — particles riding a drifting vector field
// ---------------------------------------------------------------------------

function field(x: number, y: number, s: number) {
  return (Math.sin(x * 0.0021 + s * 0.3) + Math.cos(y * 0.0027 - s * 0.2) + Math.sin((x - y) * 0.0013 + s * 0.1)) * 1.7;
}

const FLOW_COLORS = [BRAND.yellow, BRAND.yellow, BRAND.cream, BRAND.blue];

export function FlowField() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const particles = useMemo(
    () =>
      Array.from({ length: 1400 }, (_, i) => ({
        x: rand(0, W),
        y: rand(0, H),
        life: rand(0, 6),
        color: i % FLOW_COLORS.length,
      })),
    []
  );

  useStageFrame((t, dt) => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    const s = t / 1000;
    const step = (dt / 1000) * 120;
    ctx.fillStyle = "rgba(0,0,0,0.035)";
    ctx.fillRect(0, 0, W, H);
    ctx.lineWidth = 3;
    // One path per colour: 1400 strokes a frame would be the expensive part.
    FLOW_COLORS.forEach((color, c) => {
      ctx.strokeStyle = color;
      ctx.beginPath();
      for (const p of particles) {
        if (p.color !== c) continue;
        const a = field(p.x, p.y, s);
        const nx = p.x + Math.cos(a) * step;
        const ny = p.y + Math.sin(a) * step;
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(nx, ny);
        p.x = nx;
        p.y = ny;
        p.life -= dt / 1000;
        if (p.life < 0 || nx < 0 || nx > W || ny < 0 || ny > H) {
          p.x = rand(0, W);
          p.y = rand(0, H);
          p.life = rand(2, 7);
        }
      }
      ctx.stroke();
    });
  });

  return <canvas ref={canvas} className="absolute inset-0 bg-black" height={H} width={W} />;
}

// ---------------------------------------------------------------------------
// Boids
// ---------------------------------------------------------------------------

type Boid = { x: number; y: number; vx: number; vy: number; color: string };

export function Boids() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const boids = useMemo<Boid[]>(
    () =>
      Array.from({ length: 160 }, (_, i) => {
        const a = rand(0, TAU);
        return {
          x: rand(0, W),
          y: rand(0, H),
          vx: Math.cos(a) * 160,
          vy: Math.sin(a) * 160,
          color: FLOW_COLORS[i % 4],
        };
      }),
    []
  );

  useStageFrame((_t, dt) => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    const s = dt / 1000;
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.fillRect(0, 0, W, H);
    for (const b of boids) {
      let ax = 0;
      let ay = 0;
      let cx = 0;
      let cy = 0;
      let sx = 0;
      let sy = 0;
      let n = 0;
      for (const o of boids) {
        if (o === b) continue;
        const dx = o.x - b.x;
        const dy = o.y - b.y;
        const d2 = dx * dx + dy * dy;
        if (d2 > 90 * 90) continue;
        n++;
        ax += o.vx;
        ay += o.vy;
        cx += o.x;
        cy += o.y;
        if (d2 < 32 * 32) {
          sx -= dx;
          sy -= dy;
        }
      }
      if (n) {
        b.vx += ((ax / n - b.vx) * 0.6 + (cx / n - b.x) * 0.8 + sx * 3) * s;
        b.vy += ((ay / n - b.vy) * 0.6 + (cy / n - b.y) * 0.8 + sy * 3) * s;
      }
      // Soft walls, constant cruising speed.
      if (b.x < 120) b.vx += 400 * s;
      if (b.x > W - 120) b.vx -= 400 * s;
      if (b.y < 100) b.vy += 400 * s;
      if (b.y > H - 100) b.vy -= 400 * s;
      const v = Math.hypot(b.vx, b.vy) || 1;
      b.vx = (b.vx / v) * 190;
      b.vy = (b.vy / v) * 190;
      b.x += b.vx * s;
      b.y += b.vy * s;
    }
    for (const b of boids) {
      const a = Math.atan2(b.vy, b.vx);
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(a);
      ctx.fillStyle = b.color;
      ctx.beginPath();
      ctx.moveTo(22, 0);
      ctx.lineTo(-14, 11);
      ctx.lineTo(-8, 0);
      ctx.lineTo(-14, -11);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  });

  return <canvas ref={canvas} className="absolute inset-0 bg-black" height={H} width={W} />;
}

// ---------------------------------------------------------------------------
// Rotozoom — a brand tile, spun and zoomed
// ---------------------------------------------------------------------------

export function Rotozoom() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const pattern = useRef<CanvasPattern | null>(null);

  useStageFrame((t) => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    if (!pattern.current) {
      const tile = document.createElement("canvas");
      tile.width = 240;
      tile.height = 240;
      const tc = tile.getContext("2d");
      if (!tc) return;
      tc.fillStyle = BRAND.black;
      tc.fillRect(0, 0, 240, 240);
      tc.fillStyle = BRAND.yellow;
      tc.beginPath();
      tc.arc(60, 60, 44, 0, TAU);
      tc.fill();
      tc.fillStyle = BRAND.blue;
      tc.beginPath();
      tc.moveTo(130, 20);
      tc.lineTo(220, 100);
      tc.lineTo(130, 100);
      tc.closePath();
      tc.fill();
      tc.fillStyle = BRAND.cream;
      tc.fillRect(140, 140, 80, 80);
      tc.fillStyle = BRAND.yellow;
      tc.beginPath();
      tc.arc(60, 180, 44, Math.PI, TAU);
      tc.fill();
      pattern.current = ctx.createPattern(tile, "repeat");
    }
    const s = t / 1000;
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.rotate(s * 0.25);
    const z = 1.4 + Math.sin(s * 0.45) * 0.9;
    ctx.scale(z, z);
    ctx.translate(s * 40, s * 25);
    ctx.fillStyle = pattern.current ?? BRAND.black;
    ctx.fillRect(-6000, -6000, 12000, 12000);
    ctx.restore();
  });

  return (
    <>
      <canvas ref={canvas} className="absolute inset-0 bg-black" height={H} width={W} />
      <div className="absolute top-[440px] left-[560px] w-[800px] bg-black p-8">
        <LogoReveal className="!w-[736px]" delay={0.4} />
      </div>
    </>
  );
}
