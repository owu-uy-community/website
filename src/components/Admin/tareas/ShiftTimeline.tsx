"use client";

import { Fragment, type CSSProperties, type ReactNode } from "react";
import { CalendarClock, Check, TriangleAlert } from "lucide-react";

import { cn } from "app/lib/utils";
import { MicroLabel, Panel } from "components/Admin/ui/page";
import { PersonAvatar } from "components/Admin/ui/person";
import { EmptyState } from "components/Admin/ui/states";
import { StatusDot, type Tone } from "components/Admin/ui/status";
import { useCoarsePointer } from "components/Admin/ui/swipe";
import { formatDuration } from "components/Admin/ui/time";
import { isLateFor, taskPhase, taskWindow, toMinutes, toTime } from "lib/orpc/staff-tasks/shift";
import { wallClock } from "lib/slot-day";

import { plural, timeRange, type Assignee, type StaffArrival, type StaffTask } from "./helpers";
import { DRAG_HANDLE, DROP_OUTLINE, useSeat } from "./swap";

type BarState = "done" | "now" | "late" | "ongoing" | "upcoming" | "noshow";

const BAR: Record<BarState, string> = {
  done: "border-success/25 bg-success-surface text-success-foreground",
  now: "border-primary/60 bg-primary-surface text-primary shadow-[0_0_0_3px_hsl(var(--primary)/0.08)]",
  late: "border-live/50 bg-live-surface text-live-foreground",
  ongoing:
    "border-info/40 bg-info-surface/70 bg-[repeating-linear-gradient(135deg,hsl(var(--info-foreground)/0.08)_0_6px,transparent_6px_12px)] text-info-foreground",
  upcoming: "border-input bg-raised text-subtle",
  noshow: "border-dashed border-input bg-transparent text-muted-foreground line-through",
};

type Bar = {
  task: StaffTask;
  start: number;
  end: number;
  state: BarState;
  why: string;
  /** Late because they haven't come, not because of the task. */
  absent: boolean;
  lane: number;
};
type Row = {
  userId: string;
  name: string;
  image: string | null;
  bars: Bar[];
  lanes: number;
  tone: Tone | null;
  note: string;
  free: boolean;
};

const LANE = 36;
/** On a touchscreen (a tablet gets the timeline in landscape) bars are 40 px tall, so the lanes are taller. */
const COARSE_LANE = 46;
const PERSON_COLUMN = 190;

/** A person's bar for one task: its colour and, for the tooltip, why. */
function barFor(
  task: StaffTask,
  assignee: Assignee,
  arrival: StaffArrival | undefined,
  at: number,
  isToday: boolean
): { state: BarState; why: string; absent: boolean } {
  const bar = (state: BarState, why: string, absent = false) => ({ state, why, absent });
  if (assignee.noShow) return bar("noshow", "no vino");
  const phase = taskPhase(task, at);
  if (phase === "done") return bar("done", "hecha");
  if (isToday && !arrival && isLateFor(task, assignee, false, at)) return bar("late", "atrasada: no llegó", true);
  if (phase === "blocked") return bar("late", "bloqueada");
  if (phase === "overdue") return bar("late", "atrasada: nadie la marcó lista");
  if (phase === "ongoing") return bar("ongoing", "continua");
  if (phase === "now") return bar("now", "en curso");
  return bar("upcoming", "pendiente");
}

/** A person's bar: a tap opens its task; an editor drags it onto someone else's bar and the two trade tasks. */
function SeatBar({
  layout,
  row,
  bar,
  label,
  className,
  style,
  onOpen,
  children,
}: {
  layout: "timeline" | "list";
  row: Pick<Row, "userId" | "name" | "image">;
  bar: Bar;
  label: string;
  className: string;
  style?: CSSProperties;
  onOpen: (taskId: string) => void;
  children: ReactNode;
}) {
  const seat = useSeat({ taskId: bar.task.id, userId: row.userId }, row, bar.task.title, layout);

  return (
    <button
      ref={seat.ref}
      {...seat.listeners}
      aria-label={label}
      className={cn(
        className,
        seat.draggable && cn(DRAG_HANDLE, "cursor-grab active:cursor-grabbing"),
        seat.dragging && "opacity-40",
        DROP_OUTLINE[seat.drop]
      )}
      // A drag across the list isn't a swipe to the next tab.
      data-swipe-ignore={seat.draggable ? "" : undefined}
      style={style}
      title={label}
      type="button"
      onClick={() => onOpen(bar.task.id)}
    >
      {children}
    </button>
  );
}

