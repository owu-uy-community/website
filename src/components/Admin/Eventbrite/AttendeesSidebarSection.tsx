"use client";

import Link from "next/link";
import { Users, UserCheck, UserX, RefreshCw } from "lucide-react";
import { useEventbriteAttendees } from "hooks/useEventbriteAttendees";
import { Badge } from "components/shared/ui/badge";
import { Button } from "components/shared/ui/button";
import { cn } from "app/lib/utils";

export function AttendeesSidebarSection() {
  const { summary, isLoading, error, refreshAttendees, isRefreshing } = useEventbriteAttendees({
    pageSize: 10, // Just fetch a small amount for the sidebar
  });

  // Default values while loading or on error
  const displayData = summary || {
    total_attendees: 0,
    checked_in: 0,
    not_checked_in: 0,
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-medium text-white/70">Asistentes</h3>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-zinc-400 hover:text-yellow-400"
          onClick={refreshAttendees}
          disabled={isRefreshing || isLoading}
        >
          <RefreshCw size={14} className={cn((isRefreshing || isLoading) && "animate-spin")} />
        </Button>
      </div>

      <div className="space-y-2">
        <Link
          href="/admin/attendees"
          className="flex items-center justify-between rounded-md bg-zinc-800/50 px-3 py-2 text-sm transition-colors hover:bg-zinc-800"
        >
          <div className="flex items-center gap-2">
            <Users size={14} className="text-zinc-400" />
            <span className="text-zinc-300">Total</span>
          </div>
          <Badge variant="secondary" className="bg-zinc-700 text-white">
            {displayData.total_attendees}
          </Badge>
        </Link>

        <Link
          href="/admin/attendees?filter=checked_in"
          className="flex items-center justify-between rounded-md bg-zinc-800/50 px-3 py-2 text-sm transition-colors hover:bg-zinc-800"
        >
          <div className="flex items-center gap-2">
            <UserCheck size={14} className="text-green-400" />
            <span className="text-zinc-300">Check-in</span>
          </div>
          <Badge variant="secondary" className="bg-green-900/30 text-green-400">
            {displayData.checked_in}
          </Badge>
        </Link>

        <Link
          href="/admin/attendees?filter=not_checked_in"
          className="flex items-center justify-between rounded-md bg-zinc-800/50 px-3 py-2 text-sm transition-colors hover:bg-zinc-800"
        >
          <div className="flex items-center gap-2">
            <UserX size={14} className="text-yellow-400" />
            <span className="text-zinc-300">Pendientes</span>
          </div>
          <Badge variant="secondary" className="bg-yellow-900/30 text-yellow-400">
            {displayData.not_checked_in}
          </Badge>
        </Link>
      </div>

      {error && <p className="text-xs text-red-400">Error al cargar datos</p>}
    </div>
  );
}
