"use client";

import { useId, useState, type CSSProperties } from "react";

import { cn } from "app/lib/utils";

/**
 * Small single-series charts for the admin: one hue (OWU yellow), 2px lines, a faint area
 * wash, recessive hairlines, an end dot with a ring in the surface colour, a hover readout,
 * and the numbers in a visually hidden table so nothing is colour- or hover-only.
 */

const SERIES = "hsl(var(--primary))";
const GRID = "hsl(var(--border))";
const SURFACE = "hsl(var(--card))";

/** A 12-point trend for a stat tile. */
export function Sparkline({
  values,
  label,
  className,
}: {
  values: number[];
  /** What the trend shows, read by screen readers. */
  label: string;
  className?: string;
}) {
  const id = useId();
  const width = 96;
  const height = 32;
  const max = Math.max(1, ...values);
  const step = values.length > 1 ? width / (values.length - 1) : width;
  const points = values.map((value, index) => [index * step, height - 2 - (value / max) * (height - 6)] as const);
  const line = points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const last = points.at(-1);

  return (
    <svg
      aria-label={`${label}: ${values.join(", ")}`}
      className={cn("h-8 w-24 shrink-0 overflow-visible", className)}
      role="img"
      viewBox={`0 0 ${width} ${height}`}
    >
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={SERIES} stopOpacity="0.18" />
          <stop offset="1" stopColor={SERIES} stopOpacity="0" />
        </linearGradient>
      </defs>
      {points.length > 1 ? (
        <>
          <path d={`M0,${height} L${line.replaceAll(" ", " L")} L${width},${height}Z`} fill={`url(#${id})`} />
          <polyline
            fill="none"
            points={line}
            stroke={SERIES}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.5"
          />
        </>
      ) : null}
      {last ? <circle cx={last[0]} cy={last[1]} fill={SERIES} r="2.5" stroke={SURFACE} strokeWidth="1.5" /> : null}
    </svg>
  );
}

