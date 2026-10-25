"use client";

import { m } from "motion/react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useState } from "react";

import { EASE_OUT } from "components/community/motion";
import { formatDate } from "lib/timeline/format";
import type { Rank, TimelineStats } from "lib/timeline/stats";

import { useNear } from "../archive-data";
import { ChartSkeleton } from "../Skeletons";
import type { ChartSpec } from "./Charts";

/*
 * The light visuals of "En números", in plain HTML with Motion entrances: they cost no chart
 * library. The three that need a real chart (tooltips, legends, stacking) load recharts on their
 * own, only once they come near the screen (LazyChart).
 */

const number = new Intl.NumberFormat("es-UY");
const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "set", "oct", "nov", "dic"];
const IN_VIEW = { once: true, amount: "some" } as const;

/* ---------------------------------------------------------------- heatmap */

// One hue (OWU's yellow) stepping up in opacity over the ink: more events, brighter cell
const LEVELS = [
  "rgba(255,255,255,0.04)",
  "rgba(234,179,8,0.2)",
  "rgba(234,179,8,0.36)",
  "rgba(234,179,8,0.54)",
  "rgba(234,179,8,0.74)",
  "rgba(234,179,8,0.95)",
];
const level = (value: number, max: number) => (value ? Math.max(1, Math.ceil((value / max) * 5)) : 0);

type Cell = { year: number; month: number; value: number; x: number; y: number };

/** Years left to right, months top to bottom; hover a cell for its count */
export function Heatmap({ rows }: { rows: TimelineStats["heatmap"] }) {
  const max = Math.max(...rows.flatMap((row) => row.months));
  const [cell, setCell] = useState<Cell | null>(null);

  return (
    <div className="relative">
      <div
        aria-hidden
        className="grid grid-cols-[1.75rem_1fr] gap-2"
        onPointerLeave={() => setCell(null)}
        onPointerMove={(event) => {
          const target = (event.target as HTMLElement).dataset;
          if (!target.v) return setCell(null);
          setCell({
            year: Number(target.y),
            month: Number(target.m),
            value: Number(target.v),
            x: event.clientX,
            y: event.clientY,
          });
        }}
      >
        <div className="grid grid-rows-12 gap-[3px] pt-5 font-terminal text-[10px] leading-none text-zinc-400">
          {MONTHS.map((month, i) => (
            <span key={month} className="flex items-center">
              {i % 2 === 0 ? month : ""}
            </span>
          ))}
        </div>
        <div className="grid gap-[3px]" style={{ gridTemplateColumns: `repeat(${rows.length}, minmax(0, 1fr))` }}>
          {rows.map((row, column) => (
            <m.div
              key={row.year}
              className="grid grid-rows-[1rem_repeat(12,minmax(0,1fr))] gap-[3px]"
              initial={{ opacity: 0, y: 6 }}
              transition={{ duration: 0.45, ease: EASE_OUT, delay: column * 0.025 }}
              viewport={IN_VIEW}
              whileInView={{ opacity: 1, y: 0 }}
            >
              <span className="text-center font-terminal text-[10px] leading-4 text-zinc-400 tabular-nums">
                {row.year % 2 === 0 || column === rows.length - 1 ? `'${String(row.year).slice(2)}` : ""}
              </span>
              {row.months.map((value, month) => (
                <span
                  key={month}
                  className="h-3.5 rounded-[3px] transition-[outline] hover:outline hover:outline-1 hover:outline-white/60 sm:h-4"
                  data-m={month}
                  data-v={value}
                  data-y={row.year}
                  style={{ background: LEVELS[level(value, max)] }}
                />
              ))}
            </m.div>
          ))}
        </div>
      </div>
      <div aria-hidden className="mt-3 flex items-center justify-end gap-1.5 text-[11px] text-zinc-400">
        Menos
        {LEVELS.map((color) => (
          <span key={color} className="size-3 rounded-[3px]" style={{ background: color }} />
        ))}
        Más
      </div>
      {cell ? (
        <div
          className="pointer-events-none fixed z-50 rounded-lg border border-white/10 bg-zinc-900/95 px-3 py-2 text-[13px] text-zinc-100 shadow-xl backdrop-blur"
          role="tooltip"
          style={{ left: Math.min(cell.x + 12, window.innerWidth - 180), top: cell.y + 14 }}
        >
          <span className="text-zinc-400">
            {MONTHS[cell.month]} {cell.year} ·{" "}
          </span>
          {cell.value} {cell.value === 1 ? "evento" : "eventos"}
        </div>
      ) : null}
    </div>
  );
}

/* --------------------------------------------------------- vertical bars */

const MARK = "#b8860b";

