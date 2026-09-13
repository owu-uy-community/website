"use client";

import { useMemo, useRef } from "react";

import type { SceneProps } from "lib/owy-stage/scenes";

import { BRAND, H, W, useStageFrame } from "../Stage";
import { Pixels, RGB, paintRgb, type PixelDraw } from "./gen";
import { LogoReveal } from "./parts";

const rand = (min: number, max: number) => min + Math.random() * (max - min);
const TAU = Math.PI * 2;
const COLORS = [BRAND.yellow, BRAND.blue, BRAND.cream];

// ---------------------------------------------------------------------------
// Terrain — wireframe flyover with a sun on the horizon
// ---------------------------------------------------------------------------

const ROWS = 44;
const COLS = 72;
const HORIZON = 330;
const FOCAL = 800;
const NEAR = 3;

function height(x: number, z: number) {
  const ridge = Math.sin(x * 0.9 + z * 0.5) * Math.cos(z * 0.7 - x * 0.3) * 0.5 + Math.sin(x * 2.3 + z * 1.1) * 0.15;
  // Flat valley down the middle, mountains on the sides.
  return ridge * (0.15 + Math.min(1, Math.abs(x) * 0.5)) * 1.1;
}

export function Terrain() {
  const canvas = useRef<HTMLCanvasElement>(null);

  useStageFrame((t) => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    const s = t / 1000;
    const travel = s * 2.4;
    ctx.fillStyle = BRAND.black;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = BRAND.yellow;
    ctx.beginPath();
    ctx.arc(W / 2, HORIZON - 20, 170, 0, TAU);
    ctx.fill();
    ctx.fillStyle = BRAND.black;
    for (let i = 0; i < 5; i++) ctx.fillRect(W / 2 - 200, HORIZON - 20 + i * 26 + 8, 400, 6 + i * 3);

    const project = (col: number, row: number) => {
      const z = row + NEAR - (travel % 1);
      const x = (col / (COLS - 1) - 0.5) * 8;
      const y = height(x, row + Math.floor(travel));
      return { sx: W / 2 + (x * FOCAL) / z, sy: HORIZON + ((1.4 - y) * FOCAL) / z, z };
    };
    ctx.lineWidth = 2;
    for (let row = ROWS - 1; row >= 0; row--) {
      ctx.beginPath();
      for (let col = 0; col < COLS; col++) {
        const p = project(col, row);
        if (col === 0) ctx.moveTo(p.sx, p.sy);
        else ctx.lineTo(p.sx, p.sy);
      }
      ctx.strokeStyle = BRAND.cream;
      ctx.globalAlpha = 0.15 + 0.85 * (1 - row / ROWS);
      ctx.stroke();
    }
    ctx.strokeStyle = BRAND.blue;
    ctx.globalAlpha = 0.7;
    for (let col = 0; col < COLS; col += 4) {
      ctx.beginPath();
      for (let row = 0; row < ROWS; row++) {
        const p = project(col, row);
        if (row === 0) ctx.moveTo(p.sx, p.sy);
        else ctx.lineTo(p.sx, p.sy);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  });

  return <canvas ref={canvas} className="absolute inset-0 bg-black" height={H} width={W} />;
}

// ---------------------------------------------------------------------------
// Ripples
// ---------------------------------------------------------------------------

type Ring = { x: number; y: number; age: number; color: string };

export function Ripples() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const rings = useRef<Ring[]>([]);
  const next = useRef(0);

  useStageFrame((t, dt) => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    if (t > next.current) {
      next.current = t + rand(350, 900);
      const color = COLORS[Math.floor(Math.random() * COLORS.length)];
      for (let i = 0; i < 3; i++)
        rings.current.push({ x: rand(100, W - 100), y: rand(100, H - 100), age: -i * 0.25, color });
    }
    ctx.clearRect(0, 0, W, H);
    rings.current = rings.current.filter((r) => r.age < 2.6);
    for (const r of rings.current) {
      r.age += dt / 1000;
      if (r.age < 0) continue;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.age * 280, 0, TAU);
      ctx.strokeStyle = r.color;
      ctx.globalAlpha = 1 - r.age / 2.6;
      ctx.lineWidth = 10 - r.age * 3;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  });

  return <canvas ref={canvas} className="absolute inset-0 bg-black" height={H} width={W} />;
}

