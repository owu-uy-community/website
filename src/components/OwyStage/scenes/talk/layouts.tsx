"use client";

import { useRef, useState, type CSSProperties, type ReactNode } from "react";
import { m } from "motion/react";

import { EASE_OUT } from "app/conf/components/Reveal";
import type { TalkSlide } from "lib/owy-stage/talk/deck";

import { BRAND, useStageFrame } from "../../Stage";
import { QrCode, Rise } from "../parts";
import { MiniFace } from "./feed";
import { CAPTION_TOP, CONTENT_BOTTOM, OwyMark, PeopleMark, Seat } from "./seat";

/**
 * The story slides of «Owy, en vivo». One grid for all: a 120 px margin, a 1180 px column for
 * the slide, the right column for Owy (`Seat`). Content flows under the title inside `Frame`,
 * so a title that wraps pushes it down instead of running into it, and the frame ends above the
 * section name. No boxes: size, weight and light make the hierarchy, hairlines only between
 * rows. On a build the newest piece is full cream and the ones before it settle back.
 */

export type Of<L extends TalkSlide["layout"]> = Extract<TalkSlide, { layout: L }>;
export type LayoutProps<L extends TalkSlide["layout"]> = { slide: Of<L>; step: number };

/** The content column, and the full width for slides without Owy's seat. */
export const COL_X = 120;
export const COL_W = 1180;
export const FULL_W = 1680;
const FRAME_TOP = 104;

/** The slide's title: the one entrance every slide makes. */
export function Heading({ children, sub, size = 88 }: { children: ReactNode; sub?: ReactNode; size?: number }) {
  return (
    <div className="shrink-0">
      <Rise className="leading-[1.04] font-bold tracking-[-0.035em] text-balance" delay={0.05}>
        <span className="block" style={{ fontSize: size }}>
          {children}
        </span>
      </Rise>
      {sub && (
        <Rise className="mt-2 text-[34px] leading-[1.2] font-medium text-[#FBF5E7]/55" delay={0.15}>
          {sub}
        </Rise>
      )}
    </div>
  );
}

/**
 * A slide's frame: the heading on top and the content flowing under it, ending at
 * `CONTENT_BOTTOM` (or above Owy's caption on the slides that show one). Absolute children of
 * the content are placed against the content box, never against the page.
 */
export function Frame({
  title,
  sub,
  size,
  wide = false,
  caption = false,
  gap = 56,
  className = "",
  children,
}: {
  title: ReactNode;
  sub?: ReactNode;
  size?: number;
  /** No seat: the content takes the whole width. */
  wide?: boolean;
  /** Owy speaks along the bottom on this slide: stop above his caption. */
  caption?: boolean;
  gap?: number;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className="absolute flex flex-col"
      style={{
        left: COL_X,
        top: FRAME_TOP,
        width: wide ? FULL_W : COL_W,
        height: (caption ? CAPTION_TOP - 20 : CONTENT_BOTTOM) - FRAME_TOP,
      }}
    >
      <Heading size={size} sub={sub}>
        {title}
      </Heading>
      <div className={`relative min-h-0 flex-1 ${className}`} style={{ marginTop: gap }}>
        {children}
      </div>
    </div>
  );
}

/** A build: rises in once, then settles back when a newer one arrives. */
export function Build({
  children,
  className = "",
  settled = false,
  style,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  settled?: boolean;
  style?: CSSProperties;
  delay?: number;
}) {
  return (
    <m.div
      animate={{ opacity: settled ? 0.45 : 1, y: 0 }}
      className={className}
      initial={{ opacity: 0, y: 24 }}
      style={style}
      transition={{ duration: 0.5, delay, ease: EASE_OUT }}
    >
      {children}
    </m.div>
  );
}

export const ROW = "border-t-2 border-[#FBF5E7]/[0.12]";

// ---------------------------------------------------------------------------

export function TitleSlide({ slide }: LayoutProps<"title">) {
  return (
    <>
      <div className="absolute top-[230px] flex flex-col" style={{ left: COL_X, width: COL_W }}>
        <Rise className="text-[176px] leading-[0.94] font-bold tracking-[-0.05em]" delay={0.1}>
          {slide.title}
        </Rise>
        <Rise className="mt-8 text-[52px] leading-[1.15] font-medium text-[#FBF5E7]/75" delay={0.25}>
          {slide.subtitle}
        </Rise>
        <div className="mt-[88px] flex gap-[96px]">
          {slide.people.map((person, i) => (
            <Build key={person.name} className="flex items-center gap-6" delay={0.45 + i * 0.12}>
              {i === 0 ? <PeopleMark className="h-[56px] w-[56px]" /> : <OwyMark className="h-[36px] w-[72px]" />}
              <div>
                <p className="text-[46px] leading-none font-semibold tracking-[-0.02em]">{person.name}</p>
                <p className="mt-3 text-[32px] leading-none font-medium text-[#FBF5E7]/55">{person.role}</p>
              </div>
            </Build>
          ))}
        </div>
      </div>
      <p className="absolute bottom-[60px] text-[30px] font-medium text-[#FBF5E7]/55" style={{ left: COL_X }}>
        {slide.kicker}
      </p>
      <Seat chair label={null} />
    </>
  );
}

