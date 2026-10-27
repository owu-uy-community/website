"use client";

import { useState } from "react";

import { cn } from "app/lib/utils";
import { type MapDot, type MapView, venueHref } from "lib/timeline/map";

const number = new Intl.NumberFormat("es-UY");

/**
 * Places on a map: a dot each, its area by how many events it held. Pointing at one names it,
 * clicking opens its page. The dots are drawn for the eye only (aria-hidden, out of the tab
 * order): the list next to the map is what a keyboard or a screen reader gets.
 */
export default function VenueMap({
  view,
  dots,
  current,
  label,
  className,
}: {
  view: MapView;
  dots: MapDot[];
  /** The place whose page this is: lit, the rest dimmed */
  current?: string;
  label: string;
  className?: string;
}) {
  const [hover, setHover] = useState<MapDot | null>(null);
  const max = Math.max(1, ...dots.map((dot) => dot.count));
  const radius = (count: number) => (view.width / 800) * (4 + Math.sqrt(count / max) * 14);

  return (
    <figure className={cn("relative", className)}>
      <svg
        aria-label={label}
        className="block h-auto w-full"
        onPointerLeave={() => setHover(null)}
        role="img"
        viewBox={`0 0 ${view.width} ${view.height}`}
      >
        {view.shapes.map((shape) => (
          <path
            key={shape.name}
            className="fill-zinc-900 stroke-white/15"
            d={shape.d}
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {/* Biggest first, so a small place next to a big one stays on top and reachable; this page's own place last of all */}
        {dots
          .toSorted((a, b) => Number(a.slug === current) - Number(b.slug === current) || b.count - a.count)
          .map((dot) => (
            <a
              key={dot.slug}
              aria-hidden
              href={venueHref(dot.slug)}
              onFocus={() => setHover(dot)}
              onPointerEnter={() => setHover(dot)}
              tabIndex={-1}
            >
              {/* A target bigger than the dot */}
              <circle cx={dot.x} cy={dot.y} fill="transparent" r={radius(dot.count) + 6} />
              <circle
                className={cn(
                  "stroke-zinc-950 transition-colors",
                  hover?.slug === dot.slug
                    ? "fill-yellow-300"
                    : current && dot.slug !== current
                      ? "fill-zinc-500/40"
                      : "fill-yellow-400/80"
                )}
                cx={dot.x}
                cy={dot.y}
                r={radius(dot.count)}
                strokeWidth={2}
                vectorEffect="non-scaling-stroke"
              />
            </a>
          ))}
      </svg>
      {hover ? (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-white/10 bg-zinc-900/95 px-3 py-2 text-[13px] whitespace-nowrap shadow-xl backdrop-blur"
          style={{
            left: `${(hover.x / view.width) * 100}%`,
            top: `calc(${((hover.y - radius(hover.count)) / view.height) * 100}% - 6px)`,
          }}
        >
          <span className="block font-medium text-zinc-100">{hover.name}</span>
          <span className="block text-zinc-400">
            {number.format(hover.count)} {hover.count === 1 ? "evento" : "eventos"}
          </span>
        </div>
      ) : null}
    </figure>
  );
}
