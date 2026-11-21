"use client";

import { useState, useSyncExternalStore } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { cn } from "app/lib/utils";
import { Stagger } from "components/community/reveal";
import { Card, cardClassName, Freshness } from "components/community/ui";
import { ChartContainer, ChartTooltip } from "components/shared/ui/chart";
import type { Breakdown, Satisfaction, Stat, SurveyResults } from "lib/orpc/salary-survey/schemas";
import { SATISFACTION } from "lib/salary-survey/questions";

/** The brand yellow stepped for the dark chart surface (validated: lightness band, chroma, contrast) */
const MARK = "#c98500";
const SURFACE = "#111113";
const ROW = 44;
const AXIS_BAND = 36;

type Currency = "UYU" | "USD";

const money = (currency: Currency) =>
  new Intl.NumberFormat("es-UY", { style: "currency", currency, maximumFractionDigits: 0 });
const compactMoney = (currency: Currency) =>
  new Intl.NumberFormat("es-UY", { style: "currency", currency, notation: "compact", maximumFractionDigits: 1 });
const count = new Intl.NumberFormat("es-UY");

type Row = Stat & { label: string; range: [number, number] };

const NARROW = "(max-width: 640px)";

/** Phones get fewer ticks and a slimmer label column, so axis labels never collide */
const useNarrow = () =>
  useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia(NARROW);
      query.addEventListener("change", onChange);

      return () => query.removeEventListener("change", onChange);
    },
    () => window.matchMedia(NARROW).matches,
    () => false
  );

/** The p25–p75 band with a dot at the median: one series, so one hue in two strengths and no legend */
function RangeShape(props: unknown) {
  const { x, y, width, height, payload } = props as {
    x: number;
    y: number;
    width: number;
    height: number;
    payload: Row;
  };
  const span = payload.p75 - payload.p25;
  const cx = x + (span > 0 ? ((payload.median - payload.p25) / span) * width : width / 2);
  const cy = y + height / 2;

  return (
    <g>
      <rect fill={MARK} fillOpacity={0.38} height={10} rx={4} width={Math.max(width, 2)} x={x} y={cy - 5} />
      <circle cx={cx} cy={cy} fill={MARK} r={5.5} stroke={SURFACE} strokeWidth={2} />
    </g>
  );
}

/** Evenly spaced round ticks (1, 2, 2.5 or 5 × 10ⁿ) that cover every row's band */
function niceTicks(rows: Row[], count = 5) {
  const low = Math.min(...rows.map((row) => row.p25));
  const high = Math.max(...rows.map((row) => row.p75));
  const raw = (high - low || high || 1) / (count - 1);
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].find((multiple) => raw <= multiple * magnitude)! * magnitude;
  const ticks: number[] = [];
  for (let value = Math.max(0, Math.floor(low / step) * step); value <= high + step * 0.999; value += step) {
    ticks.push(value);
  }

  return ticks;
}

const headerCell = "py-2.5 pr-3 text-xs font-semibold tracking-[0.1em] text-zinc-500 uppercase";

