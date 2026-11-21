"use client";

import { useSyncExternalStore } from "react";

import { cn } from "app/lib/utils";

/**
 * One shared clock per interval: every `useNow(1000)` on the page re-renders from the same
 * timer, so twenty "hace 2 min" labels cost one interval, and they all tick together.
 */
const clocks = new Map<number, { now: number; listeners: Set<() => void>; timer?: ReturnType<typeof setInterval> }>();

function clockFor(intervalMs: number) {
  let clock = clocks.get(intervalMs);
  if (!clock) {
    clock = { now: Date.now(), listeners: new Set() };
    clocks.set(intervalMs, clock);
  }
  return clock;
}

function subscribe(intervalMs: number, listener: () => void) {
  const clock = clockFor(intervalMs);
  clock.listeners.add(listener);
  if (!clock.timer) {
    clock.now = Date.now();
    clock.timer = setInterval(() => {
      clock.now = Date.now();
      for (const notify of clock.listeners) notify();
    }, intervalMs);
  }

  return () => {
    clock.listeners.delete(listener);
    if (clock.listeners.size === 0 && clock.timer) {
      clearInterval(clock.timer);
      clock.timer = undefined;
    }
  };
}

// Stable per interval, so React never re-subscribes (and restarts the timer) on a re-render.
const subscribers = new Map<number, (listener: () => void) => () => void>();
const snapshots = new Map<number, () => number>();
const serverSnapshot = () => 0;

/** The current time in ms, refreshed every `intervalMs`. 0 during SSR, so markup never mismatches. */
export function useNow(intervalMs = 1000): number {
  let subscribeTo = subscribers.get(intervalMs);
  if (!subscribeTo) {
    subscribeTo = (listener) => subscribe(intervalMs, listener);
    subscribers.set(intervalMs, subscribeTo);
  }
  let snapshot = snapshots.get(intervalMs);
  if (!snapshot) {
    snapshot = () => {
      const clock = clockFor(intervalMs);
      // Nobody kept this clock running: catch up once, so a late mount doesn't show an old time.
      if (!clock.timer && Date.now() - clock.now >= intervalMs) clock.now = Date.now();
      return clock.now;
    };
    snapshots.set(intervalMs, snapshot);
  }

  return useSyncExternalStore(subscribeTo, snapshot, serverSnapshot);
}

const rtf = new Intl.RelativeTimeFormat("es", { numeric: "auto", style: "short" });
const STEPS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["second", 60],
  ["minute", 60],
  ["hour", 24],
  ["day", 7],
  ["week", 4.35],
  ["month", 12],
  ["year", Infinity],
];

/** "hace 4 min", "en 2 h", "ahora": Spanish relative time from a delta in ms. */
export function formatRelative(deltaMs: number): string {
  let value = deltaMs / 1000;
  if (Math.abs(value) < 45) return "ahora";
  for (const [unit, size] of STEPS) {
    if (Math.abs(value) < size) return rtf.format(Math.round(value), unit);
    value /= size;
  }
  return rtf.format(Math.round(value), "year");
}

const fullDate = new Intl.DateTimeFormat("es-UY", { dateStyle: "medium", timeStyle: "short" });

/** A relative time that keeps itself current; the absolute time is in the tooltip. */
export function RelativeTime({ date, className }: { date: Date | string | number; className?: string }) {
  const now = useNow(15_000);
  const at = new Date(date);
  const valid = !Number.isNaN(at.getTime());

  return (
    <time
      className={cn("font-terminal text-meta whitespace-nowrap text-muted-foreground tabular-nums", className)}
      dateTime={valid ? at.toISOString() : undefined}
      suppressHydrationWarning
      title={valid ? fullDate.format(at) : undefined}
    >
      {valid && now ? formatRelative(at.getTime() - now) : "—"}
    </time>
  );
}

/** "16:42" / "16:42:18" on an event's own wall clock. */
export function formatClock(at: Date | number, timeZone?: string, withSeconds = false): string {
  return new Intl.DateTimeFormat("es-UY", {
    hour: "2-digit",
    minute: "2-digit",
    second: withSeconds ? "2-digit" : undefined,
    // h23, not hour12: false: the latter renders midnight as "24:00" in some engines.
    hourCycle: "h23",
    timeZone,
  }).format(at);
}

/** "4 min", "1 h 20 min" for durations in ms (never negative). */
export function formatDuration(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}
