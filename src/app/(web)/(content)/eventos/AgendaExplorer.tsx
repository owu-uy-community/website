"use client";

import { ChevronDown, LayoutGrid, MapPin, UsersRound, Wifi, type LucideIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { cn } from "app/lib/utils";
import { EventList } from "components/community/events";
import { Reveal } from "components/community/reveal";
import { buttonClassName, cardClassName } from "components/community/ui";
import type { CommunityEvent } from "lib/community/events";
import { dateParts, monthKey } from "lib/community/time";

type Mode = "todos" | "presencial" | "online";

// Same icons as the event rows: a pin for a venue, wifi for online
const MODES: { value: Mode; label: string; icon: LucideIcon }[] = [
  { value: "todos", label: "Todos", icon: LayoutGrid },
  { value: "presencial", label: "Presencial", icon: MapPin },
  { value: "online", label: "Online", icon: Wifi },
];

/** "octubre de 2026" → "Octubre" */
const monthName = (iso: string) => {
  const name = dateParts(iso).monthYear.replace(/\s+de\s+\d{4}$/, "");

  return name.charAt(0).toUpperCase() + name.slice(1);
};

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
            <UsersRound
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-zinc-500"
            />
            <select
              className="h-11 appearance-none rounded-xl border border-white/10 bg-white/[0.04] pr-10 pl-10 text-[15px] text-white transition-colors outline-none hover:border-white/20 focus:border-yellow-400/60 focus:ring-2 focus:ring-yellow-400/20"
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
              className="pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-zinc-500"
            />
          </label>
          <div aria-label="Modalidad" className="flex rounded-xl border border-white/10 p-1" role="group">
            {MODES.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                aria-pressed={mode === value}
                className={cn(
                  "inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium transition-colors",
                  mode === value ? "bg-white/[0.08] text-white" : "text-zinc-400 hover:text-white"
                )}
                type="button"
                onClick={() => setMode(value)}
              >
                <Icon
                  aria-hidden
                  className={cn("size-3.5 shrink-0", mode === value ? "text-yellow-400" : "text-zinc-500")}
                />
                {label}
              </button>
            ))}
          </div>
        </div>
        <p aria-live="polite" className="text-[13px] text-zinc-500">
          {visible.length === events.length
            ? `${events.length} eventos`
            : `${visible.length} de ${events.length} eventos`}
        </p>
      </div>

      {months.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-white/15 px-6 py-16 text-center">
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
            <Reveal key={key}>
              <section className="grid gap-3 md:grid-cols-[180px_1fr] md:gap-8">
                <div className="md:sticky md:top-24 md:self-start md:pt-5">
                  <h2 className="font-title text-lg font-semibold text-white">
                    {monthName(monthEvents[0].start)} <span className="text-zinc-500">{key.slice(0, 4)}</span>
                  </h2>
                  <p className="mt-1 text-[13px] text-zinc-500">
                    {monthEvents.length} {monthEvents.length === 1 ? "evento" : "eventos"}
                  </p>
                </div>
                <div className={cardClassName(false, "overflow-hidden")}>
                  <EventList events={monthEvents} showMonth={false} />
                </div>
              </section>
            </Reveal>
          ))}
        </div>
      )}
    </div>
  );
}
