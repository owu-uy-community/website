"use client";

import * as React from "react";
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Presentation, Tv } from "lucide-react";

import { cn } from "app/lib/utils";
import { StatusDot } from "components/Admin/ui/status";
import { Badge } from "components/shared/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "components/shared/ui/table";
import type { Room, Schedule, StickyNote } from "lib/orpc";
import { slotDay } from "lib/slot-day";

import { slotPhase, type SlotPhase } from "./agenda-state";

const PHASES: Record<SlotPhase, { label: string; variant: "destructive" | "secondary" | "outline" }> = {
  now: { label: "en curso", variant: "destructive" },
  next: { label: "próxima", variant: "secondary" },
  past: { label: "terminó", variant: "outline" },
};

/** En curso (live), próxima or terminó, on the event's clock. */
export function PhaseBadge({ phase, className }: { phase: SlotPhase; className?: string }) {
  const { label, variant } = PHASES[phase];

  return (
    <Badge className={cn(phase === "past" && "text-muted-foreground", className)} variant={variant}>
      {phase === "now" ? <StatusDot tone="live" /> : null}
      {label}
    </Badge>
  );
}

const startOf = (schedule: Schedule | undefined) => (schedule ? `${slotDay(schedule.date)}T${schedule.startTime}` : "");

/** Every talk as a table, in programme order (or the reverse); a row opens the talk. */
export function AgendaList({
  notes,
  rooms,
  roomColors,
  schedules,
  wall,
  selectedId,
  onOpen,
}: {
  notes: StickyNote[];
  /** Board order: ties at the same time follow the columns. */
  rooms: Room[];
  roomColors: Record<string, string>;
  schedules: Schedule[];
  /** The event's wall clock, for each talk's state; null until known. */
  wall: string | null;
  selectedId: string | null;
  onOpen: (note: StickyNote) => void;
}) {
  const [latestFirst, setLatestFirst] = useState(false);

  const rows = useMemo(() => {
    const schedulesById = new Map(schedules.map((schedule) => [schedule.id, schedule]));
    const roomsById = new Map(rooms.map((room) => [room.id, room]));
    const column = new Map(rooms.map((room, index) => [room.id, index]));
    const sorted = notes
      .map((note) => ({ note, schedule: schedulesById.get(note.scheduleId), room: roomsById.get(note.roomId) }))
      .sort(
        (a, b) =>
          startOf(a.schedule).localeCompare(startOf(b.schedule)) ||
          (column.get(a.note.roomId) ?? 0) - (column.get(b.note.roomId) ?? 0)
      );

    return latestFirst ? sorted.reverse() : sorted;
  }, [notes, rooms, schedules, latestFirst]);

  return (
    // Wide enough that the title keeps a real column when the list scrolls sideways (phones, tablets,
    // a laptop with the inspector open); the fixed columns give way first.
    <Table className="min-w-[880px]">
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead aria-sort={latestFirst ? "descending" : "ascending"} className="w-[140px] pl-5">
            <button
              className="relative inline-flex items-center gap-1 rounded-sm hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:outline-hidden pointer-coarse:after:absolute pointer-coarse:after:-inset-x-2 pointer-coarse:after:-inset-y-3.5"
              type="button"
              onClick={() => setLatestFirst((value) => !value)}
            >
              Hora
              {latestFirst ? (
                <ArrowUp aria-hidden className="size-3.5" />
              ) : (
                <ArrowDown aria-hidden className="size-3.5" />
              )}
              <span className="sr-only">
                {latestFirst ? "(de la última a la primera)" : "(de la primera a la última)"}
              </span>
            </button>
          </TableHead>
          <TableHead className="w-[150px]">Sala</TableHead>
          <TableHead className="min-w-60">Título</TableHead>
          <TableHead className="w-[200px]">Orador</TableHead>
          <TableHead className="w-[110px]">Recursos</TableHead>
          <TableHead className="w-[120px] pr-5">Estado</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map(({ note, schedule, room }) => {
          const [start, end] = note.timeSlot.split(" - ");
          const lacksTV = note.needsTV && room != null && !room.hasTV;
          const lacksWhiteboard = note.needsWhiteboard && room != null && !room.hasWhiteboard;

          return (
            <TableRow
              key={note.id}
              className="cursor-pointer"
              data-state={note.id === selectedId ? "selected" : undefined}
              onClick={() => onOpen(note)}
            >
              <TableCell className="pl-5 font-terminal whitespace-nowrap tabular-nums">
                <span className="text-foreground">{start}</span>
                {end ? <span className="text-muted-foreground"> – {end}</span> : null}
              </TableCell>
              <TableCell>
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    aria-hidden
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: roomColors[note.room] ?? "#a1a1aa" }}
                  />
                  <span className="truncate">{note.room}</span>
                </span>
              </TableCell>
              <TableCell className="max-w-0">
                <button
                  className="block max-w-full truncate rounded-sm text-left font-medium text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:outline-hidden"
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onOpen(note);
                  }}
                >
                  {note.title}
                </button>
              </TableCell>
              <TableCell className="max-w-0 truncate text-subtle">{note.speaker ?? "—"}</TableCell>
              <TableCell>
                {note.needsTV || note.needsWhiteboard ? (
                  <span className="flex items-center gap-2">
                    {note.needsTV ? (
                      <Tv
                        aria-label={lacksTV ? "Necesita TV y la sala no tiene" : "Necesita TV"}
                        className={cn("size-4", lacksTV ? "text-warning-foreground" : "text-muted-foreground")}
                        role="img"
                      />
                    ) : null}
                    {note.needsWhiteboard ? (
                      <Presentation
                        aria-label={lacksWhiteboard ? "Necesita pizarra y la sala no tiene" : "Necesita pizarra"}
                        className={cn("size-4", lacksWhiteboard ? "text-warning-foreground" : "text-muted-foreground")}
                        role="img"
                      />
                    ) : null}
                  </span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="pr-5">
                {wall && schedule ? <PhaseBadge phase={slotPhase(schedule, wall)} /> : null}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
