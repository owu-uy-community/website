"use client";

import * as React from "react";
import { useEffect, useState } from "react";
import { ChevronDown, Clock, Star, User } from "lucide-react";

import { cn } from "app/lib/utils";
import { roomIconFor } from "../../../../lib/rooms/icons";

import type { Schedule, StickyNote } from "../../../../lib/orpc";
import { StickyNoteCardKiosk } from "../molecules/StickyNoteCardKiosk";

/** Live wall clock — ticks every second: the corner clock shows seconds. */
function useNow(intervalMs = 1_000): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);

  return now;
}

/** True while `now` falls inside the schedule's local day + time range. */
function isHappeningNow(schedule: Schedule | undefined, now: Date): boolean {
  if (!schedule) return false;

  const scheduleDate = new Date(schedule.date);
  if (
    scheduleDate.getFullYear() !== now.getFullYear() ||
    scheduleDate.getMonth() !== now.getMonth() ||
    scheduleDate.getDate() !== now.getDate()
  ) {
    return false;
  }

  const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

  return currentTime >= schedule.startTime && currentTime < schedule.endTime;
}

interface TimeGridKioskProps {
  rooms: string[];
  timeSlots: string[];
  /** Resolved color per room name (explicit or palette fallback). */
  roomColors?: Record<string, string>;
  /** Picked shape key per room name; rooms without one render no icon. */
  roomIcons?: Record<string, string | null>;
  /** Full schedules — the kiosk shows the starred (highlightInKiosk) row. */
  schedulesData?: Schedule[];
  recentlyUpdatedIds?: ReadonlySet<string>;
  getNotesForCell: (room: string, timeSlot: string) => StickyNote[];
}

