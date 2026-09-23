"use client";

import { m } from "motion/react";

/**
 * Origami scenes for the Open Space explainer. Same paper vocabulary as
 * OrigamiIcons (two papers, each with a darker fold facet, visible seams, flat
 * polygons only) on a wider canvas.
 *
 * The four step scenes tell one continuous story: the same grid that is drawn
 * empty in `apertura` fills with cards in `mercado`, becomes rooms full of
 * people in `sesiones`, and collapses into a single circle in `clausura`.
 *
 * Each scene is an array of parts rather than one blob, so `animate` can
 * stagger them in — pieces of paper landing one after another.
 */
export type OpenSpaceSceneName = "apertura" | "mercado" | "sesiones" | "clausura";

const YELLOW = "#F5BB03";
const YELLOW_FOLD = "#C79A03";
const CREAM = "#FBF5E7";
const CREAM_FOLD = "#DDD2B8";
const BLUE = "#0162C8";

type Paper = "cream" | "yellow" | "blue";

const FACE: Record<Paper, string> = { cream: CREAM, yellow: YELLOW, blue: BLUE };
const FOLD: Record<Paper, string> = { cream: CREAM_FOLD, yellow: YELLOW_FOLD, blue: "#014A96" };

/* The board, shared by the first two scenes so the story stays continuous. */
const BOARD = { x: 46, y: 12, w: 66, h: 38, cols: 4, rows: 3 };
const CELL_W = BOARD.w / BOARD.cols;
const CELL_H = BOARD.h / BOARD.rows;
const cellX = (col: number) => BOARD.x + col * CELL_W;
const cellY = (row: number) => BOARD.y + row * CELL_H;

/** A head: circle with the right half folded away from the light. */
function Head({ x, y, r, paper = "cream" }: { x: number; y: number; r: number; paper?: Paper }) {
  return (
    <>
      <circle cx={x} cy={y} fill={FACE[paper]} r={r} />
      <path d={`M${x} ${y - r}a${r} ${r} 0 0 1 0 ${r * 2}Z`} fill={FOLD[paper]} />
    </>
  );
}

/** A standing figure: folded head over a trapezoid body, seam left visible. */
function Person({ x, y, scale = 1, paper = "cream" }: { x: number; y: number; scale?: number; paper?: Paper }) {
  const r = 4.6 * scale;
  const top = y + r + 1.6 * scale;
  const height = 15 * scale;
  const half = 6.4 * scale;

  return (
    <>
      <Head paper={paper} r={r} x={x} y={y} />
      <polygon
        fill={FACE[paper]}
        points={`${x - half},${top + height} ${x + half},${top + height} ${x + half * 0.42},${top} ${x - half * 0.42},${top}`}
      />
      <polygon
        fill={FOLD[paper]}
        points={`${x},${top + height} ${x + half},${top + height} ${x + half * 0.42},${top} ${x},${top}`}
      />
    </>
  );
}

/** A proposal card: rectangle with the corner turned up, like the real post-its. */
function Card({
  x,
  y,
  w,
  h,
  rotate = 0,
  paper = "cream",
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  rotate?: number;
  paper?: Paper;
}) {
  const ear = Math.min(w, h) * 0.34;

  return (
    <g transform={`rotate(${rotate} ${x + w / 2} ${y + h / 2})`}>
      <polygon
        fill={FACE[paper]}
        points={`${x},${y} ${x + w},${y} ${x + w},${y + h - ear} ${x + w - ear},${y + h} ${x},${y + h}`}
      />
      <polygon
        fill={FOLD[paper]}
        points={`${x + w - ear},${y + h} ${x + w - ear},${y + h - ear} ${x + w},${y + h - ear}`}
      />
    </g>
  );
}

