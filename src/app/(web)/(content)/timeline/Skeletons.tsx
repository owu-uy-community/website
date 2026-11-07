import type { CSSProperties } from "react";

import { cn } from "app/lib/utils";
import {
  Timeline,
  TimelineDate,
  TimelineHeader,
  TimelineIndicator,
  TimelineItem,
  TimelineSeparator,
  TimelineTitle,
} from "components/shared/ui/timeline";

/*
 * Loading states drawn with the boxes of what they stand for: each line of text is a bar one line
 * tall (1lh, in the real text's font classes) and each control has the control's size, so the
 * swap moves nothing. The classes the archive's rows and filters share with their skeletons live
 * here, so the two can't drift apart. One pulse per skeleton, not one per bar.
 */

const BAR = "rounded bg-white/[0.07]";
// Widths that look like text, cycled so neighbouring lines differ
const WIDTHS = ["82%", "64%", "91%", "57%", "74%", "68%", "86%", "49%"];
const width = (i: number) => WIDTHS[i % WIDTHS.length];

/** A line of text, as tall as one line in the classes it gets */
export function Line({ className, w, style }: { className?: string; w: string; style?: CSSProperties }) {
  return (
    <span className={cn("flex h-[1lh] items-center", className)} style={style}>
      <span className={cn("h-[0.72em]", BAR)} style={{ width: w }} />
    </span>
  );
}

/* ----------------------------------------------------------------- filters */

export const CONTROL_BOX = "h-10 rounded-xl border border-white/10 bg-white/[0.04]";
export const FIELD = "flex flex-col gap-2";
export const FIELD_LABEL = "text-[12px] font-medium tracking-wide text-zinc-400 uppercase";
export const KIND_PILL = "h-8 rounded-full border border-white/10 px-3 text-[13px]";
export const SWITCH_ROW = "flex items-center justify-between gap-3 py-1 text-[14px]";
// Measured off the real controls, so the skeleton wraps where they wrap: the type toggles (Meetup …
// Hito, counts included), the event count and the sort button
const PILLS = ["136px", "152px", "128px", "103px", "131px", "94px"];
export const COUNT_PX = "194px";
const SORT_PX = "247px";

function FieldSkeleton({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn(FIELD, className)}>
      <Line className={FIELD_LABEL} w={label} />
      {children}
    </div>
  );
}

