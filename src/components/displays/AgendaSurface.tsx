"use client";

import type { ReactNode } from "react";

import { useFullscreen } from "hooks/useFullscreen";

import { FullscreenButton } from "./FullscreenButton";

/**
 * Wraps the agenda so it can be thrown on a projector without browser chrome.
 * Children are server-rendered and passed through untouched — this only owns
 * the container, the toggle and the zoom applied while full screen.
 */
export function AgendaSurface({
  eventName,
  live,
  children,
}: {
  eventName: string;
  live: ReactNode;
  children: ReactNode;
}) {
  const { ref, isFullscreen, supported, toggle } = useFullscreen<HTMLDivElement>();

  return (
    <div
      ref={ref}
      className="bg-[#18181b] data-[fullscreen=true]:overflow-auto data-[fullscreen=true]:p-8"
      data-fullscreen={isFullscreen}
    >
      <div className="mb-4 flex items-baseline justify-between gap-4">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-zinc-500">
          {isFullscreen ? eventName : "La grilla"}
        </h2>
        <div className="flex items-center gap-3">
          {live}
          {supported ? <FullscreenButton isFullscreen={isFullscreen} onToggle={toggle} /> : null}
        </div>
      </div>

      {/* Zoom (not transform) so the grid reflows instead of overflowing. */}
      <div style={isFullscreen ? { zoom: 1.35 } : undefined}>{children}</div>
    </div>
  );
}
