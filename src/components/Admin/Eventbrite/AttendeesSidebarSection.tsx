"use client";

import Link from "next/link";
import { RefreshCw, UserCheck, Users, UserX } from "lucide-react";

import { useEventbriteAttendees } from "hooks/useEventbriteAttendees";
import { scopedAdminHref, useSelectedEvent } from "components/Admin/shell/use-selected-event";
import { Badge } from "components/shared/ui/badge";
import { Button } from "components/shared/ui/button";
import { cn } from "app/lib/utils";

const ROWS = [
  { filter: null, icon: Users, label: "Total", key: "total_attendees" },
  { filter: "checked_in", icon: UserCheck, label: "Check-in", key: "checked_in" },
  { filter: "not_checked_in", icon: UserX, label: "Pendientes", key: "not_checked_in" },
] as const;

export function AttendeesSidebarSection() {
  const { selected } = useSelectedEvent();
  const { summary, isLoading, error, refreshAttendees, isRefreshing, notConfigured } = useEventbriteAttendees({
    pageSize: 10, // Just fetch a small amount for the sidebar
  });

  // Scoped to the selected event's community so the rows never bounce the
  // admin to another tenant via the legacy redirect.
  const base = selected
    ? scopedAdminHref(selected.communitySlug, "/admin/attendees", selected.slug)
    : "/admin/attendees";
  const hrefFor = (filter: string | null) =>
    filter ? `${base}${base.includes("?") ? "&" : "?"}filter=${filter}` : base;

  const displayData = summary || {
    total_attendees: 0,
    checked_in: 0,
    not_checked_in: 0,
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-medium text-sidebar-foreground/70">Asistentes</h3>
        <Button
          className="h-6 w-6 text-muted-foreground hover:text-foreground"
          disabled={isRefreshing || isLoading}
          size="icon"
          variant="ghost"
          onClick={refreshAttendees}
        >
          <RefreshCw className={cn((isRefreshing || isLoading) && "animate-spin")} size={14} />
        </Button>
      </div>

      {notConfigured ? (
        <p className="px-2 text-xs text-sidebar-foreground/50">Eventbrite sin configurar</p>
      ) : (
        <div className="space-y-1">
          {ROWS.map((row) => (
            <Link
              key={row.key}
              className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-sidebar-accent"
              href={hrefFor(row.filter)}
            >
              <div className="flex items-center gap-2">
                <row.icon className="text-sidebar-foreground/60" size={14} />
                <span className="text-sidebar-foreground/80">{row.label}</span>
              </div>
              <Badge className="bg-transparent font-terminal tabular-nums text-foreground" variant="secondary">
                {displayData[row.key]}
              </Badge>
            </Link>
          ))}
        </div>
      )}

      {error && <p className="text-xs text-destructive">Error al cargar datos</p>}
    </div>
  );
}
