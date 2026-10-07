"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { LazyMotion, MotionConfig, domAnimation, m, useAnimationFrame } from "motion/react";

import { EASE_OUT } from "app/conf/components/Reveal";
import { DEFAULT_CANVAS, type StageCanvas } from "lib/owy-stage/canvas";
import "components/displays/countdown/countdown.css";

/**
 * Owy Stage — a fixed 1920×1080 logical canvas that scales to any viewport, so
 * a scene looks identical in the OBS browser source, the admin thumbnails and
 * a laptop preview. Everything inside uses absolute px, never viewport units.
 */

export const W = 1920;
export const H = 1080;

export type { StageCanvas };
export { DEFAULT_CANVAS };

export const BRAND = {
  black: "#000000",
  cream: "#FBF5E7",
  yellow: "#F5BB03",
  blue: "#0162C8",
} as const;

export type StageBackground = "black" | "transparent";

export const StageContext = createContext<{ preview: boolean; bg: StageBackground; canvas: StageCanvas }>({
  preview: false,
  bg: "black",
  canvas: DEFAULT_CANVAS,
});

/** Canvas plus the two numbers every scene needs: type scale and "is it a strip?". */
export function useCanvas() {
  const { canvas } = useContext(StageContext);

  return { ...canvas, u: canvas.h / H, wide: canvas.w / canvas.h > 2.4 };
}

const FONTS = [
  "800 10px Poppins",
  "700 10px Poppins",
  "500 10px Inter",
  "600 10px 'Open Sans'",
  "10px 'Organic Stencil'",
];

