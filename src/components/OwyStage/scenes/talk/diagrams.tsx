"use client";

import { m } from "motion/react";

import { EASE_OUT } from "app/conf/components/Reveal";

import { BRAND } from "../../Stage";
import { Build, COL_W, CountUp, Frame, ROW, type LayoutProps } from "./layouts";
import { Seat } from "./seat";

/**
 * How things talk to each other, one click at a time: swimlanes for one request, a folder as a
 * tree, and branches merging into main. The newest piece is in Owy's yellow; the ones before it
 * settle back to cream.
 */

const DIM = "rgba(251,245,231,0.45)";

// ---------------------------------------------------------------------------
// Swimlanes: one message per click, a dot travels it
// ---------------------------------------------------------------------------

const HEAD_H = 92;
const FIRST_ROW = 150;
const ARROW = 14;
/** The content box under a one-line 72 px title: the rows share it. */
const SEQ_H = 700;

export function SequenceSlide({ slide, step }: LayoutProps<"sequence">) {
  const lanes = slide.lanes.length;
  const laneW = COL_W / lanes;
  const at = (lane: number) => laneW * (lane + 0.5);
  const shown = Math.min(step + 1, slide.messages.length);
  // Rows share what is left under the lane names (the last one keeps room for its code line).
  const rowH = Math.min(110, (SEQ_H - FIRST_ROW - 64) / Math.max(1, slide.messages.length - 1));
  const bottom = FIRST_ROW + rowH * (slide.messages.length - 1) + 40;

  return (
    <>
      <Frame gap={40} size={72} sub={slide.sub} title={slide.title}>
        {slide.lanes.map((lane, i) => (
          <div key={lane.label} className="absolute top-0 text-center" style={{ left: laneW * i, width: laneW }}>
            <p className="text-[36px] leading-none font-semibold tracking-[-0.02em]">{lane.label}</p>
            <p className="mt-2 text-[24px] leading-none font-medium text-[#FBF5E7]/55">{lane.detail}</p>
          </div>
        ))}
        <svg aria-hidden className="absolute top-0 left-0 overflow-visible" height={1} width={1}>
          {slide.lanes.map((lane, i) => (
            <line
              key={lane.label}
              stroke="rgba(251,245,231,0.16)"
              strokeDasharray="4 10"
              strokeWidth={3}
              x1={at(i)}
              x2={at(i)}
              y1={HEAD_H}
              y2={bottom}
            />
          ))}
          {slide.messages.slice(0, shown).map((message, i) => {
            const y = FIRST_ROW + rowH * i;
            const current = i === shown - 1;
            const color = current ? BRAND.yellow : DIM;
            const x1 = at(message.from);
            const x2 = at(message.to);
            if (message.from === message.to) {
              // To itself: a small loop out of the lifeline and back.
              const d = `M${x1} ${y - 18} H${x1 + 64} V${y + 18} H${x1 + 8}`;
              return (
                <g key={i}>
                  <m.path
                    animate={{ pathLength: 1 }}
                    d={d}
                    fill="none"
                    initial={{ pathLength: 0 }}
                    stroke={color}
                    strokeWidth={4}
                    transition={{ duration: 0.5, ease: EASE_OUT }}
                  />
                  <path d={`M${x1 + 8} ${y + 18} l${ARROW} -8 v16 z`} fill={color} />
                </g>
              );
            }
            const dir = Math.sign(x2 - x1);
            const end = x2 - dir * 6;
            return (
              <g key={i}>
                <m.line
                  animate={{ x2: end - dir * ARROW }}
                  initial={{ x2: x1 }}
                  stroke={color}
                  strokeWidth={4}
                  transition={{ duration: 0.55, ease: EASE_OUT }}
                  x1={x1}
                  y1={y}
                  y2={y}
                />
                <m.path
                  animate={{ opacity: 1 }}
                  d={`M${end} ${y} l${-dir * ARROW * 1.4} -11 v22 z`}
                  fill={color}
                  initial={{ opacity: 0 }}
                  transition={{ delay: 0.45, duration: 0.2 }}
                />
                {current && (
                  <m.circle
                    animate={{ cx: [x1, end], opacity: [1, 1, 0] }}
                    cy={y}
                    fill={BRAND.yellow}
                    initial={{ cx: x1 }}
                    r={10}
                    transition={{ duration: 0.75, ease: "easeInOut", repeat: Infinity, repeatDelay: 1.6 }}
                  />
                )}
              </g>
            );
          })}
        </svg>
        {slide.messages.slice(0, shown).map((message, i) => {
          const y = FIRST_ROW + rowH * i;
          const current = i === shown - 1;
          const self = message.from === message.to;
          const center = self ? at(message.from) + 84 : (at(message.from) + at(message.to)) / 2;
          return (
            <m.div
              key={i}
              animate={{ opacity: current ? 1 : 0.5, y: 0 }}
              className={`absolute flex whitespace-nowrap ${self ? "flex-col items-start" : "-translate-x-1/2 flex-col items-center"}`}
              initial={{ opacity: 0, y: 8 }}
              style={{ left: center, top: self ? y - 26 : y - 42 }}
              transition={{ duration: 0.45, ease: EASE_OUT }}
            >
              <span className="text-[30px] leading-none font-semibold tracking-[-0.01em]">{message.label}</span>
              {message.code && (
                <span
                  className={`font-terminal text-[24px] leading-none ${self ? "mt-2" : "mt-[30px]"}`}
                  style={{ color: current ? BRAND.yellow : "rgba(251,245,231,0.6)" }}
                >
                  {message.code}
                </span>
              )}
            </m.div>
          );
        })}
      </Frame>
      <Seat />
    </>
  );
}

