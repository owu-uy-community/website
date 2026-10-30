"use client";

import type * as React from "react";

import { cn } from "app/lib/utils";
import { Meter, MicroLabel } from "components/Admin/ui/page";
import { formatClock } from "components/Admin/ui/time";
import { Skeleton } from "components/shared/ui/skeleton";
import type { AttendeeList, CheckinStats } from "lib/orpc/attendees/schemas";

function Kpi({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("min-w-0 rounded-lg border border-border bg-card p-3.5 shadow-edge", className)}>{children}</div>
  );
}

function Figure({ value, note }: { value: React.ReactNode; note?: React.ReactNode }) {
  return (
    <div className="mt-2 flex items-baseline gap-2">
      <span className="font-terminal text-[24px] leading-none font-semibold text-foreground tabular-nums">{value}</span>
      {note ? <span className="truncate text-meta text-muted-foreground tabular-nums">{note}</span> : null}
    </div>
  );
}

const opening = (at: string, timeZone: string) =>
  `${new Intl.DateTimeFormat("es-UY", { weekday: "short", day: "numeric", month: "short", timeZone }).format(new Date(at))} · ${formatClock(new Date(at), timeZone)}`;

/** The conf's words in /admin; Organizá's glossary for meetups (entraron, liberaron) */
const WORDS = {
  admin: {
    in: "Acreditados",
    meter: "Acreditados sobre quienes tienen entrada",
    out: "Con entrada, sin acreditar",
    gone: "Cancelados",
    goneNote: "Cancelaron o se reembolsaron",
    pace: "Llegadas · 15′",
    paceNote: "ahora",
    lastHour: "llegadas en la última hora",
  },
  organizar: {
    in: "Entraron",
    meter: "Entraron sobre quienes tienen lugar",
    out: "Con lugar, todavía afuera",
    gone: "Liberaron o bajas",
    goneNote: "Liberaron su lugar o los dieron de baja",
    pace: "Entraron en 15 minutos",
    paceNote: "en los últimos 15 minutos",
    lastHour: "entraron en la última hora",
  },
} as const;
type Words = (typeof WORDS)[keyof typeof WORDS];

/** The arrivals of the last hour, per 5 minutes; the bar still filling is "ahora". */
function Rhythm({
  stats,
  timezone,
  opensAt,
  words,
}: {
  stats?: CheckinStats;
  timezone: string;
  opensAt: string;
  words: Words;
}) {
  const buckets = stats?.buckets ?? [];
  const highest = Math.max(1, ...buckets.map((bucket) => bucket.count));
  const lastHour = buckets.reduce((sum, bucket) => sum + bucket.count, 0);

  return (
    <Kpi className="col-span-2 flex gap-4 lg:col-span-1">
      <div className="shrink-0">
        <MicroLabel>{words.pace}</MicroLabel>
        {stats ? <Figure note={words.paceNote} value={`+${stats.last15}`} /> : <Skeleton className="mt-2 h-6 w-16" />}
        <p className="mt-2 text-meta text-muted-foreground">
          {!stats ? null : stats.peak ? (
            <>
              pico{" "}
              <span className="font-terminal text-subtle tabular-nums">
                {formatClock(new Date(stats.peak.at), timezone)}
              </span>{" "}
              · <span className="tabular-nums">{stats.peak.count}</span>
            </>
          ) : Date.parse(opensAt) > Date.now() ? (
            `Abre ${opening(opensAt, timezone)}`
          ) : (
            "Todavía no llegó nadie"
          )}
        </p>
      </div>
      <div
        aria-label={`${lastHour} ${words.lastHour}`}
        className="flex h-[52px] min-w-0 flex-1 items-end gap-1 self-end"
        role="img"
      >
        {buckets.map((bucket, index) => (
          <span
            key={bucket.at}
            className={cn(
              "w-full min-w-[3px] rounded-[2px]",
              index === buckets.length - 1 ? "bg-primary" : "bg-primary/35"
            )}
            style={{ height: `${Math.max(6, (bucket.count / highest) * 100)}%` }}
            title={`${formatClock(new Date(bucket.at), timezone)} · ${bucket.count}`}
          />
        ))}
      </div>
    </Kpi>
  );
}

/** Acreditados, por llegar, cancelados and the pace at the door, over the whole event. */
export function KpiStrip({
  totals,
  stats,
  timezone,
  opensAt,
  organizar = false,
}: {
  totals?: AttendeeList["totals"];
  stats?: CheckinStats;
  timezone: string;
  /** When the event starts: the pace card says when the door opens until someone comes in. */
  opensAt: string;
  /** Organizá's Puerta tab: its glossary instead of the conf's */
  organizar?: boolean;
}) {
  const words = organizar ? WORDS.organizar : WORDS.admin;
  const expected = totals ? totals.in + totals.out : 0;
  const percent = expected ? Math.round(((totals?.in ?? 0) / expected) * 100) : 0;

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-[1fr_1fr_1fr_1.6fr]">
      <Kpi>
        <MicroLabel>{words.in}</MicroLabel>
        {totals ? <Figure note={`${percent}%`} value={totals.in} /> : <Skeleton className="mt-2 h-6 w-20" />}
        <Meter className="mt-3" label={words.meter} max={expected} value={totals?.in ?? 0} />
      </Kpi>
      <Kpi>
        <MicroLabel>Por llegar</MicroLabel>
        {totals ? <Figure note={`de ${expected}`} value={totals.out} /> : <Skeleton className="mt-2 h-6 w-20" />}
        <p className="mt-2 text-meta text-muted-foreground">{words.out}</p>
      </Kpi>
      <Kpi className="max-lg:col-span-2">
        <MicroLabel>{words.gone}</MicroLabel>
        {totals ? <Figure value={totals.cancelled} /> : <Skeleton className="mt-2 h-6 w-12" />}
        <p className="mt-2 text-meta text-muted-foreground">{words.goneNote}</p>
      </Kpi>
      <Rhythm opensAt={opensAt} stats={stats} timezone={timezone} words={words} />
    </div>
  );
}