export function Stage({
  bg,
  preview,
  canvas = DEFAULT_CANVAS,
  children,
}: {
  bg: StageBackground;
  preview: boolean;
  canvas?: StageCanvas | "fit";
  children: ReactNode;
}) {
  const [scale, setScale] = useState(1);
  const [ready, setReady] = useState(false);
  // "fit" keeps the height and takes the width from the screen, so any wall
  // fills edge to edge without anybody typing its resolution.
  const [fitted, setFitted] = useState<StageCanvas>(canvas === "fit" ? DEFAULT_CANVAS : canvas);
  const size = canvas === "fit" ? fitted : canvas;

  // JS, not CSS calc(100vw / 1920): OBS 30 ships Chromium 103.
  useLayoutEffect(() => {
    const fit = () => {
      const { innerWidth: vw, innerHeight: vh } = window;
      if (canvas === "fit") {
        const width = Math.round(H * (vw / Math.max(vh, 1)));
        setFitted((current) => (current.w === width ? current : { w: width, h: H }));
        setScale(vh / H);

        return;
      }
      setScale(Math.min(vw / canvas.w, vh / canvas.h));
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [canvas]);

  // Fonts before first paint: a canvas never triggers a font load by itself and
  // a swap mid-reveal looks broken on a wall. Bounded so an offline rig still paints.
  useEffect(() => {
    let cancelled = false;
    const loads = Promise.all(FONTS.map((font) => document.fonts.load(font).catch(() => [])));
    const timeout = new Promise((resolve) => setTimeout(resolve, 2000));
    Promise.race([loads, timeout]).then(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <StageContext.Provider value={{ preview, bg, canvas: size }}>
      {/* Unlayered, so it beats the `@layer base` body background while a stage is mounted */}
      <style>{`html,body{background:transparent!important;margin:0;overflow:hidden}`}</style>
      <MotionConfig reducedMotion="never">
        <LazyMotion strict features={domAnimation}>
          <div
            className="fixed inset-0 overflow-hidden"
            style={{ background: bg === "black" ? BRAND.black : "transparent" }}
          >
            <div
              className="absolute top-1/2 left-1/2 overflow-hidden font-display text-[#FBF5E7]"
              style={{ height: size.h, width: size.w, transform: `translate(-50%, -50%) scale(${scale})` }}
            >
              {ready && children}
            </div>
          </div>
        </LazyMotion>
      </MotionConfig>
    </StageContext.Provider>
  );
}

/**
 * Per-frame callback on motion's shared frameloop. `dt` is clamped so a
 * throttled tab (CEF, background) catches up instead of teleporting physics;
 * previews run at ~15 fps to keep a grid of thumbnails cheap.
 */
export function useStageFrame(callback: (t: number, dt: number) => void) {
  const { preview } = useContext(StageContext);
  const callbackRef = useRef(callback);
  callbackRef.current = callback;
  const last = useRef(0);

  useAnimationFrame(
    useCallback(
      (t: number) => {
        const elapsed = t - last.current;
        if (preview && elapsed < 66) return;
        callbackRef.current(t, Math.min(last.current ? elapsed : 16, 100));
        last.current = t;
      },
      [preview]
    )
  );
}

// ---------------------------------------------------------------------------
// Shared visual vocabulary
// ---------------------------------------------------------------------------

const TRI_RIGHT = "3,3 97,50 3,97";
const TRI_CORNER = "97,3 97,97 3,97";

function Triangle({ fill, points }: { fill: string; points: string }) {
  return (
    <svg aria-hidden="true" className="h-full w-full" viewBox="0 0 100 100">
      <polygon fill={fill} points={points} />
    </svg>
  );
}

function HalfCircle({ fill }: { fill: string }) {
  return (
    <svg aria-hidden="true" className="h-full w-full" viewBox="0 0 100 50">
      <path d="M0 50 A50 50 0 0 1 100 50 Z" fill={fill} />
    </svg>
  );
}

function Shape({ wrap, delay, drift, children }: { wrap: string; delay: number; drift: boolean; children: ReactNode }) {
  return (
    <span className={`absolute ${wrap}`}>
      <span className="block h-full w-full animate-assemble" style={{ animationDelay: `${delay}s` }}>
        <span
          className={`block h-full w-full ${drift ? "animate-drift" : ""}`}
          style={{ animationDelay: `${delay + 0.3}s` }}
        >
          {children}
        </span>
      </span>
    </span>
  );
}

/**
 * The brand geometry from /conf at wall scale: assembles in, then drifts.
 * Off when the stage is transparent (overlay use).
 */
export function Ambient() {
  const { bg } = useContext(StageContext);
  if (bg === "transparent") return null;

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <Shape delay={0.1} drift wrap="-right-[150px] -top-[170px] h-[520px] w-[520px]">
        <div className="h-full w-full rounded-full bg-[#F5BB03]" />
      </Shape>
      <Shape delay={0.18} drift wrap="-left-[40px] top-[300px] h-[340px] w-[340px]">
        <Triangle fill={BRAND.blue} points={TRI_RIGHT} />
      </Shape>
      {/* Hangs from the top edge: the bottom band stays clear for captions */}
      <Shape delay={0.5} drift={false} wrap="left-[380px] top-0 h-[120px] w-[260px] rotate-180">
        <HalfCircle fill={BRAND.yellow} />
      </Shape>
      <Shape delay={0.26} drift wrap="-bottom-[30px] -right-[20px] h-[300px] w-[300px]">
        <Triangle fill={BRAND.yellow} points={TRI_CORNER} />
      </Shape>
    </div>
  );
}

/** Notched OWU flag, the accent used on captions and cards. */
export function Flag({ fill, className }: { fill: string; className?: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 100 100">
      <polygon fill={fill} points="0,0 100,0 100,100 50,72 0,100" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Caption (lower third) — used by the face scene transcripts and the caption effect
// ---------------------------------------------------------------------------

export function useTyped(text: string) {
  const [count, setCount] = useState(0);
  const previous = useRef("");
  useEffect(() => {
    // A transcript that keeps growing continues typing; a different text restarts.
    if (!text.startsWith(previous.current)) setCount(0);
    previous.current = text;
    // A whole pitch arrives at once: type it faster than a caption so it does not drag for 12 s.
    const step = text.length > 400 ? 5 : 2;
    const id = setInterval(() => setCount((n) => (n >= text.length ? n : n + step)), 16);
    return () => clearInterval(id);
  }, [text]);

  return text.slice(0, Math.min(count, text.length));
}

export function Caption({ text, who = "output" }: { text: string; who?: "input" | "output" }) {
  const { bg } = useContext(StageContext);
  const typed = useTyped(text);
  const accent = who === "input" ? BRAND.blue : BRAND.yellow;

  return (
    <m.div
      animate={{ y: 0, opacity: 1 }}
      className="absolute right-[120px] bottom-[64px] left-[120px] flex items-start gap-8"
      exit={{ y: 24, opacity: 0, transition: { duration: 0.35, ease: "easeIn" } }}
      initial={{ y: 40, opacity: 0 }}
      transition={{ duration: 0.55, ease: EASE_OUT }}
    >
      <Flag className="mt-2 h-[64px] w-[64px] shrink-0" fill={accent} />
      <p
        className="text-[46px] leading-[1.15] font-bold tracking-[-0.01em] text-balance text-[#FBF5E7]"
        style={bg === "transparent" ? { textShadow: "0 2px 24px rgba(0,0,0,0.85)" } : undefined}
      >
        {who === "input" && <span className="mr-4 text-[#0162C8]">›</span>}
        {typed}
      </p>
    </m.div>
  );
}

// ---------------------------------------------------------------------------
// Wipe — the brand stinger between scenes (blue leads, yellow reveals)
// ---------------------------------------------------------------------------

export const WIPE_MS = 900;
/** The bands fully cover the frame from ~450 ms; scenes swap here. */
export const WIPE_MID_MS = 450;

const BAND = "absolute -left-[50%] top-0 h-full w-[200%] [clip-path:polygon(0_0,88%_0,100%_100%,12%_100%)]";

const sweep = (delay: number) => ({
  initial: { x: "-100%" },
  animate: { x: ["-100%", "0%", "0%", "100%"] },
  transition: { duration: WIPE_MS / 1000, delay, times: [0, 0.4, 0.6, 1], ease: "easeInOut" as const },
});

export function Wipe({ onDone }: { onDone: () => void }) {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <m.div className={`${BAND} bg-[#0162C8]`} {...sweep(0)} />
      <m.div className={`${BAND} bg-[#F5BB03]`} {...sweep(0.09)} onAnimationComplete={onDone} />
    </div>
  );
}
