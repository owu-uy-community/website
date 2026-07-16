"use client";

import { motion, useInView, useReducedMotion } from "motion/react";
import { useRef, useState } from "react";

const YELLOW = "#EBB403";
const BLUE = "#0162C8";
const WHITE = "#FBF5E7";

// Disposición final de las piezas del hero, apiladas contra el fondo de la
// página, según el frame "OWU - LANDING - TANGRAM" de Figma (contenido 1248px).
type FallenPiece = {
  id: string;
  left: number;
  top: number;
  width: number;
  height: number;
  delay: number;
  render: React.ReactNode;
};

const STAGE_HEIGHT = 660;

const FALLEN_PIECES: FallenPiece[] = [
  {
    id: "circle-photo",
    left: 0,
    top: 299,
    width: 275,
    height: 276,
    delay: 0.2,
    render: (
      <img src="/images/conf/photos/hero-circle.png" alt="" className="pointer-events-none size-full rounded-full object-cover grayscale" />
    ),
  },
  {
    id: "cream-rect",
    left: 106,
    top: 433,
    width: 400,
    height: 142,
    delay: 0.1,
    render: <div className="pointer-events-none size-full bg-[#FBF5E7]" />,
  },
  {
    id: "parallelogram",
    left: 248,
    top: 84,
    width: 164,
    height: 491,
    delay: 0.15,
    render: (
      <img
        src="/images/conf/shapes/parallelogram.svg"
        alt=""
        className="pointer-events-none h-[164px] w-[491px] max-w-none -rotate-90 -scale-y-100"
      />
    ),
  },
  {
    id: "chevron",
    left: 448,
    top: 329,
    width: 241,
    height: 241,
    delay: 0,
    render: <img src="/images/conf/shapes/chevron.svg" alt="" className="pointer-events-none size-full" />,
  },
  {
    id: "subtract",
    left: 649,
    top: 273,
    width: 151,
    height: 302,
    delay: 0.1,
    render: (
      <img
        src="/images/conf/shapes/subtract.svg"
        alt=""
        className="pointer-events-none h-[151px] w-[302px] max-w-none -rotate-90"
      />
    ),
  },
  {
    id: "vector-2931",
    left: 848,
    top: 266,
    width: 309,
    height: 309,
    delay: 0.05,
    render: <img src="/images/conf/shapes/vector2931.svg" alt="" className="pointer-events-none size-full -scale-y-100" />,
  },
  {
    id: "triangle-outline",
    left: 886,
    top: 409,
    width: 167,
    height: 166,
    delay: 0.15,
    render: (
      <svg viewBox="0 0 167 166" className="pointer-events-none size-full" aria-hidden="true">
        <polygon points="83.5,3 164,163 3,163" fill="none" stroke="#FBF5E7" strokeWidth="4" />
      </svg>
    ),
  },
  {
    id: "triangle-photo",
    left: 919,
    top: 364,
    width: 282,
    height: 244,
    delay: 0.05,
    render: (
      <img
        src="/images/conf/photos/hero-triangle.png"
        alt=""
        className="pointer-events-none size-full object-contain grayscale"
      />
    ),
  },
];

function FallenTangram() {
  const stageRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();
  // Se observa el stage (estático) y no las piezas: con el offset inicial las
  // piezas quedan fuera del viewport y whileInView nunca dispararía.
  const inView = useInView(stageRef, { once: true, amount: 0.2 });

  return (
    <div ref={stageRef} aria-hidden="true" className="absolute inset-0 z-10 hidden lg:block">
      {FALLEN_PIECES.map((piece) => (
        <motion.div
          key={piece.id}
          className="absolute flex cursor-grab items-center justify-center active:cursor-grabbing"
          style={{ left: piece.left, top: piece.top, width: piece.width, height: piece.height }}
          drag
          dragConstraints={stageRef}
          dragElastic={0.15}
          initial={reducedMotion ? false : { y: -(piece.top + piece.height + 320), rotate: -10, opacity: 0 }}
          animate={inView || reducedMotion ? { y: 0, rotate: 0, opacity: 1 } : undefined}
          transition={{
            type: "spring",
            stiffness: 60,
            damping: 12,
            mass: 1.1,
            delay: piece.delay,
            opacity: { duration: 0.2, delay: piece.delay },
          }}
        >
          {piece.render}
        </motion.div>
      ))}
    </div>
  );
}

