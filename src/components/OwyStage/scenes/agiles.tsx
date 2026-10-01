"use client";

import { useContext, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { m } from "motion/react";

import { EASE_OUT } from "app/conf/components/Reveal";
import type { SceneProps } from "lib/owy-stage/scenes";

import { StageContext, useCanvas } from "../Stage";
import { QrCode } from "./parts";
import { secondsUntil, useNow } from "./useful";

/**
 * Ágiles Uruguay 2026 — the host's brand, not OWU's.
 *
 * From their lineamientos de diseño: #0B192C background, #FCFCFC text, yellow
 * #FFE15A as the one highlight over the dark background, the four secondary
 * accents, Poppins (bold/extrabold) for titles and Open Sans (semibold) for
 * body, and the rule that nothing should compete with the identity — hence the
 * restraint: a dimmed rambla photo, a neon skyline and the three bars, nothing
 * else. OWU's geometry (Ambient) is deliberately absent from these scenes.
 *
 * The wall at UCU is 3584×960 (56:15), so these scenes lay themselves out from
 * the stage canvas instead of fixed 1920×1080 coordinates: sizes scale with `u`
 * (canvas height ÷ 1080) and anything that would leave a strip half empty
 * splits into two columns when `wide` is true.
 */
export const AGILES = {
  navy: "#0B192C",
  cream: "#FCFCFC",
  yellow: "#FFE15A",
  blue: "#3598D4",
  teal: "#12B09F",
  pink: "#E81D5D",
  salmon: "#F18C6A",
} as const;

/** The accent order used across the brand: teal, pink, salmon. */
export const ACCENTS = [AGILES.teal, AGILES.pink, AGILES.salmon] as const;

const BODY = "font-['Open_Sans']";

/**
 * Type on a strip is sized against the canvas height, not the 1080 baseline:
 * at 960 px tall and 3584 wide, 1080-scaled text reads tiny from the back of
 * the room. `hero`/`body` return the strip size when the wall is wide.
 */
function useType() {
  const { h, u, wide } = useCanvas();

  return {
    /** Big display text: `ratio` is a fraction of the canvas height. */
    hero: (standard: number, ratio: number) => Math.round(wide ? h * ratio : standard * u),
    px: (size: number) => Math.round(size * u),
  };
}

/** Padding that keeps content off the bezel on both shapes. */
function usePad() {
  const { w, h, u, wide } = useCanvas();

  return { x: Math.round(wide ? w * 0.045 : 120 * u), y: Math.round(h * (wide ? 0.085 : 0.09)) };
}

export function Bars({ width = 150, className = "" }: { width?: number; className?: string }) {
  const { u } = useCanvas();

  return (
    <span className={`flex ${className}`} style={{ gap: Math.round(18 * u) }}>
      {ACCENTS.map((color, i) => (
        <m.span
          key={color}
          animate={{ scaleX: 1 }}
          className="block origin-left rounded-full"
          initial={{ scaleX: 0 }}
          style={{ width: Math.round(width * u), height: Math.round(10 * u), background: color }}
          transition={{ duration: 0.5, delay: 0.3 + i * 0.08, ease: EASE_OUT }}
        />
      ))}
    </span>
  );
}

/** The neon city line from the brand deck, drawn to the canvas width so a strip is not stretched. */
function Skyline() {
  const { w, h } = useCanvas();
  const buildings = useMemo(() => {
    // Deterministic: the wall must look the same on every reload.
    let seed = 7;
    const random = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    let x = -40;
    const out: { x: number; width: number; height: number }[] = [];
    while (x < w + 80) {
      const width = 48 + random() * 90;
      const height = 60 + random() * random() * 320;
      out.push({ x, width, height });
      x += width + 10 + random() * 26;
    }

    return out;
  }, [w]);

  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 bottom-0 w-full opacity-80"
      height={Math.round(h * 0.39)}
      style={{ filter: `drop-shadow(0 0 10px ${AGILES.blue}80)` }}
      viewBox={`0 0 ${w} 420`}
    >
      <defs>
        <linearGradient id="agiles-sky" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={AGILES.blue} stopOpacity="1" />
          <stop offset="100%" stopColor={AGILES.blue} stopOpacity="0.18" />
        </linearGradient>
      </defs>
      <g fill="none" stroke="url(#agiles-sky)" strokeWidth="2">
        {buildings.map((building) => (
          <g key={building.x}>
            <rect height={building.height} width={building.width} x={building.x} y={420 - building.height} />
            {Array.from({ length: Math.floor(building.height / 46) }, (_, row) => (
              <line
                key={row}
                strokeOpacity="0.5"
                x1={building.x + 8}
                x2={building.x + building.width - 8}
                y1={420 - building.height + 28 + row * 46}
                y2={420 - building.height + 28 + row * 46}
              />
            ))}
          </g>
        ))}
      </g>
      <line stroke={AGILES.blue} strokeOpacity="0.5" strokeWidth="2" x1="0" x2={w} y1="419" y2="419" />
    </svg>
  );
}

