"use client";

import * as React from "react";
import { motion, useMotionValue, useTransform, type MotionValue } from "motion/react";
import type { LucideIcon } from "lucide-react";

import { cn } from "app/lib/utils";
import { haptic } from "components/Admin/stage/haptics";

/** How far a row slides before letting go acts (px). */
const SWIPE = 76;

export type SwipeTone = "ok" | "live" | "warn" | "info" | "neutral";

/** What a swipe does. A shortcut, never the only way: the same action must also be a visible control. */
export type SwipeAction = {
  /** Shown under the row as it slides: "Tomarlo", "Resolver". */
  label: string;
  icon?: LucideIcon;
  tone?: SwipeTone;
  run: () => void;
};

const TONE: Record<SwipeTone, string> = {
  ok: "bg-success-surface text-success-foreground ring-success/40",
  live: "bg-live-surface text-live-foreground ring-live/40",
  warn: "bg-warning-surface text-warning-foreground ring-warning/40",
  info: "bg-info-surface text-info-foreground ring-info/40",
  neutral: "bg-raised text-foreground ring-input",
};

/** True on touchscreens. Rows only slide there: with a mouse, dragging would fight text selection and clicks. */
export function useCoarsePointer() {
  const [coarse, setCoarse] = React.useState(false);
  React.useEffect(() => {
    const query = matchMedia("(pointer: coarse)");
    const update = () => setCoarse(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return coarse;
}

function Reveal({
  action,
  side,
  opacity,
}: {
  action: SwipeAction;
  side: "left" | "right";
  opacity: MotionValue<number>;
}) {
  const Icon = action.icon;

  return (
    <motion.div
      aria-hidden
      className={cn(
        "absolute inset-0 flex items-center gap-2 text-ui font-semibold ring-1 ring-inset",
        side === "left" ? "justify-start pl-4" : "justify-end pr-4",
        TONE[action.tone ?? "neutral"]
      )}
      style={{ opacity }}
    >
      {side === "left" && Icon ? <Icon className="size-4" /> : null}
      {action.label}
      {side === "right" && Icon ? <Icon className="size-4" /> : null}
    </motion.div>
  );
}

/**
 * A row a finger can slide. Sliding right runs `right` (the step forward: take it, start it); sliding left runs
 * `left` (usually the one with a Deshacer). Vertical scrolling keeps working; on a mouse the row stays still.
 * Don't wrap rows that scroll sideways themselves: the row owns horizontal pans. Give the row an opaque
 * background: the action waits under it and shows through anything translucent.
 */
export function SwipeRow({
  right,
  left,
  disabled = false,
  className,
  children,
}: {
  right?: SwipeAction | null;
  left?: SwipeAction | null;
  disabled?: boolean;
  /** The row's radius and spacing; the revealed action takes the same shape. */
  className?: string;
  children: React.ReactNode;
}) {
  const coarse = useCoarsePointer();
  const x = useMotionValue(0);
  const rightOpacity = useTransform(x, [0, SWIPE], [0, 1]);
  const leftOpacity = useTransform(x, [-SWIPE, 0], [1, 0]);
  const armed = React.useRef(false);
  /** Set while a swipe is on, so the tap that ends it doesn't also press what's under the finger. */
  const swiped = React.useRef(false);
  const active = coarse && !disabled && Boolean(right || left);

  return (
    <div className={cn("relative overflow-hidden rounded-lg", className)} data-swipe-row={active ? "" : undefined}>
      {active && right ? <Reveal action={right} opacity={rightOpacity} side="left" /> : null}
      {active && left ? <Reveal action={left} opacity={leftOpacity} side="right" /> : null}
      <motion.div
        className="relative"
        drag={active ? "x" : false}
        dragConstraints={{ left: 0, right: 0 }}
        dragDirectionLock
        // A side without an action only gives a little, so the row still feels alive.
        dragElastic={{ left: left ? 0.55 : 0.06, right: right ? 0.55 : 0.06 }}
        style={{ x }}
        onClickCapture={(event) => {
          if (!swiped.current) return;
          swiped.current = false;
          event.preventDefault();
          event.stopPropagation();
        }}
        onDrag={(_, info) => {
          const past = (info.offset.x > SWIPE && right) || (info.offset.x < -SWIPE && left);
          if (Boolean(past) !== armed.current) {
            armed.current = Boolean(past);
            if (past) haptic(8);
          }
        }}
        onDragEnd={(_, info) => {
          armed.current = false;
          if (right && info.offset.x > SWIPE) right.run();
          else if (left && info.offset.x < -SWIPE) left.run();
        }}
        onDragStart={() => {
          swiped.current = true;
        }}
        onPointerDownCapture={() => {
          swiped.current = false;
        }}
      >
        {children}
      </motion.div>
    </div>
  );
}

/** A finished touch: where it started and ended, and how long it took (ms). */
export type TouchTrace = { x0: number; y0: number; x1: number; y1: number; ms: number };

/**
 * Whether a touch was a sideways swipe between tabs: -1 (to the previous tab), 1 (to the next) or 0. It must be
 * long enough, clearly horizontal, quick, and not start at the screen's edge (Safari's own back gesture lives there).
 */
export function tabSwipeDirection(trace: TouchTrace, viewportWidth: number): -1 | 0 | 1 {
  const dx = trace.x1 - trace.x0;
  const dy = trace.y1 - trace.y0;
  const edge = trace.x0 < 20 || trace.x0 > viewportWidth - 20;
  if (edge || trace.ms > 700 || Math.abs(dx) < 64 || Math.abs(dx) < Math.abs(dy) * 1.8) return 0;

  return dx < 0 ? 1 : -1;
}

/** Elements a sideways touch belongs to: fields, sliding rows, and anything that scrolls sideways on its own. */
function ownsHorizontalTouch(target: EventTarget | null, stop: Element) {
  for (let node = target instanceof Element ? target : null; node && node !== stop; node = node.parentElement) {
    if (node.matches("input, textarea, select, [contenteditable='true'], [data-swipe-row], [data-swipe-ignore]"))
      return true;
    const overflow = getComputedStyle(node).overflowX;
    if ((overflow === "auto" || overflow === "scroll") && node.scrollWidth > node.clientWidth) return true;
  }

  return false;
}

/**
 * Swipe sideways on a touchscreen to move between tabs. Put the returned ref on the element that holds the tabs'
 * content (it can mount later, after data loads); the tab list keeps working as before.
 */
export function useSwipeTabs<T extends string>(values: readonly T[], value: T, onValueChange: (next: T) => void) {
  const latest = React.useRef({ values, value, onValueChange });
  latest.current = { values, value, onValueChange };

  return React.useCallback((element: HTMLDivElement | null) => {
    if (!element) return;
    let start: { x: number; y: number; at: number } | null = null;

    const onStart = (event: TouchEvent) => {
      const touch = event.touches[0];
      start =
        event.touches.length === 1 && touch && !ownsHorizontalTouch(event.target, element)
          ? { x: touch.clientX, y: touch.clientY, at: event.timeStamp }
          : null;
    };
    const onEnd = (event: TouchEvent) => {
      const touch = event.changedTouches[0];
      const began = start;
      start = null;
      if (!began || !touch || window.getSelection()?.toString()) return;
      const direction = tabSwipeDirection(
        { x0: began.x, y0: began.y, x1: touch.clientX, y1: touch.clientY, ms: event.timeStamp - began.at },
        window.innerWidth
      );
      const { values: tabs, value: current, onValueChange: change } = latest.current;
      const next = tabs[tabs.indexOf(current) + direction];
      if (direction && next !== undefined) {
        haptic(6);
        change(next);
      }
    };
    const onCancel = () => {
      start = null;
    };

    element.addEventListener("touchstart", onStart, { passive: true });
    element.addEventListener("touchend", onEnd, { passive: true });
    element.addEventListener("touchcancel", onCancel, { passive: true });
    return () => {
      element.removeEventListener("touchstart", onStart);
      element.removeEventListener("touchend", onEnd);
      element.removeEventListener("touchcancel", onCancel);
    };
  }, []);
}
