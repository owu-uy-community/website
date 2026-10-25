"use client";

import { useReducedMotion } from "motion/react";
import { Bar, BarChart, CartesianGrid, ComposedChart, Line, LineChart, XAxis, YAxis } from "recharts";

import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "components/shared/ui/chart";
import type { TimelineStats } from "lib/timeline/stats";

/*
 * The charts that earn recharts (stacking, legends, hover read-outs). Loaded on demand by
 * LazyChart. Categorical colors are the dataviz palette's dark steps in their validated order
 * (blue, orange, aqua, yellow, magenta, green: every adjacent pair clears the CVD and
 * normal-vision checks on #09090b); "otros" folds into a neutral gray, as the seventh series
 * never gets a hue of its own. A 1px ink stroke keeps stacked segments apart.
 */

export type ChartSpec =
  | { kind: "topics"; topics: TimelineStats["topics"] }
  | { kind: "communities"; rows: TimelineStats["communities"] }
  | { kind: "attendance"; rows: TimelineStats["attendance"] };

const PALETTE = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300"];
const OTHER = "#71717a";
const INK = "#09090b";
const AXIS = { fill: "#a1a1aa", fontSize: 11 };
const GRID = "rgba(255,255,255,0.08)";

export default function Charts({ spec }: { spec: ChartSpec }) {
  const animate = !useReducedMotion();
  const motionProps = { isAnimationActive: animate, animationDuration: 900 };

  if (spec.kind === "topics") {
    const { keys, labels, rows } = spec.topics;
    const config: ChartConfig = Object.fromEntries(
      keys.map((key, i) => [key, { label: labels[key], color: key === "otros" ? OTHER : PALETTE[i % PALETTE.length] }])
    );

    return (
      <ChartContainer className="aspect-auto h-full w-full" config={config}>
        <BarChart data={rows} margin={{ left: -16, right: 4, top: 8 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis
            axisLine={false}
            dataKey="year"
            interval="preserveStartEnd"
            tick={AXIS}
            tickLine={false}
            tickMargin={8}
          />
          <YAxis axisLine={false} tick={AXIS} tickLine={false} width={44} />
          <ChartTooltip content={<ChartTooltipContent />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
          <ChartLegend content={<ChartLegendContent className="flex-wrap gap-y-1 text-zinc-300" />} />
          {keys.map((key, i) => (
            <Bar
              key={key}
              dataKey={key}
              fill={`var(--color-${key})`}
              radius={i === keys.length - 1 ? [3, 3, 0, 0] : 0}
              stackId="topics"
              stroke={INK}
              strokeWidth={1}
              {...motionProps}
            />
          ))}
        </BarChart>
      </ChartContainer>
    );
  }

  if (spec.kind === "communities") {
    const config: ChartConfig = {
      active: { label: "Se juntaron", color: PALETTE[0] },
      births: { label: "Primer evento", color: PALETTE[2] },
      closures: { label: "Último evento", color: PALETTE[1] },
    };

    return (
      <ChartContainer className="aspect-auto h-full w-full" config={config}>
        <ComposedChart data={spec.rows} margin={{ left: -16, right: 4, top: 8 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis
            axisLine={false}
            dataKey="year"
            interval="preserveStartEnd"
            tick={AXIS}
            tickLine={false}
            tickMargin={8}
          />
          <YAxis axisLine={false} tick={AXIS} tickLine={false} width={44} />
          <ChartTooltip content={<ChartTooltipContent />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
          <ChartLegend content={<ChartLegendContent className="flex-wrap gap-y-1 text-zinc-300" />} />
          <Bar dataKey="births" fill="var(--color-births)" radius={[3, 3, 0, 0]} {...motionProps} />
          <Bar dataKey="closures" fill="var(--color-closures)" radius={[3, 3, 0, 0]} {...motionProps} />
          <Line
            dataKey="active"
            dot={{ r: 2.5, fill: "var(--color-active)", stroke: INK, strokeWidth: 1 }}
            stroke="var(--color-active)"
            strokeWidth={2}
            type="monotone"
            {...motionProps}
          />
        </ComposedChart>
      </ChartContainer>
    );
  }

  // One series: the title names it, no legend
  const config: ChartConfig = { median: { label: "Mediana de anotados", color: PALETTE[0] } };

  return (
    <ChartContainer className="aspect-auto h-full w-full" config={config}>
      <LineChart data={spec.rows} margin={{ left: -16, right: 8, top: 8 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis
          axisLine={false}
          dataKey="year"
          interval="preserveStartEnd"
          tick={AXIS}
          tickLine={false}
          tickMargin={8}
        />
        <YAxis axisLine={false} tick={AXIS} tickLine={false} width={44} />
        <ChartTooltip content={<ChartTooltipContent />} cursor={{ stroke: "rgba(255,255,255,0.2)" }} />
        <Line
          dataKey="median"
          dot={{ r: 3, fill: "var(--color-median)", stroke: INK, strokeWidth: 1 }}
          stroke="var(--color-median)"
          strokeWidth={2}
          type="monotone"
          {...motionProps}
        />
      </LineChart>
    </ChartContainer>
  );
}
