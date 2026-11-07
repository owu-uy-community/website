"use client";

import { useContext } from "react";
import { m } from "motion/react";

import { EASE_OUT } from "app/conf/components/Reveal";
import { MAP, MAP_NODES, MAP_REGIONS, type MapNode, type MapRegion } from "lib/owy-stage/talk/deck";

import { BRAND } from "../../Stage";
import { MiniFace } from "./feed";
import { Heading, type LayoutProps } from "./layouts";
import { CaptionsContext, OwyMark, PeopleMark, Said } from "./seat";

/**
 * The master map: who uses it on top (blue triangles, people), owu.uy in the middle (one band:
 * the API, Postgres and the realtime bus), Owy's world below (yellow half-circles, his face for
 * his brain). Built once, one group per click, then a change crosses it; every chapter opens on
 * it again with its region lit and the camera on it. Where a node sits never changes.
 */

/** The map's own box on the page, under the title; nodes are placed in its coordinates. */
const BOX = { top: 236, height: 760 } as const;
const CENTER = { x: 960, y: 380 } as const;
const TOP_Y = 50;
/** Where a top node's text ends: its line to the band starts there. */
const TOP_FOOT = TOP_Y + 142;
const BAND = { top: 286, height: 104, left: 140, right: 1780 } as const;
const LOW_Y = 548;
const NODE_W = 400;
/** Owy's face, his brain's mark on the map. */
const FACE = 132;

type Kind = "people" | "core" | "owy" | "brain" | "model";
const AT: Record<MapNode, { x: number; y: number; kind: Kind }> = {
  ops: { x: 330, y: TOP_Y, kind: "people" },
  phones: { x: 750, y: TOP_Y, kind: "people" },
  kiosks: { x: 1170, y: TOP_Y, kind: "people" },
  wall: { x: 1590, y: TOP_Y, kind: "people" },
  api: { x: 420, y: BAND.top + BAND.height / 2, kind: "core" },
  db: { x: 960, y: BAND.top + BAND.height / 2, kind: "core" },
  bus: { x: 1500, y: BAND.top + BAND.height / 2, kind: "core" },
  chats: { x: 250, y: LOW_Y, kind: "people" },
  eve: { x: 640, y: LOW_Y, kind: "brain" },
  gateway: { x: 990, y: LOW_Y, kind: "model" },
  bridge: { x: 1335, y: LOW_Y, kind: "owy" },
  knob: { x: 1680, y: LOW_Y, kind: "owy" },
};
const CELL_W = (BAND.right - BAND.left) / 3;

/** Lines between nodes, in map coordinates: [a, b, path]. Shown once both ends are. */
const EDGES: [MapNode, MapNode, string][] = [
  ...(["ops", "phones", "kiosks", "wall"] as const).map(
    (id) =>
      [id, id === "wall" || id === "kiosks" ? "bus" : "api", `M${AT[id].x} ${TOP_FOOT} V${BAND.top}`] as [
        MapNode,
        MapNode,
        string,
      ]
  ),
  ["eve", "api", `M${AT.eve.x} ${LOW_Y - FACE / 2 - 6} V${BAND.top + BAND.height}`],
  ["bridge", "bus", `M${AT.bridge.x} ${LOW_Y - 34} V${BAND.top + BAND.height}`],
  ["chats", "eve", `M${AT.chats.x + 38} ${LOW_Y} H${AT.eve.x - FACE / 2 - 6}`],
  ["eve", "gateway", `M${AT.eve.x + FACE / 2 + 6} ${LOW_Y} H${AT.gateway.x - 28}`],
  ["bridge", "gateway", `M${AT.bridge.x - 40} ${LOW_Y} H${AT.gateway.x + 28}`],
  ["knob", "bridge", `M${AT.knob.x - 40} ${LOW_Y} H${AT.bridge.x + 40}`],
  // The bridge sends each voice turn to the brain: under the row, around the gateway.
  [
    "bridge",
    "eve",
    `M${AT.bridge.x} ${LOW_Y + 150} C${AT.bridge.x} ${LOW_Y + 200} ${AT.eve.x} ${LOW_Y + 200} ${AT.eve.x} ${LOW_Y + 150}`,
  ],
];

