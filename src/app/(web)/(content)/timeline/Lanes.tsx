"use client";

import { useRouter } from "next/navigation";
import { m } from "motion/react";
import { memo, useMemo, useState } from "react";

import { cn } from "app/lib/utils";
import type { ArchiveRow } from "lib/timeline/data";
import { formatDate, KIND_LABEL, STATUS_LABEL } from "lib/timeline/format";
import { thumbSources } from "lib/timeline/image";
import { type LaneInfo, laneLayout } from "lib/timeline/lanes";

import { useArchiveData, useNear } from "./archive-data";
import { MARK } from "./Charts";

/*
 * One lane per community, from its first event to its last, a dot per event: ~2,000 marks. Each
 * dot is a bare <circle> (no link, no <title>) and one delegated handler on the chart shows the
 * tooltip, prefetches the event on hover and opens it on click. Keyboard and screen readers get
 * each lane's name link and the archive below, the table view of the same data.
 * Conferences are bigger dots, online ones fainter: never color alone.
 */

const number = new Intl.NumberFormat("es-UY");
const BIG = new Set(["conferencia", "hackaton", "jam"]);
const COLUMNS = "grid grid-cols-[9.5rem_1fr] gap-3 sm:grid-cols-[12rem_1fr]";

/** A date string at any precision, as a fractional year */
const yearOf = (value: string) => {
  const [y, m = "07", d = "01"] = value.slice(0, 10).split("-");
  return Number(y) + (Number(m) - 1) / 12 + (Number(d) - 1) / 365;
};

type Hover = { row: ArchiveRow; x: number; y: number };