/**
 * The pinwheel from the mark, rebuilt as SVG so it can move: five blades
 * between an outer and an inner pentagon, the inner one twisted, which is what
 * gives the iris. Used big and dim as ambient motion — the wordmark itself
 * stays the original artwork, so the identity is never an approximation.
 */
export function AgilesMark({
  className = "",
  style,
  spin = 70,
  reverse = false,
  opacity = 1,
}: {
  className?: string;
  style?: CSSProperties;
  /** Seconds per full turn. */
  spin?: number;
  reverse?: boolean;
  opacity?: number;
}) {
  const blades = useMemo(() => {
    const R = 40;
    const INNER = 0.52;
    const TWIST = 0.62;
    const step = (2 * Math.PI) / 5;
    const point = (angle: number, radius: number) => [50 + radius * Math.cos(angle), 50 + radius * Math.sin(angle)];

    return [AGILES.cream, AGILES.blue, AGILES.salmon, AGILES.teal, AGILES.pink].map((color, i) => {
      const a0 = -Math.PI / 2 + i * step;
      const a1 = a0 + step;
      const points = [point(a0, R), point(a1, R), point(a1 + TWIST, R * INNER), point(a0 + TWIST, R * INNER)];

      return {
        color,
        d: `${points.map(([x, y], k) => `${k ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)}`).join(" ")} Z`,
      };
    });
  }, []);

  return (
    <svg aria-hidden="true" className={className} style={{ opacity, ...style }} viewBox="0 0 100 100">
      <m.g
        animate={{ rotate: reverse ? -360 : 360 }}
        style={{ originX: "50px", originY: "50px" }}
        transition={{ duration: spin, repeat: Infinity, ease: "linear" }}
      >
        {blades.map((blade, i) => (
          <m.path
            key={blade.color}
            animate={{ opacity: [0.75, 1, 0.75] }}
            d={blade.d}
            fill={blade.color}
            stroke={blade.color}
            strokeLinejoin="round"
            strokeWidth={7}
            transition={{ duration: 6, delay: i * 0.5, repeat: Infinity, ease: "easeInOut" }}
          />
        ))}
      </m.g>
    </svg>
  );
}

/** Two marks drifting behind the content: slow, dim, never competing with the logo. */
export function AmbientMarks() {
  const { w, h } = useCanvas();

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden"
      style={{ mixBlendMode: "soft-light" }}
    >
      <AgilesMark
        className="absolute"
        opacity={0.35}
        spin={90}
        style={{ width: h * 0.85, height: h * 0.85, right: -h * 0.3, top: -h * 0.3 }}
      />
      <AgilesMark
        className="absolute"
        opacity={0.26}
        reverse
        spin={120}
        style={{ width: h * 0.6, height: h * 0.6, left: w * 0.03, bottom: -h * 0.3 }}
      />
    </div>
  );
}

/**
 * The logo as it ships, plus the two things that make it feel alive on a wall:
 * it breathes, and a light sweeps across the letterforms every few seconds
 * (the sweep is masked by the artwork itself, so only the logo catches it).
 */
export function AnimatedLogo({ width, className = "" }: { width: number; className?: string }) {
  const { u } = useCanvas();
  const size = Math.round(width * u);

  return (
    <m.div
      animate={{ scale: [1, 1.015, 1], y: [0, -size * 0.008, 0] }}
      className={`relative ${className}`}
      style={{ width: size }}
      transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
    >
      <m.img
        alt="Ágiles Uruguay"
        animate={{
          clipPath: "inset(0 0% 0 0)",
          opacity: 1,
          // A white logo on navy cannot get whiter: the glint is light around it.
          filter: [
            "drop-shadow(0 0 0px rgba(255,225,90,0))",
            `drop-shadow(0 0 ${Math.round(size * 0.035)}px rgba(255,225,90,0.45))`,
            "drop-shadow(0 0 0px rgba(255,225,90,0))",
          ],
        }}
        className="w-full"
        initial={{ clipPath: "inset(0 100% 0 0)", opacity: 0.4 }}
        src="/agiles/logo.png"
        transition={{
          clipPath: { duration: 1.1, ease: EASE_OUT },
          opacity: { duration: 1.1, ease: EASE_OUT },
          filter: { duration: 7, repeat: Infinity, ease: "easeInOut", delay: 1.2 },
        }}
      />
    </m.div>
  );
}