/** What the camera frames for a region, when it is more than what is lit: OWU Ops with the API it writes to. */
const FRAME: Partial<Record<MapRegion, MapNode[]>> = { ops: ["ops", "api"] };

/** A node's box (glyph, label and detail) for the camera; band nodes are their cell. */
function boxOf(id: MapNode) {
  const { x, y, kind } = AT[id];
  if (kind === "core") return { x0: x - CELL_W / 2, x1: x + CELL_W / 2, y0: BAND.top, y1: BAND.top + BAND.height };
  return { x0: x - NODE_W / 2, x1: x + NODE_W / 2, y0: y - (kind === "brain" ? FACE / 2 : 30), y1: y + 140 };
}

/** Where the camera goes for a set of nodes: their box, centred and as big as fits (never past 1.7×). */
function cameraOn(ids: readonly MapNode[]) {
  const boxes = ids.map(boxOf);
  const x0 = Math.min(...boxes.map((b) => b.x0));
  const x1 = Math.max(...boxes.map((b) => b.x1));
  const y0 = Math.min(...boxes.map((b) => b.y0));
  const y1 = Math.max(...boxes.map((b) => b.y1));
  const scale = Math.max(1, Math.min(1.7, 1560 / (x1 - x0), 620 / (y1 - y0)));
  // A region that already fits stays where it is: lit, not moved.
  if (scale < 1.05) return { scale: 1, x: 0, y: 0 };
  return { scale, x: CENTER.x - scale * ((x0 + x1) / 2), y: CENTER.y - scale * ((y0 + y1) / 2) };
}

function Glyph({ id }: { id: MapNode }) {
  const { kind } = AT[id];
  if (kind === "brain") return <MiniFace size={FACE} />;
  if (kind === "people") return <PeopleMark className="h-[44px] w-[44px]" />;
  if (kind === "owy") return <OwyMark className="h-[36px] w-[72px]" />;
  return <span className="block h-[40px] w-[40px] rounded-full border-[5px] border-[#FBF5E7]" />;
}

type Look = "hidden" | "on" | "dim" | "new";
const OPACITY: Record<Look, number> = { hidden: 0, on: 1, dim: 0.16, new: 1 };

function Node({ id, look }: { id: MapNode; look: Look }) {
  const { x, y, kind } = AT[id];
  const brain = kind === "brain";
  return (
    <m.div
      animate={{ opacity: OPACITY[look], y: 0 }}
      className="absolute flex flex-col items-center text-center"
      initial={{ opacity: 0, y: look === "new" ? 18 : 0 }}
      style={{ left: x - NODE_W / 2, top: y - (brain ? FACE / 2 : 30), width: NODE_W }}
      transition={{ duration: 0.5, ease: EASE_OUT }}
    >
      <div className="flex items-center justify-center" style={{ height: brain ? FACE : 60 }}>
        <Glyph id={id} />
      </div>
      <p
        className="mt-3 text-[46px] leading-none font-semibold tracking-[-0.02em] whitespace-nowrap"
        style={{ color: look === "new" ? BRAND.yellow : undefined }}
      >
        {MAP[id].label}
      </p>
      <p className="mt-3 text-[29px] leading-[1.15] font-medium whitespace-nowrap text-[#FBF5E7]/60">
        {MAP[id].detail}
      </p>
    </m.div>
  );
}

