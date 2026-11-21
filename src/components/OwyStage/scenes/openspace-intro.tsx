"use client";

import { useContext, useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { AnimatePresence, m } from "motion/react";

import { EASE_OUT } from "app/conf/components/Reveal";
import { OPEN_SPACE_TIMES } from "app/conf/talks";
import {
  INTRO_DOODLES,
  clickerAction,
  doodleSrc,
  introAt,
  introStep,
  type IntroDoodle,
  type IntroSlideId,
} from "lib/owy-stage/openspace-intro";
import type { SceneProps } from "lib/owy-stage/scenes";
import { RoomMark } from "lib/rooms/icons";

import { BRAND, StageContext } from "../Stage";
import OwyFaceScene from "./OwyFace";
import { Rise } from "./parts";

/**
 * «Intro al open space»: the welcome's slides, one build per clicker press (`openspace-intro.ts`).
 * The visuals borrow La Meetup's yellow doodles and the venue's room signage: five spaces, each
 * with its colour and shape.
 */

/** The five spaces as the venue signs them (the seed's rooms.color / rooms.icon). */
const ROOMS = [
  { name: "Ventana", color: "#2960C1", icon: "triangle" },
  { name: "Centro", color: "#E2B63E", icon: "circle" },
  { name: "Rincón", color: "#FFFFFF", icon: "square" },
  { name: "Lobby", color: "#EA3323", icon: "diamond" },
  { name: "Cueva", color: "#EF8A34", icon: "hexagon" },
] as const;

/** Hand-drawn "boil": three poses, six times a second, like a cartoon line that never sits still. */
const BOIL =
  "@keyframes intro-boil{0%{transform:none}33%{transform:rotate(-0.7deg) translate(2px,-1px)}66%{transform:rotate(0.6deg) translate(-2px,1px)}}.intro-boil{animation:intro-boil .5s steps(1,end) infinite}";

/** One of La Meetup's doodles: it draws itself in from the left, then keeps boiling. */
function Doodle({ name, className = "", delay = 0.2 }: { name: IntroDoodle; className?: string; delay?: number }) {
  return (
    <m.div
      animate={{ clipPath: "inset(0% 0% 0% 0%)" }}
      className={className}
      initial={{ clipPath: "inset(0% 100% 0% 0%)" }}
      transition={{ duration: 1.1, delay, ease: [0.65, 0, 0.35, 1] }}
    >
      <img alt="" className="intro-boil h-full w-full object-contain" src={doodleSrc(name)} />
    </m.div>
  );
}

/** A build: in when the presenter reaches it; with `settle`, it steps back once a newer one arrives. */
function Step({
  at,
  build,
  settle = false,
  delay = 0,
  className = "",
  style,
  children,
}: {
  at: number;
  build: number;
  settle?: boolean;
  delay?: number;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const shown = build >= at;

  return (
    <m.div
      animate={shown ? { opacity: settle && build > at ? 0.4 : 1, y: 0 } : { opacity: 0, y: 28 }}
      className={className}
      initial={{ opacity: 0, y: 28 }}
      style={style}
      transition={{ duration: 0.55, delay: build === at ? delay : 0, ease: EASE_OUT }}
    >
      {children}
    </m.div>
  );
}

function Title({ children, width = 1680, size = 96 }: { children: ReactNode; width?: number; size?: number }) {
  return (
    <div
      className="absolute top-[104px] left-[120px] leading-[1.04] font-bold tracking-[-0.035em] text-balance"
      style={{ width, fontSize: size }}
    >
      <Rise delay={0.05}>{children}</Rise>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Portada: the title, the five spaces in a ring, and the show of hands
// ---------------------------------------------------------------------------

function RoomRing() {
  const r = 300;
  const turn = { duration: 90, repeat: Infinity, ease: "linear" } as const;

  return (
    <m.div
      animate={{ opacity: 1, scale: 1 }}
      className="absolute top-[140px] right-[110px] h-[800px] w-[800px]"
      initial={{ opacity: 0, scale: 0.85 }}
      transition={{ duration: 1.2, delay: 0.3, ease: EASE_OUT }}
    >
      <svg className="absolute inset-0" viewBox="0 0 800 800">
        <circle
          cx="400"
          cy="400"
          fill="none"
          r={r}
          stroke={BRAND.cream}
          strokeDasharray="2 22"
          strokeLinecap="round"
          strokeOpacity={0.3}
          strokeWidth={6}
        />
      </svg>
      {/* The ring turns and each shape turns back, so the signs stay upright. */}
      <m.div animate={{ rotate: 360 }} className="absolute inset-0" transition={turn}>
        {ROOMS.map((room, i) => {
          const a = (i / ROOMS.length) * Math.PI * 2 - Math.PI / 2;
          return (
            <m.div
              key={room.name}
              animate={{ rotate: -360 }}
              className="absolute"
              style={{ left: 400 + Math.cos(a) * r - 70, top: 400 + Math.sin(a) * r - 70 }}
              transition={turn}
            >
              <RoomMark className="size-[140px]" color={room.color} icon={room.icon} />
            </m.div>
          );
        })}
      </m.div>
    </m.div>
  );
}

function Portada({ build }: { build: number }) {
  return (
    <>
      <RoomRing />
      <div className="absolute top-[130px] left-[120px]">
        <Rise className="text-[260px] leading-[0.86] font-bold tracking-[-0.055em]" delay={0.1}>
          Open
        </Rise>
        <Rise className="text-[260px] leading-[0.86] font-bold tracking-[-0.055em]" delay={0.22}>
          space
        </Rise>
        <div className="relative mt-12 h-[260px] w-[1000px]">
          <AnimatePresence mode="wait">
            {build === 0 ? (
              <m.p
                key="sub"
                animate={{ opacity: 1, y: 0 }}
                className="text-[52px] leading-[1.15] font-medium text-[#FBF5E7]/70"
                exit={{ opacity: 0, y: -16 }}
                initial={{ opacity: 0, y: 24 }}
                transition={{ duration: 0.5, delay: 0.1, ease: EASE_OUT }}
              >
                La parte del día que arman ustedes.
              </m.p>
            ) : (
              <m.div
                key="hands"
                animate={{ opacity: 1, y: 0 }}
                className="flex items-end gap-10"
                initial={{ opacity: 0, y: 24 }}
                transition={{ duration: 0.5, ease: EASE_OUT }}
              >
                <p className="w-[760px] text-[76px] leading-[1.04] font-bold tracking-[-0.03em] text-balance text-[#F5BB03]">
                  ¿Quién ya participó de un open space?
                </p>
                <Doodle className="h-[240px] w-[110px] shrink-0" delay={0.3} name="raise-hand" />
              </m.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// ¿En qué consiste?: a circle of people, and the conversation that starts in it
// ---------------------------------------------------------------------------

const SEATS = 9;
const C = 350;
const R = 250;
const seat = (i: number) => {
  const a = (i / SEATS) * Math.PI * 2 - Math.PI / 2;
  return { a, x: C + Math.cos(a) * R, y: C + Math.sin(a) * R };
};
/** Who talks with whom: first around whoever brought the topic (seat 0), then everybody. */
const AROUND_TOPIC = [
  [0, 4],
  [0, 6],
  [0, 2],
  [0, 5],
] as const;
const EVERYBODY = [
  [3, 7],
  [5, 8],
  [2, 6],
  [1, 4],
  [7, 1],
  [8, 3],
] as const;
/** A line between two seats that bows toward the middle of the circle. */
function bow(i: number, j: number) {
  const p = seat(i);
  const q = seat(j);
  const cx = C + ((p.x + q.x) / 2 - C) * 0.3;
  const cy = C + ((p.y + q.y) / 2 - C) * 0.3;

  return `M${p.x} ${p.y}Q${cx} ${cy} ${q.x} ${q.y}`;
}

function Circle({ build }: { build: number }) {
  const arcs = [...(build >= 1 ? AROUND_TOPIC : []), ...(build >= 2 ? EVERYBODY : [])];
  const lead = seat(0);

  return (
    <svg className="absolute top-[200px] left-[1100px]" height={700} viewBox="0 0 700 700" width={700}>
      <circle
        cx={C}
        cy={C}
        fill="none"
        r={R}
        stroke={BRAND.cream}
        strokeDasharray="2 20"
        strokeLinecap="round"
        strokeOpacity={0.25}
        strokeWidth={5}
      />
      {arcs.map(([i, j], k) => (
        <m.path
          key={`${i}-${j}`}
          animate={{ pathLength: [0, 1, 1], opacity: [0, 0.9, 0] }}
          d={bow(i, j)}
          fill="none"
          initial={{ pathLength: 0, opacity: 0 }}
          stroke={BRAND.yellow}
          strokeLinecap="round"
          strokeWidth={6}
          transition={{ duration: 2.4, delay: (k % 4) * 0.55 + (k >= 4 ? 0.3 : 0), repeat: Infinity, repeatDelay: 1 }}
        />
      ))}
      {Array.from({ length: SEATS }, (_, i) => {
        const { a, x, y } = seat(i);
        const color = i === 0 && build >= 1 ? BRAND.yellow : BRAND.cream;
        const sx = C + Math.cos(a) * (R + 30);
        const sy = C + Math.sin(a) * (R + 30);
        return (
          <m.g
            key={i}
            animate={{ opacity: 1 }}
            initial={{ opacity: 0 }}
            transition={{ duration: 0.5, delay: 0.3 + i * 0.07 }}
          >
            {/* From above: shoulders behind, the head toward the middle */}
            <ellipse
              cx={sx}
              cy={sy}
              fill={color}
              fillOpacity={0.35}
              rx={48}
              ry={24}
              transform={`rotate(${(a * 180) / Math.PI + 90} ${sx} ${sy})`}
            />
            <circle cx={x} cy={y} fill={color} r={28} />
          </m.g>
        );
      })}
      {/* The topic on paper, in the hands of whoever proposed it */}
      <g transform={`rotate(-8 ${lead.x} ${lead.y + 62})`}>
        <m.rect
          animate={{ opacity: build >= 1 ? 1 : 0 }}
          fill="#FFFFFF"
          height={30}
          initial={{ opacity: 0 }}
          stroke="#000000"
          strokeWidth={3}
          width={42}
          x={lead.x - 21}
          y={lead.y + 47}
        />
      </g>
    </svg>
  );
}

function QueEs({ build }: { build: number }) {
  return (
    <>
      <Title width={980}>¿En qué consiste un open space?</Title>
      <div className="absolute top-[420px] left-[120px] flex w-[900px] flex-col gap-[64px]">
        <Step at={1} build={build} settle>
          <p className="text-[68px] leading-[1.05] font-bold tracking-[-0.03em]">Proponer un tema e intercambiar</p>
        </Step>
        <Step at={2} build={build}>
          <p className="text-[68px] leading-[1.05] font-bold tracking-[-0.03em] text-[#F5BB03]">
            Formato intencionalmente abierto
          </p>
          <p className="mt-6 text-[36px] leading-[1.3] font-medium text-[#FBF5E7]/70">
            Tirás una pregunta y arranca el intercambio, o traés algo más armado, tipo charla, y después lo abrís.
          </p>
        </Step>
      </div>
      <Circle build={build} />
    </>
  );
}

// ---------------------------------------------------------------------------
// La dinámica: five blocks × five spaces, and one afternoon hopping through them
// ---------------------------------------------------------------------------

const BLOCKS = 5;
/** Each block starts 30 minutes after the last: 25 of conversation, 5 to move. */
function blockStart(i: number) {
  const [h, min] = OPEN_SPACE_TIMES.sesiones.start.split(":").map(Number);
  const t = h * 60 + min + i * 30;

  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}
const CAPTIONS = [
  "",
  "5 bloques de 25 minutos",
  "En cada bloque, 5 open spaces a la vez",
  "Cada uno en un espacio distinto",
  "Cada 25 minutos, temas nuevos: mirás la grilla y elegís a dónde ir",
];
/** Somebody's afternoon: the space they pick in each block. */
const PATH = [0, 3, 1, 4, 2];
const GRID_X = 420;
const COL_W = 276;
const ROW_Y = 480;
const ROW_H = 96;
const cellCenter = (c: number, r: number) => ({ x: GRID_X + c * COL_W + COL_W / 2, y: ROW_Y + r * ROW_H + ROW_H / 2 });

function Dinamica({ build }: { build: number }) {
  const [hop, setHop] = useState(0);
  useEffect(() => {
    if (build < 4) return;
    const id = setInterval(() => setHop((n) => n + 1), 1100);
    return () => clearInterval(id);
  }, [build]);
  // Five hops, a beat on the last space, then the walk starts over.
  const cycle = Math.floor(hop / (PATH.length + 2));
  const walk = build >= 4 ? Math.min(hop % (PATH.length + 2), PATH.length - 1) : -1;
  const here = walk >= 0 ? cellCenter(walk, PATH[walk]) : null;

  return (
    <>
      <Title>¿Cómo es la dinámica?</Title>
      <div className="absolute top-[236px] left-[120px] h-[64px] w-[1680px]">
        <AnimatePresence mode="wait">
          {build > 0 && (
            <m.p
              key={build}
              animate={{ opacity: 1, y: 0 }}
              className="text-[44px] font-medium text-[#FBF5E7]/75"
              exit={{ opacity: 0, y: -12 }}
              initial={{ opacity: 0, y: 16 }}
              transition={{ duration: 0.4, ease: EASE_OUT }}
            >
              {CAPTIONS[build]}
            </m.p>
          )}
        </AnimatePresence>
      </div>
      {Array.from({ length: BLOCKS }, (_, c) => (
        <Step
          key={c}
          at={1}
          build={build}
          className="absolute top-[338px] text-center"
          delay={c * 0.08}
          style={{ left: GRID_X + c * COL_W, width: COL_W }}
        >
          <p className="text-[60px] leading-none font-bold">
            <span className="countdown-font">25</span> min
          </p>
          <p className="mt-2 text-[28px] font-medium text-[#FBF5E7]/55 tabular-nums">{blockStart(c)}</p>
        </Step>
      ))}
      {ROOMS.map((room, r) => (
        <Step
          key={room.name}
          at={3}
          build={build}
          className="absolute left-[120px] flex items-center gap-5"
          delay={r * 0.08}
          style={{ top: ROW_Y + r * ROW_H, height: ROW_H }}
        >
          <RoomMark className="size-[52px]" color={room.color} icon={room.icon} />
          <span className="text-[40px] font-bold">{room.name}</span>
        </Step>
      ))}
      {ROOMS.flatMap((room, r) =>
        Array.from({ length: BLOCKS }, (_, c) => {
          const visited = walk >= 0 && c <= walk && PATH[c] === r;
          const bar = build >= 3 ? "bg-black/30" : "bg-[#FBF5E7]/30";
          return (
            <m.div
              key={`${r}-${c}`}
              animate={
                build >= 2
                  ? {
                      opacity: 1,
                      scale: 1,
                      backgroundColor: build >= 3 ? room.color : "rgba(251,245,231,0.12)",
                      boxShadow: visited ? "0 0 0 6px rgba(251,245,231,1)" : "0 0 0 0px rgba(251,245,231,0)",
                    }
                  : { opacity: 0, scale: 0.6 }
              }
              className="absolute flex flex-col justify-center gap-[10px] rounded-[14px] px-6"
              initial={{ opacity: 0, scale: 0.6 }}
              style={{
                left: GRID_X + c * COL_W + 14,
                top: ROW_Y + r * ROW_H + 10,
                width: COL_W - 28,
                height: ROW_H - 20,
              }}
              transition={{ duration: 0.45, delay: build === 2 ? c * 0.12 + r * 0.05 : 0, ease: EASE_OUT }}
            >
              <span className={`h-[8px] w-[62%] rounded-full ${bar}`} />
              <span className={`h-[8px] w-[38%] rounded-full ${bar}`} />
            </m.div>
          );
        })
      )}
      {here && (
        <svg key={cycle} className="pointer-events-none absolute inset-0" height={1080} width={1920}>
          {PATH.slice(1, walk + 1).map((r, i) => {
            const from = cellCenter(i, PATH[i]);
            const to = cellCenter(i + 1, r);
            return (
              <m.line
                key={i}
                animate={{ pathLength: 1 }}
                initial={{ pathLength: 0 }}
                stroke={BRAND.cream}
                strokeLinecap="round"
                strokeWidth={6}
                transition={{ duration: 0.5, ease: EASE_OUT }}
                x1={from.x}
                x2={to.x}
                y1={from.y}
                y2={to.y}
              />
            );
          })}
          <m.circle
            animate={{ cx: here.x, cy: here.y, r: 26 }}
            cx={cellCenter(0, PATH[0]).x}
            cy={cellCenter(0, PATH[0]).y}
            fill={BRAND.yellow}
            initial={{ r: 0 }}
            stroke="#000000"
            strokeWidth={6}
            transition={{ type: "spring", stiffness: 240, damping: 20 }}
          />
        </svg>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Los principios: one per press, each with its doodle, the way La Meetup drew them
// ---------------------------------------------------------------------------

const PRINCIPLES: { text: string; doodle: IntroDoodle }[] = [
  { text: "Estamos quienes tenemos que estar", doodle: "group" },
  { text: "Empieza cuando tiene que empezar", doodle: "lightbulb" },
  { text: "Termina cuando tiene que terminar", doodle: "bell" },
  { text: "Pasa lo que tiene que pasar", doodle: "board" },
];

function Principios({ build }: { build: number }) {
  return (
    <>
      <Title>Cuatro principios</Title>
      <div className="absolute top-[290px] left-[120px] flex w-[1000px] flex-col gap-[40px]">
        {PRINCIPLES.map((principle, i) => (
          <Step key={principle.text} at={i} build={build} className="flex items-start gap-8" settle>
            <span className="w-[64px] shrink-0 text-[64px] leading-[1.08] font-bold text-[#F5BB03]">{i + 1}</span>
            <span className="text-[56px] leading-[1.08] font-bold tracking-[-0.03em] text-balance">
              {principle.text}
            </span>
          </Step>
        ))}
      </div>
      <div className="absolute top-[250px] left-[1180px] h-[660px] w-[620px]">
        <AnimatePresence mode="wait">
          <m.div key={build} className="absolute inset-0" exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
            <Doodle className="h-full w-full" name={PRINCIPLES[build].doodle} />
          </m.div>
        </AnimatePresence>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// La ley de los dos pies: footsteps from one space to another
// ---------------------------------------------------------------------------

const oval = (cx: number, cy: number, rx: number, ry = rx) =>
  `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${rx * 2} 0a${rx} ${ry} 0 1 0 ${-rx * 2} 0`;
/** A right footprint pointing up: sole, heel and five toes. */
const FOOT = [
  oval(0, -6, 20, 30),
  oval(3, 46, 15, 17),
  oval(-9, -48, 9),
  oval(5, -52, 6.5),
  oval(15, -48, 5.5),
  oval(22, -41, 5),
  oval(27, -32, 4.5),
].join("");
const FOOTSTEPS = 8;
const PACE = 0.32;

function Walk() {
  return (
    <div className="absolute top-[740px] left-[120px] h-[220px] w-[1680px]">
      <div className="absolute top-1/2 left-0 -translate-y-1/2">
        <RoomMark className="size-[120px]" color={ROOMS[4].color} icon={ROOMS[4].icon} />
      </div>
      <div className="absolute top-1/2 right-0 -translate-y-1/2">
        <RoomMark className="size-[120px]" color={ROOMS[0].color} icon={ROOMS[0].icon} />
      </div>
      <svg className="absolute inset-0" viewBox="0 0 1680 220">
        {Array.from({ length: FOOTSTEPS }, (_, i) => (
          // Walking right: the left foot on top, the right one below.
          <g
            key={i}
            transform={`translate(${260 + i * 168} ${110 + (i % 2 ? 36 : -36)}) rotate(90) scale(${i % 2 ? 1.15 : -1.15} 1.15)`}
          >
            <m.path
              animate={{ opacity: [0, 1, 1, 0] }}
              d={FOOT}
              fill={BRAND.yellow}
              initial={{ opacity: 0 }}
              transition={{
                duration: 2.2,
                times: [0, 0.08, 0.7, 1],
                delay: 0.6 + i * PACE,
                repeat: Infinity,
                repeatDelay: FOOTSTEPS * PACE + 0.8 - 2.2,
              }}
            />
          </g>
        ))}
      </svg>
    </div>
  );
}

function DosPies({ build }: { build: number }) {
  return (
    <>
      <div className="absolute top-[140px] left-[120px] w-[1680px]">
        <Rise className="text-[120px] leading-[0.98] font-bold tracking-[-0.045em]" delay={0.05}>
          La ley de los dos pies
        </Rise>
        <Rise className="mt-2 text-[44px] font-medium text-[#FBF5E7]/60" delay={0.2}>
          o de la movilidad
        </Rise>
        <Step at={1} build={build} className="mt-[64px] w-[1500px]">
          <p className="text-[60px] leading-[1.15] font-bold tracking-[-0.025em] text-balance">
            Si no estás aprendiendo ni aportando, tenés la <span className="text-[#F5BB03]">libertad</span> y la{" "}
            <span className="text-[#F5BB03]">responsabilidad</span> de moverte a donde sí puedas.
          </p>
        </Step>
      </div>
      <Walk />
    </>
  );
}

// ---------------------------------------------------------------------------
// ¿Cómo propongo un tema?: the market, the paper card, and no experts needed
// ---------------------------------------------------------------------------

const INK = BRAND.blue;
const written = (delay: number) =>
  ({
    initial: { clipPath: "inset(-30% 100% -30% 0%)" },
    animate: { clipPath: "inset(-30% 0% -30% 0%)" },
    transition: { duration: 0.9, delay, ease: "linear" },
  }) as const;

/** The market's paper card filling itself in, in pen: a name, a topic, a tick on the TV. */
function Card() {
  return (
    <m.div
      animate={{ opacity: 1, rotate: -3, y: 0 }}
      className="relative w-[620px]"
      initial={{ opacity: 0, rotate: 3, y: 40 }}
      transition={{ duration: 0.7, ease: EASE_OUT }}
    >
      <img alt="" className="block w-full" src={doodleSrc("card")} />
      <m.p
        {...written(0.7)}
        className="owu-marker absolute top-[18%] left-[5%] text-[40px] leading-none"
        style={{ color: INK }}
      >
        Tu nombre
      </m.p>
      <m.p
        {...written(1.5)}
        className="owu-marker absolute top-[57%] left-[5%] text-[40px] leading-none"
        style={{ color: INK }}
      >
        Tu tema o tu pregunta
      </m.p>
      <svg className="absolute inset-0" viewBox="0 0 1000 711">
        <m.path
          animate={{ pathLength: 1 }}
          d="M474 586 494 610 532 556"
          fill="none"
          initial={{ pathLength: 0 }}
          stroke={INK}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={12}
          transition={{ duration: 0.4, delay: 2.5, ease: "easeOut" }}
        />
      </svg>
    </m.div>
  );
}

function Proponer({ build }: { build: number }) {
  const visual = build >= 3 ? "jump" : build === 2 ? "card" : "proposer";

  return (
    <>
      <Title>¿Cómo propongo un tema?</Title>
      <div className="absolute top-[280px] left-[120px] flex w-[980px] flex-col gap-[40px]">
        <Step at={1} build={build} settle>
          <p className="text-[58px] leading-[1.05] font-bold tracking-[-0.03em] text-balance text-[#F5BB03]">
            Arrancamos con un mercado de ideas
          </p>
          <p className="mt-3 text-[34px] leading-[1.25] font-medium text-[#FBF5E7]/70">
            Cualquiera trae un tema del que quiere hablar, o una pregunta que le inquieta.
          </p>
        </Step>
        <Step at={2} build={build} settle>
          <p className="text-[38px] font-semibold text-[#FBF5E7]/80">Agarrá una hoja y escribí:</p>
          <p className="mt-2 text-[46px] leading-[1.2] font-bold">Tu nombre · Tu tema</p>
          <p className="text-[46px] leading-[1.2] font-bold">
            ¿Tele o pizarra? <span className="font-medium text-[#FBF5E7]/55">(opcional)</span>
          </p>
        </Step>
        <Step at={3} build={build}>
          <p className="text-[56px] leading-[1.05] font-bold tracking-[-0.03em]">No hace falta ser experto</p>
          <p className="mt-3 text-[34px] leading-[1.25] font-medium text-[#FBF5E7]/70">
            Alcanza con una pregunta que te dé curiosidad, o algo que te esté costando en el trabajo.
          </p>
        </Step>
      </div>
      <div className="absolute top-[240px] left-[1180px] flex h-[700px] w-[640px] items-center justify-center">
        <AnimatePresence mode="wait">
          <m.div
            key={visual}
            className="flex h-full w-full items-center justify-center"
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            {visual === "card" ? <Card /> : <Doodle className="h-[560px] w-[520px]" name={visual} />}
          </m.div>
        </AnimatePresence>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------

function Body({
  id,
  build,
  eventId,
  round,
}: {
  id: IntroSlideId;
  build: number;
  eventId: string | null;
  round: string;
}) {
  switch (id) {
    case "portada":
      return <Portada build={build} />;
    case "que-es":
      return <QueEs build={build} />;
    case "dinamica":
      return <Dinamica build={build} />;
    case "principios":
      return <Principios build={build} />;
    case "dos-pies":
      return <DosPies build={build} />;
    case "proponer":
      return <Proponer build={build} />;
    case "owy":
      // "Les presento a Owy": his live face, the whole wall.
      return <OwyFaceScene eventId={eventId} params={{ captions: true }} round={round} takenAt="" />;
  }
}

export function OpenSpaceIntro({ params, eventId, round }: SceneProps<"openspace-intro">) {
  const { pinned } = useContext(StageContext);
  const [local, setLocal] = useState(() => ({ slide: params.slide, build: params.build, blank: params.blank }));
  const shown = pinned ? local : params;
  const { slide, build } = introAt(shown);

  // The pictures and the pen's font ahead of their slides, also for a laptop that loses the network.
  useEffect(() => {
    for (const name of INTRO_DOODLES) new Image().src = doodleSrc(name);
    document.fonts.load("40px 'Permanent Marker'").catch(() => undefined);
  }, []);

  // Nobody drives a pinned page: it answers the clicker itself, and play goes full screen.
  useEffect(() => {
    if (!pinned) return;
    const onKey = (event: KeyboardEvent) => {
      const action = event.metaKey || event.ctrlKey || event.altKey ? null : clickerAction(event.key);
      if (!action) return;
      event.preventDefault();
      // A held clicker button repeats its key: one press is one build.
      if (event.repeat) return;
      if (action === "play") {
        if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => undefined);
        return;
      }
      setLocal((current) => {
        if (action === "blank") return { ...current, blank: !current.blank };
        const to = introStep(current, action);
        return to ? { ...to, blank: false } : current;
      });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pinned]);

  // ...and keeps its place in the URL, so a reload comes back to the same build.
  useEffect(() => {
    if (!pinned) return;
    const url = new URL(window.location.href);
    url.searchParams.set("p", JSON.stringify(local));
    window.history.replaceState(window.history.state, "", url);
  }, [pinned, local]);

  return (
    <>
      <style>{BOIL}</style>
      <m.div
        key={slide.id}
        animate={{ opacity: 1 }}
        className="absolute inset-0"
        initial={{ opacity: 0 }}
        transition={{ duration: 0.35, ease: EASE_OUT }}
      >
        <Body build={build} eventId={eventId} id={slide.id} round={round} />
      </m.div>
      {slide.id !== "portada" && slide.id !== "owy" && (
        <p className="absolute bottom-[48px] left-[120px] text-[28px] font-medium text-[#FBF5E7]/45">
          Open space · OWU CONF
        </p>
      )}
      {shown.blank && <div className="absolute inset-0 bg-black" />}
    </>
  );
}
