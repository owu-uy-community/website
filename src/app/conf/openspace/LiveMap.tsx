"use client";

import classNames from "classnames";
import { forwardRef, useMemo } from "react";
import { MonitorPlay, PencilRuler, Users } from "lucide-react";

import OpenSpaceMap from "components/Meetups/2024/OpenSpace/Map";
import type { Schedule, StickyNote } from "lib/orpc";

import type { BoardRoom } from "./board";
import { trackAt } from "./board";
import type { Selection } from "./selection";

type LiveMapProps = {
  rooms: BoardRoom[];
  tracks: StickyNote[];
  /** The block the map is showing — the selected one, or the active one. */
  block: Schedule | null;
  selected: Selection | null;
  onSelect: (selection: Selection) => void;
  className?: string;
};

/**
 * The venue floorplan, for people standing in the venue. Same SVG the kiosk
 * draws, with attendee chrome instead of TV chrome: no auto-cycling (a phone is
 * not a wall display — you pick the room), and the legend doubles as the answer
 * to "what is happening in there right now".
 *
 * Selection is shared with the grid, so tapping a room here highlights the same
 * cell there and vice versa.
 */
const LiveMap = forwardRef<HTMLDivElement, LiveMapProps>(function LiveMap(
  { rooms, tracks, block, selected, onSelect, className },
  ref
) {
  const onMap = useMemo(() => rooms.filter((room) => room.zone), [rooms]);
  const roomByZone = useMemo(() => new Map(onMap.map((room) => [room.zone as string, room.id])), [onMap]);

  const selectedRoom = rooms.find((room) => room.id === selected?.roomId) ?? null;
  const selectedTrack = selected ? trackAt(tracks, selected.roomId, selected.scheduleId) : null;

  const pick = (roomId: string) => {
    if (block) onSelect({ roomId, scheduleId: block.id });
  };

  return (
    <div ref={ref} className={classNames("scroll-mt-20 border border-[#FBF5E7]/12 bg-[#FBF5E7]/[0.02]", className)}>
      <div className="flex items-baseline justify-between gap-4 border-b border-[#FBF5E7]/12 px-5 py-3.5">
        <p className="font-display text-xs font-semibold uppercase leading-none tracking-[0.18em] text-[#FBF5E7]/60">
          El mapa
        </p>
        {block ? (
          <p className="font-display text-[11px] font-bold uppercase leading-none tracking-[0.12em] text-[#FBF5E7]/45">
            {block.startTime}–{block.endTime}
          </p>
        ) : null}
      </div>

      {onMap.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-[#FBF5E7]/50">Las salas todavía no están cargadas.</p>
      ) : (
        <>
          <div className="px-3 py-5 sm:px-6 sm:py-7">
            {/* The SVG selects a zone by name; rooms bind to zones in board.ts */}
            <div className="mx-auto aspect-[1315/654] w-full max-w-[720px]">
              <OpenSpaceMap
                event={selectedRoom?.zone ? { location: selectedRoom.zone } : null}
                onRoomClick={(zone) => {
                  const roomId = roomByZone.get(zone);
                  if (roomId) pick(roomId);
                }}
              />
            </div>
          </div>

          {/* Legend: tap a room here or on the map — same selection either way. */}
          <ul className="grid grid-cols-1 gap-px border-t border-[#FBF5E7]/12 bg-[#FBF5E7]/12 sm:grid-cols-2 lg:grid-cols-3">
            {onMap.map((room) => {
              const track = trackAt(tracks, room.id, block?.id);
              const isSelected = room.id === selected?.roomId;

              return (
                <li key={room.id}>
                  <button
                    aria-pressed={isSelected}
                    className={classNames(
                      "flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#F5BB03]",
                      isSelected ? "bg-[#F5BB03]/[0.12]" : "bg-black hover:bg-[#FBF5E7]/[0.04]"
                    )}
                    type="button"
                    onClick={() => pick(room.id)}
                  >
                    <span
                      aria-hidden="true"
                      className="h-2.5 w-2.5 shrink-0 rotate-45"
                      style={{ backgroundColor: room.color }}
                    />
                    <span className="min-w-0">
                      <span className="block font-display text-[11px] font-bold uppercase leading-none tracking-[0.12em] text-[#FBF5E7]/70">
                        {room.name}
                      </span>
                      <span
                        className={classNames(
                          "mt-1.5 block truncate text-sm leading-tight",
                          track ? "text-[#FBF5E7]" : "text-[#FBF5E7]/35"
                        )}
                      >
                        {track ? track.title : "Libre"}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {/* Detail for the selected room, so a tap always shows something. */}
      {selectedRoom ? (
        <div className="border-t border-[#FBF5E7]/12 px-5 py-4">
          {selectedTrack ? (
            <>
              <p className="font-display text-lg font-extrabold uppercase leading-tight tracking-[-0.01em] text-[#FBF5E7]">
                {selectedTrack.title}
              </p>
              {selectedTrack.speaker ? (
                <p className="mt-1.5 text-sm text-[#FBF5E7]/60">Propone {selectedTrack.speaker}</p>
              ) : null}
              {selectedTrack.description ? (
                <p className="mt-2.5 text-pretty text-sm leading-relaxed text-[#FBF5E7]/75">
                  {selectedTrack.description}
                </p>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-[#FBF5E7]/50">
              Nadie reservó {selectedRoom.name} para este bloque. Sala libre: si tenés un tema, es tuya.
            </p>
          )}

          {/* What the room itself offers — part of deciding whether to walk over. */}
          <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-[#FBF5E7]/55">
            {selectedRoom.capacity ? (
              <span className="inline-flex items-center gap-1.5">
                <Users aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={2} />
                {selectedRoom.capacity} personas
              </span>
            ) : null}
            {selectedRoom.hasTV ? (
              <span className="inline-flex items-center gap-1.5">
                <MonitorPlay aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={2} />
                Pantalla
              </span>
            ) : null}
            {selectedRoom.hasWhiteboard ? (
              <span className="inline-flex items-center gap-1.5">
                <PencilRuler aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={2} />
                Pizarra
              </span>
            ) : null}
          </p>
        </div>
      ) : null}
    </div>
  );
});

export default LiveMap;