export function AgilesLogo({
  width = 340,
  className = "",
  style,
}: {
  width?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const { u } = useCanvas();

  return (
    <img
      alt="Ágiles Uruguay"
      className={className}
      src="/agiles/logo.png"
      style={{ width: Math.round(width * u), ...style }}
    />
  );
}

/**
 * Every Ágiles scene sits in this frame: navy, optional rambla photo, the neon
 * skyline, and a padded column for the content. `plain` drops the skyline when
 * the content already fills the lower half.
 */
export function AgilesFrame({
  children,
  photo = false,
  plain = false,
  logo = true,
  center = false,
}: {
  children: ReactNode;
  photo?: boolean;
  plain?: boolean;
  logo?: boolean;
  center?: boolean;
}) {
  const { bg } = useContext(StageContext);
  const { wide } = useCanvas();
  const pad = usePad();
  const transparent = bg === "transparent";

  return (
    <div className={`absolute inset-0 overflow-hidden ${BODY}`} style={{ color: AGILES.cream }}>
      {!transparent && <div className="absolute inset-0" style={{ background: AGILES.navy }} />}
      {!transparent && photo && (
        <>
          <m.img
            alt=""
            animate={{ scale: 1.08 }}
            className="absolute inset-0 h-full w-full object-cover"
            initial={{ scale: 1 }}
            src="/agiles/bg.jpg"
            style={{ objectPosition: wide ? "62% 46%" : "70% 40%" }}
            transition={{ duration: 40, ease: "linear" }}
          />
          <div
            className="absolute inset-0"
            style={{
              background: `linear-gradient(100deg, ${AGILES.navy} 22%, ${AGILES.navy}e6 46%, ${AGILES.navy}8c 100%)`,
            }}
          />
        </>
      )}
      {!transparent && !plain && !photo && <Skyline />}
      <div
        className={`absolute inset-0 flex flex-col ${center ? "items-center justify-center text-center" : ""}`}
        style={{ padding: `${pad.y}px ${pad.x}px` }}
      >
        {children}
      </div>
      {logo && !transparent && (
        <AgilesLogo className="absolute opacity-90" style={{ right: pad.x, bottom: Math.round(pad.y * 0.75) }} />
      )}
    </div>
  );
}

export function AgilesHeader({ eyebrow, title }: { eyebrow?: string; title: string }) {
  const { u, wide } = useCanvas();
  const { hero } = useType();

  return (
    <header className="flex w-full shrink-0 items-start justify-between" style={{ gap: Math.round(60 * u) }}>
      <div className="min-w-0">
        {eyebrow && (
          <m.p
            animate={{ opacity: 1, y: 0 }}
            className={`font-semibold tracking-[0.34em] uppercase ${BODY}`}
            initial={{ opacity: 0, y: 16 }}
            style={{ color: AGILES.yellow, fontSize: Math.round(26 * u) }}
            transition={{ duration: 0.5, ease: EASE_OUT }}
          >
            {eyebrow}
          </m.p>
        )}
        <m.h1
          animate={{ opacity: 1, y: 0 }}
          className="font-display leading-[0.95] font-extrabold tracking-[-0.02em] text-balance uppercase"
          initial={{ opacity: 0, y: 24 }}
          style={{
            fontSize: hero(title.length > 26 ? 82 : 104, title.length > 26 ? 0.11 : 0.135),
            marginTop: Math.round(12 * u),
          }}
          transition={{ duration: 0.6, delay: 0.08, ease: EASE_OUT }}
        >
          {title}
        </m.h1>
        <Bars className="mt-[2%]" />
      </div>
      <AgilesLogo className="shrink-0 opacity-85" width={wide ? 320 : 300} />
    </header>
  );
}

/** A card with the coloured top bar and the 01/02/03 index from the brand deck. */
export function AgilesCard({
  index,
  title,
  text,
  delay = 0,
  className = "",
}: {
  index: number;
  title: string;
  text?: string;
  delay?: number;
  className?: string;
}) {
  const { u } = useCanvas();
  const { hero } = useType();
  const color = ACCENTS[index % ACCENTS.length];

  return (
    <m.article
      animate={{ opacity: 1, y: 0 }}
      className={`relative flex flex-col overflow-hidden bg-white/[0.045] ${className}`}
      initial={{ opacity: 0, y: 28 }}
      style={{ borderRadius: Math.round(18 * u) }}
      transition={{ duration: 0.6, delay, ease: EASE_OUT }}
    >
      <span className="block w-full" style={{ height: Math.round(10 * u), background: color }} />
      <div
        className="flex flex-1 flex-col justify-center"
        style={{ gap: Math.round(14 * u), padding: `${Math.round(32 * u)}px ${Math.round(40 * u)}px` }}
      >
        <span className={`font-bold ${BODY}`} style={{ color, fontSize: Math.round(26 * u) }}>
          {String(index + 1).padStart(2, "0")}
        </span>
        <h3 className="font-display leading-[1.05] font-extrabold uppercase" style={{ fontSize: hero(44, 0.072) }}>
          {title}
        </h3>
        {text && (
          <p className={`text-white/75 ${BODY}`} style={{ fontSize: hero(30, 0.045), lineHeight: 1.35 }}>
            {text}
          </p>
        )}
      </div>
    </m.article>
  );
}

export function Hashtag({ text, size = 34, className = "" }: { text: string; size?: number; className?: string }) {
  const { u } = useCanvas();

  return (
    <span
      className={`font-display font-extrabold tracking-[0.12em] ${className}`}
      style={{ color: AGILES.yellow, fontSize: Math.round(size * u) }}
    >
      {text}
    </span>
  );
}

const splitList = (value: string) =>
  value
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);

// ---------------------------------------------------------------------------
// Portada
// ---------------------------------------------------------------------------

