"use client";

import { useMemo, useRef } from "react";

import type { SceneProps } from "lib/owy-stage/scenes";

import { BRAND, H, W, useStageFrame } from "../Stage";

const rand = (min: number, max: number) => min + Math.random() * (max - min);
const TAU = Math.PI * 2;
const COLORS = [BRAND.yellow, BRAND.blue, BRAND.cream];

// ---------------------------------------------------------------------------
// Mystify — bouncing polygons with trails
// ---------------------------------------------------------------------------

type Vertex = { x: number; y: number; vx: number; vy: number };
type Poly = { verts: Vertex[]; history: number[][]; color: string };

export function Mystify() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const polys = useMemo<Poly[]>(
    () =>
      [BRAND.yellow, BRAND.blue].map((color) => ({
        color,
        history: [],
        verts: Array.from({ length: 4 }, () => ({
          x: rand(0, W),
          y: rand(0, H),
          vx: rand(-320, 320),
          vy: rand(-260, 260),
        })),
      })),
    []
  );

  useStageFrame((_t, dt) => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    const s = dt / 1000;
    ctx.fillStyle = BRAND.black;
    ctx.fillRect(0, 0, W, H);
    ctx.lineWidth = 3;
    for (const poly of polys) {
      for (const v of poly.verts) {
        v.x += v.vx * s;
        v.y += v.vy * s;
        if (v.x < 0 || v.x > W) v.vx *= -1;
        if (v.y < 0 || v.y > H) v.vy *= -1;
      }
      poly.history.push(poly.verts.flatMap((v) => [v.x, v.y]));
      if (poly.history.length > 16) poly.history.shift();
      poly.history.forEach((pts, i) => {
        ctx.strokeStyle = poly.color;
        ctx.globalAlpha = (i + 1) / poly.history.length;
        ctx.beginPath();
        ctx.moveTo(pts[0], pts[1]);
        for (let k = 2; k < pts.length; k += 2) ctx.lineTo(pts[k], pts[k + 1]);
        ctx.closePath();
        ctx.stroke();
      });
    }
    ctx.globalAlpha = 1;
  });

  return <canvas ref={canvas} className="absolute inset-0 bg-black" height={H} width={W} />;
}

// ---------------------------------------------------------------------------
// Pipes — the screensaver, flat
// ---------------------------------------------------------------------------

const PIPE = 40;
const PCOLS = W / PIPE;
const PROWS = H / PIPE;
const STEPS = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

type Pipe = { x: number; y: number; dir: number; color: string };