/** A running total over time (registrations against the cap). Hover reads the day. */
export function AreaChart({
  points,
  reference,
  height = 120,
  label,
  formatValue = String,
}: {
  points: { label: string; value: number }[];
  /** A horizontal reference ("cupo 480"). */
  reference?: { value: number; label: string };
  height?: number;
  label: string;
  formatValue?: (value: number) => string;
}) {
  const id = useId();
  const [hover, setHover] = useState<number | null>(null);
  const width = 520;
  const max = Math.max(1, reference?.value ?? 0, ...points.map((point) => point.value)) * 1.04;
  const x = (index: number) => (points.length > 1 ? (index / (points.length - 1)) * width : 0);
  const y = (value: number) => height - (value / max) * height;
  const line = points.map((point, index) => `${x(index).toFixed(1)},${y(point.value).toFixed(1)}`).join(" L");
  const last = points.at(-1);
  const active = hover === null ? null : points[hover];

  return (
    <div className="relative">
      <svg
        aria-hidden
        className="block h-[var(--chart-h)] w-full touch-none overflow-visible"
        preserveAspectRatio="none"
        style={{ "--chart-h": `${height}px` } as CSSProperties}
        viewBox={`0 0 ${width} ${height}`}
        onPointerLeave={() => setHover(null)}
        onPointerMove={(event) => {
          const box = event.currentTarget.getBoundingClientRect();
          const ratio = (event.clientX - box.left) / box.width;
          setHover(Math.max(0, Math.min(points.length - 1, Math.round(ratio * (points.length - 1)))));
        }}
      >
        <defs>
          <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={SERIES} stopOpacity="0.16" />
            <stop offset="1" stopColor={SERIES} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((fraction) => (
          <line
            key={fraction}
            stroke={GRID}
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
            x1="0"
            x2={width}
            y1={height * fraction}
            y2={height * fraction}
          />
        ))}
        {reference ? (
          <line
            stroke="hsl(var(--faint))"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
            x1="0"
            x2={width}
            y1={y(reference.value)}
            y2={y(reference.value)}
          />
        ) : null}
        {points.length > 1 ? (
          <>
            <path d={`M0,${height} L${line} L${width},${height}Z`} fill={`url(#${id})`} />
            <path
              d={`M${line}`}
              fill="none"
              stroke={SERIES}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
            />
          </>
        ) : null}
        {active && hover !== null ? (
          <line
            stroke="hsl(var(--muted-foreground))"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
            x1={x(hover)}
            x2={x(hover)}
            y1="0"
            y2={height}
          />
        ) : null}
      </svg>
      {/* Dots live outside the stretched SVG so they stay round. */}
      {last ? (
        <span
          aria-hidden
          className="pointer-events-none absolute size-2 -translate-1/2 rounded-full bg-primary ring-2 ring-card"
          style={{ left: "100%", top: `${(y(last.value) / height) * 100}%` }}
        />
      ) : null}
      {active && hover !== null ? (
        <>
          <span
            aria-hidden
            className="pointer-events-none absolute size-2 -translate-1/2 rounded-full bg-primary ring-2 ring-card"
            style={{ left: `${(x(hover) / width) * 100}%`, top: `${(y(active.value) / height) * 100}%` }}
          />
          <div
            className="pointer-events-none absolute -top-2 z-10 -translate-x-1/2 -translate-y-full rounded-md border border-input bg-popover px-2 py-1 text-meta whitespace-nowrap shadow-overlay"
            style={{ left: `${Math.min(92, Math.max(8, (x(hover) / width) * 100))}%` }}
          >
            <span className="font-semibold text-foreground tabular-nums">{formatValue(active.value)}</span>
            <span className="ml-1.5 text-muted-foreground">{active.label}</span>
          </div>
        </>
      ) : null}
      {reference ? (
        <span
          className="pointer-events-none absolute right-0 -translate-y-full pb-0.5 font-terminal text-2xs text-muted-foreground"
          style={{ top: `${(y(reference.value) / height) * 100}%` }}
        >
          {reference.label}
        </span>
      ) : null}
      <table className="sr-only">
        <caption>{label}</caption>
        <tbody>
          {points.map((point) => (
            <tr key={point.label}>
              <th scope="row">{point.label}</th>
              <td>{formatValue(point.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Columns over time (arrivals per 10 minutes). Each column has its own hover readout. */
export function ColumnChart({
  bars,
  height = 140,
  label,
  unit = "",
}: {
  bars: { label: string; value: number }[];
  height?: number;
  label: string;
  unit?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...bars.map((bar) => bar.value));

  return (
    <div className="relative">
      <div aria-hidden className="flex items-end gap-0.5 border-b border-border" style={{ height }}>
        {bars.map((bar, index) => (
          <div
            key={bar.label}
            className="relative flex h-full flex-1 items-end justify-center"
            onPointerEnter={() => setHover(index)}
            onPointerLeave={() => setHover((current) => (current === index ? null : current))}
          >
            <div
              className={cn(
                "w-full max-w-6 rounded-t-[4px] bg-primary transition-opacity",
                hover !== null && hover !== index && "opacity-50"
              )}
              style={{ height: `${Math.max(2, (bar.value / max) * 100)}%` }}
            />
            {hover === index ? (
              <div className="pointer-events-none absolute bottom-full z-10 mb-1 rounded-md border border-input bg-popover px-2 py-1 text-meta whitespace-nowrap shadow-overlay">
                <span className="font-semibold text-foreground tabular-nums">
                  {bar.value}
                  {unit}
                </span>
                <span className="ml-1.5 text-muted-foreground">{bar.label}</span>
              </div>
            ) : null}
          </div>
        ))}
      </div>
      <div
        aria-hidden
        className="mt-1.5 flex justify-between font-terminal text-2xs text-muted-foreground tabular-nums"
      >
        <span>{bars[0]?.label}</span>
        <span>{bars.at(-1)?.label}</span>
      </div>
      <table className="sr-only">
        <caption>{label}</caption>
        <tbody>
          {bars.map((bar) => (
            <tr key={bar.label}>
              <th scope="row">{bar.label}</th>
              <td>
                {bar.value}
                {unit}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