/** The filters as Filters draws them: search and communities, the type/topic/city/years card, the count */
export function FiltersSkeleton() {
  return (
    <div aria-hidden className="flex animate-pulse flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row">
        {/* Not flex-1 on phones: in a column an empty box with a zero basis collapses (the real input has content) */}
        <div className={cn(CONTROL_BOX, "sm:flex-1")} />
        <div className="flex gap-2">
          <div className="min-w-0 flex-1">
            <div className={cn(CONTROL_BOX, "w-full sm:w-64")} />
          </div>
          <div className={cn(CONTROL_BOX, "w-[6.2rem] lg:hidden")} />
        </div>
      </div>
      <div className="hidden rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 lg:block">
        <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-end">
          <div className="flex flex-col gap-5">
            <FieldSkeleton label="2.2rem">
              <div className="flex flex-wrap items-center gap-1">
                {PILLS.map((w) => (
                  <span key={w} className={KIND_PILL} style={{ width: w }} />
                ))}
              </div>
            </FieldSkeleton>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-[11rem_11rem_1fr]">
              <FieldSkeleton label="2.6rem">
                <div className={CONTROL_BOX} />
              </FieldSkeleton>
              <FieldSkeleton label="3.4rem">
                <div className={CONTROL_BOX} />
              </FieldSkeleton>
              <FieldSkeleton className="sm:col-span-2 lg:col-span-1" label="6.5rem">
                <div className="flex h-10 items-center">
                  <span className="h-1.5 w-full rounded-full bg-white/[0.07]" />
                </div>
              </FieldSkeleton>
            </div>
          </div>
          <div className="flex flex-col gap-1 lg:w-60">
            {["6.5rem", "7.4rem", "8.6rem"].map((w, i) => (
              <div key={w} className={SWITCH_ROW}>
                <span>
                  <Line w={w} />
                  {i === 2 ? <Line className="text-[12px]" w="10rem" /> : null}
                </span>
                <span className="h-[18px] w-8 shrink-0 rounded-full bg-white/[0.07]" />
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Line className="text-sm" w={COUNT_PX} />
        <span className={cn("h-9", BAR)} style={{ width: SORT_PX }} />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------- rows */

export const ROW_ITEM =
  "scroll-mt-48 scroll-mb-24 group-data-[orientation=vertical]/timeline:ms-10 group-data-[orientation=vertical]/timeline:not-last:pb-2";
export const ROW_RAIL =
  "bg-white/10 group-data-[orientation=vertical]/timeline:-left-7 group-data-[orientation=vertical]/timeline:h-[calc(100%-1rem)] group-data-[orientation=vertical]/timeline:translate-y-5";
export const ROW_DOT =
  "size-3 rounded-full border-0 bg-zinc-800 ring-1 ring-white/20 transition-transform group-data-[orientation=vertical]/timeline:top-4 group-data-[orientation=vertical]/timeline:-left-7";
export const ROW_BUTTON = "flex w-full items-start gap-4 rounded-xl px-3 py-2.5 text-left";
export const ROW_DATE = "font-terminal text-[12px] font-normal text-zinc-400";
export const ROW_TITLE = "text-[15px] leading-snug font-semibold";
export const ROW_META = "mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-zinc-400";
export const ROW_THUMB = "hidden h-[54px] w-[72px] shrink-0 rounded-lg sm:block";
export const YEAR_HEAD =
  "flex items-baseline gap-3 border-b border-white/[0.08] pb-3 font-title text-3xl font-extrabold tracking-tight text-white sm:text-4xl";
export const YEAR_COUNT = "font-sans text-sm font-normal tracking-normal text-zinc-400";
export const MONTH =
  "sticky top-[8.3rem] z-10 -mx-2 mt-4 mb-2 bg-zinc-950/90 px-2 py-1.5 text-[12px] font-medium tracking-wide text-zinc-400 uppercase backdrop-blur";

/** A row of the archive: date, title, community and place, the cover on the right */
function RowSkeleton({ index }: { index: number }) {
  return (
    <TimelineItem className={ROW_ITEM} step={1}>
      <TimelineSeparator className={ROW_RAIL} />
      <TimelineIndicator className={ROW_DOT} />
      <div className={ROW_BUTTON}>
        <TimelineHeader className="min-w-0 flex-1">
          <TimelineDate asChild className={ROW_DATE}>
            <span>
              <Line w="7.5rem" />
            </span>
          </TimelineDate>
          <TimelineTitle className={ROW_TITLE}>
            <Line w={width(index)} />
          </TimelineTitle>
          <div className={ROW_META}>
            <Line w="6rem" />
            <Line w={index % 3 === 0 ? "9rem" : "5.5rem"} />
          </div>
        </TimelineHeader>
        {index % 4 !== 3 ? <span className={cn(ROW_THUMB, BAR, "rounded-lg")} /> : null}
      </div>
    </TimelineItem>
  );
}

export function RowsSkeleton({ count }: { count: number }) {
  return (
    <Timeline value={0}>
      {Array.from({ length: count }, (_, i) => (
        <RowSkeleton key={i} index={i} />
      ))}
    </Timeline>
  );
}

/* ---------------------------------------------------------------- overview */

/** The panel's numbers for the current selection, before there's a selection to count */
export function OverviewSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <Line className="text-[12px] font-medium uppercase" w="12rem" />
        <div className="mt-3 grid grid-cols-2 gap-3">
          {["3.4rem", "5.5rem", "4.4rem", "2.6rem"].map((w) => (
            <div key={w} className="rounded-xl bg-white/[0.03] p-3">
              <Line className="text-[12px]" w={w} />
              <Line className="font-title text-2xl font-bold" w="4.5rem" />
            </div>
          ))}
        </div>
        <Line className="mt-3 text-[13px]" w="11rem" />
      </div>
      <div>
        <Line className="mb-2 text-[12px] font-medium uppercase" w="10.5rem" />
        <div className="flex flex-col gap-1.5">
          {[100, 86, 78, 70, 62].map((bar, i) => (
            <div key={bar} className="flex items-center gap-2 text-[14px]">
              <Line className="min-w-0 flex-1" w={width(i + 2)} />
              <span className="h-1.5 rounded-full bg-white/[0.07]" style={{ width: `${(bar / 100) * 6}rem` }} />
              <span className="w-8" />
            </div>
          ))}
        </div>
      </div>
      <div className="flex items-start gap-2 rounded-xl border border-dashed border-white/10 p-3 text-[13px] leading-normal">
        <span className="mt-0.5 size-4 shrink-0" />
        <span className="flex-1">
          <Line w="96%" />
          <Line w="70%" />
        </span>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- archive */

/** A year as YearSection draws it, with its first rows */
function YearSkeleton({ rows }: { rows: number }) {
  return (
    <div>
      <div className={YEAR_HEAD}>
        <Line w="5.4rem" />
        <Line className={YEAR_COUNT} w="4.6rem" />
      </div>
      <div className={cn(MONTH, "static")}>
        <Line w="4.5rem" />
      </div>
      <RowsSkeleton count={rows} />
    </div>
  );
}

/** The list, the year index beside it (xl) and the reading panel (lg), before the rows arrive */
export function ArchiveListSkeleton() {
  return (
    <div
      aria-hidden
      className="mt-8 grid animate-pulse gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] xl:grid-cols-[4rem_minmax(0,1fr)_minmax(0,26rem)]"
    >
      <div className="hidden xl:block">
        <div className="flex flex-col gap-0.5">
          {Array.from({ length: 20 }, (_, i) => (
            <div key={i} className="flex items-center gap-2 px-2 py-1 font-terminal text-[12px]">
              <Line w="2.2rem" />
              <span className="ml-auto h-1 rounded-full bg-white/[0.07]" style={{ width: `${6 + ((i * 7) % 16)}px` }} />
            </div>
          ))}
        </div>
      </div>
      <div className="min-w-0">
        <YearSkeleton rows={6} />
      </div>
      <div className="hidden lg:block">
        <div className="rounded-2xl border border-white/[0.08] bg-zinc-950/60 p-5">
          <OverviewSkeleton />
        </div>
      </div>
    </div>
  );
}

/** Filters and list: what the archive looks like before its code and its rows arrive */
export function ArchiveSkeleton() {
  return (
    <div>
      <FiltersSkeleton />
      <ArchiveListSkeleton />
    </div>
  );
}

/* ------------------------------------------------------------------ charts */

/** A chart's frame while recharts loads: its gridlines, its baseline, its legend */
export function ChartSkeleton({ legend = false }: { legend?: boolean }) {
  return (
    <div aria-hidden className="flex h-full animate-pulse flex-col gap-3">
      <div className="mt-2 ml-8 flex flex-1 flex-col justify-between border-b border-white/[0.1] pb-px">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className="h-px bg-white/[0.05]" />
        ))}
      </div>
      <div className="ml-8 flex justify-between">
        {Array.from({ length: 8 }, (_, i) => (
          <span key={i} className={cn("h-2 w-6", BAR)} />
        ))}
      </div>
      {legend ? (
        <div className="flex justify-center gap-4">
          {["4rem", "5.5rem", "4.5rem", "5rem"].map((w) => (
            <span key={w} className={cn("h-2.5", BAR)} style={{ width: w }} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------- the story */

/** Lifeline's first frame: columns of a year each, with its line, its text and a photo */
export function LifelineSkeleton() {
  return (
    <div aria-hidden className="flex h-full animate-pulse gap-10 overflow-hidden pt-16 pl-[18%]">
      {[0, 1, 2, 3].map((column) => (
        <div key={column} className="flex w-60 shrink-0 flex-col gap-4">
          <Line className="text-[11px]" w="4rem" />
          <Line className="text-[15px]" w="3rem" />
          <span className="h-px w-full border-t border-dashed border-white/15" />
          <div className="flex flex-col text-[14px] leading-relaxed">
            {[0, 1, 2].map((line) => (
              <Line key={line} w={width(column + line)} />
            ))}
          </div>
          {column % 2 === 0 ? <span className={cn("mt-2 aspect-[16/10] w-48 rounded-xl", BAR)} /> : null}
        </div>
      ))}
    </div>
  );
}