// ---------------------------------------------------------------------------
// Rays — the sunburst behind the logo
// ---------------------------------------------------------------------------

export function Rays() {
  const canvas = useRef<HTMLCanvasElement>(null);

  useStageFrame((t) => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    const s = t / 1000;
    ctx.fillStyle = BRAND.black;
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.rotate(s * 0.12);
    ctx.fillStyle = BRAND.yellow;
    for (let k = 0; k < 24; k += 2) {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, 1500, (k * TAU) / 24, ((k + 1) * TAU) / 24);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    ctx.fillStyle = BRAND.black;
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, 470, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = BRAND.blue;
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, 470, 0, TAU);
    ctx.stroke();
  });

  return (
    <>
      <canvas ref={canvas} className="absolute inset-0 bg-black" height={H} width={W} />
      <div className="absolute top-[460px] left-[560px] w-[800px]">
        <LogoReveal className="!w-[800px]" delay={0.3} />
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Network — the constellation background
// ---------------------------------------------------------------------------

type Node = { x: number; y: number; vx: number; vy: number; r: number; color: string };

export function Network() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const nodes = useMemo<Node[]>(
    () =>
      Array.from({ length: 90 }, (_, i) => ({
        x: rand(0, W),
        y: rand(0, H),
        vx: rand(-30, 30),
        vy: rand(-30, 30),
        r: i % 9 === 0 ? 13 : rand(5, 9),
        color: i % 9 === 0 ? BRAND.blue : i % 3 ? BRAND.yellow : BRAND.cream,
      })),
    []
  );

  useStageFrame((_t, dt) => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    const s = dt / 1000;
    ctx.clearRect(0, 0, W, H);
    for (const n of nodes) {
      n.x += n.vx * s;
      n.y += n.vy * s;
      if (n.x < 0 || n.x > W) n.vx *= -1;
      if (n.y < 0 || n.y > H) n.vy *= -1;
    }
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = BRAND.cream;
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const d = Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y);
        if (d > 280) continue;
        ctx.globalAlpha = (1 - d / 280) * 0.8;
        ctx.beginPath();
        ctx.moveTo(nodes[i].x, nodes[i].y);
        ctx.lineTo(nodes[j].x, nodes[j].y);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    for (const n of nodes) {
      ctx.fillStyle = n.color;
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r, 0, TAU);
      ctx.fill();
    }
  });

  return <canvas ref={canvas} className="absolute inset-0 bg-black" height={H} width={W} />;
}

// ---------------------------------------------------------------------------
// Blob — organic brand shapes breathing
// ---------------------------------------------------------------------------

const BLOBS = [
  { color: BRAND.yellow, r: 400, phase: 0, cx: -40, cy: 0 },
  { color: BRAND.blue, r: 300, phase: 2.1, cx: 120, cy: 60 },
  { color: BRAND.cream, r: 170, phase: 4.2, cx: -20, cy: -40 },
];