export function Pipes() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const state = useRef({
    grid: new Uint8Array(PCOLS * PROWS),
    pipes: [] as Pipe[],
    used: 0,
    spawned: 0,
    acc: 0,
    fading: 0,
    fresh: true,
  });

  const spawn = (s: typeof state.current) => {
    for (let tries = 0; tries < 50; tries++) {
      const x = Math.floor(rand(0, PCOLS));
      const y = Math.floor(rand(0, PROWS));
      if (s.grid[y * PCOLS + x]) continue;
      s.grid[y * PCOLS + x] = 1;
      s.used++;
      return { x, y, dir: Math.floor(rand(0, 4)), color: COLORS[s.spawned++ % 3] };
    }
    return null;
  };

  useStageFrame((_t, dt) => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    const s = state.current;
    if (s.fresh) {
      ctx.fillStyle = BRAND.black;
      ctx.fillRect(0, 0, W, H);
      s.fresh = false;
      s.pipes = [];
      for (let i = 0; i < 3; i++) {
        const p = spawn(s);
        if (p) s.pipes.push(p);
      }
    }
    if (s.fading > 0) {
      s.fading -= dt;
      ctx.fillStyle = "rgba(0,0,0,0.12)";
      ctx.fillRect(0, 0, W, H);
      if (s.fading <= 0) {
        s.fading = 0;
        s.grid.fill(0);
        s.used = 0;
        s.fresh = true;
      }
      return;
    }
    s.acc += dt;
    while (s.acc > 45) {
      s.acc -= 45;
      s.pipes = s.pipes.map((p) => {
        const order =
          Math.random() < 0.78 ? [p.dir, (p.dir + 1) & 3, (p.dir + 3) & 3] : [(p.dir + 1) & 3, (p.dir + 3) & 3, p.dir];
        for (const dir of order) {
          const nx = p.x + STEPS[dir][0];
          const ny = p.y + STEPS[dir][1];
          if (nx < 0 || ny < 0 || nx >= PCOLS || ny >= PROWS || s.grid[ny * PCOLS + nx]) continue;
          s.grid[ny * PCOLS + nx] = 1;
          s.used++;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 18;
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(p.x * PIPE + PIPE / 2, p.y * PIPE + PIPE / 2);
          ctx.lineTo(nx * PIPE + PIPE / 2, ny * PIPE + PIPE / 2);
          ctx.stroke();
          if (dir !== p.dir) {
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x * PIPE + PIPE / 2, p.y * PIPE + PIPE / 2, 14, 0, TAU);
            ctx.fill();
          }
          return { ...p, x: nx, y: ny, dir };
        }
        // Stuck: cap it and start a new pipe elsewhere.
        ctx.fillStyle = BRAND.cream;
        ctx.beginPath();
        ctx.arc(p.x * PIPE + PIPE / 2, p.y * PIPE + PIPE / 2, 10, 0, TAU);
        ctx.fill();
        return spawn(s) ?? p;
      });
      if (s.used > PCOLS * PROWS * 0.72) s.fading = 1500;
    }
  });

  return <canvas ref={canvas} className="absolute inset-0 bg-black" height={H} width={W} />;
}

// ---------------------------------------------------------------------------
// Pendulum wave
// ---------------------------------------------------------------------------

const PENDULUMS = 16;
const CYCLE = 60;

export function PendulumWave() {
  const canvas = useRef<HTMLCanvasElement>(null);

  useStageFrame((t) => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    const s = t / 1000;
    ctx.fillStyle = BRAND.black;
    ctx.fillRect(0, 0, W, H);
    const pts: [number, number][] = [];
    for (let i = 0; i < PENDULUMS; i++) {
      const f = (40 + i) / CYCLE;
      const y = 110 + (i * (H - 220)) / (PENDULUMS - 1);
      const x = W / 2 + Math.sin(TAU * f * s) * 640;
      pts.push([x, y]);
    }
    ctx.strokeStyle = BRAND.cream;
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 3;
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
    ctx.globalAlpha = 0.18;
    ctx.beginPath();
    ctx.moveTo(W / 2, 60);
    ctx.lineTo(W / 2, H - 60);
    ctx.stroke();
    ctx.globalAlpha = 1;
    pts.forEach(([x, y], i) => {
      ctx.fillStyle = COLORS[i % 3];
      ctx.beginPath();
      ctx.arc(x, y, 22, 0, TAU);
      ctx.fill();
    });
  });

  return <canvas ref={canvas} className="absolute inset-0 bg-black" height={H} width={W} />;
}

// ---------------------------------------------------------------------------
// Double pendulum — two of them, almost identical, never the same
// ---------------------------------------------------------------------------

type Dp = { a1: number; a2: number; w1: number; w2: number; color: string };

const L1 = 230;
const L2 = 230;
const G = 900;

function stepPendulum(p: Dp, dt: number) {
  const { a1, a2, w1, w2 } = p;
  const d = a1 - a2;
  const den = 3 - Math.cos(2 * d);
  const acc1 =
    (-G * 3 * Math.sin(a1) -
      G * Math.sin(a1 - 2 * a2) -
      2 * Math.sin(d) * (w2 * w2 * L2 + w1 * w1 * L1 * Math.cos(d))) /
    (L1 * den);
  const acc2 = (2 * Math.sin(d) * (w1 * w1 * L1 * 2 + G * 2 * Math.cos(a1) + w2 * w2 * L2 * Math.cos(d))) / (L2 * den);
  p.w1 += acc1 * dt;
  p.w2 += acc2 * dt;
  p.a1 += p.w1 * dt;
  p.a2 += p.w2 * dt;
}