/** owu.uy: one band, three cells. It is the first thing built and the middle of everything. */
function Band({ looks }: { looks: Record<MapNode, Look> }) {
  const core = (["api", "db", "bus"] as const).map((id) => looks[id]);
  if (core.every((look) => look === "hidden")) return null;
  const lit = core.some((look) => look === "new" || look === "on") && !core.some((look) => look === "dim");
  return (
    <m.div
      animate={{ opacity: 1, borderColor: lit ? "rgba(251,245,231,0.55)" : "rgba(251,245,231,0.18)" }}
      className="absolute flex rounded-[14px] border-[3px]"
      initial={{ opacity: 0 }}
      style={{ left: BAND.left, top: BAND.top, width: BAND.right - BAND.left, height: BAND.height }}
      transition={{ duration: 0.5, ease: EASE_OUT }}
    >
      <p className="absolute -top-[44px] left-0 font-terminal text-[28px] text-[#FBF5E7]/55">owu.uy</p>
      {(["api", "db", "bus"] as const).map((id, i) => (
        <m.div
          key={id}
          animate={{ opacity: OPACITY[looks[id]] }}
          className={`flex flex-1 flex-col items-center justify-center gap-[10px] ${i ? "border-l-[3px] border-[#FBF5E7]/[0.14]" : ""}`}
          transition={{ duration: 0.5, ease: EASE_OUT }}
        >
          <span
            className="text-[46px] leading-none font-bold tracking-[-0.02em]"
            style={{ color: looks[id] === "new" ? BRAND.yellow : undefined }}
          >
            {MAP[id].label}
          </span>
          <span className="font-terminal text-[28px] text-[#FBF5E7]/60">{MAP[id].detail}</span>
        </m.div>
      ))}
    </m.div>
  );
}

const PULSE_S = 3.6;
const repeat = { repeat: Infinity, repeatDelay: 1.2 } as const;

/** One change crossing the map: from the staff into owu.uy, along the bus, out to every screen and the knob. */
function Pulse() {
  const dot = { fill: BRAND.yellow, r: 11 } as const;
  const bandY = BAND.top + BAND.height / 2;
  const up = (x: number) => (
    <m.circle
      key={x}
      {...dot}
      animate={{ cy: [BAND.top, BAND.top, TOP_FOOT], opacity: [0, 1, 0] }}
      cx={x}
      initial={{ opacity: 0 }}
      transition={{
        duration: PULSE_S * 0.2,
        delay: PULSE_S * 0.38,
        ease: "easeOut",
        ...repeat,
        repeatDelay: 1.2 + PULSE_S * 0.8,
      }}
    />
  );
  return (
    <svg aria-hidden className="absolute top-0 left-0 overflow-visible" height={1} width={1}>
      <m.circle
        {...dot}
        animate={{ cy: [TOP_FOOT, BAND.top], opacity: [0, 1, 1, 0] }}
        cx={AT.ops.x}
        initial={{ cy: TOP_FOOT, opacity: 0 }}
        transition={{
          duration: PULSE_S * 0.14,
          ease: "easeIn",
          opacity: {
            duration: PULSE_S * 0.14,
            times: [0, 0.15, 0.85, 1],
            ...repeat,
            repeatDelay: 1.2 + PULSE_S * 0.86,
          },
          ...repeat,
          repeatDelay: 1.2 + PULSE_S * 0.86,
        }}
      />
      <m.rect
        animate={{ x: [AT.ops.x - 60, BAND.right - 140], opacity: [0, 1, 1, 0] }}
        fill={BRAND.yellow}
        height={8}
        initial={{ opacity: 0 }}
        rx={4}
        transition={{
          duration: PULSE_S * 0.24,
          delay: PULSE_S * 0.14,
          ease: "easeInOut",
          ...repeat,
          repeatDelay: 1.2 + PULSE_S * 0.76,
        }}
        width={120}
        y={bandY + 30}
      />
      {[AT.phones.x, AT.kiosks.x, AT.wall.x].map(up)}
      <m.circle
        {...dot}
        animate={{
          cx: [AT.bridge.x, AT.bridge.x, AT.bridge.x, AT.knob.x - 34],
          cy: [BAND.top + BAND.height, BAND.top + BAND.height, LOW_Y, LOW_Y],
          opacity: [0, 1, 1, 0],
        }}
        initial={{ opacity: 0 }}
        transition={{
          duration: PULSE_S * 0.34,
          delay: PULSE_S * 0.38,
          ease: "easeInOut",
          ...repeat,
          repeatDelay: 1.2 + PULSE_S * 0.66,
        }}
      />
    </svg>
  );
}