export function BubblesSlide({ slide, step }: LayoutProps<"bubbles">) {
  const shown = Math.min(step + 1, slide.bubbles.length);
  const punch = step >= slide.bubbles.length;

  return (
    <>
      <Frame title={slide.title}>
        {/* A little wider than the column: three rows instead of four. The seat starts 80 px further. */}
        <div className="flex w-[1220px] flex-wrap content-start gap-[18px]">
          {slide.bubbles.slice(0, shown).map((text) => (
            <m.p
              key={text}
              animate={{ opacity: punch ? 0.35 : 1, y: 0 }}
              className="rounded-[40px] rounded-bl-[10px] bg-[#0162C8] px-8 py-5 text-[40px] leading-none font-semibold tracking-[-0.01em]"
              initial={{ opacity: 0, y: 20 }}
              transition={{ duration: 0.45, ease: EASE_OUT }}
            >
              {text}
            </m.p>
          ))}
        </div>
        {punch && (
          <Build className="mt-[64px]">
            <p className="text-[58px] leading-[1.12] font-semibold tracking-[-0.025em] text-balance">
              {slide.punchline}
            </p>
          </Build>
        )}
      </Frame>
      <Seat />
    </>
  );
}

export function PhotosSlide({ slide, step }: LayoutProps<"photos">) {
  return (
    <>
      <Frame className="flex items-start gap-[60px]" title={slide.title}>
        {slide.photos.slice(0, step + 1).map((photo, i) => (
          <Build key={photo.src} className="w-[560px]">
            <img alt={photo.alt} className="h-[420px] w-full object-cover" src={photo.src} />
            <p className="mt-7 text-[40px] leading-[1.15] font-semibold tracking-[-0.015em] text-balance">
              {slide.captions[i]}
            </p>
          </Build>
        ))}
      </Frame>
      <Seat />
    </>
  );
}

/** Agustín's own words: the people's triangle, big, pointing at them. */
export function StatementSlide({ slide }: LayoutProps<"statement">) {
  return (
    <>
      <PeopleMark className="absolute top-[300px] -left-[90px] h-[480px] w-[300px]" />
      <div className="absolute top-[200px] left-[300px] w-[1000px]">
        <Rise className="text-[34px] font-medium text-[#FBF5E7]/55" delay={0.05}>
          {slide.kicker}
        </Rise>
        <Build className="mt-8" delay={0.15}>
          <p className="text-[70px] leading-[1.12] font-semibold tracking-[-0.03em] text-balance">
            <span className="text-[#7DB3F2]">«</span>
            {slide.text}
            <span className="text-[#7DB3F2]">»</span>
          </p>
          {slide.by && <p className="mt-10 text-[40px] font-medium text-[#FBF5E7]/60">{slide.by}</p>}
        </Build>
      </div>
      <Seat />
    </>
  );
}

/**
 * One brain in the middle, its bodies around it: thin spokes, words instead of boxes. In content
 * coordinates; the ellipse is sized so the top label clears the heading and the bottom ones end
 * above Owy's caption.
 */
const ORBIT = { cx: 840, cy: 290, rx: 620, ry: 250, ring: 130, labelW: 440, labelH: 104 };