export function DoublePendulum() {
  const trail = useRef<HTMLCanvasElement>(null);
  const rods = useRef<HTMLCanvasElement>(null);
  const pendulums = useMemo<Dp[]>(
    () => [
      { a1: Math.PI * 0.75, a2: Math.PI * 0.9, w1: 0, w2: 0, color: BRAND.yellow },
      { a1: Math.PI * 0.75 + 0.002, a2: Math.PI * 0.9, w1: 0, w2: 0, color: BRAND.blue },
    ],
    []
  );
  const last = useRef<number[][]>([]);

  useStageFrame((_t, dt) => {
    const tctx = trail.current?.getContext("2d");
    const rctx = rods.current?.getContext("2d");
    if (!tctx || !rctx) return;
    tctx.fillStyle = "rgba(0,0,0,0.012)";
    tctx.fillRect(0, 0, W, H);
    rctx.clearRect(0, 0, W, H);
    const ox = W / 2;
    const oy = 300;
    pendulums.forEach((p, i) => {
      for (let k = 0; k < 8; k++) stepPendulum(p, dt / 8000);
      const x1 = ox + Math.sin(p.a1) * L1;
      const y1 = oy + Math.cos(p.a1) * L1;
      const x2 = x1 + Math.sin(p.a2) * L2;
      const y2 = y1 + Math.cos(p.a2) * L2;
      const prev = last.current[i];
      if (prev) {
        tctx.strokeStyle = p.color;
        tctx.lineWidth = 4;
        tctx.beginPath();
        tctx.moveTo(prev[0], prev[1]);
        tctx.lineTo(x2, y2);
        tctx.stroke();
      }
      last.current[i] = [x2, y2];
      rctx.strokeStyle = BRAND.cream;
      rctx.lineWidth = 5;
      rctx.globalAlpha = 0.6;
      rctx.beginPath();
      rctx.moveTo(ox, oy);
      rctx.lineTo(x1, y1);
      rctx.lineTo(x2, y2);
      rctx.stroke();
      rctx.globalAlpha = 1;
      rctx.fillStyle = p.color;
      for (const [x, y] of [
        [x1, y1],
        [x2, y2],
      ]) {
        rctx.beginPath();
        rctx.arc(x, y, 16, 0, TAU);
        rctx.fill();
      }
    });
    rctx.fillStyle = BRAND.cream;
    rctx.beginPath();
    rctx.arc(ox, oy, 10, 0, TAU);
    rctx.fill();
  });

  return (
    <>
      <canvas ref={trail} className="absolute inset-0 bg-black" height={H} width={W} />
      <canvas ref={rods} className="absolute inset-0" height={H} width={W} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Automaton — Wolfram's elementary rules, scrolling
// ---------------------------------------------------------------------------

const ACELL = 8;
const ACOLS = W / ACELL;

export function Automaton({ params }: SceneProps<"automaton">) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const state = useRef({ row: null as Uint8Array | null, acc: 0, rule: -1, seed: "" });

  useStageFrame((_t, dt) => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    const s = state.current;
    if (!s.row || s.rule !== params.rule || s.seed !== params.seed) {
      s.rule = params.rule;
      s.seed = params.seed;
      s.row = new Uint8Array(ACOLS);
      if (params.seed === "azar") for (let i = 0; i < ACOLS; i++) s.row[i] = Math.random() < 0.5 ? 1 : 0;
      else s.row[ACOLS >> 1] = 1;
      ctx.fillStyle = BRAND.black;
      ctx.fillRect(0, 0, W, H);
    }
    s.acc += dt;
    while (s.acc > 40) {
      s.acc -= 40;
      const row = s.row;
      const next = new Uint8Array(ACOLS);
      for (let i = 0; i < ACOLS; i++) {
        const l = row[(i - 1 + ACOLS) % ACOLS];
        const r = row[(i + 1) % ACOLS];
        next[i] = (params.rule >> ((l << 2) | (row[i] << 1) | r)) & 1;
      }
      ctx.drawImage(ctx.canvas, 0, -ACELL);
      ctx.fillStyle = BRAND.black;
      ctx.fillRect(0, H - ACELL, W, ACELL);
      for (let i = 0; i < ACOLS; i++) {
        if (!next[i]) continue;
        ctx.fillStyle = row[i] ? BRAND.blue : BRAND.yellow;
        ctx.fillRect(i * ACELL, H - ACELL, ACELL - 1, ACELL - 1);
      }
      s.row = next;
    }
  });

  return (
    <>
      <canvas ref={canvas} className="absolute inset-0 bg-black" height={H} width={W} />
      <p className="font-terminal absolute top-[40px] right-[60px] text-[28px] text-[#FBF5E7]/60">
        regla {params.rule}
      </p>
    </>
  );
}