function RangeChart({ title, breakdown, currency }: { title: string; breakdown: Breakdown; currency: Currency }) {
  const rows: Row[] = breakdown.groups.map(({ label, stat }) => ({ ...stat, label, range: [stat.p25, stat.p75] }));
  const format = money(currency);
  const compact = compactMoney(currency);
  const narrow = useNarrow();
  const ticks = rows.length ? niceTicks(rows, narrow ? 3 : 5) : [];

  return (
    <figure className={cardClassName(false, "flex flex-col gap-5 p-5 sm:p-6")}>
      <figcaption className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="font-title text-[17px] font-semibold text-white">{title}</h3>
        {breakdown.hidden > 0 ? (
          <Freshness>
            {breakdown.hidden} {breakdown.hidden === 1 ? "grupo con" : "grupos con"} pocas respuestas sin mostrar
          </Freshness>
        ) : null}
      </figcaption>

      {rows.length === 0 ? (
        <p className="py-6 text-sm text-zinc-500">Ningún grupo llegó al mínimo de respuestas para publicarse.</p>
      ) : (
        <ChartContainer
          className="aspect-auto w-full text-xs text-zinc-500 [&_.recharts-cartesian-axis-tick_text]:fill-zinc-500"
          config={{ range: { label: "50% central", color: MARK } }}
          style={{ height: rows.length * ROW + AXIS_BAND }}
        >
          <BarChart
            accessibilityLayer
            barCategoryGap={0}
            data={rows}
            layout="vertical"
            margin={{ left: 0, right: 28, top: 0, bottom: 0 }}
          >
            <CartesianGrid horizontal={false} stroke="rgba(255,255,255,0.06)" />
            <XAxis
              axisLine={false}
              domain={[ticks[0], ticks.at(-1)!]}
              interval={0}
              ticks={ticks}
              tickFormatter={(value: number) => compact.format(value)}
              tickLine={false}
              type="number"
            />
            <YAxis axisLine={false} dataKey="label" tickLine={false} type="category" width={narrow ? 104 : 150} />
            <ChartTooltip
              content={({ active, payload }) => {
                const row = active ? (payload?.[0]?.payload as Row | undefined) : undefined;
                if (!row) return null;

                return (
                  <div className="w-max max-w-[14rem] rounded-xl border border-white/10 bg-[#141416] px-3.5 py-3 shadow-xl shadow-black/50">
                    <p className="font-title text-base font-semibold text-white tabular-nums">
                      {format.format(row.median)}
                    </p>
                    <p className="text-xs text-zinc-400">mediana · {row.label}</p>
                    <p className="mt-2 text-xs text-zinc-400 tabular-nums">
                      50% central: {format.format(row.p25)} a {format.format(row.p75)}
                    </p>
                    <p className="text-xs text-zinc-500 tabular-nums">{count.format(row.n)} respuestas</p>
                  </div>
                );
              }}
              cursor={{ fill: "rgba(255,255,255,0.04)" }}
            />
            <Bar dataKey="range" isAnimationActive={false} shape={RangeShape} />
          </BarChart>
        </ChartContainer>
      )}

      {rows.length > 0 ? (
        <details className="group text-sm">
          <summary className="cursor-pointer list-none text-[13px] font-medium text-zinc-400 transition-colors hover:text-white [&::-webkit-details-marker]:hidden">
            <span className="group-open:hidden">Ver como tabla</span>
            <span className="hidden group-open:inline">Ocultar tabla</span>
          </summary>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[420px] text-left">
              <thead className="border-b border-white/[0.07]">
                <tr>
                  <th className={headerCell} scope="col">
                    Grupo
                  </th>
                  <th className={cn(headerCell, "text-right")} scope="col">
                    Respuestas
                  </th>
                  <th className={cn(headerCell, "text-right")} scope="col">
                    25%
                  </th>
                  <th className={cn(headerCell, "text-right")} scope="col">
                    Mediana
                  </th>
                  <th className={cn(headerCell, "pr-0 text-right")} scope="col">
                    75%
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.07] font-terminal text-[13px] tabular-nums">
                {rows.map((row) => (
                  <tr key={row.label}>
                    <th className="py-2.5 pr-3 font-sans font-normal text-zinc-300" scope="row">
                      {row.label}
                    </th>
                    <td className="py-2.5 pr-3 text-right text-zinc-400">{count.format(row.n)}</td>
                    <td className="py-2.5 pr-3 text-right text-zinc-400">{format.format(row.p25)}</td>
                    <td className="py-2.5 pr-3 text-right font-medium text-zinc-100">{format.format(row.median)}</td>
                    <td className="py-2.5 text-right text-zinc-400">{format.format(row.p75)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ) : null}
    </figure>
  );
}

/** "Qué tan conforme": the average on the 1–5 scale, the shape of the answers, and the gap between markets */
function SatisfactionCard({ satisfaction }: { satisfaction: Satisfaction | null }) {
  if (!satisfaction) {
    return (
      <Card className="flex flex-col-reverse gap-3 p-5 sm:p-6">
        <dt className="text-xs font-semibold tracking-[0.14em] text-zinc-500 uppercase">Conformidad con el sueldo</dt>
        <dd className="text-sm text-zinc-500">Todavía sin suficientes respuestas.</dd>
      </Card>
    );
  }
  const max = Math.max(...satisfaction.distribution, 1);
  const nearest = SATISFACTION[Math.min(4, Math.max(0, Math.round(satisfaction.mean) - 1))];
  const markets = satisfaction.byMarket;

  return (
    <Card className="flex flex-col gap-3 p-5 sm:p-6">
      <dt className="order-last text-xs font-semibold tracking-[0.14em] text-zinc-500 uppercase">
        Conformidad con el sueldo
      </dt>
      <dd className="flex items-end justify-between gap-4">
        <span>
          <span className="font-title text-2xl font-bold tracking-[-0.02em] text-white tabular-nums">
            {satisfaction.mean.toLocaleString("es-UY", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
            <span className="text-base font-medium text-zinc-500"> / 5</span>
          </span>
          <span className="mt-0.5 block text-xs text-zinc-400">{nearest.label}, en promedio</span>
        </span>
        {/* The shape of the answers: five bars, one hue, nada → muy */}
        <span aria-hidden className="flex h-9 items-end gap-1">
          {satisfaction.distribution.map((n, index) => (
            <span
              key={index}
              className="w-3 rounded-sm"
              style={{
                height: `${Math.max((n / max) * 100, 8)}%`,
                backgroundColor: MARK,
                opacity: 0.35 + (index / 4) * 0.6,
              }}
              title={`${SATISFACTION[index].label}: ${count.format(n)}`}
            />
          ))}
        </span>
      </dd>
      {markets.length === 2 ? (
        <p className="text-xs text-zinc-500 tabular-nums">
          {markets.map((group, index) => (
            <span key={group.key}>
              {index > 0 ? " · " : ""}
              {group.label}{" "}
              <span className="text-zinc-300">{group.mean.toLocaleString("es-UY", { minimumFractionDigits: 1 })}</span>
            </span>
          ))}
        </p>
      ) : null}
    </Card>
  );
}

export default function Results({ results }: { results: SurveyResults }) {
  const { UYU, USD } = results.currencies;
  const [currency, setCurrency] = useState<Currency>(USD.n > UYU.n ? "USD" : "UYU");
  const data = results.currencies[currency];
  const format = money(currency);

  return (
    <div className="flex flex-col gap-8">
      <div
        aria-label="Moneda"
        className="inline-flex w-fit rounded-xl border border-white/10 bg-white/[0.04] p-1"
        role="radiogroup"
      >
        {(["UYU", "USD"] as const).map((option) => (
          <button
            key={option}
            aria-checked={currency === option}
            className={cn(
              "flex h-9 items-center gap-2 rounded-lg px-4 text-sm font-medium transition-colors",
              currency === option ? "bg-yellow-400 text-zinc-950" : "text-zinc-400 hover:text-white"
            )}
            role="radio"
            type="button"
            onClick={() => setCurrency(option)}
          >
            {option === "UYU" ? "Pesos" : "Dólares"}
            <span className={cn("text-xs tabular-nums", currency === option ? "text-zinc-950/60" : "text-zinc-600")}>
              {count.format(results.currencies[option].n)}
            </span>
          </button>
        ))}
      </div>

      {data.overall ? (
        <dl className="grid gap-4 sm:grid-cols-3">
          <Card className="flex flex-col-reverse gap-3 p-5 sm:p-6">
            <dt className="text-xs font-semibold tracking-[0.14em] text-zinc-500 uppercase">Mediana mensual</dt>
            <dd className="font-title text-4xl font-bold tracking-[-0.02em] text-yellow-400 tabular-nums sm:text-5xl">
              {format.format(data.overall.median)}
            </dd>
          </Card>
          <Card className="flex flex-col-reverse gap-3 p-5 sm:p-6">
            <dt className="text-xs font-semibold tracking-[0.14em] text-zinc-500 uppercase">50% central</dt>
            <dd className="font-title text-2xl font-bold tracking-[-0.02em] text-white tabular-nums">
              {format.format(data.overall.p25)} a {format.format(data.overall.p75)}
            </dd>
          </Card>
          <SatisfactionCard satisfaction={results.satisfaction} />
        </dl>
      ) : (
        <p className="rounded-2xl border border-dashed border-white/15 p-6 text-sm text-zinc-400">
          Todavía no hay suficientes respuestas en {currency === "UYU" ? "pesos" : "dólares"} para publicar agregados.
        </p>
      )}

      {data.overall ? (
        <>
          <p className="flex items-center gap-3 text-[13px] text-zinc-500">
            <svg aria-hidden className="shrink-0" height="12" width="44">
              <rect fill={MARK} fillOpacity={0.38} height="10" rx="4" width="44" x="0" y="1" />
              <circle cx="20" cy="6" fill={MARK} r="5" stroke={SURFACE} strokeWidth="2" />
            </svg>
            El punto es la mediana; la barra, el 50% central (del percentil 25 al 75).
          </p>
          <Stagger className="grid gap-4 lg:grid-cols-2">
            <RangeChart breakdown={data.bySeniority} currency={currency} title="Por seniority" />
            <RangeChart breakdown={data.byMarket} currency={currency} title="Para el exterior o para Uruguay" />
            <RangeChart breakdown={data.byExperience} currency={currency} title="Por años de experiencia" />
            <RangeChart breakdown={data.byModality} currency={currency} title="Por modalidad" />
            <RangeChart breakdown={data.byRole} currency={currency} title="Por rol" />
            <RangeChart breakdown={data.byStack} currency={currency} title="Por stack" />
            <RangeChart breakdown={data.byContract} currency={currency} title="Por forma de contratación" />
          </Stagger>
        </>
      ) : null}
    </div>
  );
}
