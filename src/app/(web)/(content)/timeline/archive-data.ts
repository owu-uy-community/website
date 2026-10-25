"use client";

import { useCallback, useEffect, useState } from "react";

import type { ArchiveRow } from "lib/timeline/data";
import type { TimelineCommunity } from "lib/timeline/types";

export type ArchiveCommunity = Pick<TimelineCommunity, "slug" | "name" | "status" | "layer" | "first"> & {
  events: number;
  /** Its first topic, for the topic filter */
  topic: string;
};
export type ArchiveData = { rows: ArchiveRow[]; communities: ArchiveCommunity[] };

const EMPTY: ArchiveData = { rows: [], communities: [] };
let request: Promise<ArchiveData> | null = null;
/** Kept once loaded: coming back to the page renders the archive on the first paint */
let loaded: ArchiveData | null = null;

const load = () =>
  (request ??= fetch("/timeline/archivo.json")
    .then((response) => (response.ok ? (response.json() as Promise<ArchiveData>) : EMPTY))
    .catch(() => EMPTY)
    .then((body) => (loaded = body)));

/**
 * /timeline/archivo.json (~2,800 rows), fetched once for every block that needs it, and only
 * when one of them gets near the screen (`active`).
 */
export function useArchiveData(active: boolean) {
  const [data, setData] = useState<ArchiveData | null>(loaded);
  useEffect(() => {
    if (!active || data) return;
    let live = true;
    void load().then((body) => live && setData(body));
    return () => {
      live = false;
    };
  }, [active, data]);
  return data;
}

/**
 * True once the element comes within `margin` of the viewport, and from then on. Returns the
 * ref to put on it: a ref callback, so the observer is attached in the commit itself (a passive
 * effect could still be pending when a deep link scrolls the page) and dropped with the element.
 */
export function useNear<T extends Element>(margin = "1200px") {
  const [near, setNear] = useState(false);
  const ref = useCallback(
    (element: T | null) => {
      if (!element) return;
      const observer = new IntersectionObserver(
        ([entry]) => {
          if (!entry?.isIntersecting) return;
          setNear(true);
          observer.disconnect();
        },
        { rootMargin: `${margin} 0px` }
      );
      observer.observe(element);
      return () => observer.disconnect();
    },
    [margin]
  );
  return [ref, near] as const;
}

/*
 * Coming back from an event to the archive: the row it came from is centered again. The click
 * leaves a note (the row and the URL it was on); the archive uses it once, when it is shown
 * again at that same URL.
 */
const RETURN_KEY = "timeline:return";

export const rememberReturn = (slug: string) =>
  sessionStorage.setItem(RETURN_KEY, JSON.stringify({ slug, from: location.href, at: Date.now() }));

/** Whether a note is waiting for this URL (without using it up) */
export function returnPending() {
  const note = sessionStorage.getItem(RETURN_KEY);
  return Boolean(note && (JSON.parse(note) as { from: string }).from === location.href);
}

export function takeReturn() {
  const note = sessionStorage.getItem(RETURN_KEY);
  if (!note) return null;
  sessionStorage.removeItem(RETURN_KEY);
  const { slug, from, at } = JSON.parse(note) as { slug: string; from: string; at: number };
  // Within half an hour, and only back where it left from
  return from === location.href && Date.now() - at < 1_800_000 ? slug : null;
}

/**
 * Scrolls to an archive anchor and keeps it there while the page settles: the years above it
 * render as it lands (their placeholders are estimates) and would push it away. Re-aims whenever
 * it moves; done once it has stayed put for half a second (2.5 s at most), or as soon as the
 * reader scrolls or types.
 */
export function settleOn(id: string, block: ScrollLogicalPosition = "start") {
  const started = performance.now();
  let still = started;
  let last = Number.POSITIVE_INFINITY;
  let frame = 0;
  const events = ["wheel", "touchstart", "keydown"] as const;
  const stop = () => {
    cancelAnimationFrame(frame);
    for (const type of events) window.removeEventListener(type, stop);
  };
  for (const type of events) window.addEventListener(type, stop, { once: true, passive: true });
  const tick = (now: number) => {
    const element = document.getElementById(id);
    const top = element?.getBoundingClientRect().top ?? last;
    if (element && Math.abs(top - last) > 1) {
      // Instant: the site scrolls smoothly, and an animated jump of 20,000px would be measured mid-flight
      element.scrollIntoView({ block, behavior: "instant" });
      last = element.getBoundingClientRect().top;
      still = now;
    }
    if (now - still < 500 && now - started < 2500) frame = requestAnimationFrame(tick);
    else stop();
  };
  frame = requestAnimationFrame(tick);
}