// ---------------------------------------------------------------------------
// Langton's ant — three of them
// ---------------------------------------------------------------------------

const LCELL = 20;
const LCOLS = W / LCELL;
const LROWS = H / LCELL;

type Ant = { x: number; y: number; dir: number; color: string };

export function Langton() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const state = useRef({
    grid: new Uint8Array(LCOLS * LROWS),
    ants: COLORS.map((color, i) => ({ x: (LCOLS >> 1) + (i - 1) * 12, y: LROWS >> 1, dir: i, color })) as Ant[],
    fresh: true,
    steps: 0,
  });

  useStageFrame(() => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    const s = state.current;
    if (s.fresh) {
      ctx.fillStyle = BRAND.black;
      ctx.fillRect(0, 0, W, H);
      s.fresh = false;
    }
    for (let k = 0; k < 60; k++) {
      for (const ant of s.ants) {
        const i = ant.y * LCOLS + ant.x;
        const on = s.grid[i];
        ant.dir = (ant.dir + (on ? 3 : 1)) & 3;
        s.grid[i] = on ? 0 : 1;
        ctx.fillStyle = on ? BRAND.black : BRAND.cream;
        ctx.fillRect(ant.x * LCELL, ant.y * LCELL, LCELL - 1, LCELL - 1);
        ant.x = (ant.x + STEPS[ant.dir][0] + LCOLS) % LCOLS;
        ant.y = (ant.y + STEPS[ant.dir][1] + LROWS) % LROWS;
      }
    }
    for (const ant of s.ants) {
      ctx.fillStyle = ant.color;
      ctx.fillRect(ant.x * LCELL, ant.y * LCELL, LCELL - 1, LCELL - 1);
    }
    s.steps += 60;
    if (s.steps > 40_000) {
      s.grid.fill(0);
      s.steps = 0;
      s.fresh = true;
    }
  });

  return <canvas ref={canvas} className="absolute inset-0 bg-black" height={H} width={W} />;
}

// ---------------------------------------------------------------------------
// Maze — carve it, then solve it
// ---------------------------------------------------------------------------

const MCELL = 40;
const MCOLS = W / MCELL;
const MROWS = H / MCELL;

type MazeState = {
  walls: Uint8Array; // bit d set = wall towards STEPS[d]
  visited: Uint8Array;
  stack: number[];
  phase: "carve" | "solve" | "path" | "done";
  parent: Int32Array;
  queue: number[];
  head: number;
  path: number[];
  doneAt: number;
  fresh: boolean;
};

function freshMaze(): MazeState {
  return {
    walls: new Uint8Array(MCOLS * MROWS).fill(15),
    visited: new Uint8Array(MCOLS * MROWS),
    stack: [0],
    phase: "carve",
    parent: new Int32Array(MCOLS * MROWS).fill(-1),
    queue: [0],
    head: 0,
    path: [],
    doneAt: 0,
    fresh: true,
  };
}

const cellCenter = (i: number) => [(i % MCOLS) * MCELL + MCELL / 2, Math.floor(i / MCOLS) * MCELL + MCELL / 2];

function carveDraw(ctx: CanvasRenderingContext2D, a: number, b: number, color: string, width: number) {
  const [ax, ay] = cellCenter(a);
  const [bx, by] = cellCenter(b);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "square";
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(bx, by);
  ctx.stroke();
}

