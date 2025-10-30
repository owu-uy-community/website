"use client";

import * as React from "react";
import { Diamond, Square, Pentagon, Circle, Triangle, ChevronDown, Clock, User } from "lucide-react";
import { cn } from "app/lib/utils";

import type { StickyNote } from "../../../../lib/orpc";
import { StickyNoteCardKiosk } from "../molecules/StickyNoteCardKiosk";

const getRoomConfig = (room: string) => {
  switch (room.toLowerCase()) {
    case "lobby":
      return {
        bgColor: "bg-blue-500",
        textColor: "text-white",
        mobileTextColor: "text-blue-400",
        icon: <Diamond className="h-7 w-7 fill-blue-500 text-blue-500 sm:h-8 sm:w-8 lg:h-10 lg:w-10" />,
        iconMobile: <Diamond className="h-5 w-5 fill-blue-400 text-blue-400 sm:h-6 sm:w-6" />,
      };
    case "ventana":
      return {
        bgColor: "bg-orange-500",
        textColor: "text-white",
        mobileTextColor: "text-orange-400",
        icon: <Square className="h-7 w-7 fill-orange-500 text-orange-500 sm:h-8 sm:w-8 lg:h-10 lg:w-10" />,
        iconMobile: <Square className="h-5 w-5 fill-orange-400 text-orange-400 sm:h-6 sm:w-6" />,
      };
    case "cueva":
      return {
        bgColor: "bg-green-500",
        textColor: "text-white",
        mobileTextColor: "text-green-400",
        icon: <Pentagon className="h-7 w-7 fill-green-500 text-green-500 sm:h-8 sm:w-8 lg:h-10 lg:w-10" />,
        iconMobile: <Pentagon className="h-5 w-5 fill-green-400 text-green-400 sm:h-6 sm:w-6" />,
      };
    case "centro":
      return {
        bgColor: "bg-yellow-400",
        textColor: "text-black",
        mobileTextColor: "text-yellow-400",
        icon: <Circle className="h-7 w-7 fill-yellow-400 text-yellow-400 sm:h-8 sm:w-8 lg:h-10 lg:w-10" />,
        iconMobile: <Circle className="h-5 w-5 fill-yellow-400 text-yellow-400 sm:h-6 sm:w-6" />,
      };
    case "rincon":
      return {
        bgColor: "bg-red-500",
        textColor: "text-white",
        mobileTextColor: "text-red-400",
        icon: <Triangle className="h-7 w-7 fill-red-500 text-red-500 sm:h-8 sm:w-8 lg:h-10 lg:w-10" />,
        iconMobile: <Triangle className="h-5 w-5 fill-red-400 text-red-400 sm:h-6 sm:w-6" />,
      };
    default:
      return {
        bgColor: "bg-gray-500",
        textColor: "text-white",
        mobileTextColor: "text-gray-400",
        icon: null,
        iconMobile: null,
      };
  }
};

interface TimeGridKioskProps {
  rooms: string[];
  timeSlots: string[];
  noteColors: Record<string, string>;
  getNotesForCell: (room: string, timeSlot: string) => StickyNote[];
}