export function Blob() {
  const canvas = useRef<HTMLCanvasElement>(null);

  useStageFrame((t) => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    const s = t / 1000;
    ctx.fillStyle = BRAND.black;
    ctx.fillRect(0, 0, W, H);
    for (const b of BLOBS) {
      const cx = W / 2 + b.cx + Math.sin(s * 0.4 + b.phase) * 90;
      const cy = H / 2 + b.cy + Math.cos(s * 0.3 + b.phase) * 60;
      ctx.fillStyle = b.color;
      ctx.beginPath();
      for (let k = 0; k <= 140; k++) {
        const a = (k / 140) * TAU;
        const r =
          b.r *
          (1 +
            0.16 * Math.sin(3 * a + s * 1.1 + b.phase) +
            0.09 * Math.sin(5 * a - s * 0.8 + b.phase) +
            0.05 * Math.sin(8 * a + s * 1.9));
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        if (k === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
    }
  });

  return (
    <>
      <canvas ref={canvas} className="absolute inset-0 bg-black" height={H} width={W} />
      <img alt="OWU CONF" className="absolute right-[100px] bottom-[70px] w-[360px]" src="/images/logos/conf.webp" />
    </>
  );
}

// ---------------------------------------------------------------------------
// Dragon curve — folds itself, one segment at a time
// ---------------------------------------------------------------------------

function dragonPoints(order: number) {
  const n = 1 << order;
  const pts: [number, number][] = [[0, 0]];
  let x = 0;
  let y = 0;
  let dir = 0;
  for (let i = 1; i <= n; i++) {
    // Turn left when the bit above the lowest set bit is 0.
    const left = (((i & -i) << 1) & i) === 0;
    dir = (dir + (left ? 1 : 3)) & 3;
    x += dir === 0 ? 1 : dir === 2 ? -1 : 0;
    y += dir === 1 ? 1 : dir === 3 ? -1 : 0;
    pts.push([x, y]);
  }
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const k = Math.min((W - 160) / (maxX - minX || 1), (H - 160) / (maxY - minY || 1));
  const ox = (W - (maxX - minX) * k) / 2 - minX * k;
  const oy = (H - (maxY - minY) * k) / 2 - minY * k;
  return pts.map(([px, py]) => [px * k + ox, py * k + oy] as [number, number]);
}

export function Dragon() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const state = useRef({ pts: [] as [number, number][], drawn: 0, doneAt: 0, round: 0 });

  useStageFrame((t) => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    const s = state.current;
    if (!s.pts.length) {
      s.pts = dragonPoints(12 + (s.round % 3));
      s.drawn = 0;
      ctx.fillStyle = BRAND.black;
      ctx.fillRect(0, 0, W, H);
    }
    if (s.drawn >= s.pts.length - 1) {
      if (!s.doneAt) s.doneAt = t;
      if (t - s.doneAt > 4000) {
        s.pts = [];
        s.doneAt = 0;
        s.round++;
      }
      return;
    }
    const end = Math.min(s.pts.length - 1, s.drawn + 28);
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    for (let i = s.drawn; i < end; i++) {
      ctx.strokeStyle = COLORS[Math.floor((i / s.pts.length) * 3)];
      ctx.beginPath();
      ctx.moveTo(s.pts[i][0], s.pts[i][1]);
      ctx.lineTo(s.pts[i + 1][0], s.pts[i + 1][1]);
      ctx.stroke();
    }
    s.drawn = end;
  });

  return <canvas ref={canvas} className="absolute inset-0 bg-black" height={H} width={W} />;
}

// ---------------------------------------------------------------------------
// Wave function collapse — a circuit board that solves itself
// ---------------------------------------------------------------------------

// Tile edges as [N, E, S, W]; 1 = a trace leaves through that side.
const TILES = [
  [0, 0, 0, 0],
  [1, 0, 1, 0],
  [0, 1, 0, 1],
  [1, 1, 0, 0],
  [0, 1, 1, 0],
  [0, 0, 1, 1],
  [1, 0, 0, 1],
  [1, 1, 1, 0],
  [0, 1, 1, 1],
  [1, 0, 1, 1],
  [1, 1, 0, 1],
  [1, 1, 1, 1],
  [1, 0, 0, 0],
  [0, 1, 0, 0],
  [0, 0, 1, 0],
  [0, 0, 0, 1],
];
const WEIGHTS = [5, 4, 4, 2, 2, 2, 2, 1, 1, 1, 1, 0.5, 0.7, 0.7, 0.7, 0.7];
const ALL = (1 << TILES.length) - 1;
// COMPAT[d][t] = mask of tiles allowed next to tile t in direction d.
const COMPAT = [0, 1, 2, 3].map((d) =>
  TILES.map((tile) => TILES.reduce((mask, other, u) => (other[(d + 2) % 4] === tile[d] ? mask | (1 << u) : mask), 0))
);
const CELL = 60;
const GW = W / CELL;
const GH = H / CELL;
const DIRS = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