export function Maze() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const state = useRef(freshMaze());

  useStageFrame((t) => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    const s = state.current;
    if (s.fresh) {
      ctx.fillStyle = BRAND.black;
      ctx.fillRect(0, 0, W, H);
      s.visited[0] = 1;
      s.fresh = false;
    }
    const goal = MCOLS * MROWS - 1;
    if (s.phase === "carve") {
      for (let k = 0; k < 6 && s.stack.length; k++) {
        const cur = s.stack[s.stack.length - 1];
        const x = cur % MCOLS;
        const y = Math.floor(cur / MCOLS);
        const options = STEPS.map((step, d) => ({ d, nx: x + step[0], ny: y + step[1] })).filter(
          ({ nx, ny }) => nx >= 0 && ny >= 0 && nx < MCOLS && ny < MROWS && !s.visited[ny * MCOLS + nx]
        );
        if (!options.length) {
          s.stack.pop();
          continue;
        }
        const { d, nx, ny } = options[Math.floor(Math.random() * options.length)];
        const next = ny * MCOLS + nx;
        s.walls[cur] &= ~(1 << d);
        s.walls[next] &= ~(1 << ((d + 2) & 3));
        s.visited[next] = 1;
        s.stack.push(next);
        carveDraw(ctx, cur, next, "#2a2a2a", MCELL - 12);
      }
      if (!s.stack.length) s.phase = "solve";
      return;
    }
    if (s.phase === "solve") {
      for (let k = 0; k < 5 && s.head < s.queue.length; k++) {
        const cur = s.queue[s.head++];
        if (cur === goal) {
          s.phase = "path";
          let i = goal;
          while (i >= 0) {
            s.path.push(i);
            i = s.parent[i];
          }
          s.path.reverse();
          return;
        }
        STEPS.forEach((step, d) => {
          if (s.walls[cur] & (1 << d)) return;
          const next = (Math.floor(cur / MCOLS) + step[1]) * MCOLS + ((cur % MCOLS) + step[0]);
          if (s.parent[next] !== -1 || next === 0) return;
          s.parent[next] = cur;
          s.queue.push(next);
          carveDraw(ctx, cur, next, "#0b3f7a", MCELL - 20);
        });
      }
      return;
    }
    if (s.phase === "path") {
      for (let k = 0; k < 3 && s.path.length > 1; k++) {
        const a = s.path.shift() as number;
        carveDraw(ctx, a, s.path[0], BRAND.yellow, MCELL - 18);
      }
      if (s.path.length <= 1) {
        s.phase = "done";
        s.doneAt = t;
      }
      return;
    }
    if (t - s.doneAt > 4000) state.current = freshMaze();
  });

  return <canvas ref={canvas} className="absolute inset-0 bg-black" height={H} width={W} />;
}

// ---------------------------------------------------------------------------
// Raycaster — first-person walk through a maze, 1992 style
// ---------------------------------------------------------------------------

const RC = 21; // odd: cells at odd coordinates, walls between
const COLUMNS = 480;

function buildWorld() {
  const map = new Uint8Array(RC * RC).fill(1);
  const stack = [[1, 1]];
  map[RC + 1] = 0;
  while (stack.length) {
    const [x, y] = stack[stack.length - 1];
    const options = STEPS.map(([dx, dy]) => [x + dx * 2, y + dy * 2, x + dx, y + dy]).filter(
      ([nx, ny]) => nx > 0 && ny > 0 && nx < RC - 1 && ny < RC - 1 && map[ny * RC + nx]
    );
    if (!options.length) {
      stack.pop();
      continue;
    }
    const [nx, ny, wx, wy] = options[Math.floor(Math.random() * options.length)];
    map[wy * RC + wx] = 0;
    map[ny * RC + nx] = 0;
    stack.push([nx, ny]);
  }
  // Knock a few extra walls so there are loops to wander through.
  for (let k = 0; k < 24; k++) {
    const x = 1 + Math.floor(rand(0, RC - 2));
    const y = 1 + Math.floor(rand(0, RC - 2));
    if ((x + y) % 2 === 1) map[y * RC + x] = 0;
  }
  return map;
}

