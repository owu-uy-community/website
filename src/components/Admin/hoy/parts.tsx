"use client";

import type { ReactNode } from "react";
import {
  CircleCheck,
  HeartPulse,
  KeyRound,
  Lightbulb,
  MapPin,
  PackageSearch,
  ShieldAlert,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import { cn } from "app/lib/utils";
import { MicroLabel } from "components/Admin/ui/page";
import { PersonAvatar } from "components/Admin/ui/person";
import { RelativeTime } from "components/Admin/ui/time";
import type { Today } from "lib/orpc/dashboard/today-schemas";

/** One cell of the KPI strip: a micro label with an aside, the figure, and a line under it. */
export function Kpi({
  label,
  aside,
  value,
  of,
  children,
  className,
}: {
  label: string;
  aside?: ReactNode;
  value: ReactNode;
  of?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 p-3.5", className)}>
      <div className="flex items-center justify-between gap-2">
        <MicroLabel>{label}</MicroLabel>
        {aside}
      </div>
      <div className="mt-1.5 whitespace-nowrap">
        <span className="text-[26px] leading-none font-semibold tracking-tight text-foreground">{value}</span>
        {of ? <span className="ml-1 text-ui text-muted-foreground">{of}</span> : null}
      </div>
      {children}
    </div>
  );
}

const SEVERITY = {
  critical: { label: "Crítica", dot: "bg-live", text: "text-live-foreground" },
  high: { label: "Alta", dot: "bg-live", text: "text-live-foreground" },
  medium: { label: "Media", dot: "bg-warning", text: "text-warning-foreground" },
  low: { label: "Baja", dot: "bg-faint", text: "text-muted-foreground" },
} as const;

export const CATEGORY: Record<string, { label: string; icon: LucideIcon }> = {
  medical: { label: "Médico", icon: HeartPulse },
  conduct: { label: "Conducta", icon: ShieldAlert },
  technical: { label: "Técnica", icon: Wrench },
  venue: { label: "Venue", icon: KeyRound },
  lost: { label: "Perdidos", icon: PackageSearch },
  other: { label: "Otro", icon: Lightbulb },
};

export function IncidentRow({ incident }: { incident: Today["incidents"]["items"][number] }) {
  const severity = SEVERITY[incident.severity];

  return (
    <div className="flex gap-3 px-4 py-2.5">
      <span aria-hidden className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", severity.dot)} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-ui font-medium text-foreground">{incident.title}</span>
          <RelativeTime className="text-2xs text-faint" date={incident.createdAt} />
        </div>
        <div className="mt-1 flex items-center gap-2 text-meta text-muted-foreground">
          {incident.assignee ? (
            <>
              <PersonAvatar image={incident.assignee.image} name={incident.assignee.name} size={16} />
              <span className="truncate">{incident.assignee.name.split(" ")[0]}</span>
            </>
          ) : (
            <span>Sin asignar</span>
          )}
          {incident.room ? (
            <span className="flex items-center gap-1 truncate">
              <MapPin aria-hidden className="size-3" />
              {incident.room}
            </span>
          ) : null}
          <span className={severity.text}>· {severity.label}</span>
          {incident.status === "in_progress" ? <span className="ml-auto text-info-foreground">en curso</span> : null}
        </div>
      </div>
    </div>
  );
}

/** One line of the activity feed. */
export function ActivityRow({ item }: { item: Today["activity"][number] }) {
  return (
    <div className="flex items-start gap-2.5 px-4 py-2">
      {item.actor ? (
        <PersonAvatar className="mt-px" image={item.actor.image} name={item.actor.name} size={20} />
      ) : (
        <span className="mt-px flex size-5 shrink-0 items-center justify-center rounded-md bg-raised ring-1 ring-border">
          <CircleCheck aria-hidden className="size-3 text-subtle" />
        </span>
      )}
      <p className="min-w-0 flex-1 text-meta text-subtle">
        {item.actor ? <span className="font-medium text-foreground">{item.actor.name.split(" ")[0]} </span> : null}
        {item.summary}
      </p>
      <RelativeTime className="shrink-0 text-2xs text-faint" date={item.createdAt} />
    </div>
  );
}

/** A human name for a display route ("/…/kiosk" → "Kiosco · grilla"). */
export function screenLabel(path: string): string {
  if (path.startsWith("/owy/stage")) return "Pared · Owy stage";
  if (path.endsWith("/kiosk/map")) return "Kiosco · mapa";
  if (path.endsWith("/kiosk")) return "Kiosco · grilla";
  if (path.endsWith("/stickynote")) return "Pantalla · charla";
  if (path.endsWith("/countdown")) return "Countdown";
  return path || "Pantalla";
}
