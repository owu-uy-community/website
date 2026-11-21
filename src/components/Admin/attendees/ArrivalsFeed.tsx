"use client";

import { DoorOpen } from "lucide-react";

import { Panel, PanelHead } from "components/Admin/ui/page";
import { EmptyState, ErrorState } from "components/Admin/ui/states";
import { StatusDot, type Tone } from "components/Admin/ui/status";
import { formatClock } from "components/Admin/ui/time";
import { Skeleton } from "components/shared/ui/skeleton";
import type { RecentEntry } from "lib/orpc/attendees/schemas";

import { doorOf } from "./helpers";

const TONE: Record<RecentEntry["kind"], Tone> = { in: "ok", repeat: "warn", unknown: "live", cancelled: "live" };

function describe(entry: RecentEntry, timezone: string) {
  const door = doorOf({ checkinDevice: entry.device, checkinSource: entry.source });
  switch (entry.kind) {
    case "in":
      return { title: entry.name ?? "—", detail: [entry.ticketClass, door].filter(Boolean).join(" · ") };
    case "repeat":
      return {
        title: `Ya había entrado · ${entry.name ?? "—"}`,
        detail: [entry.firstAt ? `entró ${formatClock(new Date(entry.firstAt), timezone)}` : null, door]
          .filter(Boolean)
          .join(" · "),
      };
    case "cancelled":
      return { title: `Entrada cancelada · ${entry.name ?? "—"}`, detail: door };
    case "unknown":
      return { title: "Código desconocido", detail: [entry.code, door].filter(Boolean).join(" · ") };
  }
}

/** The latest arrivals at every door, with the scans that let nobody in. */
export function ArrivalsFeed({
  entries,
  error,
  onRetry,
  timezone,
  organizar = false,
}: {
  entries: RecentEntry[] | undefined;
  error: Error | null;
  onRetry: () => void;
  timezone: string;
  /** Organizá's Puerta tab: its glossary, and the whole list in the page (no inner scroll box) */
  organizar?: boolean;
}) {
  const alerts = entries?.filter((entry) => entry.kind !== "in").length ?? 0;

  return (
    <Panel>
      <PanelHead
        icon={DoorOpen}
        meta={alerts > 0 ? `${alerts} ${alerts === 1 ? "aviso" : "avisos"}` : undefined}
        title={organizar ? "Entraron" : "Llegadas"}
      />
      {entries === undefined && error ? (
        <div className="p-3">
          <ErrorState compact description={error.message} onRetry={onRetry} />
        </div>
      ) : entries === undefined ? (
        <div className="space-y-3 p-3.5">
          {Array.from({ length: 5 }, (_, index) => (
            <div key={index} className="flex items-center gap-2.5">
              <Skeleton className="size-1.5 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-32" />
                <Skeleton className="h-3 w-20" />
              </div>
              <Skeleton className="h-3 w-9" />
            </div>
          ))}
        </div>
      ) : entries.length === 0 ? (
        <EmptyState
          compact
          description={
            organizar
              ? "Cuando alguien entre por la puerta, aparece acá."
              : "Cuando Organizer o el escáner acrediten a alguien, aparece acá."
          }
          icon={DoorOpen}
          title="Todavía no entró nadie"
        />
      ) : (
        <ol
          aria-label={organizar ? "Los últimos que entraron" : "Últimas llegadas"}
          className={
            organizar ? "divide-y divide-border" : "max-h-[360px] scrollbar-thin divide-y divide-border overflow-y-auto"
          }
        >
          {entries.map((entry) => {
            const { title, detail } = describe(entry, timezone);
            return (
              <li key={entry.id} className="flex items-start gap-2.5 px-3.5 py-2.5">
                <StatusDot className="mt-[7px]" tone={TONE[entry.kind]} />
                <div className="min-w-0 flex-1">
                  <p
                    className={
                      entry.kind === "in" ? "truncate text-ui text-foreground" : "truncate text-ui text-subtle"
                    }
                  >
                    {title}
                  </p>
                  {detail ? <p className="truncate text-meta text-muted-foreground">{detail}</p> : null}
                </div>
                <time
                  className="shrink-0 font-terminal text-meta text-muted-foreground tabular-nums"
                  dateTime={entry.at}
                >
                  {formatClock(new Date(entry.at), timezone)}
                </time>
              </li>
            );
          })}
        </ol>
      )}
    </Panel>
  );
}