// Tangram clásico de siete piezas (fallback interactivo en mobile).
const PIECES: [number, number][][] = [
  [
    [0, 0],
    [8, 0],
    [4, 4],
  ],
  [
    [0, 0],
    [4, 4],
    [0, 8],
  ],
  [
    [8, 4],
    [8, 8],
    [4, 8],
  ],
  [
    [8, 0],
    [8, 4],
    [6, 2],
  ],
  [
    [4, 4],
    [6, 2],
    [8, 4],
    [6, 6],
  ],
  [
    [4, 4],
    [2, 6],
    [6, 6],
  ],
  [
    [0, 8],
    [2, 6],
    [6, 6],
    [4, 8],
  ],
];

// How far (in viewBox units) a piece can be dragged away from its home position.
const MAX_OFFSET = 4;
const VIEW_MIN = -3;
const VIEW_SIZE = 14;

const clamp = (value: number) => Math.min(MAX_OFFSET, Math.max(-MAX_OFFSET, value));

type Offset = { x: number; y: number };

const initialOffsets = () => PIECES.map<Offset>(() => ({ x: 0, y: 0 }));

function TangramSet({ colors }: { colors: string[] }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [offsets, setOffsets] = useState<Offset[]>(initialOffsets);
  const drag = useRef<{ index: number; pointerX: number; pointerY: number; base: Offset; scale: number } | null>(null);

  const onPointerDown = (index: number) => (e: React.PointerEvent<SVGPolygonElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    drag.current = {
      index,
      pointerX: e.clientX,
      pointerY: e.clientY,
      base: offsets[index],
      scale: VIEW_SIZE / rect.width,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<SVGPolygonElement>) => {
    const current = drag.current;
    if (!current) return;
    const dx = (e.clientX - current.pointerX) * current.scale;
    const dy = (e.clientY - current.pointerY) * current.scale;
    setOffsets((prev) =>
      prev.map((offset, i) =>
        i === current.index ? { x: clamp(current.base.x + dx), y: clamp(current.base.y + dy) } : offset
      )
    );
  };

  const onPointerEnd = () => {
    drag.current = null;
  };

  return (
    <svg
      ref={svgRef}
      viewBox={`${VIEW_MIN} ${VIEW_MIN} ${VIEW_SIZE} ${VIEW_SIZE}`}
      className="w-full touch-none select-none"
      role="application"
      aria-label="Tangram interactivo: arrastrá las piezas para crear tu composición"
    >
      {PIECES.map((points, i) => (
        <polygon
          key={i}
          points={points.map(([x, y]) => `${x},${y}`).join(" ")}
          fill={colors[i]}
          stroke="#000"
          strokeWidth={0.22}
          strokeLinejoin="round"
          transform={`translate(${offsets[i].x} ${offsets[i].y})`}
          className="cursor-grab active:cursor-grabbing"
          onPointerDown={onPointerDown(i)}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
        />
      ))}
    </svg>
  );
}

const SET_A = [WHITE, WHITE, BLUE, YELLOW, YELLOW, BLUE, WHITE];

export default function TangramPlayground() {
  return (
    <section id="juga-con-owu" className="bg-black px-6 pb-16 pt-8 xl:px-0">
      <div className="relative mx-auto w-full max-w-[1248px]">
        <div className="lg:h-[672px]">
          <p className="text-lg font-bold uppercase text-[#FBF5E7] sm:text-xl">Construimos entre todos</p>
          <h2 className="mt-3 text-[clamp(2.5rem,5vw,4rem)] font-extrabold uppercase leading-none tracking-tight text-[#FBF5E7]">
            Armá, mové, explorá.
          </h2>
          <div className="mt-8 flex max-w-[598px] flex-col gap-8 font-sans text-lg leading-snug text-[#FBF5E7] sm:text-xl">
            <p>
              Como un tangram, una comunidad nunca permanece igual. Se transforma con cada persona, cada idea y cada
              encuentro.
            </p>
            <p>
              Explorá, mové las piezas y descubrí cómo pequeñas contribuciones construyen algo mucho más grande cuando
              trabajamos juntos.
            </p>
          </div>

          <FallenTangram />
        </div>

        <div className="mt-10 lg:hidden">
          <TangramSet colors={SET_A} />
        </div>
      </div>
    </section>
  );
}
