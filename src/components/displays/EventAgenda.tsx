import { Fragment } from "react";

import type { Room, Schedule, StickyNote } from "lib/orpc";
import { StickyNoteCardKiosk } from "components/Meetups/OpenSpace/molecules/StickyNoteCardKiosk";
import { roomIconFor } from "lib/rooms/icons";
import { roomColorFor } from "lib/rooms/palette";

type Props = {
  rooms: Room[];
  schedules: Schedule[];
  tracks: StickyNote[];
};

function slotLabel(schedule: Schedule): string {
  return `${schedule.startTime} - ${schedule.endTime}`;
}

/**
 * The event's grid, rendered as the same sticky-note wall the admin board and
 * the kiosk show — shared StickyNoteSurface post-its — but read-only: no drag,
 * no resource icons, no edit affordances. Server-rendered so the agenda stays
 * shareable and indexable; `LiveAgenda` refreshes it in place while the open
 * space is running.
 */
export function EventAgenda({ rooms, schedules, tracks }: Props) {
  const activeRooms = rooms.filter((room) => room.isActive).sort((a, b) => a.sortOrder - b.sortOrder);
  const activeSchedules = schedules.filter((schedule) => schedule.isActive);

  if (activeRooms.length === 0 || activeSchedules.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-white/15 px-6 py-16 text-center">
        <p className="text-white">La grilla todavía no está armada</p>
        <p className="mt-1 text-sm text-zinc-400">
          Las charlas se proponen y se ubican el mismo día del evento. Volvé a mirar acá.
        </p>
      </div>
    );
  }

  const notesAt = (roomId: string, slot: string) =>
    tracks.filter((track) => track.roomId === roomId && track.timeSlot === slot);

  return (
    <div className="openspace-surface max-h-[calc(100dvh-8rem)] overflow-auto rounded-xl border border-white/10 bg-white/[0.02]">
      <div
        className="grid select-none"
        style={{ gridTemplateColumns: `88px repeat(${activeRooms.length}, minmax(170px, 1fr))` }}
      >
        {/* Corner cell — sticky on both axes. Opaque backgrounds on the sticky
            rails so post-its scroll cleanly underneath. */}
        <div className="sticky left-0 top-0 z-30 flex h-14 items-center justify-center border-b border-r border-white/10 bg-zinc-800">
          <span className="font-terminal text-[10px] uppercase tracking-[0.18em] text-zinc-400">Hora</span>
        </div>

        {activeRooms.map((room) => {
          const color = roomColorFor(room.id, room.color);
          const Shape = roomIconFor(room.icon);

          return (
            <div
              key={room.id}
              className="sticky top-0 z-20 flex h-14 items-center justify-center gap-1.5 border-b border-r border-white/10 bg-zinc-800 px-2"
            >
              {Shape ? <Shape aria-hidden className="h-3.5 w-3.5 shrink-0" style={{ color, fill: color }} /> : null}
              <span
                className="truncate font-display text-xs font-semibold uppercase tracking-wide md:text-sm"
                style={{ color }}
              >
                {room.name}
              </span>
            </div>
          );
        })}

        {activeSchedules.map((schedule) => {
          const slot = slotLabel(schedule);

          return (
            <Fragment key={schedule.id}>
              <div className="sticky left-0 z-10 flex h-28 flex-col items-center justify-center border-b border-r border-white/10 bg-zinc-900 px-1 md:h-32">
                <span className="font-terminal text-xs font-medium tabular-nums text-white md:text-sm">
                  {schedule.startTime}
                </span>
                <span className="font-terminal text-[10px] tabular-nums text-zinc-500 md:text-xs">
                  {schedule.endTime}
                </span>
              </div>

              {activeRooms.map((room) => {
                const cellNotes = notesAt(room.id, slot);

                return (
                  <div key={room.id} className="relative h-28 border-b border-r border-white/10 md:h-32">
                    {cellNotes.length === 0 ? (
                      <div className="flex h-full items-center justify-center">
                        <span aria-hidden className="h-1 w-1 rounded-full bg-white/15" />
                      </div>
                    ) : (
                      cellNotes.map((note) => <StickyNoteCardKiosk key={note.id} note={note} />)
                    )}
                  </div>
                );
              })}
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}