export function AgilesCover({ params }: SceneProps<"agiles-logo">) {
  const { w, u, wide } = useCanvas();

  return (
    <AgilesFrame center logo={false} photo={params.photo}>
      {!params.photo && <Skyline />}
      <AmbientMarks />
      <AnimatedLogo width={wide ? (w * 0.4) / u : 1180} />
      <m.div
        animate={{ opacity: 1 }}
        className="flex items-center"
        initial={{ opacity: 0 }}
        style={{ marginTop: Math.round(60 * u), gap: Math.round(46 * u) }}
        transition={{ duration: 0.8, delay: 0.5, ease: EASE_OUT }}
      >
        <span
          className={`font-semibold tracking-[0.08em] text-white/85 ${BODY}`}
          style={{ fontSize: Math.round(40 * u) }}
        >
          {params.date}
        </span>
        <span className="bg-white/25" style={{ height: Math.round(44 * u), width: 2 }} />
        <Hashtag size={40} text={params.hashtag} />
      </m.div>
    </AgilesFrame>
  );
}

// ---------------------------------------------------------------------------
// Bienvenida
// ---------------------------------------------------------------------------

export function AgilesWelcome({ params }: SceneProps<"agiles-welcome">) {
  const { u, wide } = useCanvas();
  const { hero } = useType();
  const facts = [
    params.venue && { label: "Sede", value: params.venue },
    params.wifi && { label: "Wifi", value: params.wifi },
  ].filter((fact): fact is { label: string; value: string } => Boolean(fact));

  return (
    <AgilesFrame photo>
      <div
        className={`flex flex-1 ${wide ? "flex-row items-center" : "flex-col justify-center"}`}
        style={{ gap: "6%" }}
      >
        <div className={wide ? "flex-[1.5]" : ""}>
          <m.h1
            animate={{ opacity: 1, y: 0 }}
            className="font-display leading-[0.94] font-extrabold tracking-[-0.03em] text-balance uppercase"
            initial={{ opacity: 0, y: 30 }}
            style={{ fontSize: hero(118, 0.19) }}
            transition={{ duration: 0.7, ease: EASE_OUT }}
          >
            {params.title}
          </m.h1>
          <Bars className="mt-[3%]" width={190} />
          <m.p
            animate={{ opacity: 1, y: 0 }}
            className={`text-white/80 ${BODY}`}
            initial={{ opacity: 0, y: 20 }}
            style={{ fontSize: hero(42, 0.055), lineHeight: 1.3, marginTop: Math.round(40 * u) }}
            transition={{ duration: 0.7, delay: 0.3, ease: EASE_OUT }}
          >
            {params.subtitle}
          </m.p>
        </div>
        {facts.length > 0 && (
          <div
            className={`flex ${wide ? "flex-1 flex-col" : "flex-row"}`}
            style={{ gap: Math.round((wide ? 40 : 90) * u), marginTop: wide ? 0 : Math.round(56 * u) }}
          >
            {facts.map((fact, i) => (
              <m.div
                key={fact.label}
                animate={{ opacity: 1, y: 0 }}
                initial={{ opacity: 0, y: 18 }}
                transition={{ duration: 0.6, delay: 0.5 + i * 0.1, ease: EASE_OUT }}
              >
                <p
                  className={`font-bold tracking-[0.3em] uppercase ${BODY}`}
                  style={{ color: ACCENTS[i % ACCENTS.length], fontSize: Math.round(22 * u) }}
                >
                  {fact.label}
                </p>
                <p
                  className={`font-semibold ${BODY}`}
                  style={{ fontSize: Math.round(34 * u), marginTop: Math.round(8 * u) }}
                >
                  {fact.value}
                </p>
              </m.div>
            ))}
          </div>
        )}
      </div>
      <Hashtag className="shrink-0" text={params.hashtag} />
    </AgilesFrame>
  );
}

// ---------------------------------------------------------------------------
// Programa
// ---------------------------------------------------------------------------

type AgendaItem = { start: string; end: string; title: string; detail: string };

/** `HH:MM[-HH:MM] Título :: Descripción`, items separated by `|` — the agenda as the flyer reads it. */
function parseAgenda(items: string): AgendaItem[] {
  return items
    .split("|")
    .map((raw) => raw.trim())
    .map((raw) => raw.match(/^(\d{1,2}:\d{2})(?:\s*[-–]\s*(\d{1,2}:\d{2}))?\s+(.+)$/))
    .filter((match): match is RegExpMatchArray => match !== null)
    .map((match) => {
      const [title, ...rest] = match[3].split("::");

      return {
        start: match[1].padStart(5, "0"),
        end: match[2] ? match[2].padStart(5, "0") : "",
        title: title.trim(),
        detail: rest.join("::").trim(),
      };
    })
    .sort((a, b) => a.start.localeCompare(b.start));
}

function useAgenda(items: string) {
  const now = useNow(15_000);
  const agenda = useMemo(() => parseAgenda(items), [items]);
  // The block running now: the last one that started, unless it already ended.
  let current = -1;
  agenda.forEach((item, i) => {
    if (item.start <= now) current = i;
  });
  if (current >= 0 && agenda[current].end && now >= agenda[current].end) {
    const next = agenda.findIndex((item) => item.start > now);
    if (next >= 0) current = -1;
  }

  return { now, agenda, current };
}