// ---------------------------------------------------------------------------
// A folder as a tree: one entry per click
// ---------------------------------------------------------------------------

export function TreeSlide({ slide, step }: LayoutProps<"tree">) {
  const shown = Math.min(step + 1, slide.entries.length);
  return (
    <>
      <Frame sub={slide.sub} title={slide.title}>
        <p className="font-terminal text-[34px] leading-none text-[#FBF5E7]/70">{slide.root}</p>
        <div className="mt-4 flex flex-col">
          {slide.entries.slice(0, shown).map((entry, i) => {
            const current = i === shown - 1;
            const last = i === slide.entries.length - 1;
            return (
              <Build key={entry.name} className="flex h-[66px] items-center" settled={!current}>
                <span className="w-[64px] shrink-0 font-terminal text-[32px] text-[#FBF5E7]/35">
                  {last ? "└─" : "├─"}
                </span>
                <span
                  className="w-[330px] shrink-0 font-terminal text-[34px] leading-none"
                  style={{ color: current ? BRAND.yellow : undefined }}
                >
                  {entry.name}
                </span>
                <span className="w-[80px] shrink-0 text-[34px] leading-none font-bold tabular-nums">
                  {entry.count ?? ""}
                </span>
                <span className="min-w-0 truncate text-[31px] leading-none font-medium text-[#FBF5E7]/72">
                  {entry.note}
                </span>
              </Build>
            );
          })}
        </div>
      </Frame>
      <Seat />
    </>
  );
}

// ---------------------------------------------------------------------------
// Branches off main: one PR per click, each merging back; then the totals
// ---------------------------------------------------------------------------

const LANE_H = 70;
const MAIN_X = 26;
const BRANCH_X = 92;

export function LanesSlide({ slide, step }: LayoutProps<"lanes">) {
  const shown = Math.min(step + 1, slide.branches.length);
  const totals = step >= slide.branches.length;
  const height = LANE_H * slide.branches.length;

  return (
    <>
      <Frame sub={slide.sub} title={slide.title}>
        <svg aria-hidden className="absolute top-0 left-0 overflow-visible" height={1} width={1}>
          <line stroke="rgba(251,245,231,0.3)" strokeWidth={5} x1={MAIN_X} x2={MAIN_X} y1={-6} y2={height + 6} />
          {slide.branches.slice(0, shown).map((branch, i) => {
            const y0 = LANE_H * i;
            const current = i === shown - 1 && !totals;
            const color = current ? BRAND.yellow : DIM;
            const d = `M${MAIN_X} ${y0 + 8} C${MAIN_X} ${y0 + 26} ${BRANCH_X} ${y0 + 14} ${BRANCH_X} ${y0 + 32} V${y0 + 40} C${BRANCH_X} ${y0 + 58} ${MAIN_X} ${y0 + 46} ${MAIN_X} ${y0 + 64}`;
            return (
              <g key={branch.pr}>
                <m.path
                  animate={{ pathLength: 1 }}
                  d={d}
                  fill="none"
                  initial={{ pathLength: 0 }}
                  stroke={color}
                  strokeWidth={5}
                  transition={{ duration: 0.7, ease: EASE_OUT }}
                />
                <circle cx={BRANCH_X} cy={y0 + 36} fill={color} r={9} />
                <m.circle
                  animate={{ scale: 1 }}
                  cx={MAIN_X}
                  cy={y0 + 64}
                  fill={BRAND.cream}
                  initial={{ scale: 0 }}
                  r={10}
                  transition={{ delay: 0.6, duration: 0.3 }}
                />
              </g>
            );
          })}
        </svg>
        {slide.branches.slice(0, shown).map((branch, i) => {
          const current = i === shown - 1 && !totals;
          return (
            <Build
              key={branch.pr}
              className="absolute flex items-baseline gap-5 whitespace-nowrap"
              settled={!current}
              style={{ left: 140, top: LANE_H * i + 14 }}
            >
              <span
                className="w-[96px] shrink-0 font-terminal text-[30px]"
                style={{ color: current ? BRAND.yellow : undefined }}
              >
                #{branch.pr}
              </span>
              <span className="text-[36px] leading-none font-semibold tracking-[-0.015em]">{branch.title}</span>
              <span className="text-[24px] font-medium text-[#FBF5E7]/50">{branch.date}</span>
            </Build>
          );
        })}
        {totals && (
          <div className="absolute right-0 left-0 grid grid-cols-3 gap-x-[48px]" style={{ top: height + 36 }}>
            {slide.totals.map((total, i) => (
              <Build key={total.label} className={`${ROW} pt-4`} delay={i * 0.1}>
                <p className="text-[96px] leading-[0.95] font-bold tracking-[-0.05em] tabular-nums">
                  <CountUp value={total.value} />
                </p>
                <p className="mt-2 text-[30px] leading-[1.15] font-medium text-[#FBF5E7]/65">{total.label}</p>
              </Build>
            ))}
          </div>
        )}
      </Frame>
      <Seat />
    </>
  );
}
