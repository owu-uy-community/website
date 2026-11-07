"use client";

import { useEffect, useRef } from "react";

import type { Spotlight } from "lib/owy-stage/scenes";

/**
 * Spotlights as this page heard them. StageClient (always up) feeds them in; the scene that shows
 * them subscribes and, when it mounts, also takes those of the last few seconds: the autopilot
 * announces the take and the spotlight together, and the scene only mounts once the wipe covers
 * the frame, after the spotlight went by.
 */
const RECENT_MS = 5000;
let recent: { spot: Spotlight; at: number }[] = [];
const listeners = new Set<(spot: Spotlight) => void>();

export function heardSpotlight(spot: Spotlight) {
  const now = Date.now();
  recent = [...recent.filter((item) => now - item.at < RECENT_MS), { spot, at: now }];
  for (const listener of listeners) listener(spot);
}

/** Every spotlight from now on, plus the ones heard just before this mounted (the queue drops repeats). */
export function useSpotlights(on: (spot: Spotlight) => void) {
  const handler = useRef(on);
  handler.current = on;
  useEffect(() => {
    const listener = (spot: Spotlight) => handler.current(spot);
    const now = Date.now();
    for (const item of recent) if (now - item.at < RECENT_MS) listener(item.spot);
    listeners.add(listener);

    return () => {
      listeners.delete(listener);
    };
  }, []);
}
