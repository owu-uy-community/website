"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { cn } from "app/lib/utils";
import { CountUp } from "components/community/motion";
import { cardClassName, Freshness } from "components/community/ui";
import type { DatasetRow } from "lib/orpc/salary-survey/schemas";
import {
  CONTRACTS,
  EXPERIENCE,
  labelOf,
  MARKETS,
  MODALITIES,
  ROLES,
  SENIORITIES,
} from "lib/salary-survey/questions";
import { percentileOf, summarize } from "lib/salary-survey/stats";

/*
 * "Compará tu perfil": the same arithmetic as the published results, run in the
 * browser over the open dataset. Pick the filters that describe you, read the
 * median and the range, and put in your own pay to see where it lands.
 */

type Currency = "UYU" | "USD";
type Filters = { seniority: string; experience: string; role: string; modality: string; market: string; contract: string };

const ALL = "";
const EMPTY: Filters = { seniority: ALL, experience: ALL, role: ALL, modality: ALL, market: ALL, contract: ALL };

const FILTERS: { key: keyof Filters; label: string; column: keyof DatasetRow; options: readonly { value: string; label: string }[] }[] = [
  { key: "seniority", label: "Seniority", column: "seniority", options: SENIORITIES },
  { key: "experience", label: "Experiencia", column: "experiencia", options: EXPERIENCE },
  { key: "role", label: "Rol", column: "rol", options: ROLES },
  { key: "modality", label: "Modalidad", column: "modalidad", options: MODALITIES },
  { key: "market", label: "Para quién", column: "mercado", options: MARKETS },
  { key: "contract", label: "Contratación", column: "contratacion", options: CONTRACTS },
];

const MARK = "#c98500";

const money = (currency: Currency) =>
  new Intl.NumberFormat("es-UY", { style: "currency", currency, maximumFractionDigits: 0 });
const count = new Intl.NumberFormat("es-UY");

const selectClassName =
  "h-10 w-full appearance-none rounded-xl border border-white/10 bg-white/[0.04] pr-9 pl-3.5 text-[14px] text-white outline-none transition-colors hover:border-white/20 focus-visible:border-yellow-400/60 focus-visible:ring-2 focus-visible:ring-yellow-400/20";

/** The group's band (p25–p75), its median, and where your figure lands */
function Band({ p25, median, p75, mine }: { p25: number; median: number; p75: number; mine: number | null }) {
  // The scale runs a little past the band so an outside figure still shows
  const spread = Math.max(p75 - p25, 1);
  const low = Math.min(p25 - spread * 0.6, mine == null ? Infinity : mine - spread * 0.25);
  const high = Math.max(p75 + spread * 0.6, mine == null ? -Infinity : mine + spread * 0.25);
  const at = (value: number) => `${(((value - low) / (high - low)) * 100).toFixed(2)}%`;

  return (
    <div className="relative h-8">
      <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-white/10" />
      <div
        className="absolute top-1/2 h-2.5 -translate-y-1/2 rounded-full"
        style={{ left: at(p25), width: `calc(${at(p75)} - ${at(p25)})`, backgroundColor: MARK, opacity: 0.4 }}
      />
      <span
        aria-hidden
        className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#111113]"
        style={{ left: at(median), backgroundColor: MARK }}
      />
      {mine != null ? (
        <span
          aria-hidden
          className="absolute top-1/2 h-6 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-zinc-50 shadow-[0_0_0_3px_rgba(9,9,11,0.9)]"
          style={{ left: at(mine) }}
        />
      ) : null}
    </div>
  );
}

