"use client";

import { useSyncExternalStore } from "react";

import { useNow } from "components/Admin/ui/time";
import { slotDay, wallClock } from "lib/slot-day";

export type AgendaView = "postit" | "compact" | "list";

const VIEW_KEY = "owu-admin:agenda-view";
const VIEWS: readonly AgendaView[] = ["postit", "compact", "list"];
const viewListeners = new Set<() => void>();

function subscribeView(listener: () => void) {
  viewListeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    viewListeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

/** Post-it, Compacta or Lista, remembered per device. Post-it until someone picks another. */
export function useAgendaView(): [AgendaView, (view: AgendaView) => void] {
  const stored = useSyncExternalStore(
    subscribeView,
    () => window.localStorage.getItem(VIEW_KEY),
    () => null
  );
  const setView = (next: AgendaView) => {
    window.localStorage.setItem(VIEW_KEY, next);
    for (const listener of viewListeners) listener();
  };

  return [VIEWS.find((view) => view === stored) ?? "postit", setView];
}

const WIDE = "(min-width: 1280px)";

/** The inspector needs room beside the board; narrower screens edit in the sheet. */
export function useInspectorFits() {
  return useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia(WIDE);
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    },
    () => window.matchMedia(WIDE).matches,
    () => false
  );
}

/** The event's wall clock ("YYYY-MM-DDTHH:MM"), refreshed every 15 s; null until the browser has the time. */
export function useWallClock(timeZone: string | undefined) {
  const now = useNow(15_000);
  if (!now) return null;

  return wallClock(new Date(now), timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone);
}

export type SlotPhase = "next" | "now" | "past";

/** Where a block stands against a wall clock: still to come, on now, or over. */
export function slotPhase(slot: { date: string; startTime: string; endTime: string }, wall: string): SlotPhase {
  const day = slotDay(slot.date);
  if (wall < `${day}T${slot.startTime}`) return "next";

  return wall < `${day}T${slot.endTime}` ? "now" : "past";
}
