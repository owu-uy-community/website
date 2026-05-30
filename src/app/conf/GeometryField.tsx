"use client";

import { useEffect, useRef, type ReactNode } from "react";

const YELLOW = "#F5BB03";
const BLUE = "#0162C8";

function Accent({
  wrap,
  depth,
  anim,
  drift,
  children,
}: {
  wrap: string;
  depth: number;
  anim: string;
  drift: string;
  children: ReactNode;
}) {
  return (
    <span
      className={`absolute transition-transform duration-500 ease-out ${wrap}`}
      style={{ transform: `translate3d(calc(var(--mx, 0) * ${depth}px), calc(var(--my, 0) * ${depth}px), 0)` }}
    >
      <span className={`block h-full w-full ${anim}`}>
        <span className={`block h-full w-full ${drift}`}>{children}</span>
      </span>
    </span>
  );
}

const Triangle = ({ fill, points }: { fill: string; points: string }) => (
  <svg viewBox="0 0 100 100" className="h-full w-full" aria-hidden="true">
    <polygon points={points} fill={fill} />
  </svg>
);

const TRI_RIGHT = "3,3 97,50 3,97";
const TRI_CORNER = "97,3 97,97 3,97";

const HalfCircle = ({ fill }: { fill: string }) => (
  <svg viewBox="0 0 100 50" className="h-full w-full" aria-hidden="true">
    <path d="M0 50 A50 50 0 0 1 100 50 Z" fill={fill} />
  </svg>
);

export default function GeometryField() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof window === "undefined") return;

    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const finePointer = window.matchMedia?.("(pointer: fine)").matches;
    if (reduce || !finePointer) return;

    let raf = 0;
    const onMove = (event: MouseEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const mx = (event.clientX / window.innerWidth - 0.5) * 2;
        const my = (event.clientY / window.innerHeight - 0.5) * 2;
        el.style.setProperty("--mx", mx.toFixed(3));
        el.style.setProperty("--my", my.toFixed(3));
      });
    };

    window.addEventListener("mousemove", onMove, { passive: true });
    return () => {
      window.removeEventListener("mousemove", onMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div ref={ref} aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <Accent
        wrap="-right-24 -top-28 h-64 w-64 sm:h-80 sm:w-80"
        depth={12}
        anim="animate-assemble [animation-delay:0.12s] motion-reduce:animate-none"
        drift="animate-drift [animation-delay:0.2s] motion-reduce:animate-none"
      >
        <div className="h-full w-full rounded-full bg-[#F5BB03]" />
      </Accent>

      <Accent
        wrap="-left-6 top-[30%] hidden h-40 w-40 sm:block sm:h-52 sm:w-52"
        depth={30}
        anim="animate-assemble [animation-delay:0.16s] motion-reduce:animate-none"
        drift="animate-drift motion-reduce:animate-none"
      >
        <Triangle fill={BLUE} points={TRI_RIGHT} />
      </Accent>
      <Accent
        wrap="bottom-0 left-0 h-16 w-32 sm:h-20 sm:w-44"
        depth={6}
        anim="animate-assemble [animation-delay:0.5s] motion-reduce:animate-none"
        drift=""
      >
        <HalfCircle fill={YELLOW} />
      </Accent>

      <Accent
        wrap="-bottom-6 -right-4 h-36 w-36 sm:h-48 sm:w-48"
        depth={26}
        anim="animate-assemble [animation-delay:0.22s] motion-reduce:animate-none"
        drift="animate-drift [animation-delay:0.4s] motion-reduce:animate-none"
      >
        <Triangle fill={YELLOW} points={TRI_CORNER} />
      </Accent>

      <Accent
        wrap="left-[12%] top-[24%] hidden h-14 w-14 xl:block"
        depth={9}
        anim="animate-assemble [animation-delay:0.6s] motion-reduce:animate-none"
        drift="animate-drift [animation-delay:0.4s] motion-reduce:animate-none"
      >
        <div className="h-full w-full rounded-full border-[5px] border-white/15" />
      </Accent>
    </div>
  );
}