export function OrbitSlide({ slide, step }: LayoutProps<"orbit">) {
  const { cx, cy, rx, ry, ring, labelW, labelH } = ORBIT;
  const bodies = slide.bodies.slice(0, step);
  const at = (i: number) => {
    const a = -Math.PI / 2 + (i / slide.bodies.length) * Math.PI * 2;
    return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry] as const;
  };

  return (
    <Frame caption wide title={slide.title}>
      <svg aria-hidden className="absolute top-0 left-0 overflow-visible" height={1} width={1}>
        {bodies.map((body, i) => {
          const [x, y] = at(i);
          const dx = x - cx;
          const dy = y - cy;
          // From just outside the ring to just short of the label's box.
          const from = (ring + 14) / Math.hypot(dx, dy);
          const to =
            1 -
            Math.min(
              Math.abs(dx) > 1 ? (labelW / 2 + 16) / Math.abs(dx) : 1,
              Math.abs(dy) > 1 ? (labelH / 2 + 12) / Math.abs(dy) : 1
            );
          if (to <= from) return null;
          return (
            <m.line
              key={body.label}
              animate={{ pathLength: 1, stroke: i === step - 1 ? BRAND.yellow : "rgba(251,245,231,0.22)" }}
              initial={{ pathLength: 0 }}
              strokeWidth={3}
              transition={{ duration: 0.5, ease: EASE_OUT }}
              x1={cx + dx * from}
              x2={cx + dx * to}
              y1={cy + dy * from}
              y2={cy + dy * to}
            />
          );
        })}
      </svg>
      <div
        className="absolute flex flex-col items-center justify-center rounded-full border-[6px] border-[#F5BB03]"
        style={{ left: cx - ring, top: cy - ring, width: ring * 2, height: ring * 2 }}
      >
        <MiniFace size={124} />
        <p className="mt-2 w-[180px] text-center text-[24px] leading-[1.15] font-medium text-balance text-[#FBF5E7]/70">
          {slide.core.detail}
        </p>
      </div>
      {bodies.map((body, i) => {
        const [x, y] = at(i);
        return (
          <Build
            key={body.label}
            className="absolute flex flex-col items-center justify-center text-center"
            settled={i < step - 1}
            style={{ left: x - labelW / 2, top: y - labelH / 2, width: labelW, height: labelH }}
          >
            <p className="text-[50px] leading-[1.1] font-semibold tracking-[-0.02em]">{body.label}</p>
            <p className="mt-2 text-[30px] leading-[1.2] font-medium whitespace-nowrap text-[#FBF5E7]/60">
              {body.detail}
            </p>
          </Build>
        );
      })}
    </Frame>
  );
}

/** Two columns of rows, no icons, no cards. A `code` body is Owy's (tool names): monospace, his yellow. */
export function TilesSlide({ slide, step }: LayoutProps<"tiles">) {
  return (
    <>
      <Frame className="grid grid-cols-2 content-start gap-x-[56px]" sub={slide.sub} title={slide.title}>
        {slide.tiles.slice(0, step + 1).map((tile, i) => (
          <Build key={tile.title} className={`${ROW} pt-6 pb-8`} settled={i < step}>
            <p className="text-[42px] leading-[1.08] font-semibold tracking-[-0.02em]">{tile.title}</p>
            <p
              className={`mt-3 leading-[1.25] ${tile.code ? "font-terminal text-[27px] text-[#F5BB03]" : "text-[32px] font-medium text-[#FBF5E7]/65"}`}
            >
              {tile.body}
            </p>
          </Build>
        ))}
      </Frame>
      <Seat />
    </>
  );
}

/** The story as a list of dates: the current one opens with its sentence, the rest stay one line. */
export function TimelineSlide({ slide, step }: LayoutProps<"timeline">) {
  const now = Math.min(step, slide.events.length - 1);

  return (
    <>
      <Frame className="flex flex-col" title={slide.title}>
        {slide.events.slice(0, now + 1).map((event, i) => {
          const current = i === now;
          return (
            <Build key={event.title} className={`${ROW} flex gap-8 py-[11px]`} settled={!current}>
              <p
                className="w-[150px] shrink-0 text-[34px] leading-[1.2] font-semibold tabular-nums"
                style={{ color: current ? BRAND.yellow : undefined }}
              >
                {event.date}
              </p>
              <div className="min-w-0">
                <p className="text-[34px] leading-[1.2] font-semibold tracking-[-0.01em]">{event.title}</p>
                {current && (
                  <p className="mt-1 text-[32px] leading-[1.25] font-medium text-[#FBF5E7]/70">{event.body}</p>
                )}
              </div>
            </Build>
          );
        })}
      </Frame>
      <Seat />
    </>
  );
}

/** One bug at a time, told in full; the earlier ones fold down to their name. */
export function BugsSlide({ slide, step }: LayoutProps<"bugs">) {
  const now = Math.min(step, slide.bugs.length - 1);
  return (
    <>
      <Frame className="flex flex-col" title={slide.title}>
        {slide.bugs.slice(0, now + 1).map((bug, i) => {
          const current = i === now;
          return (
            <Build key={bug.title} className={`${ROW} ${current ? "py-7" : "py-[14px]"}`} settled={!current}>
              <p
                className={`${current ? "text-[56px]" : "text-[36px]"} leading-[1.1] font-semibold tracking-[-0.02em]`}
              >
                {bug.title}
              </p>
              {current && (
                <p className="mt-4 max-w-[1080px] text-[38px] leading-[1.3] font-medium text-[#FBF5E7]/72">
                  {bug.body}
                </p>
              )}
            </Build>
          );
        })}
      </Frame>
      <Seat />
    </>
  );
}

export function CountUp({ value, suffix = "" }: { value: number; suffix?: string }) {
  const [n, setN] = useState(0);
  const start = useRef<number | null>(null);
  useStageFrame((t) => {
    start.current ??= t;
    const k = Math.min(1, (t - start.current) / 1600);
    const next = Math.round(value * (1 - (1 - k) ** 3));
    setN((current) => (current === next ? current : next));
  });
  return (
    <>
      {n.toLocaleString("es-UY")}
      <span className="ml-2 text-[0.36em] font-semibold tracking-normal">{suffix.trim()}</span>
    </>
  );
}