export function TimeGridKiosk({
  rooms,
  timeSlots,
  roomColors,
  roomIcons,
  schedulesData = [],
  recentlyUpdatedIds,
  getNotesForCell,
}: TimeGridKioskProps) {
  const [expandedSlots, setExpandedSlots] = useState<Set<string>>(new Set());
  const now = useNow();

  const clock = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(
    now.getSeconds()
  ).padStart(2, "0")}`;

  const toggleSlot = (timeSlot: string) => {
    setExpandedSlots((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(timeSlot)) {
        newSet.delete(timeSlot);
      } else {
        newSet.add(timeSlot);
      }
      return newSet;
    });
  };

  return (
    <div className="h-full w-full">
      {/* Desktop Grid */}
      <div
        className="openspace-time-grid-kiosk hidden h-full min-w-full gap-0 lg:grid"
        style={{
          gridTemplateColumns: `minmax(128px, 168px) repeat(${rooms.length}, 1fr)`,
          gridTemplateRows: `56px repeat(${timeSlots.length}, minmax(0, 1fr))`,
        }}
      >
        {/* Corner: a real clock, seconds included so the room trusts it's live */}
        <div className="flex h-full items-center justify-center gap-2 border-b border-r border-white/10 bg-white/[0.06] px-2">
          <Clock
            aria-hidden
            className="h-[clamp(1rem,1.3vw,1.4rem)] w-[clamp(1rem,1.3vw,1.4rem)] shrink-0 text-primary"
          />
          <span className="font-terminal text-[clamp(0.95rem,1.5vw,1.5rem)] font-semibold tabular-nums text-white">
            {clock}
          </span>
        </div>

        {rooms.map((room) => {
          const Shape = roomIconFor(roomIcons?.[room]);
          const color = roomColors?.[room] ?? "#ffffff";

          return (
            <div
              key={room}
              className="flex h-full items-center justify-center gap-2 border-b border-r border-white/10 bg-white/[0.06] px-2 last:border-r-0 lg:px-3"
            >
              {Shape ? (
                <Shape
                  aria-hidden
                  className="h-[clamp(0.9rem,1.4vw,1.5rem)] w-[clamp(0.9rem,1.4vw,1.5rem)] shrink-0"
                  style={{ color, fill: color }}
                />
              ) : null}
              <span
                className="truncate text-center font-display text-[clamp(1rem,1.6vw,1.75rem)] font-bold uppercase tracking-wide"
                style={{ color }}
              >
                {room}
              </span>
            </div>
          );
        })}

        {/* Time Slots and Cells */}
        {timeSlots.map((timeSlot, timeIndex) => {
          const schedule = schedulesData[timeIndex];
          const isStarred = schedule?.highlightInKiosk || false;
          const isNow = isHappeningNow(schedule, now);
          const rowTint = isStarred ? "bg-primary/[0.08]" : isNow ? "bg-white/[0.05]" : "";

          return (
            <React.Fragment key={timeSlot}>
              {/* Time Label */}
              <div
                className={cn(
                  "relative flex h-full flex-col items-center justify-center gap-1 border-b border-r border-white/10 bg-white/[0.04] px-2",
                  isStarred && "bg-primary/[0.12]"
                )}
              >
                {isStarred && (
                  <Star aria-hidden className="absolute right-1.5 top-1.5 h-4 w-4 fill-primary text-primary" />
                )}
                {timeSlot.split(" - ").map((time, idx) => (
                  <span
                    key={idx}
                    className={cn(
                      "text-center font-terminal font-semibold tabular-nums leading-tight",
                      idx === 0
                        ? "text-[clamp(1rem,1.4vw,1.5rem)] text-white"
                        : "text-[clamp(0.85rem,1.1vw,1.2rem)] text-white/50"
                    )}
                  >
                    {time}
                  </span>
                ))}
                {isNow && (
                  <span className="mt-1 rounded bg-primary px-1.5 py-0.5 font-terminal text-[10px] font-bold uppercase tracking-widest text-black">
                    Ahora
                  </span>
                )}
              </div>

              {/* Room Cells */}
              {rooms.map((room) => {
                const cellNotes = getNotesForCell(room, timeSlot);

                return (
                  <div
                    key={`${room}-${timeSlot}`}
                    className={cn(
                      "relative h-full border-b border-r border-white/10 bg-white/[0.02] transition-colors duration-300 last:border-r-0",
                      rowTint
                    )}
                  >
                    {cellNotes.length === 0 ? (
                      <div className="flex h-full items-center justify-center">
                        <span aria-hidden className="h-1 w-1 rounded-full bg-white/15" />
                      </div>
                    ) : (
                      cellNotes.map((note) => (
                        <StickyNoteCardKiosk
                          key={note.id}
                          note={note}
                          wasJustUpdated={recentlyUpdatedIds?.has(note.id) || false}
                        />
                      ))
                    )}
                  </div>
                );
              })}
            </React.Fragment>
          );
        })}
      </div>

      {/* Mobile Layout - Organized by Time Slots */}
      <div className="flex flex-col gap-6 lg:hidden">
        {timeSlots.map((timeSlot, index) => {
          const [start, end] = timeSlot.split(" - ");
          const isExpanded = expandedSlots.has(timeSlot);

          const ordinals = [
            "Primer",
            "Segundo",
            "Tercer",
            "Cuarto",
            "Quinto",
            "Sexto",
            "Séptimo",
            "Octavo",
            "Noveno",
            "Décimo",
          ];
          const trackLabel = ordinals[index] || `Track ${index + 1}`;

          return (
            <section
              key={timeSlot}
              className="rounded-2xl border border-white/10 bg-white/[0.03] transition-colors hover:border-white/20"
            >
              {/* Time Header - Clickable */}
              <button
                className="flex w-full items-center justify-between p-5 text-left transition-colors hover:bg-white/[0.04]"
                onClick={() => toggleSlot(timeSlot)}
              >
                <div className="flex-1">
                  <p className="font-terminal text-xs font-medium uppercase tracking-[0.18em] text-primary">
                    {trackLabel} track
                  </p>
                  <h3 className="font-display text-2xl font-bold text-white sm:text-3xl">
                    {start}
                    <span className="mx-2 text-lg font-normal text-white/40">→</span>
                    {end}
                  </h3>
                </div>
                <ChevronDown
                  className={cn(
                    "h-6 w-6 shrink-0 text-primary transition-transform duration-200",
                    isExpanded ? "rotate-180" : ""
                  )}
                />
              </button>

              {/* Rooms Grid - Collapsible */}
              {isExpanded && (
                <div className="flex flex-col gap-4 border-t border-white/10 p-5">
                  {rooms.map((room) => {
                    const notesForSlot = getNotesForCell(room, timeSlot);
                    const Shape = roomIconFor(roomIcons?.[room]);
                    const roomColor = roomColors?.[room] ?? "#ffffff";

                    return (
                      <article
                        key={`${timeSlot}-${room}-mobile`}
                        className="rounded-xl border border-white/10 bg-white/[0.03] p-4"
                      >
                        {/* Room Header */}
                        <h4
                          className="mb-3 flex items-center gap-2 font-display text-lg font-bold uppercase sm:text-xl"
                          style={{ color: roomColor }}
                        >
                          {Shape ? (
                            <Shape
                              aria-hidden
                              className="h-4 w-4 shrink-0"
                              style={{ color: roomColor, fill: roomColor }}
                            />
                          ) : null}
                          {room}
                        </h4>

                        {/* Notes */}
                        {notesForSlot.length === 0 ? (
                          <div className="flex items-center justify-center rounded-lg border border-dashed border-white/10 p-4">
                            <span className="text-sm text-white/40">Sin sesiones</span>
                          </div>
                        ) : (
                          <div className="flex flex-col gap-3">
                            {notesForSlot.map((note) => (
                              <div
                                key={`${note.id}-mobile`}
                                className="rounded-lg border border-white/10 bg-white/[0.04] p-3"
                              >
                                <div className="flex flex-col gap-2">
                                  <h5 className="text-base font-semibold text-white">{note.title}</h5>
                                  {note.speaker ? (
                                    <div className="flex items-center gap-2 text-sm">
                                      <User className="h-3.5 w-3.5 text-primary" />
                                      <span className="font-medium text-white/80">{note.speaker}</span>
                                    </div>
                                  ) : null}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
