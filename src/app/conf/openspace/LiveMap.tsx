"use client";

import classNames from "classnames";
import { useMemo } from "react";

import OpenSpaceMap from "components/Meetups/2024/OpenSpace/Map";
import type { StickyNote } from "lib/orpc";

import type { BoardRoom } from "./board";
import { trackAt } from "./board";

type LiveMapProps = {
  rooms: BoardRoom[];
  tracks: StickyNote[];
  /** Block whose talks the map is showing; undefined during a break. */
  scheduleId: string | undefined;
  selectedRoomId: string | null;
  onSelect: (roomId: string) => void;
};

/**
 * The venue floorplan, for people standing in the venue. Same SVG the kiosk
 * draws, with attendee chrome instead of TV chrome: no auto-cycling (a phone
 * is not a wall display — you pick the room), and the legend doubles as the
 * answer to "what is happening in there right now".
 */
export default function LiveMap({ rooms, tracks, scheduleId, selectedRoomId, onSelect }: LiveMapProps) {
  const onMap = useMemo(() => rooms.filter((room) => room.zone), [rooms]);

  const roomByZone = useMemo(
    () => new Map(onMap.map((room) => [room.zone as string, room.id])),
    [onMap]
  );

  const selected = rooms.find((room) => room.id === selectedRoomId) ?? null;
  const selectedTrack = selected ? trackAt(tracks, selected.id, scheduleId) : null;

  return (
    <div className="border border-[#FBF5E7]/12 bg-[#FBF5E7]/[0.02]">
      <div className="flex items-baseline justify-between gap-4 border-b border-[#FBF5E7]/12 px-5 py-3.5">
        <p className="font-display text-xs font-semibold uppercase leading-none tracking-[0.18em] text-[#FBF5E7]/60">
          El mapa
        </p>
        {selected ? (
          <p className="truncate font-display text-xs font-bold uppercase leading-none tracking-[0.1em]" style={{ color: selected.color }}>
            {selected.name}
          </p>
        ) : null}
      </div>

      {onMap.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-[#FBF5E7]/50">
          Las salas todavía no están cargadas.
        </p>
      ) : (
        <>
          <div className="px-3 py-5 sm:px-6 sm:py-7">
            {/* The SVG selects a zone by name; rooms are bound to zones in board.ts */}
            <div className="mx-auto aspect-[1315/654] w-full max-w-[720px]">
              <OpenSpaceMap
                event={selected?.zone ? { location: selected.zone } : null}
                onRoomClick={(zone) => {
                  const roomId = roomByZone.get(zone);
                  if (roomId) onSelect(roomId);
                }}
              />
            </div>
          </div>

          {/* Legend: tap a room here or on the map — same selection either way. */}
          <ul className="grid grid-cols-1 gap-px border-t border-[#FBF5E7]/12 bg-[#FBF5E7]/12 sm:grid-cols-2 lg:grid-cols-3">
            {onMap.map((room) => {
              const track = trackAt(tracks, room.id, scheduleId);
              const isSelected = room.id === selectedRoomId;

              return (
                <li key={room.id}>
                  <button
                    aria-current={isSelected || undefined}
                    className={classNames(
                      "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#F5BB03]",
                      isSelected ? "bg-[#FBF5E7]/[0.08]" : "bg-black hover:bg-[#FBF5E7]/[0.04]"
                    )}
                    type="button"
                    onClick={() => onSelect(room.id)}
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
      {selected ? (
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
              Nadie reservó {selected.name} para este bloque. Sala libre: si tenés un tema, es tuya.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