function bfsPath(map: Uint8Array, from: number, to: number) {
  const parent = new Int32Array(RC * RC).fill(-1);
  const queue = [from];
  parent[from] = from;
  for (let head = 0; head < queue.length; head++) {
    const cur = queue[head];
    if (cur === to) break;
    for (const [dx, dy] of STEPS) {
      const next = cur + dy * RC + dx;
      if (map[next] || parent[next] !== -1) continue;
      parent[next] = cur;
      queue.push(next);
    }
  }
  if (parent[to] === -1) return [];
  const path = [to];
  while (path[0] !== from) path.unshift(parent[path[0]]);
  return path.slice(1);
}

export function Raycaster() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const world = useMemo(() => {
    const map = buildWorld();
    return { map, x: 1.5, y: 1.5, angle: 0, path: [] as number[] };
  }, []);

  useStageFrame((_t, dt) => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    const w = world;
    const s = dt / 1000;
    if (!w.path.length) {
      const here = Math.floor(w.y) * RC + Math.floor(w.x);
      let target = here;
      while (target === here || w.map[target]) target = Math.floor(rand(0, RC * RC));
      w.path = bfsPath(w.map, here, target);
    }
    const next = w.path[0];
    if (next !== undefined) {
      const tx = (next % RC) + 0.5;
      const ty = Math.floor(next / RC) + 0.5;
      const want = Math.atan2(ty - w.y, tx - w.x);
      let diff = want - w.angle;
      while (diff > Math.PI) diff -= TAU;
      while (diff < -Math.PI) diff += TAU;
      const turn = Math.sign(diff) * Math.min(Math.abs(diff), 2.6 * s);
      w.angle += turn;
      if (Math.abs(diff) < 0.5) {
        const speed = 1.5 * s;
        w.x += Math.cos(w.angle) * speed;
        w.y += Math.sin(w.angle) * speed;
      }
      if (Math.hypot(tx - w.x, ty - w.y) < 0.08) w.path.shift();
    }
    ctx.fillStyle = BRAND.black;
    ctx.fillRect(0, 0, W, H / 2);
    const floor = ctx.createLinearGradient(0, H / 2, 0, H);
    floor.addColorStop(0, "#050505");
    floor.addColorStop(1, "#2a2a2a");
    ctx.fillStyle = floor;
    ctx.fillRect(0, H / 2, W, H / 2);
    const fov = Math.PI / 3;
    const colW = W / COLUMNS;
    for (let c = 0; c < COLUMNS; c++) {
      const ray = w.angle - fov / 2 + (c / COLUMNS) * fov;
      const dx = Math.cos(ray);
      const dy = Math.sin(ray);
      let mx = Math.floor(w.x);
      let my = Math.floor(w.y);
      const ddx = Math.abs(1 / dx);
      const ddy = Math.abs(1 / dy);
      const sx = dx < 0 ? -1 : 1;
      const sy = dy < 0 ? -1 : 1;
      let sideX = dx < 0 ? (w.x - mx) * ddx : (mx + 1 - w.x) * ddx;
      let sideY = dy < 0 ? (w.y - my) * ddy : (my + 1 - w.y) * ddy;
      let side = 0;
      for (let n = 0; n < 64; n++) {
        if (sideX < sideY) {
          sideX += ddx;
          mx += sx;
          side = 0;
        } else {
          sideY += ddy;
          my += sy;
          side = 1;
        }
        if (mx < 0 || my < 0 || mx >= RC || my >= RC || w.map[my * RC + mx]) break;
      }
      const dist = (side === 0 ? sideX - ddx : sideY - ddy) * Math.cos(ray - w.angle);
      const h = Math.min(H * 2, H / Math.max(dist, 0.05));
      const shade = Math.max(0.15, 1 - dist / 9);
      ctx.fillStyle = side === 0 ? BRAND.yellow : BRAND.blue;
      ctx.globalAlpha = shade;
      ctx.fillRect(c * colW, H / 2 - h / 2, colW + 1, h);
    }
    ctx.globalAlpha = 1;
  });

  return <canvas ref={canvas} className="absolute inset-0 bg-black" height={H} width={W} />;
}