export function NumbersSlide({ slide }: LayoutProps<"numbers">) {
  return (
    <>
      <Frame className="grid grid-cols-3 content-start gap-x-[48px] gap-y-[40px]" title={slide.title}>
        {slide.stats.map((stat, i) => (
          <Build key={stat.label} className={`${ROW} pt-6`} delay={i * 0.08}>
            <p className="text-[150px] leading-[0.95] font-bold tracking-[-0.05em] whitespace-nowrap tabular-nums">
              <CountUp suffix={stat.suffix} value={stat.value} />
            </p>
            <p className="mt-3 text-[34px] leading-[1.15] font-medium text-[#FBF5E7]/65">{stat.label}</p>
          </Build>
        ))}
      </Frame>
      <Seat />
    </>
  );
}

/** The fallbacks really are an order, so they are numbered, and each steps down a little. */
export function LadderSlide({ slide, step }: LayoutProps<"ladder">) {
  return (
    <>
      <Frame className="flex flex-col" title={slide.title}>
        {slide.rungs.slice(0, step + 1).map((rung, i) => (
          <Build
            key={rung.title}
            className={`${ROW} flex items-baseline gap-8 py-[22px]`}
            settled={i < step}
            style={{ marginLeft: i * 72 }}
          >
            <span className="w-[48px] shrink-0 text-[44px] leading-none font-semibold text-[#F5BB03] tabular-nums">
              {i + 1}
            </span>
            <div>
              <p className="text-[50px] leading-[1.05] font-semibold tracking-[-0.02em]">{rung.title}</p>
              <p className="mt-2 text-[34px] leading-[1.25] font-medium text-[#FBF5E7]/65">{rung.body}</p>
            </div>
          </Build>
        ))}
      </Frame>
      <Seat />
    </>
  );
}

export function PointsSlide({ slide, step }: LayoutProps<"points">) {
  return (
    <>
      <Frame className="flex flex-col" title={slide.title}>
        {slide.points.slice(0, step + 1).map((point, i) => (
          <Build key={point.title} className={`${ROW} py-7`} settled={i < step}>
            <p className="text-[54px] leading-[1.06] font-semibold tracking-[-0.025em] text-balance">{point.title}</p>
            <p className="mt-3 text-[34px] leading-[1.25] font-medium text-[#FBF5E7]/65">{point.body}</p>
          </Build>
        ))}
      </Frame>
      <Seat />
    </>
  );
}

const shortUrl = (url: string) => url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");

export function LinksSlide({ slide }: LayoutProps<"links">) {
  return (
    <>
      <Frame className="flex items-start gap-[100px]" sub={slide.kicker} title={slide.title}>
        {slide.links.map((link, i) => (
          <Build key={link.url} className="flex flex-col items-start" delay={0.15 + i * 0.12}>
            <QrCode size={320} value={link.url} />
            <p className="mt-8 text-[46px] leading-none font-semibold tracking-[-0.02em]">{link.label}</p>
            <p className="mt-3 text-[32px] font-medium text-[#FBF5E7]/60">{shortUrl(link.url)}</p>
          </Build>
        ))}
      </Frame>
      <Seat label={null} />
    </>
  );
}

export function EndSlide({ slide }: LayoutProps<"end">) {
  return (
    <>
      <div className="absolute top-[180px] flex flex-col" style={{ left: COL_X, width: COL_W }}>
        <Rise className="text-[240px] leading-[0.9] font-bold tracking-[-0.055em]" delay={0.1}>
          {slide.title}
        </Rise>
        <Rise className="mt-6 text-[44px] font-medium text-[#FBF5E7]/65" delay={0.25}>
          OWU CONF 2026
        </Rise>
        <div className="mt-[96px] flex flex-col gap-[36px]">
          {slide.links.map((link, i) => (
            <Build key={link.url} className="flex items-center gap-7" delay={0.4 + i * 0.12}>
              <QrCode size={130} value={link.url} />
              <div>
                <p className="text-[40px] leading-none font-semibold">{link.label}</p>
                <p className="mt-3 text-[30px] font-medium text-[#FBF5E7]/60">{shortUrl(link.url)}</p>
              </div>
            </Build>
          ))}
        </div>
      </div>
      <Seat chair label={null} />
    </>
  );
}

/** Seconds since mount on the stage clock, in tenths (the photo countdown). */
export function useSinceMount(): number {
  const start = useRef<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  useStageFrame((t) => {
    start.current ??= t;
    const next = Math.floor((t - start.current) / 100) / 10;
    setElapsed((current) => (current === next ? current : next));
  });
  return elapsed;
}