/** The empty grid: the thing the whole morning exists to fill. */
function Board({ faint = false }: { faint?: boolean }) {
  return (
    <>
      <rect
        fill={CREAM}
        height={BOARD.h}
        opacity={faint ? 0.06 : 0.1}
        width={BOARD.w}
        x={BOARD.x}
        y={BOARD.y}
      />
      <rect
        fill="none"
        height={BOARD.h}
        opacity=".5"
        stroke={CREAM}
        strokeWidth="1"
        width={BOARD.w}
        x={BOARD.x}
        y={BOARD.y}
      />
      {Array.from({ length: BOARD.cols - 1 }, (_, i) => (
        <line
          key={`c${i}`}
          opacity=".28"
          stroke={CREAM}
          strokeWidth="0.8"
          x1={cellX(i + 1)}
          x2={cellX(i + 1)}
          y1={BOARD.y}
          y2={BOARD.y + BOARD.h}
        />
      ))}
      {Array.from({ length: BOARD.rows - 1 }, (_, i) => (
        <line
          key={`r${i}`}
          opacity=".28"
          stroke={CREAM}
          strokeWidth="0.8"
          x1={BOARD.x}
          x2={BOARD.x + BOARD.w}
          y1={cellY(i + 1)}
          y2={cellY(i + 1)}
        />
      ))}
    </>
  );
}

/** A card sized to sit inside a board cell. */
function CellCard({ col, row, paper, rotate }: { col: number; row: number; paper: Paper; rotate: number }) {
  return (
    <Card
      h={CELL_H - 4}
      paper={paper}
      rotate={rotate}
      w={CELL_W - 3.5}
      x={cellX(col) + 1.75}
      y={cellY(row) + 2}
    />
  );
}

/* One room: header bar, walls, and a small circle of people seen from above. */
function Room({ x, accent = false }: { x: number; accent?: boolean }) {
  const w = 34;

  return (
    <>
      <rect fill={CREAM} height="62" opacity=".1" width={w} x={x} y="16" />
      <rect fill={accent ? YELLOW : CREAM} height="6" width={w} x={x} y="16" />
      <rect fill={accent ? YELLOW_FOLD : CREAM_FOLD} height="6" width={w / 2} x={x + w / 2} y="16" />
      <Head paper={accent ? "yellow" : "cream"} r={4.5} x={x + 17} y={34} />
      <Head paper="cream" r={4.5} x={x + 9} y={50} />
      <Head paper="cream" r={4.5} x={x + 25} y={50} />
      <Head paper={accent ? "yellow" : "cream"} r={4.5} x={x + 17} y={66} />
    </>
  );
}