function LaneView({
  lane: community,
  rows,
  from,
  span,
  order,
}: {
  lane: LaneInfo;
  /** Its events: until they arrive, the lane is its line alone */
  rows?: ArchiveRow[];
  from: number;
  span: number;
  /** Its place in the chart: lanes draw in one after another */
  order: number;
}) {
  const delay = Math.min(order, 24) * 0.03;
  const x = (value: string) => `${(((yearOf(value) - from) / span) * 100).toFixed(2)}%`;
  const closed = community.status === "cerrada";

  return (
    <li className={cn(COLUMNS, "items-center")}>
      <a
        className={cn(
          "truncate text-right text-[13px] transition-colors hover:text-yellow-300",
          closed ? "text-zinc-400" : "text-zinc-200"
        )}
        href={`/timeline?comunidad=${community.slug}#archivo`}
        title={`${community.name} · ${community.events} eventos · ${STATUS_LABEL[community.status]}`}
      >
        {community.name}
      </a>
      <svg aria-hidden className="owu-lane h-5 w-full overflow-visible" data-lane={community.slug}>
        {/* The life of the community draws itself from its first event to its last, then its events appear */}
        <m.line
          className={closed ? "stroke-white/10" : "stroke-white/25"}
          initial={{ pathLength: 0 }}
          transition={{ delay, duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
          viewport={{ once: true }}
          whileInView={{ pathLength: 1 }}
          x1={x(community.first)}
          x2={x(community.last)}
          y1="50%"
          y2="50%"
        />
        <m.g
          initial={{ opacity: 0 }}
          transition={{ delay: delay + 0.35, duration: 0.5 }}
          viewport={{ once: true }}
          whileInView={{ opacity: 1 }}
        >
          {rows?.map((row, index) => (
            <circle
              key={row.s}
              className={row.o ? "opacity-50" : undefined}
              cx={x(row.d)}
              cy="50%"
              data-i={index}
              r={BIG.has(row.k) ? 4.5 : 2.5}
            />
          ))}
        </m.g>
      </svg>
    </li>
  );
}

const Lane = memo(LaneView);

function Tooltip({ hover, community }: { hover: Hover; community?: string }) {
  const { row } = hover;
  const thumb = row.i ? thumbSources(row.i, 48) : null;
  // Kept inside the viewport: flips left near the right edge
  const left = Math.min(hover.x + 14, window.innerWidth - 300);

  return (
    <div
      className="pointer-events-none fixed z-50 flex w-72 gap-3 rounded-xl border border-white/10 bg-zinc-900/95 p-3 shadow-2xl backdrop-blur"
      role="tooltip"
      style={{ left, top: hover.y + 16 }}
    >
      {thumb ? (
        <img
          alt=""
          className="size-12 shrink-0 rounded-md object-cover"
          decoding="async"
          src={thumb.src}
          srcSet={thumb.srcSet}
        />
      ) : null}
      <div className="min-w-0 text-[13px]">
        <p className="font-terminal text-[11px] text-zinc-400">
          {formatDate({ start: row.d, end: row.e })} · {KIND_LABEL[row.k]}
        </p>
        <p className="mt-0.5 line-clamp-2 font-semibold text-zinc-100">{row.t}</p>
        <p className="mt-0.5 truncate text-zinc-400">
          {community}
          {row.r ? ` · ${number.format(row.r)} anotados` : ""}
        </p>
      </div>
    </div>
  );
}

export default function Lanes({
  from,
  to,
  shown = 36,
  preview,
}: {
  from: number;
  to: number;
  shown?: number;
  /** The lanes up front and how many more there are, drawn by the server: lines first, dots after */
  preview: { lanes: LaneInfo[]; more: number };
}) {
  // Close, not early: on phones the story above is short, and 1000px rendered the ~2,700 nodes at load
  const [root, near] = useNear<HTMLElement>("300px");
  const data = useArchiveData(near);
  const router = useRouter();
  const [hover, setHover] = useState<Hover | null>(null);
  const span = to + 1 - from;

  const { front, rest, byCommunity, names } = useMemo(() => {
    if (!data) return { front: preview.lanes, rest: null, byCommunity: null, names: null };
    const { lanes, top, byCommunity, info } = laneLayout(data.rows, data.communities, shown);
    return {
      front: lanes.filter((c) => top.has(c.slug)).map(info),
      rest: lanes.filter((c) => !top.has(c.slug)).map(info),
      byCommunity,
      names: new Map(data.communities.map((c) => [c.slug, c.name])),
    };
  }, [data, shown, preview]);

  // The dot under the pointer, if any
  const rowAt = (target: EventTarget) => {
    if (!(target instanceof SVGCircleElement)) return null;
    const lane = target.closest("svg")?.dataset.lane;
    const index = Number(target.dataset.i);
    return lane ? (byCommunity?.get(lane)?.[index] ?? null) : null;
  };

  const lane = (info: LaneInfo, order: number) => (
    <Lane key={info.slug} from={from} lane={info} order={order} rows={byCommunity?.get(info.slug)} span={span} />
  );
  // The same tree before and after the dots arrive: the lines stay put and the dots join them
  const chart = useMemo(
    () => (
      <>
        <ul className="mt-2 flex flex-col gap-1">{front.map(lane)}</ul>
        {preview.more ? (
          <details className="group/more mt-1">
            <summary className="ml-[10.25rem] cursor-pointer list-none py-2 text-sm text-zinc-300 transition-colors hover:text-yellow-300 sm:ml-[12.75rem] [&::-webkit-details-marker]:hidden">
              <span className="group-open/more:hidden">Ver {rest?.length ?? preview.more} comunidades más</span>
              <span className="hidden group-open/more:inline">Ver menos</span>
            </summary>
            <ul className="flex flex-col gap-1">{rest?.map(lane)}</ul>
          </details>
        ) : null}
      </>
    ),
    // oxlint-disable-next-line react/exhaustive-deps -- `lane` closes over the same inputs
    [front, rest, byCommunity, from, span, preview.more]
  );

  const ticks = Array.from({ length: span }, (_, i) => from + i).filter((year) => year % 2 === 0);

  return (
    <figure ref={root} aria-busy={!data} className="-mx-5 overflow-x-auto px-5 sm:mx-0 sm:px-0">
      <div
        className="min-w-[44rem] [&_circle]:cursor-pointer"
        onClick={(event) => {
          const row = rowAt(event.target);
          if (row) router.push(`/timeline/${row.s}`);
        }}
        onPointerLeave={() => setHover(null)}
        onPointerMove={(event) => {
          if (event.pointerType !== "mouse") return;
          const row = rowAt(event.target);
          if (!row) return hover && setHover(null);
          if (row !== hover?.row) router.prefetch(`/timeline/${row.s}`);
          setHover({ row, x: event.clientX, y: event.clientY });
        }}
      >
        <div aria-hidden className={COLUMNS}>
          <span />
          <div className="relative h-5 font-terminal text-[10px] text-zinc-400 tabular-nums">
            {ticks.map((year) => (
              <span
                key={year}
                className="absolute -translate-x-1/2"
                style={{ left: `${((year - from) / span) * 100}%` }}
              >
                {year}
              </span>
            ))}
          </div>
        </div>
        {chart}
      </div>
      {hover ? <Tooltip community={names?.get(hover.row.c)} hover={hover} /> : null}
      <figcaption className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-zinc-300">
        <span className="inline-flex items-center gap-2">
          <span className="size-[5px] rounded-full" style={{ background: MARK }} /> Meetup o taller
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="size-2.5 rounded-full" style={{ background: MARK }} /> Conferencia, hackatón o jam
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="size-[5px] rounded-full opacity-50" style={{ background: MARK }} /> Online
        </span>
        <span className="text-zinc-400">
          Cada línea va del primer evento al último; las grises ya no se juntan. Tocá un punto para ver el evento.
        </span>
      </figcaption>
    </figure>
  );
}
