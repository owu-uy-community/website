"use client";

import { m } from "motion/react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { cn } from "app/lib/utils";
import type { ActivityRow } from "lib/timeline/activity";
import { STATUS_LABEL } from "lib/timeline/format";

import { settleOn } from "./archive-data";
import { LEVELS } from "./stats/Visuals";

/*
 * Who was there and when, as a grid: a row per community, a cell per year of its life, brighter
 * the more in-person events it held. It replaced a strip of ~2,000 dots that read as noise; this
 * is ~350 cells, drawn by the server. One delegated handler gives the tooltip and opens a year's
 * events in the archive. Keyboard and screen readers get each row's name link and the archive
 * below, the table view of the same data.
 */

// In-person events a year in five steps, each holding a similar share of the cells (1, 2–3, 4–6,
// 7–11, 12+ of 589): a scale relative to the busiest year would leave nearly everything dim
const STEPS = [1, 2, 4, 7, 12];
const STEP_LABELS = ["1", "2–3", "4–6", "7–11", "12+"];
const level = (count: number) => STEPS.findLastIndex((step) => count >= step) + 1;

const COLUMNS = "grid grid-cols-[7rem_minmax(0,1fr)] items-center gap-x-3 sm:grid-cols-[12rem_minmax(0,1fr)]";

type Hover = { row: ActivityRow; year: number; count: number; x: number; y: number };

function Row({ row, from, span, order }: { row: ActivityRow; from: number; span: number; order: number }) {
  const closed = row.status === "cerrada";
  return (
    <li className={COLUMNS} data-slug={row.slug}>
      <a
        // 24px tall: a touch target that size needs no extra spacing (WCAG 2.5.8), so the rows can touch
        className={cn(
          "block truncate text-right text-[12px] leading-6 transition-colors hover:text-yellow-300",
          closed ? "text-zinc-400" : "text-zinc-200"
        )}
        href={`/timeline?comunidad=${row.slug}#archivo`}
        title={`${row.name} · ${row.events} eventos · ${STATUS_LABEL[row.status]}`}
      >
        {row.name}
      </a>
      {/* Each life sweeps in from its first year */}
      <m.div
        aria-hidden
        className="grid gap-[2px]"
        initial={{ clipPath: "inset(0 100% 0 0)" }}
        style={{ gridTemplateColumns: `repeat(${span}, minmax(0, 1fr))` }}
        transition={{ delay: Math.min(order, 20) * 0.025, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        viewport={{ once: true }}
        whileInView={{ clipPath: "inset(0 0% 0 0)" }}
      >
        {row.years.map((count, i) => (
          <span
            key={i}
            className={cn(
              "h-4 rounded-[3px]",
              count && "cursor-pointer hover:outline hover:outline-1 hover:outline-white/70"
            )}
            data-n={count}
            data-y={row.first + i}
            style={{ background: LEVELS[level(count)], gridColumnStart: i === 0 ? row.first - from + 1 : undefined }}
          />
        ))}
      </m.div>
    </li>
  );
}

export default function Activity({
  from,
  to,
  top,
  rest,
}: {
  from: number;
  to: number;
  top: ActivityRow[];
  rest: ActivityRow[];
}) {
  const router = useRouter();
  const [all, setAll] = useState(false);
  const [hover, setHover] = useState<Hover | null>(null);
  const span = to + 1 - from;
  const bySlug = useMemo(() => new Map([...top, ...rest].map((row) => [row.slug, row])), [top, rest]);
  const years = Array.from({ length: span }, (_, i) => from + i);

  // The year cell under the pointer, if any
  const cellAt = (target: EventTarget) => {
    if (!(target instanceof HTMLElement) || !target.dataset.y) return null;
    const row = bySlug.get(target.closest("li")?.dataset.slug ?? "");
    return row ? { row, year: Number(target.dataset.y), count: Number(target.dataset.n) } : null;
  };

  const rows = (list: ActivityRow[], offset: number) =>
    list.map((row, i) => <Row key={row.slug} from={from} order={offset + i} row={row} span={span} />);

  return (
    <figure>
      <div aria-hidden className={COLUMNS}>
        <span />
        <div
          className="grid font-terminal text-[10px] text-zinc-400 tabular-nums"
          style={{ gridTemplateColumns: `repeat(${span}, minmax(0, 1fr))` }}
        >
          {years.map((year) => (
            <span key={year} className="justify-self-center whitespace-nowrap">
              {/* Every fourth year on phones, every other one from tablets up */}
              <span className="sm:hidden">{year % 4 === 0 ? `’${String(year).slice(2)}` : ""}</span>
              <span className="hidden sm:inline">{year % 2 === 0 ? year : ""}</span>
            </span>
          ))}
        </div>
      </div>
      <ol
        className="mt-1 flex flex-col"
        onClick={(event) => {
          const cell = cellAt(event.target);
          if (!cell?.count) return;
          // The URL carries the filters (the archive reads them as it mounts, or as they change);
          // pushState fires no hashchange, so the page goes to the archive itself
          router.push(`/timeline?comunidad=${cell.row.slug}&desde=${cell.year}&hasta=${cell.year}#archivo`, {
            scroll: false,
          });
          settleOn("archivo");
        }}
        onPointerLeave={() => setHover(null)}
        onPointerMove={(event) => {
          if (event.pointerType !== "mouse") return;
          const cell = cellAt(event.target);
          if (!cell) return hover && setHover(null);
          setHover({ ...cell, x: event.clientX, y: event.clientY });
        }}
      >
        {rows(top, 0)}
        {all ? rows(rest, top.length) : null}
      </ol>
      {rest.length ? (
        <button
          aria-expanded={all}
          className="mt-1 ml-[7.75rem] py-2 text-sm text-zinc-300 transition-colors hover:text-yellow-300 sm:ml-[12.75rem]"
          onClick={() => setAll((value) => !value)}
          type="button"
        >
          {all ? "Ver menos" : `Ver ${rest.length} comunidades más`}
        </button>
      ) : null}
      {hover ? (
        <div
          className="pointer-events-none fixed z-50 rounded-lg border border-white/10 bg-zinc-900/95 px-3 py-2 text-[13px] shadow-xl backdrop-blur"
          role="tooltip"
          style={{ left: Math.min(hover.x + 12, window.innerWidth - 240), top: hover.y + 14 }}
        >
          <span className="block font-medium text-zinc-100">{hover.row.name}</span>
          <span className="text-zinc-400">{hover.year} · </span>
          <span className="text-zinc-200">
            {hover.count ? `${hover.count} ${hover.count === 1 ? "evento" : "eventos"}` : "ningún evento presencial"}
          </span>
          {hover.count ? <span className="mt-0.5 block text-[12px] text-zinc-400">Tocá para verlos</span> : null}
        </div>
      ) : null}
      <figcaption className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-zinc-300">
        <span className="inline-flex flex-wrap items-center gap-x-2.5 gap-y-1">
          Eventos presenciales en el año:
          {STEP_LABELS.map((label, i) => (
            <span key={label} className="inline-flex items-center gap-1 tabular-nums">
              <span className="size-3 rounded-[3px]" style={{ background: LEVELS[i + 1] }} />
              {label}
            </span>
          ))}
          <span className="inline-flex items-center gap-1">
            <span className="size-3 rounded-[3px]" style={{ background: LEVELS[0] }} />
            ninguno
          </span>
        </span>
        <span className="text-zinc-400">
          Cada fila va del primer año de la comunidad al último; las de nombre gris ya no se juntan. Tocá un año para
          ver sus eventos.
        </span>
      </figcaption>
    </figure>
  );
}