export function TimeGridKiosk({ rooms, timeSlots, noteColors, getNotesForCell }: TimeGridKioskProps) {
  const [expandedSlots, setExpandedSlots] = React.useState<Set<string>>(new Set());

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
        className="openspace-time-grid-kiosk hidden min-w-full gap-0 lg:grid"
        style={{
          gridTemplateColumns: `minmax(100px, 120px) repeat(${rooms.length}, 1fr)`,
          gridTemplateRows: `64px repeat(${timeSlots.length}, 1fr)`,
        }}
      >
        {/* Header Row */}
        <div className="flex h-full items-center justify-center border-b border-r border-gray-700/50 bg-gray-800/80">
          <Clock
            className="h-6 w-6 animate-spin text-white lg:h-8 lg:w-8"
            strokeWidth={2.5}
            style={{ animationDuration: "3s" }}
          />
        </div>

        {rooms.map((room) => {
          const config = getRoomConfig(room);
          return (
            <div
              key={room}
              className="flex h-full items-center justify-center gap-2 border-b border-r border-gray-700/50 bg-gray-800/80 px-2 last:border-r-0 lg:gap-3 lg:px-3"
            >
              {config.icon}
              <span className="text-center text-xl font-bold uppercase text-white lg:text-3xl">{room}</span>
            </div>
          );
        })}

        {/* Time Slots and Cells */}
        {timeSlots.map((timeSlot) => (
          <React.Fragment key={timeSlot}>
            {/* Time Label */}
            <div className="flex h-full flex-col items-center justify-center gap-1.5 border-b border-r border-gray-700/50 bg-gray-800/80 px-2">
              {timeSlot.split(" - ").map((time, idx) => (
                <span key={idx} className="text-center text-xl font-bold leading-tight text-white lg:text-2xl">
                  {time}
                </span>
              ))}
            </div>

            {/* Room Cells */}
            {rooms.map((room) => {
              const cellNotes = getNotesForCell(room, timeSlot);

              return (
                <div
                  key={`${room}-${timeSlot}`}
                  className="relative h-full border-b border-r border-gray-700/50 bg-gray-900/40 p-2 last:border-r-0"
                >
                  {cellNotes.length === 0 ? (
                    // Empty cell placeholder
                    <div className="flex h-full items-center justify-center">
                      <span className="text-sm text-gray-600">-</span>
                    </div>
                  ) : (
                    // Display notes
                    <div className="flex h-full flex-col">
                      {cellNotes.map((note) => (
                        <StickyNoteCardKiosk key={note.id} note={note} noteColors={noteColors} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </React.Fragment>
        ))}
      </div>

      {/* Mobile Layout - Organized by Time Slots */}
      <div className="flex flex-col gap-6 lg:hidden">
        {/* Time Slot Loop */}
        {timeSlots.map((timeSlot, index) => {
          const [start, end] = timeSlot.split(" - ");
          const isExpanded = expandedSlots.has(timeSlot);

          // Generate ordinal track label
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
              className="rounded-2xl border border-gray-800 bg-gray-900/50 transition-all hover:border-gray-700"
            >
              {/* Time Header - Clickable */}
              <button
                onClick={() => toggleSlot(timeSlot)}
                className="flex w-full items-center justify-between p-5 text-left transition-colors hover:bg-gray-900/70"
              >
                <div className="flex-1">
                  <p className="text-xs font-medium uppercase tracking-wide text-yellow-400">{trackLabel} track</p>
                  <h3 className="text-2xl font-bold text-white sm:text-3xl">
                    {start}
                    <span className="mx-2 text-lg font-normal text-gray-500">→</span>
                    {end}
                  </h3>
                </div>
                <ChevronDown
                  className={cn(
                    "h-6 w-6 flex-shrink-0 text-yellow-400 transition-transform duration-200",
                    isExpanded ? "rotate-180" : ""
                  )}
                />
              </button>

              {/* Rooms Grid - Collapsible */}
              {isExpanded && (
                <div className="flex flex-col gap-4 border-t border-gray-700 p-5">
                  {rooms.map((room) => {
                    const notesForSlot = getNotesForCell(room, timeSlot);
                    const config = getRoomConfig(room);

                    return (
                      <article
                        key={`${timeSlot}-${room}-mobile`}
                        className="rounded-xl border border-gray-800 bg-gray-900/60 p-4"
                      >
                        {/* Room Header */}
                        <div className="mb-3 flex items-center gap-2">
                          {config.iconMobile}
                          <h4 className={`text-lg font-bold uppercase sm:text-xl ${config.mobileTextColor}`}>{room}</h4>
                        </div>

                        {/* Notes */}
                        {notesForSlot.length === 0 ? (
                          <div className="flex items-center justify-center rounded-lg border border-dashed border-gray-700 bg-gray-900/40 p-4">
                            <span className="text-sm text-gray-500">Sin sesiones</span>
                          </div>
                        ) : (
                          <div className="flex flex-col gap-3">
                            {notesForSlot.map((note) => (
                              <div
                                key={`${note.id}-mobile`}
                                className="rounded-lg border border-gray-700 bg-gray-800/60 p-3"
                              >
                                <div className="flex flex-col gap-2">
                                  <h5 className="text-base font-semibold text-white">{note.title}</h5>
                                  {note.speaker ? (
                                    <div className="flex items-center gap-2 text-sm text-gray-300">
                                      <User className="h-3.5 w-3.5 text-yellow-400" />
                                      <span className="font-medium text-white">{note.speaker}</span>
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