/** The flyer's pill colours, cycling. */
const PILLS = [AGILES.blue, AGILES.teal, AGILES.pink, AGILES.salmon] as const;

export function AgilesProgram({ params }: SceneProps<"agiles-program">) {
  const { u, wide } = useCanvas();
  const { hero } = useType();
  const { now, agenda, current } = useAgenda(params.items);
  const visible = agenda.slice(0, 10);
  // The flyer has seven blocks; if the operator adds more, the rows shrink to fit the wall.
  const fit = Math.min(1, 7 / Math.max(visible.length, 1));

  return (
    <AgilesFrame logo={false} plain>
      <AgilesHeader eyebrow={`Ágiles Uruguay · ${now}`} title={params.title} />
      <ul
        className="flex flex-1 flex-col justify-between"
        style={{ gap: Math.round(8 * u * fit), marginTop: Math.round(24 * u) }}
      >
        {visible.map((item, i) => {
          const isNow = i === current;
          const past = current >= 0 ? i < current : Boolean(item.end) && item.end <= now;
          const pill = isNow ? AGILES.yellow : PILLS[i % PILLS.length];

          return (
            <m.li
              key={`${item.start}-${item.title}`}
              animate={{ opacity: past ? 0.4 : 1, x: 0 }}
              className="flex items-center"
              initial={{ opacity: 0, x: -24 }}
              style={{
                gap: Math.round(26 * u * fit),
                padding: `${Math.round(6 * u * fit)}px ${Math.round(14 * u)}px`,
                borderRadius: Math.round(16 * u),
                background: isNow ? "rgba(255,225,90,0.1)" : "transparent",
              }}
              transition={{ duration: 0.5, delay: 0.2 + i * 0.05, ease: EASE_OUT }}
            >
              <span
                className="font-display shrink-0 text-center font-extrabold tabular-nums"
                style={{
                  width: Math.round((wide ? 320 : 290) * u * fit),
                  padding: `${Math.round(11 * u * fit)}px 0`,
                  borderRadius: Math.round(999 * u),
                  background: pill,
                  color: AGILES.navy,
                  fontSize: hero(34 * fit, 0.036 * fit),
                }}
              >
                {item.end ? `${item.start} - ${item.end}` : item.start}
              </span>
              <span
                className="font-display shrink-0 truncate leading-tight font-extrabold uppercase"
                style={{ width: Math.round((wide ? 880 : 540) * u * fit), fontSize: hero(36 * fit, 0.045 * fit) }}
              >
                {item.title}
              </span>
              <span
                className={`min-w-0 flex-1 truncate leading-tight ${BODY}`}
                style={{
                  fontSize: hero(30 * fit, 0.036 * fit),
                  color: isNow ? AGILES.cream : "rgba(252,252,252,0.72)",
                }}
              >
                {item.detail}
              </span>
              {isNow && (
                <span
                  className="font-display shrink-0 rounded-full font-extrabold tracking-[0.2em] uppercase"
                  style={{
                    background: AGILES.yellow,
                    color: AGILES.navy,
                    fontSize: Math.round(22 * u),
                    padding: `${Math.round(6 * u)}px ${Math.round(20 * u)}px`,
                  }}
                >
                  Ahora
                </span>
              )}
            </m.li>
          );
        })}
      </ul>
    </AgilesFrame>
  );
}

// ---------------------------------------------------------------------------
// Ahora / a continuación
// ---------------------------------------------------------------------------

export function AgilesNow({ params }: SceneProps<"agiles-now">) {
  const { u, wide } = useCanvas();
  const { hero } = useType();
  const { now, agenda, current } = useAgenda(params.items);
  const running = agenda[current];
  const next = agenda.find((item) => item.start > now);

  return (
    <AgilesFrame photo>
      <div
        className={`flex flex-1 ${wide ? "flex-row items-center" : "flex-col justify-center"}`}
        style={{ gap: "5%" }}
      >
        <div className={wide ? "flex-[1.6]" : ""}>
          <p
            className={`font-bold tracking-[0.34em] uppercase ${BODY}`}
            style={{ color: AGILES.yellow, fontSize: Math.round(28 * u) }}
          >
            Ahora · {running?.end ? `${running.start} - ${running.end}` : now}
          </p>
          <m.h1
            key={running?.title ?? "none"}
            animate={{ opacity: 1, y: 0 }}
            className="font-display leading-[0.95] font-extrabold tracking-[-0.02em] text-balance uppercase"
            initial={{ opacity: 0, y: 26 }}
            style={{ fontSize: hero(112, 0.2), marginTop: Math.round(20 * u) }}
            transition={{ duration: 0.6, ease: EASE_OUT }}
          >
            {running?.title ?? "Nos estamos acomodando"}
          </m.h1>
          {running?.detail && (
            <p
              className={`text-white/75 ${BODY}`}
              style={{ fontSize: hero(42, 0.055), lineHeight: 1.25, marginTop: Math.round(22 * u) }}
            >
              {running.detail}
            </p>
          )}
          <Bars className="mt-[3%]" width={190} />
        </div>
        {next && (
          <m.div
            animate={{ opacity: 1, y: 0 }}
            className={wide ? "flex-1 border-l border-white/15" : ""}
            initial={{ opacity: 0, y: 20 }}
            style={{ paddingLeft: wide ? Math.round(60 * u) : 0, marginTop: wide ? 0 : Math.round(70 * u) }}
            transition={{ duration: 0.6, delay: 0.35, ease: EASE_OUT }}
          >
            <p
              className={`font-bold tracking-[0.3em] text-white/55 uppercase ${BODY}`}
              style={{ fontSize: Math.round(24 * u) }}
            >
              A continuación
            </p>
            <div className={wide ? "" : "flex items-baseline"} style={{ gap: Math.round(28 * u) }}>
              <p
                className="font-display font-extrabold tabular-nums"
                style={{ color: AGILES.teal, fontSize: hero(62, 0.115), marginTop: Math.round(12 * u) }}
              >
                {next.start}
              </p>
              <p
                className={`font-semibold ${BODY}`}
                style={{ fontSize: hero(48, 0.07), lineHeight: 1.15, marginTop: wide ? Math.round(10 * u) : 0 }}
              >
                {next.title}
              </p>
            </div>
          </m.div>
        )}
      </div>
    </AgilesFrame>
  );
}