/** Bars that grow from the baseline; only the busiest one carries its number (the table has all) */
export function ColumnBars({
  items,
  height = 140,
}: {
  items: { label: string; value: number; tick?: boolean }[];
  height?: number;
}) {
  const max = Math.max(...items.map((item) => item.value));
  const total = items.reduce((sum, item) => sum + item.value, 0);

  return (
    <div aria-hidden>
      <div className="flex items-end gap-[3px]" style={{ height }}>
        {items.map((item, i) => (
          <div
            key={item.label}
            className="relative flex h-full flex-1 flex-col justify-end"
            title={`${item.label}: ${number.format(item.value)}`}
          >
            {item.value === max ? (
              <span className="absolute -top-5 left-1/2 -translate-x-1/2 font-terminal text-[11px] whitespace-nowrap text-zinc-200 tabular-nums">
                {Math.round((item.value / total) * 100)}%
              </span>
            ) : null}
            <m.span
              className="block origin-bottom rounded-t-[4px]"
              initial={{ scaleY: 0 }}
              style={{
                height: `${(item.value / max) * 100}%`,
                background: MARK,
                opacity: item.value === max ? 1 : 0.7,
              }}
              transition={{ duration: 0.6, ease: EASE_OUT, delay: i * 0.04 }}
              viewport={IN_VIEW}
              whileInView={{ scaleY: 1 }}
            />
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-[3px] font-terminal text-[10px] text-zinc-400">
        {items.map((item) => (
          <span key={item.label} className="flex-1 text-center">
            {item.tick === false ? "" : item.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------- horizontal ranks */

/** A ranked list whose bars sweep in from the left; name and count are always written out */
export function RankBars({ items }: { items: Rank[] }) {
  const max = Math.max(...items.map((item) => item.count));

  return (
    <ol className="flex flex-col gap-2">
      {items.map((item, i) => (
        <li
          key={item.name}
          className="grid grid-cols-[minmax(0,9rem)_1fr_2.5rem] items-center gap-3 text-[13px] sm:grid-cols-[minmax(0,11rem)_1fr_2.5rem]"
        >
          <span className="truncate text-zinc-200" title={item.name}>
            {item.name}
          </span>
          <span aria-hidden className="h-2.5 rounded-full bg-white/[0.04]">
            <m.span
              className="block h-full origin-left rounded-full"
              initial={{ scaleX: 0 }}
              style={{ width: `${(item.count / max) * 100}%`, background: MARK }}
              transition={{ duration: 0.7, ease: EASE_OUT, delay: i * 0.05 }}
              viewport={IN_VIEW}
              whileInView={{ scaleX: 1 }}
            />
          </span>
          <span className="text-right font-terminal text-zinc-400 tabular-nums">{number.format(item.count)}</span>
        </li>
      ))}
    </ol>
  );
}

/* ------------------------------------------------------------ biggest */

export function BiggestList({ items }: { items: TimelineStats["biggest"] }) {
  return (
    <ol className="grid grid-cols-1 gap-x-8 gap-y-1 sm:grid-cols-2">
      {items.map((item, i) => (
        <m.li
          key={item.slug}
          initial={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.4, ease: EASE_OUT, delay: i * 0.05 }}
          viewport={IN_VIEW}
          whileInView={{ opacity: 1, y: 0 }}
        >
          <Link
            className="group flex items-baseline gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-white/[0.04]"
            href={`/timeline/${item.slug}`}
          >
            <span className="w-5 shrink-0 text-right font-terminal text-[12px] text-zinc-400 tabular-nums">
              {i + 1}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-medium text-zinc-100 group-hover:text-yellow-200">
                {item.title}
              </span>
              <span className="block truncate text-[12px] text-zinc-400">
                {formatDate({ start: item.start })} · {item.community}
              </span>
            </span>
            <span className="shrink-0 font-terminal text-[13px] text-zinc-200 tabular-nums">
              {number.format(item.people)}
            </span>
          </Link>
        </m.li>
      ))}
    </ol>
  );
}

/* --------------------------------------------------------- lazy charts */

// recharts stays out of the page's bundle: it loads with the first chart that comes near the screen
const Charts = dynamic(() => import("./Charts"), { ssr: false, loading: Frame });

function Frame() {
  return <ChartSkeleton />;
}

/** A fixed-height slot (nothing shifts) that mounts its chart once it is within reach */
export function LazyChart({ spec, height }: { spec: ChartSpec; height: number }) {
  const [ref, near] = useNear<HTMLDivElement>("600px");

  return (
    <div ref={ref} aria-hidden className="w-full" style={{ height }}>
      {near ? <Charts spec={spec} /> : <ChartSkeleton legend={spec.kind !== "attendance"} />}
    </div>
  );
}