// ---------------------------------------------------------------------------
// Sorting — the algorithms, racing bars
// ---------------------------------------------------------------------------

type Step = { i: number; j: number };
type Sorter = (a: number[]) => Generator<Step>;

const swap = (a: number[], i: number, j: number) => ([a[i], a[j]] = [a[j], a[i]]);

const ALGORITHMS: { name: string; run: Sorter; perFrame: number }[] = [
  {
    name: "Bubble sort",
    perFrame: 14,
    *run(a) {
      for (let n = a.length; n > 1; n--)
        for (let i = 0; i < n - 1; i++) {
          if (a[i] > a[i + 1]) swap(a, i, i + 1);
          yield { i, j: i + 1 };
        }
    },
  },
  {
    name: "Insertion sort",
    perFrame: 12,
    *run(a) {
      for (let i = 1; i < a.length; i++)
        for (let j = i; j > 0 && a[j - 1] > a[j]; j--) {
          swap(a, j - 1, j);
          yield { i, j };
        }
    },
  },
  {
    name: "Selection sort",
    perFrame: 14,
    *run(a) {
      for (let i = 0; i < a.length; i++) {
        let min = i;
        for (let j = i + 1; j < a.length; j++) {
          if (a[j] < a[min]) min = j;
          yield { i, j };
        }
        swap(a, i, min);
      }
    },
  },
  {
    name: "Quicksort",
    perFrame: 3,
    *run(a) {
      const stack: [number, number][] = [[0, a.length - 1]];
      while (stack.length) {
        const [lo, hi] = stack.pop() as [number, number];
        if (lo >= hi) continue;
        const pivot = a[hi];
        let p = lo;
        for (let j = lo; j < hi; j++) {
          if (a[j] < pivot) swap(a, p++, j);
          yield { i: p, j };
        }
        swap(a, p, hi);
        stack.push([lo, p - 1], [p + 1, hi]);
      }
    },
  },
  {
    name: "Merge sort",
    perFrame: 3,
    *run(a) {
      for (let width = 1; width < a.length; width *= 2)
        for (let lo = 0; lo < a.length; lo += width * 2) {
          const mid = Math.min(lo + width, a.length);
          const hi = Math.min(lo + width * 2, a.length);
          const merged: number[] = [];
          let i = lo;
          let j = mid;
          while (i < mid || j < hi) {
            if (j >= hi || (i < mid && a[i] <= a[j])) merged.push(a[i++]);
            else merged.push(a[j++]);
          }
          for (let k = 0; k < merged.length; k++) {
            a[lo + k] = merged[k];
            yield { i: lo + k, j: hi - 1 };
          }
        }
    },
  },
];

const BARS = 96;

export function Sorting() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const state = useRef({
    values: [] as number[],
    algo: 0,
    gen: null as Generator<Step> | null,
    step: null as Step | null,
    doneAt: 0,
  });

  useStageFrame((t) => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    const s = state.current;
    if (!s.gen) {
      s.values = Array.from({ length: BARS }, (_, i) => i + 1);
      for (let i = BARS - 1; i > 0; i--) swap(s.values, i, Math.floor(Math.random() * (i + 1)));
      s.gen = ALGORITHMS[s.algo].run(s.values);
      s.doneAt = 0;
    }
    if (!s.doneAt) {
      for (let k = 0; k < ALGORITHMS[s.algo].perFrame; k++) {
        const r = s.gen.next();
        if (r.done) {
          s.doneAt = t;
          s.step = null;
          break;
        }
        s.step = r.value;
      }
    } else if (t - s.doneAt > 3000) {
      s.algo = (s.algo + 1) % ALGORITHMS.length;
      s.gen = null;
    }
    ctx.fillStyle = BRAND.black;
    ctx.fillRect(0, 0, W, H);
    const bw = (W - 160) / BARS;
    s.values.forEach((v, i) => {
      const h = (v / BARS) * 760;
      const hot = s.step && (i === s.step.i || i === s.step.j);
      ctx.fillStyle = hot ? BRAND.cream : s.doneAt ? BRAND.yellow : v === i + 1 ? BRAND.yellow : BRAND.blue;
      ctx.fillRect(80 + i * bw, H - 120 - h, bw - 4, h);
    });
    ctx.fillStyle = BRAND.cream;
    ctx.font = "800 64px Poppins, sans-serif";
    ctx.fillText(ALGORITHMS[s.algo].name, 80, 120);
    ctx.font = "28px 'Geist Mono', ui-monospace, monospace";
    ctx.fillStyle = "rgba(251,245,231,0.55)";
    ctx.fillText(`n = ${BARS}${s.doneAt ? " · ordenado" : ""}`, 80, 170);
  });

  return <canvas ref={canvas} className="absolute inset-0 bg-black" height={H} width={W} />;
}