// ---------------------------------------------------------------------------
// Quién habla
// ---------------------------------------------------------------------------

export function AgilesSpeaker({ params }: SceneProps<"agiles-speaker">) {
  const { bg } = useContext(StageContext);
  const { u, wide } = useCanvas();
  const { hero } = useType();
  const pad = usePad();
  const meta = [params.time, params.room].filter(Boolean).join(" · ");

  // With ?bg=transparent this doubles as the lower third over the camera.
  if (bg === "transparent") {
    return (
      <div className={`absolute ${BODY}`} style={{ left: pad.x, bottom: pad.y, maxWidth: "70%" }}>
        <m.div
          animate={{ opacity: 1, x: 0 }}
          initial={{ opacity: 0, x: -30 }}
          style={{
            background: `${AGILES.navy}f2`,
            color: AGILES.cream,
            borderRadius: Math.round(18 * u),
            padding: `${Math.round(32 * u)}px ${Math.round(48 * u)}px`,
          }}
          transition={{ duration: 0.6, ease: EASE_OUT }}
        >
          <Bars width={110} />
          <p
            className="font-display leading-none font-extrabold uppercase"
            style={{ fontSize: Math.round(64 * u), marginTop: Math.round(20 * u) }}
          >
            {params.name}
          </p>
          <p
            className={`font-semibold text-white/75 ${BODY}`}
            style={{ fontSize: Math.round(34 * u), marginTop: Math.round(12 * u) }}
          >
            {params.talk}
          </p>
        </m.div>
      </div>
    );
  }

  return (
    <AgilesFrame>
      <div
        className={`flex flex-1 ${wide ? "flex-row items-center" : "flex-col justify-center"}`}
        style={{ gap: "5%" }}
      >
        <div className={wide ? "flex-1" : ""}>
          <m.p
            animate={{ opacity: 1, y: 0 }}
            className={`font-bold tracking-[0.34em] uppercase ${BODY}`}
            initial={{ opacity: 0, y: 14 }}
            style={{ color: AGILES.yellow, fontSize: Math.round(26 * u) }}
            transition={{ duration: 0.5, ease: EASE_OUT }}
          >
            {meta || "En el escenario"}
          </m.p>
          <m.h1
            animate={{ opacity: 1, y: 0 }}
            className="font-display leading-[0.94] font-extrabold tracking-[-0.03em] uppercase"
            initial={{ opacity: 0, y: 26 }}
            style={{ fontSize: hero(116, 0.175), marginTop: Math.round(18 * u) }}
            transition={{ duration: 0.6, delay: 0.08, ease: EASE_OUT }}
          >
            {params.name}
          </m.h1>
          {params.role && (
            <m.p
              animate={{ opacity: 1, y: 0 }}
              className={`font-semibold text-white/70 ${BODY}`}
              initial={{ opacity: 0, y: 18 }}
              style={{ fontSize: hero(38, 0.05), marginTop: Math.round(16 * u) }}
              transition={{ duration: 0.6, delay: 0.2, ease: EASE_OUT }}
            >
              {params.role}
            </m.p>
          )}
          <Bars className="mt-[3%]" width={190} />
        </div>
        <m.p
          animate={{ opacity: 1, y: 0 }}
          className={`text-balance ${wide ? "flex-1 border-l border-white/15" : ""} ${BODY}`}
          initial={{ opacity: 0, y: 22 }}
          style={{
            fontSize: hero(58, 0.085),
            lineHeight: 1.15,
            paddingLeft: wide ? Math.round(60 * u) : 0,
            marginTop: wide ? 0 : Math.round(48 * u),
          }}
          transition={{ duration: 0.7, delay: 0.32, ease: EASE_OUT }}
        >
          {params.talk}
        </m.p>
      </div>
    </AgilesFrame>
  );
}

// ---------------------------------------------------------------------------
// Pausa
// ---------------------------------------------------------------------------