const SCENES: Record<OpenSpaceSceneName, React.ReactNode[]> = {
  /* Apertura — the facilitator, and a grid with nothing on it yet. */
  apertura: [
    <Board key="board" faint />,
    <text
      key="empty"
      fill={CREAM}
      fontSize="9"
      fontWeight="700"
      opacity=".4"
      textAnchor="middle"
      x={BOARD.x + BOARD.w / 2}
      y={BOARD.y + BOARD.h / 2 + 3.2}
    >
      ?
    </text>,
    <Person key="facilitator" paper="yellow" scale={1.2} x={22} y={24} />,
    <g key="room-left">
      <Person paper="cream" scale={0.72} x={14} y={70} />
      <Person paper="cream" scale={0.72} x={32} y={74} />
    </g>,
    <g key="room-right">
      <Person paper="cream" scale={0.72} x={58} y={74} />
      <Person paper="cream" scale={0.72} x={76} y={70} />
      <Person paper="cream" scale={0.72} x={94} y={74} />
    </g>,
  ],

  /* Mercado de ideas — the same grid, filling up card by card. */
  mercado: [
    <Board key="board" />,
    <CellCard key="c1" col={0} paper="yellow" rotate={-4} row={0} />,
    <CellCard key="c2" col={2} paper="cream" rotate={3} row={0} />,
    <CellCard key="c3" col={1} paper="cream" rotate={-2} row={1} />,
    <CellCard key="c4" col={3} paper="yellow" rotate={4} row={1} />,
    <CellCard key="c5" col={0} paper="cream" rotate={5} row={2} />,
    <g key="empty-cell">
      {/* The slot yours is about to fill */}
      <rect
        fill="none"
        height={CELL_H - 4}
        opacity=".65"
        stroke={YELLOW}
        strokeDasharray="3 2.5"
        strokeWidth="1.4"
        width={CELL_W - 3.5}
        x={cellX(2) + 1.75}
        y={cellY(2) + 2}
      />
    </g>,
    <g key="proposer">
      <Person paper="blue" scale={1.05} x={20} y={52} />
      <Card h={12} paper="yellow" rotate={-14} w={16} x={4} y={34} />
    </g>,
  ],

  /* Sesiones — the grid has become rooms, all running at once. */
  sesiones: [
    <Room key="r1" accent x={3} />,
    <Room key="r2" x={43} />,
    <Room key="r3" x={83} />,
    <g key="parallel">
      <polygon fill={YELLOW} opacity=".8" points="38,44 42,48 38,52" />
      <polygon fill={YELLOW} opacity=".8" points="78,44 82,48 78,52" />
    </g>,
  ],

  /* Clausura — everyone back in one circle to close the day. */
  clausura: [
    <circle cx="60" cy="48" fill="none" key="ring" opacity=".18" r="32" stroke={CREAM} strokeWidth="1.5" />,
    <g key="center">
      <polygon fill={YELLOW} points="60,40 68,48 60,56 52,48" />
      <polygon fill={YELLOW_FOLD} points="60,40 68,48 60,56" />
    </g>,
    <g key="ring-a">
      <Head paper="cream" r={6} x={60} y={16} />
      <Head paper="yellow" r={6} x={87} y={31} />
      <Head paper="cream" r={6} x={89} y={62} />
    </g>,
    <g key="ring-b">
      <Head paper="yellow" r={6} x={73} y={79} />
      <Head paper="cream" r={6} x={47} y={79} />
    </g>,
    <g key="ring-c">
      <Head paper="yellow" r={6} x={31} y={62} />
      <Head paper="cream" r={6} x={33} y={31} />
    </g>,
  ],
};

/* Pieces of paper landing one after another. MotionConfig reducedMotion="user"
   strips the movement and leaves the fade for anyone who asked for that. */
const CONTAINER = { show: { transition: { staggerChildren: 0.08, delayChildren: 0.08 } } };
const PART = {
  hidden: { opacity: 0, y: -10, rotate: -6, scale: 0.9 },
  show: { opacity: 1, y: 0, rotate: 0, scale: 1, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] as const } },
};

type OpenSpaceSceneProps = {
  name: OpenSpaceSceneName;
  className?: string;
  /** Stagger the parts in. Off for the small thumbnails, on for the open panel. */
  animate?: boolean;
  /**
   * Which variant to sit in. Driven as a prop rather than replayed by
   * remounting, so the panels can all stay mounted (they share a grid cell to
   * keep the card a constant height) and still animate when one becomes active.
   */
  show?: boolean;
};

export default function OpenSpaceScene({ name, className, animate = false, show = true }: OpenSpaceSceneProps) {
  const parts = SCENES[name];

  if (!animate) {
    return (
      <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 120 96">
        {parts}
      </svg>
    );
  }

  return (
    <m.svg
      animate={show ? "show" : "hidden"}
      aria-hidden="true"
      className={className}
      fill="none"
      initial="hidden"
      variants={CONTAINER}
      viewBox="0 0 120 96"
    >
      {parts.map((part, index) => (
        <m.g
          key={index}
          // fill-box keeps rotate/scale around each piece, not the whole canvas
          style={{ transformBox: "fill-box", transformOrigin: "center" }}
          variants={PART}
        >
          {part}
        </m.g>
      ))}
    </m.svg>
  );
}
