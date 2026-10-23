"use client";

import classNames from "classnames";
import { useMemo } from "react";
import { MonitorPlay, PencilRuler, Users } from "lucide-react";

import OpenSpaceMap from "components/Meetups/2024/OpenSpace/Map";
import { RoomStatusBadge } from "components/Meetups/OpenSpace/atoms/RoomStatusBadge";
import type { Schedule, StickyNote } from "lib/orpc";

import type { BoardRoom } from "./board";
import { trackAt } from "./board";
import type { Selection } from "./selection";

type LiveMapProps = {
  rooms: BoardRoom[];
  tracks: StickyNote[];
  /** The block the map shows: the selected one, or the one on now (or next). */
  block: Schedule | null;
  selected: Selection | null;
  /** A room the pointer is over in the grid: the map lights it up instead of the selection. */
  hoveredRoomId?: string | null;
  onSelect: (selection: Selection) => void;
  /** «¿Qué hay en las otras salas?», for a room that's full. */
  onShowOthers?: () => void;
  className?: string;
  ref?: React.Ref<HTMLDivElement>;
};

/**
 * The venue floorplan, for people standing in the venue: the same SVG the kiosk draws, without
 * the TV's auto-cycling (a phone is not a wall, you pick the room). The legend doubles as «what's
 * on in there right now», and the selection is shared with the grid both ways.
 */
export default function LiveMap({
  rooms,
  tracks,
  block,
  selected,
  hoveredRoomId,
  onSelect,
  onShowOthers,
  className,
  ref,
}: LiveMapProps) {
  const onMap = useMemo(() => rooms.filter((room) => room.zone), [rooms]);
  const roomByZone = useMemo(() => new Map(onMap.map((room) => [room.zone as string, room.id])), [onMap]);

  const selectedRoom = rooms.find((room) => room.id === selected?.roomId) ?? null;
  const selectedTrack = selected ? trackAt(tracks, selected.roomId, selected.scheduleId) : null;
  const lit = rooms.find((room) => room.id === hoveredRoomId) ?? selectedRoom;

  const pick = (roomId: string) => {
    if (block) onSelect({ roomId, scheduleId: block.id });
  };

  return (
    <div ref={ref} className={classNames("scroll-mt-36 border border-[#FBF5E7]/12 bg-[#FBF5E7]/[0.02]", className)}>
      <div className="flex items-baseline justify-between gap-4 border-b border-[#FBF5E7]/12 px-5 py-3.5">
        <h2 className="font-display text-xs leading-none font-semibold tracking-[0.18em] text-[#FBF5E7]/75 uppercase">
          Dónde queda cada sala
        </h2>
        {block ? (
          <p className="font-display text-[11px] leading-none font-bold tracking-[0.12em] text-[#FBF5E7]/65 uppercase tabular-nums">
            {block.startTime}–{block.endTime}
          </p>
        ) : null}
      </div>

      {onMap.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-[#FBF5E7]/65">Las salas todavía no están cargadas.</p>
      ) : (
        <>
          <div className="px-3 py-5 sm:px-6 sm:py-6">
            {/* The SVG lights a zone by name; rooms bind to zones in board.ts */}
            <div className="mx-auto aspect-[1315/654] w-full max-w-[720px]">
              <OpenSpaceMap
                event={lit?.zone ? { location: lit.zone } : null}
                onRoomClick={(zone) => {
                  const roomId = roomByZone.get(zone);
                  if (roomId) pick(roomId);
                }}
              />
            </div>
          </div>

          {/* Legend: tap a room here or on the map, same selection either way */}
          <ul className="grid grid-cols-1 gap-px border-t border-[#FBF5E7]/12 bg-[#FBF5E7]/12 sm:grid-cols-2 sm:[&>li:last-child:nth-child(odd)]:col-span-2">
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
                      <span className="flex items-center gap-2">
                        <span className="font-display text-[11px] leading-none font-bold tracking-[0.12em] text-[#FBF5E7]/75 uppercase">
                          {room.name}
                        </span>
                        <RoomStatusBadge status={room.status} />
                      </span>
                      <span
                        className={classNames(
                          "mt-1.5 block truncate text-sm leading-tight",
                          track ? "text-[#FBF5E7]" : "text-[#FBF5E7]/55"
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

      {/* The selected room, so a tap always answers something */}
      {selectedRoom ? (
        <div className="border-t border-[#FBF5E7]/12 px-5 py-4" aria-live="polite">
          {selectedRoom.status === "full" ? (
            <p className="mb-3 text-sm text-[#FBF5E7]">
              <span className="font-semibold">{selectedRoom.name} está llena.</span>{" "}
              {onShowOthers ? (
                <button
                  className="underline decoration-[#F5BB03] decoration-2 underline-offset-4 transition-colors hover:text-[#F5BB03]"
                  type="button"
                  onClick={onShowOthers}
                >
                  ¿Qué hay ahora en las otras salas?
                </button>
              ) : null}
            </p>
          ) : null}
          {selectedTrack ? (
            <>
              <p className="font-display text-lg leading-tight font-extrabold tracking-[-0.01em] text-[#FBF5E7] uppercase">
                {selectedTrack.title}
              </p>
              {selectedTrack.speaker ? (
                <p className="mt-1.5 text-sm text-[#FBF5E7]/70">Propone {selectedTrack.speaker}</p>
              ) : null}
              {selectedTrack.description ? (
                <p className="mt-2.5 text-sm leading-relaxed text-pretty text-[#FBF5E7]/80">
                  {selectedTrack.description}
                </p>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-[#FBF5E7]/70">
              Nadie reservó {selectedRoom.name} para este bloque. Sala libre: si tenés un tema, es tuya.
            </p>
          )}

          {/* What the room offers is part of deciding whether to walk over */}
          <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-[#FBF5E7]/70">
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
}
