"use client";

import { motion, useMotionValueEvent, useReducedMotion, useScroll } from "motion/react";
import { useEffect, useRef, useState } from "react";

// Coordenadas en el espacio de contenido del hero de Figma (1248x616).
// Al scrollear, las piezas "caen" y salen por debajo del stage (overflow-hidden);
// reaparecen apiladas en el fondo real de la página (ver TangramPlayground).
type Piece = {
  id: string;
  left: number;
  top: number;
  width: number;
  height: number;
  rotate: number;
  delay: number;
  render: React.ReactNode;
};

// El stage arranca en el borde superior de la sección: 80px de aire para que
// las piezas (p. ej. el chevron, top -63 en Figma) asomen por encima de la foto.
const STAGE_HEIGHT = 940;

const PIECES: Piece[] = [
  {
    id: "parallelogram",
    left: 667,
    top: 122,
    width: 164,
    height: 491,
    rotate: 14,
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
    left: 906,
    top: 17,
    width: 241,
    height: 241,
    rotate: -18,
    delay: 0,
    render: <img src="/images/conf/shapes/chevron.svg" alt="" className="pointer-events-none size-full" />,
  },
  {
    id: "cream-rect",
    left: 782,
    top: 439,
    width: 400,
    height: 142,
    rotate: -8,
    delay: 0.1,
    render: <div className="pointer-events-none size-full bg-[#FBF5E7]" />,
  },
  {
    id: "subtract",
    left: 831,
    top: 525,
    width: 151,
    height: 302,
    rotate: -12,
    delay: 0.1,
    render: (
      <img src="/images/conf/shapes/subtract.svg" alt="" className="pointer-events-none h-[151px] w-[302px] max-w-none -rotate-90" />
    ),
  },
  {
    id: "circle-photo",
    left: 589,
    top: 472,
    width: 275,
    height: 276,
    rotate: 6,
    delay: 0.2,
    render: (
      <img src="/images/conf/photos/hero-circle.png" alt="" className="pointer-events-none size-full rounded-full object-cover grayscale" />
    ),
  },
  {
    id: "vector-2931",
    left: 945,
    top: 317,
    width: 309,
    height: 309,
    rotate: 10,
    delay: 0.05,
    render: <img src="/images/conf/shapes/vector2931.svg" alt="" className="pointer-events-none size-full -scale-y-100" />,
  },
  {
    id: "triangle-photo",
    left: 1069,
    top: 632,
    width: 282,
    height: 244,
    rotate: 8,
    delay: 0.05,
    render: <img src="/images/conf/photos/hero-triangle.png" alt="" className="pointer-events-none size-full object-contain grayscale" />,
  },
  {
    id: "triangle-outline",
    left: 1084,
    top: 642,
    width: 167,
    height: 166,
    rotate: -6,
    delay: 0.15,
    render: (
      <svg viewBox="0 0 167 166" className="pointer-events-none size-full" aria-hidden="true">
        <polygon points="83.5,3 164,163 3,163" fill="none" stroke="#FBF5E7" strokeWidth="4" />
      </svg>
    ),
  },
];

export default function HeroTangram() {
  const stageRef = useRef<HTMLDivElement>(null);
  const [fallen, setFallen] = useState(false);
  const reducedMotion = useReducedMotion();
  const { scrollY } = useScroll();

  useMotionValueEvent(scrollY, "change", (y) => setFallen(y > 80));

  // Si la página carga ya scrolleada (reload a mitad de página), arrancar con las piezas caídas.
  useEffect(() => {
    setFallen(window.scrollY > 80);
  }, []);

  return (
    <div
      ref={stageRef}
      aria-hidden="true"
      className="pointer-events-none absolute left-0 right-[calc(50%-50vw)] top-0 hidden overflow-hidden lg:block"
      style={{ height: STAGE_HEIGHT }}
    >
      <img
        src="/images/conf/photos/hero-strip.png"
        alt=""
        className="absolute left-[726px] top-[80px] h-[440px] w-[880px] max-w-none object-cover grayscale"
      />
      {PIECES.map((piece) => {
        // Distancia suficiente para que la pieza salga por completo del stage.
        const fall = STAGE_HEIGHT + 20 - piece.top;
        return (
          <motion.div
            key={piece.id}
            className="pointer-events-auto absolute flex cursor-grab items-center justify-center active:cursor-grabbing"
            style={{ left: piece.left, top: piece.top, width: piece.width, height: piece.height }}
            drag={!fallen}
            dragConstraints={stageRef}
            dragElastic={0.15}
            animate={fallen ? { y: fall, rotate: piece.rotate, opacity: 0 } : { x: 0, y: 0, rotate: 0, opacity: 1 }}
            transition={
              reducedMotion
                ? { duration: 0 }
                : {
                    type: "spring",
                    stiffness: 55,
                    damping: 11,
                    mass: 1.1,
                    delay: piece.delay,
                    opacity: fallen
                      ? { duration: 0.45, delay: piece.delay + 0.3, ease: "easeIn" }
                      : { duration: 0.3 },
                  }
            }
          >
            {piece.render}
          </motion.div>
        );
      })}
    </div>
  );
}