export function AgilesBreak({ params }: SceneProps<"agiles-break">) {
  const { h, u, wide } = useCanvas();
  useNow(1000);
  const left = Math.max(0, secondsUntil(params.until));
  const minutes = String(Math.floor(left / 60)).padStart(2, "0");
  const seconds = String(left % 60).padStart(2, "0");

  return (
    <AgilesFrame center>
      <AmbientMarks />
      <p
        className={`font-bold tracking-[0.34em] uppercase ${BODY}`}
        style={{ color: AGILES.yellow, fontSize: Math.round(34 * u) }}
      >
        {params.title}
      </p>
      <p
        className="font-display leading-none font-extrabold tabular-nums"
        style={{ fontSize: Math.round(h * (wide ? 0.42 : 0.28)), marginTop: Math.round(20 * u) }}
      >
        {minutes}:{seconds}
      </p>
      <Bars className="mt-[2%] justify-center" width={210} />
      <p
        className={`font-semibold text-white/75 ${BODY}`}
        style={{ fontSize: Math.round(42 * u), marginTop: Math.round(40 * u) }}
      >
        {params.note}
      </p>
      <p className={`text-white/45 ${BODY}`} style={{ fontSize: Math.round(30 * u), marginTop: Math.round(12 * u) }}>
        Volvemos a las {params.until}
      </p>
    </AgilesFrame>
  );
}

// ---------------------------------------------------------------------------
// Aviso
// ---------------------------------------------------------------------------

export function AgilesMessage({ params }: SceneProps<"agiles-message">) {
  const { u, wide } = useCanvas();
  const { hero } = useType();
  const split = wide && Boolean(params.text);

  return (
    <AgilesFrame plain>
      <div
        className={`flex flex-1 ${split ? "flex-row items-center" : "flex-col justify-center"}`}
        style={{ gap: "6%" }}
      >
        <div className={split ? "flex-[1.4]" : ""}>
          <m.p
            animate={{ opacity: 1, y: 0 }}
            className={`font-bold tracking-[0.34em] uppercase ${BODY}`}
            initial={{ opacity: 0, y: 14 }}
            style={{ color: AGILES.yellow, fontSize: Math.round(30 * u) }}
            transition={{ duration: 0.5, ease: EASE_OUT }}
          >
            {params.eyebrow}
          </m.p>
          <m.h1
            animate={{ opacity: 1, y: 0 }}
            className="font-display leading-[0.95] font-extrabold tracking-[-0.03em] text-balance uppercase"
            initial={{ opacity: 0, y: 28 }}
            style={{ fontSize: hero(110, 0.18), marginTop: Math.round(24 * u) }}
            transition={{ duration: 0.7, delay: 0.1, ease: EASE_OUT }}
          >
            {params.title}
          </m.h1>
          <Bars className="mt-[3%]" width={190} />
        </div>
        {params.text && (
          <m.p
            animate={{ opacity: 1, y: 0 }}
            className={`text-white/80 ${split ? "flex-1 border-l border-white/15" : ""} ${BODY}`}
            initial={{ opacity: 0, y: 20 }}
            style={{
              fontSize: hero(46, 0.062),
              lineHeight: 1.3,
              paddingLeft: split ? Math.round(60 * u) : 0,
              marginTop: split ? 0 : Math.round(40 * u),
            }}
            transition={{ duration: 0.7, delay: 0.25, ease: EASE_OUT }}
          >
            {params.text}
          </m.p>
        )}
      </div>
    </AgilesFrame>
  );
}

// ---------------------------------------------------------------------------
// Sponsors
// ---------------------------------------------------------------------------

/** Sponsor name → the file an operator can drop in `public/agiles/sponsors`. */
const sponsorSlug = (name: string) =>
  name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/**
 * The sponsor's own logo when we have the file, their name set in the event's
 * type when we do not — so adding a sponsor to the list never leaves a hole.
 */
function SponsorLogo({ name, size }: { name: string; size: number }) {
  const [step, setStep] = useState(0);
  const sources = [`/agiles/sponsors/${sponsorSlug(name)}.svg`, `/agiles/sponsors/${sponsorSlug(name)}.png`];

  if (step >= sources.length)
    return (
      <span
        className="font-display leading-tight font-extrabold text-balance uppercase"
        style={{ color: AGILES.navy, fontSize: Math.round(size * 0.42) }}
      >
        {name}
      </span>
    );

  return (
    // Fit, never crop: a wide wordmark ends up width-limited and a square mark
    // height-limited, so every logo carries about the same visual weight.
    // eslint-disable-next-line @next/next/no-img-element -- the wall is a fixed canvas, not a responsive page
    <img
      alt={name}
      className="max-h-full object-contain"
      src={sources[step]}
      // A set height (not a cap) so a 114 px wordmark and a 2000 px one read the same size.
      style={{ height: size, maxWidth: "100%" }}
      onError={() => setStep((current) => current + 1)}
    />
  );
}

