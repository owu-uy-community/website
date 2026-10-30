import {
  Building2,
  CircleQuestionMark,
  HeartPulse,
  MonitorX,
  PackageSearch,
  ShieldAlert,
  type LucideIcon,
} from "lucide-react";

import { cn } from "app/lib/utils";
import { StatusDot, type Tone } from "components/Admin/ui/status";
import { Badge } from "components/shared/ui/badge";
import type { Incident, IncidentCategory, IncidentSeverity, IncidentStatus } from "lib/orpc/incidents/schemas";

export const SEVERITIES: { value: IncidentSeverity; label: string; tone: Tone; text: string }[] = [
  { value: "low", label: "Baja", tone: "idle", text: "text-muted-foreground" },
  { value: "medium", label: "Media", tone: "warn", text: "text-warning-foreground" },
  { value: "high", label: "Alta", tone: "live", text: "text-live-foreground" },
  { value: "critical", label: "Crítica", tone: "live", text: "text-live-foreground" },
];
export const SEVERITY = Object.fromEntries(SEVERITIES.map((item) => [item.value, item])) as Record<
  IncidentSeverity,
  (typeof SEVERITIES)[number]
>;
export const isLoud = (severity: IncidentSeverity) => severity === "high" || severity === "critical";

export const CATEGORIES: { value: IncidentCategory; label: string; icon: LucideIcon }[] = [
  { value: "medical", label: "Médico", icon: HeartPulse },
  { value: "conduct", label: "Conducta", icon: ShieldAlert },
  { value: "technical", label: "Técnica", icon: MonitorX },
  { value: "venue", label: "Venue", icon: Building2 },
  { value: "lost", label: "Perdidos", icon: PackageSearch },
  { value: "other", label: "Otro", icon: CircleQuestionMark },
];
export const CATEGORY = Object.fromEntries(CATEGORIES.map((item) => [item.value, item])) as Record<
  IncidentCategory,
  (typeof CATEGORIES)[number]
>;

export const STATUSES: { value: IncidentStatus; label: string; badge: "secondary" | "info" | "success" }[] = [
  { value: "open", label: "Abierto", badge: "secondary" },
  { value: "in_progress", label: "En curso", badge: "info" },
  { value: "resolved", label: "Resuelto", badge: "success" },
];
export const STATUS = Object.fromEntries(STATUSES.map((item) => [item.value, item])) as Record<
  IncidentStatus,
  (typeof STATUSES)[number]
>;

export const SOURCE_LABEL: Record<Incident["source"], string> = {
  admin: "desde el admin",
  phone: "desde un teléfono",
  owy: "por Owy",
  public: "desde la página del evento",
};

/** The leading glyph of an incident: its severity, blinking only when a loud one has nobody on it. */
export function SeverityDot({
  incident,
  className,
}: {
  incident: Pick<Incident, "severity" | "status" | "assignee">;
  className?: string;
}) {
  const needsSomeone = incident.status === "open" && !incident.assignee && isLoud(incident.severity);

  return (
    <StatusDot
      className={className}
      pulse={needsSomeone}
      ring={isLoud(incident.severity) && incident.status !== "resolved"}
      tone={incident.status === "resolved" ? "idle" : SEVERITY[incident.severity].tone}
    />
  );
}

export function SeverityLabel({ severity, className }: { severity: IncidentSeverity; className?: string }) {
  return (
    <span className={cn("text-meta font-medium", SEVERITY[severity].text, className)}>{SEVERITY[severity].label}</span>
  );
}

export function StatusBadge({ status, className }: { status: IncidentStatus; className?: string }) {
  return (
    <Badge className={className} variant={STATUS[status].badge}>
      {STATUS[status].label}
    </Badge>
  );
}

/** Where it is: the room (with its colour) or the free-text place. */
export function incidentPlace(incident: Pick<Incident, "room" | "location">): string | null {
  return incident.room?.name ?? incident.location;
}

/** "Juan" from "Juan Oliú": rows and chips use first names, like the team does. */
export const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;