export default function Explorer({ edition, threshold, defaultCurrency }: { edition: string; threshold: number; defaultCurrency: Currency }) {
  const [rows, setRows] = useState<DatasetRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [currency, setCurrency] = useState<Currency>(defaultCurrency);
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [mine, setMine] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch(`/encuesta-sueldos/datos.json?edicion=${encodeURIComponent(edition)}`)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
      .then((data: { rows: DatasetRow[] }) => {
        if (!cancelled) setRows(data.rows);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [edition]);

  const amounts = useMemo(() => {
    if (!rows) return [];

    return rows
      .filter(
        (row) =>
          row.moneda === currency && FILTERS.every(({ key, column }) => filters[key] === ALL || row[column] === filters[key])
      )
      .map((row) => row.monto_mensual);
  }, [rows, currency, filters]);

  const stat = summarize(amounts, threshold);
  const format = money(currency);
  const myAmount = Number(mine.replace(/\D/g, "")) || null;
  const percentile = stat && myAmount ? percentileOf(amounts, myAmount) : null;
  const active = FILTERS.filter(({ key }) => filters[key] !== ALL);

  return (
    <div className={cardClassName(false, "overflow-hidden")}>
      <div className="grid gap-0 lg:grid-cols-[1fr_1.15fr]">
        {/* ------------------------------------------------------------ filters */}
        <div className="flex flex-col gap-5 border-b border-white/[0.07] p-6 lg:border-r lg:border-b-0 sm:p-7">
          <div className="flex items-center justify-between gap-4">
            <p className="font-title text-[17px] font-semibold text-zinc-50">Tu perfil</p>
            <div aria-label="Moneda" className="inline-flex rounded-lg border border-white/10 bg-white/[0.04] p-0.5" role="radiogroup">
              {(["UYU", "USD"] as const).map((option) => (
                <button
                  key={option}
                  aria-checked={currency === option}
                  className={cn(
                    "h-7 rounded-md px-3 text-[13px] font-medium transition-colors",
                    currency === option ? "bg-yellow-400 text-zinc-950" : "text-zinc-400 hover:text-white"
                  )}
                  role="radio"
                  type="button"
                  onClick={() => setCurrency(option)}
                >
                  {option === "UYU" ? "Pesos" : "Dólares"}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {FILTERS.map(({ key, label, options }) => (
              <label key={key} className="relative flex flex-col gap-1.5">
                <span className="text-xs font-medium text-zinc-500">{label}</span>
                <span className="relative">
                  <select
                    className={selectClassName}
                    value={filters[key]}
                    onChange={(event) => setFilters((current) => ({ ...current, [key]: event.target.value }))}
                  >
                    <option value={ALL}>{key === "market" ? "Cualquiera" : key === "modality" ? "Cualquiera" : "Todos"}</option>
                    {options.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown aria-hidden className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-zinc-500" />
                </span>
              </label>
            ))}
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-zinc-500">¿Y vos? Tu nominal mensual, para ubicarte en el grupo (no se guarda)</span>
            <span className="relative max-w-[14rem]">
              <input
                autoComplete="off"
                className={cn(selectClassName, "pr-14 pl-3.5 tabular-nums")}
                inputMode="numeric"
                placeholder={currency === "USD" ? "4.000" : "120.000"}
                value={myAmount ? count.format(myAmount) : ""}
                onChange={(event) => setMine(event.target.value.replace(/\D/g, "").slice(0, 9))}
              />
              <span className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-xs font-semibold text-zinc-500">
                {currency}
              </span>
            </span>
          </label>

          {active.length > 0 ? (
            <button
              className="self-start text-[13px] text-zinc-500 underline underline-offset-4 transition-colors hover:text-yellow-400"
              type="button"
              onClick={() => setFilters(EMPTY)}
            >
              Sacar los filtros
            </button>
          ) : null}
        </div>

        {/* ------------------------------------------------------------ result */}
        <div className="flex flex-col justify-center gap-6 p-6 sm:p-7">
          {failed ? (
            <p className="text-sm text-zinc-400">No pudimos cargar el dataset. Probá de nuevo en un rato.</p>
          ) : !rows ? (
            <div className="flex flex-col gap-3" aria-busy>
              <div className="h-12 w-48 animate-pulse rounded-lg bg-white/[0.06]" />
              <div className="h-4 w-72 animate-pulse rounded bg-white/[0.05]" />
              <div className="h-8 w-full animate-pulse rounded bg-white/[0.04]" />
            </div>
          ) : stat ? (
            <>
              <div>
                <p className="text-[13px] text-zinc-500">
                  Mediana mensual ·{" "}
                  {active.length ? active.map(({ key, options }) => labelOf(options, filters[key])).join(" · ") : "todas las respuestas"}
                </p>
                <p className="mt-1 font-title text-4xl font-bold tracking-[-0.02em] text-yellow-400 tabular-nums sm:text-5xl">
                  <CountUp prefix={currency === "USD" ? "US$ " : "$ "} value={stat.median} />
                </p>
                <p className="mt-2 text-sm text-zinc-400 tabular-nums">
                  El 50% central cobra entre {format.format(stat.p25)} y {format.format(stat.p75)} ·{" "}
                  <span className="text-zinc-300">{count.format(stat.n)} respuestas</span>
                </p>
              </div>

              <Band median={stat.median} mine={myAmount} p25={stat.p25} p75={stat.p75} />

              {myAmount && percentile != null ? (
                <div className="rounded-xl bg-white/[0.04] p-4 text-sm leading-relaxed text-zinc-300">
                  <span className="font-semibold text-zinc-50">Con {format.format(myAmount)} estás en el percentil {percentile}</span>
                  {percentile >= 50
                    ? `: cobrás más que el ${percentile}% de este grupo.`
                    : `: el ${100 - percentile}% de este grupo cobra más que vos.`}{" "}
                  {myAmount === stat.median
                    ? "Estás justo en la mediana."
                    : `La mediana está un ${Math.abs(Math.round(((stat.median - myAmount) / myAmount) * 100))}% ${stat.median > myAmount ? "arriba" : "abajo"}.`}
                </div>
              ) : (
                <Freshness>La raya blanca aparece cuando ponés tu monto. El punto es la mediana; la barra, el 50% central.</Freshness>
              )}
            </>
          ) : (
            <div>
              <p className="font-title text-xl font-semibold text-zinc-50">
                {amounts.length === 0 ? "Nadie con ese perfil respondió" : `Solo ${count.format(amounts.length)} ${amounts.length === 1 ? "respuesta" : "respuestas"} con ese perfil`}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                Mostramos números con {threshold} respuestas o más, para que nadie pueda reconocerse. Sacá un filtro o
                probá con la otra moneda.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