/** What Owy says on a map slide: top right, beside the title (the bottom belongs to the map). */
function HeaderWords() {
  if (!useContext(CaptionsContext)) return null;
  return (
    <div className="absolute flex items-start gap-5" style={{ left: 1000, top: 108, width: 800 }}>
      <Said className="min-w-0 flex-1" lines={2} size={38} />
    </div>
  );
}

export function MapSlide({ slide, step }: LayoutProps<"map">) {
  const groups = slide.build ?? [];
  const building = groups.length > 0;
  const shown = building ? Math.min(step + 1, groups.length) : groups.length;
  const visible = new Set<MapNode>(building ? groups.slice(0, shown).flat() : MAP_NODES);
  const newest = new Set<MapNode>(building && step < groups.length ? groups[step] : []);
  const lit = new Set<MapNode>(slide.focus ? MAP_REGIONS[slide.focus] : MAP_NODES);
  const pulse = Boolean(slide.pulse) && step >= groups.length;

  const looks = Object.fromEntries(
    MAP_NODES.map((id) => [id, !visible.has(id) ? "hidden" : newest.has(id) ? "new" : lit.has(id) ? "on" : "dim"])
  ) as Record<MapNode, Look>;
  const camera = slide.focus ? cameraOn(FRAME[slide.focus] ?? MAP_REGIONS[slide.focus]) : { scale: 1, x: 0, y: 0 };

  return (
    <>
      <div className="absolute" style={{ left: 120, top: 96, width: 860 }}>
        <Heading size={72} sub={slide.sub}>
          {slide.title}
        </Heading>
      </div>
      <HeaderWords />
      <div
        className="absolute right-0 left-0 overflow-hidden"
        style={{
          top: BOX.top,
          height: BOX.height,
          // Whatever the camera pushes up fades before it reaches the title.
          maskImage: "linear-gradient(to bottom, transparent 0, black 96px)",
        }}
      >
        <m.div
          animate={{ scale: camera.scale, x: camera.x, y: camera.y }}
          className="absolute top-0 left-0 h-full w-full"
          initial={{ scale: 1, x: 0, y: 0 }}
          style={{ originX: 0, originY: 0 }}
          transition={{ duration: 1.1, delay: slide.focus ? 0.45 : 0, ease: [0.65, 0, 0.35, 1] }}
        >
          <svg aria-hidden className="absolute top-0 left-0 overflow-visible" height={1} width={1}>
            {EDGES.map(([a, b, d]) => {
              if (!visible.has(a) || !visible.has(b)) return null;
              const on = lit.has(a) && lit.has(b);
              const dashed = a === "bridge" && b === "eve";
              return (
                <m.path
                  key={`${a}-${b}`}
                  animate={{ pathLength: 1, opacity: on ? 1 : 0.12 }}
                  d={d}
                  fill="none"
                  initial={{ pathLength: 0, opacity: on ? 1 : 0.12 }}
                  stroke={slide.focus && on ? BRAND.yellow : "rgba(251,245,231,0.32)"}
                  strokeDasharray={dashed ? "2 12" : undefined}
                  strokeLinecap="round"
                  strokeWidth={slide.focus && on ? 4 : 3}
                  transition={{ duration: 0.6, ease: EASE_OUT }}
                />
              );
            })}
          </svg>
          <Band looks={looks} />
          {MAP_NODES.filter((id) => AT[id].kind !== "core").map((id) =>
            looks[id] === "hidden" ? null : <Node key={id} id={id} look={looks[id]} />
          )}
          {pulse && <Pulse />}
        </m.div>
      </div>
    </>
  );
}