export function AgilesSponsors({ params }: SceneProps<"agiles-sponsors">) {
  const { u, wide } = useCanvas();
  const items = useMemo(() => splitList(params.items), [params.items]);

  return (
    <AgilesFrame logo={false} plain>
      <AgilesHeader eyebrow="Gracias a" title={params.title} />
      <div
        className="grid flex-1 items-stretch"
        style={{
          gridTemplateColumns: `repeat(${wide ? 6 : 4}, minmax(0, 1fr))`,
          gridAutoRows: "1fr",
          gap: Math.round(24 * u),
          marginTop: Math.round(30 * u),
        }}
      >
        {items.slice(0, 12).map((name, i) => (
          <m.div
            key={name}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center justify-center bg-white text-center"
            initial={{ opacity: 0, y: 24 }}
            style={{
              minHeight: Math.round((wide ? 130 : 150) * u),
              borderRadius: Math.round(16 * u),
              padding: `${Math.round(14 * u)}px ${Math.round(20 * u)}px`,
              borderBottom: `${Math.round(6 * u)}px solid ${ACCENTS[i % ACCENTS.length]}`,
            }}
            transition={{ duration: 0.5, delay: 0.2 + i * 0.05, ease: EASE_OUT }}
          >
            <SponsorLogo name={name} size={Math.round((wide ? 92 : 108) * u)} />
          </m.div>
        ))}
      </div>
    </AgilesFrame>
  );
}

export function AgilesSocial({ params }: SceneProps<"agiles-social">) {
  const { w, u } = useCanvas();
  const pad = usePad();
  const accounts = useMemo(() => splitList(params.accounts), [params.accounts]);
  // One line, always: the hashtag is the point of the scene.
  const column = (params.url ? w * 0.62 : w) - pad.x * 2;
  const { hero } = useType();
  const size = Math.min(hero(170, 0.26), Math.floor(column / Math.max(params.hashtag.length, 1) / 0.6));

  return (
    <AgilesFrame photo>
      <div className="flex flex-1 items-center" style={{ gap: Math.round(80 * u) }}>
        <div className="min-w-0 flex-1">
          <p
            className={`font-bold tracking-[0.34em] text-white/60 uppercase ${BODY}`}
            style={{ fontSize: Math.round(28 * u) }}
          >
            Contá tu experiencia
          </p>
          <m.p
            animate={{ opacity: 1, y: 0 }}
            className="font-display leading-[0.9] font-extrabold tracking-[-0.03em] whitespace-nowrap"
            initial={{ opacity: 0, y: 30 }}
            style={{ color: AGILES.yellow, fontSize: size, marginTop: Math.round(20 * u) }}
            transition={{ duration: 0.7, ease: EASE_OUT }}
          >
            {params.hashtag}
          </m.p>
          <Bars className="mt-[3%]" width={190} />
          <div
            className={`flex flex-wrap font-semibold text-white/80 ${BODY}`}
            style={{
              fontSize: Math.round(40 * u),
              gap: `${Math.round(14 * u)}px ${Math.round(70 * u)}px`,
              marginTop: Math.round(40 * u),
            }}
          >
            {accounts.map((account) => (
              <span key={account}>{account}</span>
            ))}
          </div>
        </div>
        {params.url && (
          <m.div
            animate={{ opacity: 1, scale: 1 }}
            className="shrink-0 text-center"
            initial={{ opacity: 0, scale: 0.94 }}
            transition={{ duration: 0.6, delay: 0.3, ease: EASE_OUT }}
          >
            <QrCode size={Math.round(380 * u)} value={params.url} />
            <p
              className={`text-white/70 ${BODY}`}
              style={{ fontSize: Math.round(26 * u), marginTop: Math.round(16 * u) }}
            >
              {params.url.replace(/^https?:\/\//, "")}
            </p>
          </m.div>
        )}
      </div>
    </AgilesFrame>
  );
}

// ---------------------------------------------------------------------------
// Cierre
// ---------------------------------------------------------------------------

export function AgilesClosing({ params }: SceneProps<"agiles-closing">) {
  const { w, u, wide } = useCanvas();
  const { hero } = useType();

  return (
    <AgilesFrame center logo={false} photo>
      <AmbientMarks />
      <Hashtag className="opacity-90" text={params.hashtag} />
      <m.h1
        animate={{ opacity: 1, scale: 1 }}
        className="font-display leading-none font-extrabold tracking-[-0.04em] uppercase"
        initial={{ opacity: 0, scale: 0.95 }}
        style={{ fontSize: hero(190, 0.3), marginTop: Math.round(16 * u) }}
        transition={{ duration: 0.8, ease: EASE_OUT }}
      >
        {params.title}
      </m.h1>
      <Bars className="mt-[2%] justify-center" width={210} />
      <m.p
        animate={{ opacity: 1, y: 0 }}
        className={`text-white/80 ${BODY}`}
        initial={{ opacity: 0, y: 22 }}
        style={{ fontSize: hero(46, 0.06), lineHeight: 1.3, marginTop: Math.round(32 * u), maxWidth: w * 0.66 }}
        transition={{ duration: 0.7, delay: 0.3, ease: EASE_OUT }}
      >
        {params.text}
      </m.p>
      <AnimatedLogo className="mt-[4%]" width={wide ? (w * 0.2) / u : 620} />
    </AgilesFrame>
  );
}
