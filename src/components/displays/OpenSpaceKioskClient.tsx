"use client";

import * as React from "react";
import { useEffect, useMemo, useState } from "react";

import { TimeGridKiosk } from "components/Meetups/OpenSpace/organisms/TimeGridKiosk";
import { TimeGridKioskSkeleton } from "components/Meetups/OpenSpace/organisms/TimeGridKioskSkeleton";

import { eventChannel } from "lib/realtime/channels";
import { orpc } from "lib/orpc";
import type { Room, Schedule, StickyNote } from "lib/orpc";
import { useOpenSpaceNotesORPC } from "hooks/useOpenSpaceNotesORPC";
import { useOpenSpaceSetup } from "hooks/useOpenSpaceSetup";
import { useFullscreen } from "hooks/useFullscreen";
import { useRealtimeBroadcastWithInvalidation } from "hooks/useRealtimeBroadcast";

import { FullscreenButton } from "./FullscreenButton";

/** A wall TV has no hover: show controls briefly, then fade until the pointer moves. */
function usePointerIdle(timeoutMs = 4000): boolean {
  const [idle, setIdle] = useState(false);

  useEffect(() => {
    let timer = setTimeout(() => setIdle(true), timeoutMs);
    const wake = () => {
      setIdle(false);
      clearTimeout(timer);
      timer = setTimeout(() => setIdle(true), timeoutMs);
    };

    window.addEventListener("pointermove", wake);
    window.addEventListener("pointerdown", wake);

    return () => {
      clearTimeout(timer);
      window.removeEventListener("pointermove", wake);
      window.removeEventListener("pointerdown", wake);
    };
  }, [timeoutMs]);

  return idle;
}

export default function OpenSpaceKioskClient({
  openSpaceId,
  initialNotes,
  initialRooms,
  initialSchedules,
}: {
  openSpaceId: string;
  initialNotes?: StickyNote[];
  initialRooms?: Room[];
  initialSchedules?: Schedule[];
}) {
  // Realtime + a slow interval: a mounted TV never refires window focus.
  const {
    notes,
    loading: notesLoading,
    recentlyUpdatedIds,
  } = useOpenSpaceNotesORPC({
    openSpaceId,
    enableRealtime: true,
    initialData: initialNotes,
    refetchInterval: 60_000,
  });

  const {
    rooms,
    roomColors,
    roomIcons,
    timeSlots,
    schedulesData,
    isLoading: setupLoading,
  } = useOpenSpaceSetup(openSpaceId, {
    initialRooms,
    initialSchedules,
    refetchInterval: 60_000,
  });

  // Star/slot changes broadcast on the highlights channel — pick them up live.
  useRealtimeBroadcastWithInvalidation({
    channelName: eventChannel(openSpaceId, "highlights"),
    eventHandlers: [
      { event: "highlight_changed", queryKey: orpc.schedules.getByOpenSpace.key({ input: { openSpaceId } }) },
      { event: "auto_highlight_changed", queryKey: ["openSpace", openSpaceId] },
    ],
    receiveSelf: false,
  });

  const {
    ref: screenRef,
    isFullscreen,
    supported: fullscreenSupported,
    toggle: toggleFullscreen,
  } = useFullscreen<HTMLDivElement>();
  const pointerIdle = usePointerIdle();

  const getNotesForCell = useMemo(
    () => (room: string, timeSlot: string) => notes.filter((note) => note.room === room && note.timeSlot === timeSlot),
    [notes]
  );

  // Loading state (only reachable without server-provided initial data)
  if (notesLoading || setupLoading) {
    return (
      <div className="h-screen w-full overflow-hidden bg-black p-2">
        <TimeGridKioskSkeleton />
      </div>
    );
  }

  // Empty database state
  if (rooms.length === 0 || timeSlots.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black p-6">
        <div className="max-w-2xl rounded-lg border border-white/10 bg-white/[0.03] p-12 text-center">
          <h2 className="mb-4 font-display text-4xl font-bold text-white">La grilla no está armada</h2>
          <p className="text-xl text-white/60">
            {rooms.length === 0 && "No hay salas configuradas. "}
            {timeSlots.length === 0 && "No hay horarios configurados. "}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div ref={screenRef} className="relative h-screen w-full overflow-hidden bg-black">
      {fullscreenSupported ? (
        <FullscreenButton
          className={`absolute bottom-3 right-3 z-20 bg-black/60 backdrop-blur transition-opacity duration-500 focus-visible:opacity-100 ${
            pointerIdle ? "opacity-0" : "opacity-100"
          }`}
          isFullscreen={isFullscreen}
          onToggle={toggleFullscreen}
        />
      ) : null}

      {/* Grid - Full screen */}
      <div className="h-full w-full overflow-hidden">
        <TimeGridKiosk
          getNotesForCell={getNotesForCell}
          recentlyUpdatedIds={recentlyUpdatedIds}
          roomColors={roomColors}
          roomIcons={roomIcons}
          rooms={rooms}
          schedulesData={schedulesData}
          timeSlots={timeSlots}
        />
      </div>
    </div>
  );
}