/** Packs a person's bars into as few lanes as fit without overlapping. */
function packLanes(bars: Omit<Bar, "lane">[]): { bars: Bar[]; lanes: number } {
  const ends: number[] = [];
  const packed = bars
    .toSorted((a, b) => a.start - b.start)
    .map((bar) => {
      let lane = ends.findIndex((end) => end <= bar.start);
      if (lane === -1) lane = ends.push(bar.end) - 1;
      else ends[lane] = bar.end;
      return { ...bar, lane };
    });

  return { bars: packed, lanes: Math.max(1, ends.length) };
}

/**
 * Turnos: who is on what, through the day. One row per person, bars on a time axis zoomed to
 * the day's working hours, milestones on top and a red line at the current time; on a phone, a
 * list per person. Selecting a bar opens its task.
 */
export function ShiftTimeline({
  tasks,
  arrivals,
  at,
  isToday,
  timeZone,
  onOpen,
  emptyAction,
}: {
  /** The selected day's tasks, milestones included. */
  tasks: StaffTask[];
  arrivals: StaffArrival[];
  /** Minute of the selected day (see `minuteOfDay`). */
  at: number;
  isToday: boolean;
  timeZone: string;
  onOpen: (taskId: string) => void;
  emptyAction?: ReactNode;
}) {
  const lane = useCoarsePointer() ? COARSE_LANE : LANE;
  const timed = tasks.filter((task) => task.type !== "milestone" && task.startTime);
  const milestones = tasks.filter((task) => task.type === "milestone" && task.startTime);
  const untimed = tasks.filter((task) => task.type !== "milestone" && !task.startTime).length;

  if (timed.length === 0) {
    return (
      <EmptyState
        action={emptyAction}
        description="Cuando las tareas tengan horario y gente, acá vas a ver quién está en cada momento."
        icon={CalendarClock}
        title="Todavía no hay turnos para este día"
      />
    );
  }

  // The axis: whole hours around the day's work, never less than four.
  const marks = [
    ...timed.flatMap((task) => {
      const window = taskWindow(task);
      return window ? [window.start, window.end] : [];
    }),
    ...milestones.map((task) => toMinutes(task.startTime ?? "00:00")),
  ];
  const from = Math.floor(Math.min(...marks) / 60) * 60;
  const to = Math.max(Math.ceil(Math.max(...marks) / 60) * 60, Math.min(24 * 60, from + 240));
  const pct = (minute: number) => ((minute - from) / (to - from)) * 100;
  const hours = Array.from({ length: (to - from) / 60 + 1 }, (_, index) => from + index * 60);
  const showNow = isToday && at >= from && at <= to;

  const arrivalOf = new Map(arrivals.map((arrival) => [arrival.userId, arrival]));
  const clock = (iso: string) => wallClock(new Date(iso), timeZone).slice(11);
  const people = new Map<string, { userId: string; name: string; image: string | null; bars: Omit<Bar, "lane">[] }>();
  for (const task of timed) {
    const window = taskWindow(task);
    if (!window) continue;
    for (const assignee of task.assignees) {
      const person = people.get(assignee.userId) ?? { ...assignee, bars: [] };
      person.bars.push({ task, ...window, ...barFor(task, assignee, arrivalOf.get(assignee.userId), at, isToday) });
      people.set(assignee.userId, person);
    }
  }
  if (isToday) {
    for (const arrival of arrivals) {
      if (!arrival.leftAt && !people.has(arrival.userId)) people.set(arrival.userId, { ...arrival, bars: [] });
    }
  }

  const rows: Row[] = [...people.values()]
    .map((person) => {
      const arrival = arrivalOf.get(person.userId);
      const { bars, lanes } = packLanes(person.bars);
      const busy = bars.some(
        (bar) => bar.state !== "done" && bar.state !== "noshow" && bar.start <= at && at < bar.end
      );
      const counted = bars.filter((bar) => bar.state !== "noshow");
      let tone: Tone | null = null;
      let note = `${plural(counted.length, "tarea", "tareas")} · ${formatDuration(
        counted.reduce((total, bar) => total + (bar.end - bar.start), 0) * 60_000
      )}`;
      if (isToday) {
        if (arrival?.leftAt) [tone, note] = ["idle", `se fue ${clock(arrival.leftAt)}`];
        else if (arrival) [tone, note] = ["ok", `llegó ${clock(arrival.arrivedAt)}`];
        else if (bars.some((bar) => bar.absent)) [tone, note] = ["live", "no llegó"];
        else [tone, note] = ["idle", "sin llegar"];
      }

      return {
        ...person,
        bars,
        lanes,
        tone,
        note,
        free: Boolean(isToday && arrival && !arrival.leftAt && !busy && showNow),
      };
    })
    .toSorted(
      (a, b) =>
        (a.bars[0]?.start ?? Number.POSITIVE_INFINITY) - (b.bars[0]?.start ?? Number.POSITIVE_INFINITY) ||
        a.name.localeCompare(b.name, "es")
    );

  const label = (bar: Bar) => `${bar.task.title}, ${timeRange(bar.task)}, ${bar.why}`;
  const person = (row: Row, size: number) => (
    <span className="relative shrink-0">
      <PersonAvatar
        className={cn(row.tone === "idle" && isToday && "opacity-60 grayscale")}
        image={row.image}
        name={row.name}
        size={size}
      />
      {row.tone ? (
        <StatusDot className="absolute -right-0.5 -bottom-0.5 size-2.5 ring-2 ring-card" tone={row.tone} />
      ) : null}
    </span>
  );

  return (
    <Panel>
      {/* Desktop: the timeline. */}
      <div className="relative hidden lg:block">
        <div className="grid h-11 border-b border-border" style={{ gridTemplateColumns: `${PERSON_COLUMN}px 1fr` }}>
          <div className="flex items-center px-4">
            <MicroLabel>Persona</MicroLabel>
          </div>
          <div aria-hidden className="relative">
            {/* The last hour has no room for its label, nor one under the now pill. */}
            {hours
              .slice(0, -1)
              .filter((hour) => !showNow || Math.abs(hour - at) > 20)
              .map((hour) => (
                <span
                  key={hour}
                  className="absolute top-2 font-terminal text-2xs text-muted-foreground tabular-nums"
                  style={{ left: `calc(${pct(hour)}% + 6px)` }}
                >
                  {toTime(hour)}
                </span>
              ))}
          </div>
        </div>

        <div
          aria-hidden
          className="pointer-events-none absolute top-11 right-0 bottom-0"
          style={{ left: PERSON_COLUMN }}
        >
          {hours.map((hour) => (
            <span key={hour} className="absolute inset-y-0 w-px bg-border" style={{ left: `${pct(hour)}%` }} />
          ))}
        </div>

        <ul aria-label="Turnos por persona" className="relative">
          {rows.map((row) => (
            <li
              key={row.userId}
              className="grid border-b border-border last:border-b-0"
              style={{ gridTemplateColumns: `${PERSON_COLUMN}px 1fr`, height: 14 + row.lanes * lane }}
            >
              <div className="flex min-w-0 items-center gap-2.5 px-4">
                {person(row, 28)}
                <div className="min-w-0 leading-tight">
                  <p className="truncate text-ui font-medium text-foreground">{row.name}</p>
                  <p
                    className={cn(
                      "truncate text-2xs text-muted-foreground",
                      row.tone === "live" && "text-live-foreground"
                    )}
                  >
                    {row.note}
                  </p>
                </div>
              </div>
              <div className="relative">
                {row.free ? (
                  <span
                    className="absolute top-[9px] flex h-8 items-center rounded-[7px] border border-dashed border-info/40 px-2 text-meta text-info-foreground pointer-coarse:h-10"
                    style={{ left: `calc(${pct(at)}% + 6px)` }}
                  >
                    libre
                  </span>
                ) : null}
                {row.bars.map((bar) => (
                  <SeatBar
                    key={bar.task.id}
                    bar={bar}
                    layout="timeline"
                    className={cn(
                      "absolute flex h-8 min-w-2 items-center gap-1.5 overflow-hidden rounded-[7px] border px-2 text-meta font-medium transition-[filter] hover:brightness-125 focus-visible:z-20 focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:outline-hidden pointer-coarse:h-10",
                      BAR[bar.state]
                    )}
                    label={label(bar)}
                    row={row}
                    style={{
                      left: `calc(${pct(bar.start)}% + 2px)`,
                      width: `calc(${pct(bar.end) - pct(bar.start)}% - 4px)`,
                      top: 9 + bar.lane * lane,
                    }}
                    onOpen={onOpen}
                  >
                    {bar.state === "done" ? <Check aria-hidden className="size-3 shrink-0" /> : null}
                    {bar.state === "late" ? <TriangleAlert aria-hidden className="size-3 shrink-0" /> : null}
                    {bar.state === "now" ? (
                      <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-primary" />
                    ) : null}
                    <span className="truncate">{bar.task.title}</span>
                  </SeatBar>
                ))}
              </div>
            </li>
          ))}
        </ul>

        <div
          aria-hidden
          className="[container-type:inline-size] pointer-events-none absolute inset-y-0 right-0 z-20"
          style={{ left: PERSON_COLUMN }}
        >
          {milestones.map((milestone, index) => {
            const start = pct(toMinutes(milestone.startTime ?? "00:00"));
            const next = milestones[index + 1];
            // Each label only takes the room until the next milestone.
            const room = (next ? pct(toMinutes(next.startTime ?? "00:00")) : 100) - start;
            return (
              <div
                key={milestone.id}
                className="absolute top-6 bottom-0 border-l border-dashed border-info/45"
                style={{ left: `${start}%` }}
              >
                <span
                  className="absolute top-0 left-1 truncate rounded-sm bg-info-surface px-1 font-terminal text-3xs whitespace-nowrap text-info-foreground"
                  style={{ maxWidth: `calc(${room}cqw - 6px)` }}
                >
                  {milestone.title}
                </span>
              </div>
            );
          })}
          {showNow ? (
            <div className="absolute inset-y-0" style={{ left: `${pct(at)}%` }}>
              <span className="absolute top-1 -translate-x-1/2 rounded-[5px] bg-live px-1.5 py-0.5 font-terminal text-3xs font-semibold text-white tabular-nums">
                {toTime(at)}
              </span>
              <span className="absolute top-6 bottom-0 w-0.5 -translate-x-1/2 bg-live shadow-[0_0_12px_hsl(var(--live)/0.55)]" />
            </div>
          ) : null}
        </div>
      </div>

      {/* Phones and tablets: one list per person. */}
      <ul aria-label="Turnos por persona" className="divide-y divide-border lg:hidden">
        {rows.map((row) => (
          <li key={row.userId} className="px-3.5 py-3">
            <div className="flex items-center gap-2.5">
              {person(row, 32)}
              <div className="min-w-0">
                <p className="truncate text-ui font-medium text-foreground">{row.name}</p>
                <p className={cn("text-meta text-muted-foreground", row.tone === "live" && "text-live-foreground")}>
                  {row.note}
                </p>
              </div>
            </div>
            <ul className="mt-2 space-y-1.5">
              {row.bars.map((bar, index) => (
                <Fragment key={bar.task.id}>
                  {row.free && bar.start > at && (index === 0 || row.bars[index - 1].start <= at) ? (
                    <li className="text-meta text-info-foreground">Libre ahora</li>
                  ) : null}
                  <li>
                    <SeatBar
                      bar={bar}
                      layout="list"
                      className={cn(
                        "flex min-h-11 w-full items-center gap-2.5 rounded-lg border px-3 text-left focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:outline-hidden",
                        BAR[bar.state]
                      )}
                      label={label(bar)}
                      row={row}
                      onOpen={onOpen}
                    >
                      <span className="shrink-0 font-terminal text-meta tabular-nums">{timeRange(bar.task)}</span>
                      <span className="min-w-0 flex-1 truncate text-ui">{bar.task.title}</span>
                      <span className="shrink-0 text-2xs">{bar.why}</span>
                    </SeatBar>
                  </li>
                </Fragment>
              ))}
              {row.free && row.bars.every((bar) => bar.start <= at) ? (
                <li className="text-meta text-info-foreground">Libre ahora</li>
              ) : null}
            </ul>
          </li>
        ))}
      </ul>

      {untimed > 0 ? (
        <p className="border-t border-border px-4 py-2.5 text-meta text-muted-foreground">
          {untimed === 1
            ? "1 tarea sin hora no aparece en los turnos: está en el Cronograma."
            : `${untimed} tareas sin hora no aparecen en los turnos: están en el Cronograma.`}
        </p>
      ) : null}
    </Panel>
  );
}