function popcount(m: number) {
  let n = 0;
  while (m) {
    m &= m - 1;
    n++;
  }
  return n;
}

export function Wfc() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const state = useRef({
    cells: new Uint16Array(GW * GH).fill(ALL),
    drawn: new Uint8Array(GW * GH),
    left: GW * GH,
    doneAt: 0,
    fresh: true,
  });

  const collapse = (ctx: CanvasRenderingContext2D) => {
    const s = state.current;
    // Lowest entropy first, ties broken at random.
    let best = 99;
    let pick = -1;
    for (let i = 0; i < s.cells.length; i++) {
      const n = popcount(s.cells[i]);
      if (n > 1 && (n < best || (n === best && Math.random() < 0.3))) {
        best = n;
        pick = i;
      }
    }
    if (pick < 0) return false;
    const options = TILES.map((_, t) => t).filter((t) => s.cells[pick] & (1 << t));
    let chosen = options[0];
    let r = Math.random() * options.reduce((sum, t) => sum + WEIGHTS[t], 0);
    for (const t of options) {
      r -= WEIGHTS[t];
      if (r <= 0) {
        chosen = t;
        break;
      }
    }
    s.cells[pick] = 1 << chosen;
    const stack = [pick];
    while (stack.length) {
      const i = stack.pop() as number;
      const x = i % GW;
      const y = Math.floor(i / GW);
      DIRS.forEach(([dx, dy], d) => {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) return;
        const j = ny * GW + nx;
        let allowed = 0;
        for (let t = 0; t < TILES.length; t++) if (s.cells[i] & (1 << t)) allowed |= COMPAT[d][t];
        const next = s.cells[j] & allowed;
        if (next !== s.cells[j]) {
          s.cells[j] = next;
          stack.push(j);
        }
      });
    }
    // Draw every cell that just became certain.
    let certain = 0;
    for (let i = 0; i < s.cells.length; i++) {
      const m = s.cells[i];
      if (m === 0) return "contradiction";
      if (popcount(m) !== 1) continue;
      certain++;
      if (s.drawn[i]) continue;
      s.drawn[i] = 1;
      const tile = TILES[31 - Math.clz32(m)];
      const cx = (i % GW) * CELL + CELL / 2;
      const cy = Math.floor(i / GW) * CELL + CELL / 2;
      ctx.strokeStyle = BRAND.yellow;
      ctx.lineWidth = 8;
      ctx.lineCap = "round";
      ctx.beginPath();
      tile.forEach((edge, d) => {
        if (!edge) return;
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + (DIRS[d][0] * CELL) / 2, cy + (DIRS[d][1] * CELL) / 2);
      });
      ctx.stroke();
      const ends = tile.reduce((a, b) => a + b, 0);
      if (ends === 1 || ends >= 3) {
        ctx.fillStyle = ends === 1 ? BRAND.blue : BRAND.cream;
        ctx.beginPath();
        ctx.arc(cx, cy, ends === 1 ? 11 : 7, 0, TAU);
        ctx.fill();
      }
    }
    s.left = s.cells.length - certain;
    return true;
  };

  useStageFrame((t) => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    const s = state.current;
    if (s.fresh) {
      ctx.fillStyle = BRAND.black;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "rgba(251,245,231,0.12)";
      for (let y = 0; y < GH; y++)
        for (let x = 0; x < GW; x++) ctx.fillRect(x * CELL + CELL / 2 - 2, y * CELL + CELL / 2 - 2, 4, 4);
      s.fresh = false;
    }
    if (s.left === 0) {
      if (!s.doneAt) s.doneAt = t;
      if (t - s.doneAt > 5000) {
        s.cells.fill(ALL);
        s.drawn.fill(0);
        s.left = s.cells.length;
        s.doneAt = 0;
        s.fresh = true;
      }
      return;
    }
    for (let k = 0; k < 3; k++) {
      const result = collapse(ctx);
      if (result === "contradiction") {
        s.cells.fill(ALL);
        s.drawn.fill(0);
        s.left = s.cells.length;
        s.fresh = true;
        return;
      }
      if (!result) break;
    }
  });

  return <canvas ref={canvas} className="absolute inset-0 bg-black" height={H} width={W} />;
}

