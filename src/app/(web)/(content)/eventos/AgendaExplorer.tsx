"use client";

import { ChevronDown } from "lucide-react";
import { useMemo, useState } from "react";

import { cn } from "app/lib/utils";
import { EventList } from "components/community/events";
import { buttonClassName } from "components/community/ui";
import type { CommunityEvent } from "lib/community/events";
import { dateParts, monthKey } from "lib/community/time";

type Mode = "todos" | "presencial" | "online";

const MODES: { value: Mode; label: string }[] = [
  { value: "todos", label: "Todos" },
  { value: "presencial", label: "Presencial" },
  { value: "online", label: "Online" },
];

/**
 * The whole agenda, grouped by month, with client-side filters. It renders on the
 * server with every event, so the list is crawlable and works without JavaScript.
 */
export default function AgendaExplorer({ events }: { events: CommunityEvent[] }) {
  const [group, setGroup] = useState("");
  const [mode, setMode] = useState<Mode>("todos");

  const groups = useMemo(
    () => [...new Set(events.map((event) => event.group))].sort((a, b) => a.localeCompare(b, "es")),
    [events]
  );

  const visible = useMemo(
    () =>
      events.filter(
        (event) =>
          (!group || event.group === group) &&
          (mode === "todos" || (mode === "online" ? event.venue === null : event.venue !== null))
      ),
    [events, group, mode]
  );

  const months = useMemo(() => {
    const byMonth = new Map<string, CommunityEvent[]>();
    for (const event of visible) {
      const key = monthKey(event.start);
      byMonth.set(key, [...(byMonth.get(key) ?? []), event]);
    }

    return [...byMonth.entries()];
  }, [visible]);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative">
            <span className="sr-only">Filtrar por comunidad</span>
            <select
              className="h-9 appearance-none rounded-lg border border-line bg-ink-elev pr-9 pl-3 text-[13px] text-zinc-200 transition-colors outline-none hover:border-line-strong focus:border-line-strong"
              value={group}
              onChange={(event) => setGroup(event.target.value)}
            >
              <option value="">Todas las comunidades</option>
              {groups.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            <ChevronDown
              aria-hidden
              className="pointer-events-none absolute top-1/2 right-3 size-3.5 -translate-y-1/2 text-zinc-500"
            />
          </label>
          <div aria-label="Modalidad" className="flex rounded-lg border border-line p-0.5" role="group">
            {MODES.map(({ value, label }) => (
              <button
                key={value}
                aria-pressed={mode === value}
                className={cn(
                  "h-8 rounded-md px-3 text-[13px] transition-colors",
                  mode === value ? "bg-white/[0.08] text-zinc-50" : "text-zinc-400 hover:text-zinc-100"
                )}
                type="button"
                onClick={() => setMode(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <p aria-live="polite" className="font-terminal text-[11px] tracking-[0.08em] text-zinc-500 uppercase">
          {visible.length === events.length
            ? `${events.length} eventos`
            : `${visible.length} de ${events.length} eventos`}
        </p>
      </div>

      {months.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-line-strong px-6 py-16 text-center">
          <p className="text-zinc-300">No hay eventos con esos filtros.</p>
          <button
            className={buttonClassName("secondary", "sm")}
            type="button"
            onClick={() => {
              setGroup("");
              setMode("todos");
            }}
          >
            Ver todos
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-10">
          {months.map(([key, monthEvents]) => (
            <section key={key} className="grid gap-3 md:grid-cols-[180px_1fr] md:gap-8">
              <div className="md:sticky md:top-20 md:self-start md:pt-4">
                <h2 className="font-terminal text-[11px] tracking-[0.14em] text-zinc-300 uppercase">
                  {dateParts(monthEvents[0].start).monthYear}
                </h2>
                <p className="mt-1 font-terminal text-[11px] text-zinc-600">
                  {monthEvents.length} {monthEvents.length === 1 ? "evento" : "eventos"}
                </p>
              </div>
              <div className="overflow-hidden rounded-xl border border-line bg-ink-elev/60">
                <EventList events={monthEvents} showMonth={false} />
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
