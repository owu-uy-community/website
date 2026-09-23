"use client";

import classNames from "classnames";
import { Fragment, useEffect, useRef } from "react";

import type { Schedule, StickyNote } from "lib/orpc";

import type { BoardRoom } from "./board";
import { trackAt } from "./board";
import type { Selection } from "./selection";

type LiveGridProps = {
  rooms: BoardRoom[];
  schedules: Schedule[];
  tracks: StickyNote[];
  currentScheduleId: string | null;
  nextScheduleId: string | null;
  selected: Selection | null;
  onSelect: (selection: Selection) => void;
};

const cellKey = (scheduleId: string, roomId: string) => `${scheduleId}:${roomId}`;

/**
 * The whole board: every room against every block. Server-rendered and
 * refreshed in place, so it is shareable and indexable — but unlike the kiosk
 * wall it marks the block you are standing in, and every cell is a control:
 * tapping one selects that room and block everywhere else on the page.
 */
export default function LiveGrid({
  rooms,
  schedules,
  tracks,
  currentScheduleId,
  nextScheduleId,
  selected,
  onSelect,
}: LiveGridProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const blocks = schedules.filter((schedule) => schedule.isActive);

  /* A selection made on the map has to be findable here — on a phone the
     matching column is usually off-screen. */
  useEffect(() => {
    if (!selected || !scroller.current) return;

    const cell = scroller.current.querySelector<HTMLElement>(
      `[data-cell="${CSS.escape(cellKey(selected.scheduleId, selected.roomId))}"]`
    );
    cell?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [selected]);

  if (rooms.length === 0 || blocks.length === 0) {
    return (
      <div className="border border-dashed border-[#FBF5E7]/20 px-6 py-16 text-center">
        <p className="font-display text-lg font-extrabold uppercase tracking-[-0.01em] text-[#FBF5E7]">
          La grilla todavía no está armada
        </p>
        <p className="mx-auto mt-2 max-w-[420px] text-sm leading-relaxed text-[#FBF5E7]/60">
          Las charlas se proponen y se ubican el mismo día. Volvé a mirar acá cuando arranque el mercado de ideas.
        </p>
      </div>
    );
  }

  return (
    <div ref={scroller} className="overflow-x-auto border border-[#FBF5E7]/12 [scrollbar-width:thin]">
      {/* Columns have a floor, not a fixed width: the grid fills a desktop
          container and overflows into a horizontal scroll on a phone. */}
      <div
        className="grid select-none"
        style={{ gridTemplateColumns: `64px repeat(${rooms.length}, minmax(150px, 1fr))` }}
      >
        {/* Sticky corner + room rail */}
        <div className="sticky left-0 top-0 z-30 border-b border-r border-[#FBF5E7]/12 bg-black" />
        {rooms.map((room) => (
          <div
            key={room.id}
            className={classNames(
              "sticky top-0 z-20 flex h-12 items-center gap-2 border-b border-r border-[#FBF5E7]/12 bg-black px-3 transition-opacity",
              selected && selected.roomId !== room.id && "opacity-45"
            )}
          >
            <span aria-hidden="true" className="h-2 w-2 shrink-0 rotate-45" style={{ backgroundColor: room.color }} />
            <span
              className="truncate font-display text-[11px] font-bold uppercase leading-none tracking-[0.12em]"
              style={{ color: room.color }}
            >
              {room.name}
            </span>
          </div>
        ))}

        {blocks.map((block) => {
          const isCurrent = block.id === currentScheduleId;
          const isNext = block.id === nextScheduleId;

          return (
            <Fragment key={block.id}>
              <div
                className={classNames(
                  "sticky left-0 z-10 flex min-h-24 flex-col items-center justify-center border-b border-r border-[#FBF5E7]/12 bg-black px-1",
                  isCurrent && "border-l-2 border-l-[#F5BB03]"
                )}
              >
                <span
                  className={classNames(
                    "font-display text-xs font-bold tabular-nums",
                    isCurrent ? "text-[#F5BB03]" : "text-[#FBF5E7]/85"
                  )}
                >
                  {block.startTime}
                </span>
                <span className="mt-0.5 text-[10px] tabular-nums text-[#FBF5E7]/40">{block.endTime}</span>
                {isCurrent ? (
                  <span className="mt-1 font-display text-[9px] font-bold uppercase tracking-[0.1em] text-[#F5BB03]">
                    Ahora
                  </span>
                ) : null}
                {isNext ? (
                  <span className="mt-1 font-display text-[9px] font-bold uppercase tracking-[0.1em] text-[#FBF5E7]/45">
                    Próximo
                  </span>
                ) : null}
              </div>

              {rooms.map((room) => {
                const track = trackAt(tracks, room.id, block.id);
                const isSelected = selected?.roomId === room.id && selected?.scheduleId === block.id;

                return (
                  <button
                    key={`${block.id}-${room.id}`}
                    aria-label={
                      track
                        ? `${track.title}, ${room.name}, ${block.startTime}`
                        : `${room.name} libre a las ${block.startTime}`
                    }
                    aria-pressed={isSelected}
                    className={classNames(
                      "min-h-24 border-b border-r border-[#FBF5E7]/12 p-2.5 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#F5BB03]",
                      isCurrent ? "bg-[#FBF5E7]/[0.05]" : "bg-transparent",
                      isSelected && "!bg-[#F5BB03]/[0.12]",
                      "hover:bg-[#FBF5E7]/[0.08]"
                    )}
                    data-cell={cellKey(block.id, room.id)}
                    type="button"
                    onClick={() => onSelect({ roomId: room.id, scheduleId: block.id })}
                  >
                    {track ? (
                      <span
                        className={classNames(
                          "flex h-full flex-col border-l-2 px-2.5 py-2 transition-colors",
                          isSelected ? "bg-[#FBF5E7]/[0.1]" : "bg-[#FBF5E7]/[0.04]"
                        )}
                        style={{ borderColor: room.color }}
                      >
                        <span className="text-[13px] font-medium leading-snug text-[#FBF5E7]">{track.title}</span>
                        {track.speaker ? (
                          <span className="mt-auto truncate pt-1 text-[11px] text-[#FBF5E7]/50">{track.speaker}</span>
                        ) : null}
                      </span>
                    ) : (
                      <span className="flex h-full items-center justify-center">
                        <span className="text-[11px] uppercase tracking-[0.1em] text-[#FBF5E7]/20">Libre</span>
                      </span>
                    )}
                  </button>
                );
              })}
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}