// ---------------------------------------------------------------------------
// Sand — falling sand in brand colours
// ---------------------------------------------------------------------------

const SW = 192;
const SH = 108;
const SAND = [RGB.black, RGB.yellow, RGB.blue, RGB.cream];

export function Sand() {
  const draw = useMemo<PixelDraw>(() => {
    const grid = new Uint8Array(SW * SH);
    let acc = 0;
    let filled = 0;
    let flip = false;
    return (px, t, dt) => {
      acc += dt;
      const s = t / 1000;
      while (acc > 0) {
        acc -= 16;
        const ex = Math.floor(SW / 2 + Math.sin(s * 0.6) * SW * 0.42 + Math.sin(s * 2.3) * 6);
        const color = 1 + (Math.floor(s / 4) % 3);
        for (let k = -1; k <= 1; k++) {
          const x = ex + k;
          if (x >= 0 && x < SW && !grid[x] && Math.random() < 0.7) {
            grid[x] = color;
            filled++;
          }
        }
        flip = !flip;
        for (let y = SH - 2; y >= 0; y--) {
          for (let n = 0; n < SW; n++) {
            const x = flip ? n : SW - 1 - n;
            const i = y * SW + x;
            const c = grid[i];
            if (!c) continue;
            const below = i + SW;
            if (!grid[below]) {
              grid[below] = c;
              grid[i] = 0;
              continue;
            }
            const dir = Math.random() < 0.5 ? -1 : 1;
            for (const d of [dir, -dir]) {
              const nx = x + d;
              if (nx < 0 || nx >= SW || grid[below + d]) continue;
              grid[below + d] = c;
              grid[i] = 0;
              break;
            }
          }
        }
        if (filled > SW * SH * 0.82) {
          grid.fill(0);
          filled = 0;
        }
      }
      for (let i = 0; i < grid.length; i++) paintRgb(px, i, SAND[grid[i]]);
    };
  }, []);
  return <Pixels draw={draw} h={SH} smooth={false} w={SW} />;
}

// ---------------------------------------------------------------------------
// Fireworks
// ---------------------------------------------------------------------------

type Spark = { x: number; y: number; vx: number; vy: number; life: number; color: string };
type Rocket = { x: number; y: number; vy: number; color: string };