// ---------------------------------------------------------------------------
// Pong — plays itself, badly on purpose
// ---------------------------------------------------------------------------

const PAD_H = 180;
const PAD_W = 22;

export function Pong() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const state = useRef({
    ball: { x: W / 2, y: H / 2, vx: 620, vy: 260 },
    pads: [
      { y: H / 2, err: 0 },
      { y: H / 2, err: 0 },
    ],
    score: [0, 0],
  });

  const serve = (dir: number) => {
    const s = state.current;
    s.ball = { x: W / 2, y: H / 2, vx: 620 * dir, vy: rand(-300, 300) };
    s.pads.forEach((p) => (p.err = rand(-140, 140)));
  };

  useStageFrame((_t, dt) => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    const s = state.current;
    const dts = dt / 1000;
    const b = s.ball;
    b.x += b.vx * dts;
    b.y += b.vy * dts;
    if (b.y < 12 || b.y > H - 12) b.vy *= -1;
    s.pads.forEach((p, i) => {
      const chasing = i === 0 ? b.vx < 0 : b.vx > 0;
      const target = chasing ? b.y + p.err : H / 2;
      p.y += Math.sign(target - p.y) * Math.min(Math.abs(target - p.y), 640 * dts);
    });
    const px = [60 + PAD_W, W - 60 - PAD_W];
    if (b.vx < 0 && b.x < px[0] && b.x > px[0] - 30 && Math.abs(b.y - s.pads[0].y) < PAD_H / 2 + 12) {
      b.vx = Math.abs(b.vx) * 1.05;
      b.vy += (b.y - s.pads[0].y) * 3;
      s.pads[0].err = rand(-150, 150);
    }
    if (b.vx > 0 && b.x > px[1] && b.x < px[1] + 30 && Math.abs(b.y - s.pads[1].y) < PAD_H / 2 + 12) {
      b.vx = -Math.abs(b.vx) * 1.05;
      b.vy += (b.y - s.pads[1].y) * 3;
      s.pads[1].err = rand(-150, 150);
    }
    if (b.x < -40) {
      s.score[1]++;
      serve(1);
    } else if (b.x > W + 40) {
      s.score[0]++;
      serve(-1);
    }
    ctx.fillStyle = BRAND.black;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "rgba(251,245,231,0.25)";
    for (let y = 20; y < H; y += 60) ctx.fillRect(W / 2 - 4, y, 8, 32);
    ctx.fillStyle = BRAND.cream;
    ctx.font = "800 150px Poppins, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(String(s.score[0]), W / 2 - 200, 200);
    ctx.fillText(String(s.score[1]), W / 2 + 200, 200);
    ctx.fillStyle = BRAND.yellow;
    ctx.fillRect(60, s.pads[0].y - PAD_H / 2, PAD_W, PAD_H);
    ctx.fillStyle = BRAND.blue;
    ctx.fillRect(W - 60 - PAD_W, s.pads[1].y - PAD_H / 2, PAD_W, PAD_H);
    ctx.fillStyle = BRAND.cream;
    ctx.fillRect(b.x - 12, b.y - 12, 24, 24);
  });

  return <canvas ref={canvas} className="absolute inset-0 bg-black" height={H} width={W} />;
}
