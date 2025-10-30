"use client";

import * as React from "react";
import { useMemo } from "react";

import { TimeGridKiosk } from "components/Meetups/OpenSpace/organisms/TimeGridKiosk";
import { TimeGridKioskSkeleton } from "components/Meetups/OpenSpace/organisms/TimeGridKioskSkeleton";

import { NOTE_COLORS, DEFAULT_OPENSPACE_ID } from "components/Meetups/OpenSpace/utils/constants";
import { useOpenSpaceNotesORPC } from "../../../../hooks/useOpenSpaceNotesORPC";
import { useOpenSpaceSetup } from "../../../../hooks/useOpenSpaceSetup";

export default function OpenSpaceKioskClient() {
  // Fetch data with realtime enabled
  const { notes, loading: notesLoading } = useOpenSpaceNotesORPC({
    openSpaceId: DEFAULT_OPENSPACE_ID,
    enableRealtime: true,
  });

  const { rooms, timeSlots, isLoading: setupLoading } = useOpenSpaceSetup(DEFAULT_OPENSPACE_ID);

  const getNotesForCell = useMemo(
    () => (room: string, timeSlot: string) => notes.filter((note) => note.room === room && note.timeSlot === timeSlot),
    [notes]
  );

  // Loading state
  if (notesLoading || setupLoading) {
    return (
      <div className="h-screen w-full overflow-hidden bg-black">
        <div
          className="h-full w-full overflow-hidden rounded-2xl [&_.openspace-time-grid-kiosk]:h-full"
          style={{
            ["--row-count" as string]: 5,
          }}
        >
          <style jsx>{`
            .openspace-time-grid-kiosk {
              grid-auto-rows: minmax(0, 1fr) !important;
            }
          `}</style>
          <TimeGridKioskSkeleton />
        </div>
      </div>
    );
  }

  // Empty database state
  if (rooms.length === 0 || timeSlots.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black p-6">
        <div className="max-w-2xl rounded-lg border border-zinc-700 bg-zinc-800 p-12 text-center">
          <h2 className="mb-4 text-4xl font-bold text-white">Sin datos disponibles</h2>
          <p className="text-xl text-zinc-400">
            {rooms.length === 0 && "No hay salas configuradas. "}
            {timeSlots.length === 0 && "No hay horarios configurados. "}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-full overflow-hidden bg-black">
      {/* Grid - Full screen */}
      <div
        className="h-full w-full overflow-hidden rounded-2xl [&_.openspace-time-grid-kiosk]:h-full"
        style={{
          ["--row-count" as string]: timeSlots.length,
        }}
      >
        <style jsx>{`
          .openspace-time-grid-kiosk {
            grid-auto-rows: minmax(0, 1fr) !important;
          }
        `}</style>
        <TimeGridKiosk rooms={rooms} timeSlots={timeSlots} noteColors={NOTE_COLORS} getNotesForCell={getNotesForCell} />
      </div>
    </div>
  );
}