export function Fireworks({ params }: SceneProps<"fireworks">) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const state = useRef({ rockets: [] as Rocket[], sparks: [] as Spark[], next: 0 });

  useStageFrame((t, dt) => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    const st = state.current;
    const s = dt / 1000;
    if (t > st.next) {
      st.next = t + rand(350, 900);
      st.rockets.push({
        x: rand(200, W - 200),
        y: H,
        vy: -rand(880, 1150),
        color: COLORS[Math.floor(Math.random() * 3)],
      });
    }
    ctx.fillStyle = "rgba(0,0,0,0.2)";
    ctx.fillRect(0, 0, W, H);
    st.rockets = st.rockets.filter((r) => {
      r.y += r.vy * s;
      r.vy += 560 * s;
      ctx.fillStyle = BRAND.cream;
      ctx.fillRect(r.x - 2, r.y, 4, 14);
      if (r.vy > -80) {
        const n = 120;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * TAU + rand(-0.05, 0.05);
          const v = rand(160, 480);
          st.sparks.push({
            x: r.x,
            y: r.y,
            vx: Math.cos(a) * v,
            vy: Math.sin(a) * v,
            life: rand(1.2, 1.9),
            color: r.color,
          });
        }
        return false;
      }
      return true;
    });
    st.sparks = st.sparks.filter((p) => {
      p.life -= s;
      if (p.life <= 0) return false;
      p.vx *= 0.985;
      p.vy = p.vy * 0.985 + 320 * s;
      p.x += p.vx * s;
      p.y += p.vy * s;
      ctx.fillStyle = p.life < 0.4 && Math.random() < 0.5 ? BRAND.cream : p.color;
      ctx.globalAlpha = Math.min(1, p.life);
      ctx.fillRect(p.x - 3.5, p.y - 3.5, 7, 7);
      return true;
    });
    ctx.globalAlpha = 1;
  });

  return (
    <>
      <canvas ref={canvas} className="absolute inset-0 bg-black" height={H} width={W} />
      {params.title && (
        <p className="absolute inset-x-0 bottom-[90px] text-center text-[120px] font-extrabold tracking-[-0.02em] text-[#FBF5E7] uppercase drop-shadow-[0_6px_30px_rgba(0,0,0,0.9)]">
          {params.title}
        </p>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Particle text — dots gather into a word, scatter, gather into the next
// ---------------------------------------------------------------------------

type Dot = { x: number; y: number; tx: number; ty: number; vx: number; vy: number };

function sampleText(text: string): [number, number][] {
  const off = document.createElement("canvas");
  off.width = W;
  off.height = H;
  const ctx = off.getContext("2d");
  if (!ctx) return [];
  let size = 300;
  ctx.font = `800 ${size}px Poppins, sans-serif`;
  while (ctx.measureText(text).width > W - 200 && size > 80) {
    size -= 20;
    ctx.font = `800 ${size}px Poppins, sans-serif`;
  }
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#fff";
  ctx.fillText(text, W / 2, H / 2);
  const data = ctx.getImageData(0, 0, W, H).data;
  const pts: [number, number][] = [];
  for (let y = 0; y < H; y += 7) for (let x = 0; x < W; x += 7) if (data[(y * W + x) * 4 + 3] > 128) pts.push([x, y]);
  return pts;
}

export function ParticleText({ params }: SceneProps<"particle-text">) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const words = useMemo(
    () =>
      params.text
        .split("|")
        .map((w) => w.trim())
        .filter(Boolean),
    [params.text]
  );
  const state = useRef({ dots: [] as Dot[], word: -1, phaseAt: 0, scatter: false });

  useStageFrame((t, dt) => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx || !words.length) return;
    const s = state.current;
    const elapsed = t - s.phaseAt;
    if (s.word < 0 || (s.scatter && elapsed > 1400)) {
      s.word = (s.word + 1) % words.length;
      s.scatter = false;
      s.phaseAt = t;
      const targets = sampleText(words[s.word]);
      while (s.dots.length < targets.length) s.dots.push({ x: rand(0, W), y: rand(0, H), tx: 0, ty: 0, vx: 0, vy: 0 });
      s.dots.forEach((d, i) => {
        if (i >= targets.length) {
          // Surplus dots from a longer word park above the frame.
          d.tx = rand(0, W);
          d.ty = -300;
          return;
        }
        d.tx = targets[i][0];
        d.ty = targets[i][1];
      });
    } else if (!s.scatter && elapsed > 5200) {
      s.scatter = true;
      s.phaseAt = t;
      for (const d of s.dots) {
        const a = rand(0, TAU);
        const v = rand(200, 900);
        d.vx = Math.cos(a) * v;
        d.vy = Math.sin(a) * v;
      }
    }
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.fillRect(0, 0, W, H);
    const k = 1 - Math.exp(-dt / 140);
    s.dots.forEach((d, i) => {
      if (s.scatter) {
        d.x += d.vx * (dt / 1000);
        d.y += d.vy * (dt / 1000);
      } else {
        d.x += (d.tx - d.x) * k;
        d.y += (d.ty - d.y) * k;
      }
      ctx.fillStyle = i % 7 === 0 ? BRAND.blue : i % 3 ? BRAND.yellow : BRAND.cream;
      ctx.fillRect(d.x - 2.5, d.y - 2.5, 5, 5);
    });
  });

  return <canvas ref={canvas} className="absolute inset-0 bg-black" height={H} width={W} />;
}
