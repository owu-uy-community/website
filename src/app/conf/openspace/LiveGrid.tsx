"use client";

import classNames from "classnames";
import { Fragment, useEffect, useRef } from "react";
import { Sparkles } from "lucide-react";

import { RoomStatusBadge } from "components/Meetups/OpenSpace/atoms/RoomStatusBadge";
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
  selected?: Selection | null;
  /** Without it the grid is read-only (the example board before the day). */
  onSelect?: (selection: Selection) => void;
  /** Pointer over a room's cell, for the map to light it up (desktop). */
  onHover?: (roomId: string | null) => void;
  /** Talks that match the visitor's interests («Para vos»). */
  matches?: ReadonlySet<string>;
  /** Talks that just changed, for a brief pulse. */
  pulsing?: ReadonlySet<string>;
  /** The page's clock (ms): a card proposed in the last minutes reads «Nueva». */
  now?: number;
};

const NEW_FOR_MS = 3 * 60_000;
const cellKey = (scheduleId: string, roomId: string) => `${scheduleId}:${roomId}`;

/**
 * The whole board, every room against every block, marking the block you are standing in. On a
 * phone the five columns don't fit, so it reads as a list per block with the current one open; the
 * real grid starts at tablet width, where a desktop sees all of it without scrolling sideways.
 * Every card is text, so the browser's own find (Ctrl/Cmd+F) searches the board.
 */
export default function LiveGrid({
  rooms,
  schedules,
  tracks,
  currentScheduleId,
  nextScheduleId,
  selected = null,
  onSelect,
  onHover,
  matches,
  pulsing,
  now,
}: LiveGridProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const blocks = schedules.filter((schedule) => schedule.isActive);

  /* A cell picked elsewhere (the map) has to be findable here when the grid scrolls sideways
     (tablet widths). Only sideways: scrolling the page would yank whoever is reading. */
  useEffect(() => {
    const box = scroller.current;
    if (!selected || !box || box.scrollWidth <= box.clientWidth) return;

    const cell = box.querySelector<HTMLElement>(
      `[data-cell="${CSS.escape(cellKey(selected.scheduleId, selected.roomId))}"]`
    );
    if (cell) box.scrollTo({ left: cell.offsetLeft - (box.clientWidth - cell.offsetWidth) / 2, behavior: "smooth" });
  }, [selected]);

  if (rooms.length === 0 || blocks.length === 0) {
    return (
      <div className="border border-dashed border-[#FBF5E7]/20 px-6 py-16 text-center">
        <p className="font-display text-lg font-extrabold tracking-[-0.01em] text-[#FBF5E7] uppercase">
          La grilla todavía no está armada
        </p>
        <p className="mx-auto mt-2 max-w-[420px] text-sm leading-relaxed text-[#FBF5E7]/70">
          Las charlas se proponen el mismo día, en el mercado de ideas. Volvé a mirar acá cuando arranque.
        </p>
      </div>
    );
  }

  /** Arrow keys walk the cells like a spreadsheet; Tab still leaves the grid in one go per cell. */
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const delta = { ArrowRight: [0, 1], ArrowLeft: [0, -1], ArrowDown: [1, 0], ArrowUp: [-1, 0] }[event.key];
    const from = (event.target as HTMLElement).closest<HTMLElement>("[data-row]");
    if (!delta || !from) return;

    const row = Number(from.dataset.row) + delta[0];
    const col = Number(from.dataset.col) + delta[1];
    const target = scroller.current?.querySelector<HTMLElement>(`[data-row="${row}"][data-col="${col}"]`);
    if (!target) return;

    event.preventDefault();
    target.focus();
  };

  const tags = (track: StickyNote) => {
    const isNew = now !== undefined && now - new Date(track.createdAt).getTime() < NEW_FOR_MS;
    const isMatch = matches?.has(track.id);
    if (!isNew && !isMatch) return null;

    return (
      <span className="flex flex-wrap gap-1.5">
        {isNew ? (
          <span className="bg-[#F5BB03] px-1.5 py-px font-display text-[10px] leading-4 font-bold tracking-[0.08em] text-black uppercase">
            Nueva
          </span>
        ) : null}
        {isMatch ? (
          <span className="inline-flex items-center gap-1 text-[11px] leading-4 text-[#F5BB03]">
            <Sparkles aria-hidden="true" className="h-3 w-3" strokeWidth={2.2} />
            Para vos
          </span>
        ) : null}
      </span>
    );
  };

  return (
    <>
      {/* Phone: one list per block, the one on now open */}
      <div className="flex flex-col gap-2 md:hidden">
        {blocks.map((block) => {
          const isCurrent = block.id === currentScheduleId;
          const isNext = block.id === nextScheduleId;
          const booked = rooms
            .map((room) => ({ room, track: trackAt(tracks, room.id, block.id) }))
            .filter((entry) => entry.track !== null);

          return (
            <details
              key={block.id}
              className={classNames(
                "group border bg-[#FBF5E7]/[0.02]",
                isCurrent ? "border-[#F5BB03]/60" : "border-[#FBF5E7]/12"
              )}
              data-block={block.id}
              open={isCurrent || undefined}
            >
              <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 px-4 [&::-webkit-details-marker]:hidden">
                <span
                  className={classNames(
                    "font-display text-base font-bold tabular-nums",
                    isCurrent ? "text-[#F5BB03]" : "text-[#FBF5E7]"
                  )}
                >
                  {block.startTime}
                </span>
                <span className="text-xs text-[#FBF5E7]/60 tabular-nums">a {block.endTime}</span>
                {isCurrent ? (
                  <span className="font-display text-[10px] font-bold tracking-[0.12em] text-[#F5BB03] uppercase">
                    Ahora
                  </span>
                ) : isNext ? (
                  <span className="font-display text-[10px] font-bold tracking-[0.12em] text-[#FBF5E7]/70 uppercase">
                    Próximo
                  </span>
                ) : null}
                <span className="ml-auto text-xs text-[#FBF5E7]/60">
                  {booked.length === 0
                    ? "sin charlas"
                    : `${booked.length} ${booked.length === 1 ? "charla" : "charlas"}`}
                </span>
                <span aria-hidden="true" className="text-[#FBF5E7]/60 transition-transform group-open:rotate-90">
                  ›
                </span>
              </summary>
              <ul className="divide-y divide-[#FBF5E7]/10 border-t border-[#FBF5E7]/12">
                {rooms.map((room) => {
                  const track = trackAt(tracks, room.id, block.id);
                  const content = (
                    <>
                      <span
                        aria-hidden="true"
                        className="mt-1.5 h-2.5 w-2.5 shrink-0 rotate-45"
                        style={{ backgroundColor: room.color }}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="font-display text-[11px] font-bold tracking-[0.12em] text-[#FBF5E7]/70 uppercase">
                            {room.name}
                          </span>
                          <RoomStatusBadge status={room.status} />
                        </span>
                        <span
                          className={classNames(
                            "mt-1 block text-[15px] leading-snug text-pretty",
                            track ? "text-[#FBF5E7]" : "text-[#FBF5E7]/50"
                          )}
                        >
                          {track ? track.title : "Libre"}
                        </span>
                        {track?.speaker ? (
                          <span className="mt-0.5 block text-sm text-[#FBF5E7]/65">{track.speaker}</span>
                        ) : null}
                        {track ? <span className="mt-1.5 block">{tags(track)}</span> : null}
                      </span>
                    </>
                  );

                  return (
                    <li key={room.id}>
                      {onSelect ? (
                        <button
                          className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-[#FBF5E7]/[0.04] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#F5BB03]"
                          type="button"
                          onClick={() => onSelect({ roomId: room.id, scheduleId: block.id })}
                        >
                          {content}
                        </button>
                      ) : (
                        <div className="flex items-start gap-3 px-4 py-3">{content}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </details>
          );
        })}
      </div>

      {/* Tablet and up: the grid itself */}
      <div
        ref={scroller}
        className="hidden [scrollbar-width:thin] overflow-x-auto border border-[#FBF5E7]/12 md:block"
        onKeyDown={onSelect ? onKeyDown : undefined}
        onMouseLeave={() => onHover?.(null)}
      >
        <div
          className="grid select-none"
          style={{ gridTemplateColumns: `72px repeat(${rooms.length}, minmax(160px, 1fr))` }}
        >
          <div className="sticky top-0 left-0 z-30 border-r border-b border-[#FBF5E7]/12 bg-black" />
          {rooms.map((room) => (
            <div
              key={room.id}
              className={classNames(
                "sticky top-0 z-20 flex min-h-12 items-center gap-2 border-r border-b border-[#FBF5E7]/12 bg-black px-3 transition-opacity",
                selected && selected.roomId !== room.id && "opacity-55"
              )}
            >
              <span aria-hidden="true" className="h-2 w-2 shrink-0 rotate-45" style={{ backgroundColor: room.color }} />
              <span
                className="truncate font-display text-xs font-bold tracking-[0.12em] uppercase"
                style={{ color: room.color }}
              >
                {room.name}
              </span>
              <RoomStatusBadge status={room.status} />
            </div>
          ))}

          {blocks.map((block, row) => {
            const isCurrent = block.id === currentScheduleId;
            const isNext = block.id === nextScheduleId;

            return (
              <Fragment key={block.id}>
                <div
                  className={classNames(
                    "sticky left-0 z-10 flex min-h-28 flex-col items-center justify-center border-r border-b border-[#FBF5E7]/12 bg-black px-1",
                    isCurrent && "border-l-2 border-l-[#F5BB03]"
                  )}
                >
                  <span
                    className={classNames(
                      "font-display text-sm font-bold tabular-nums",
                      isCurrent ? "text-[#F5BB03]" : "text-[#FBF5E7]"
                    )}
                  >
                    {block.startTime}
                  </span>
                  <span className="mt-0.5 text-[11px] text-[#FBF5E7]/60 tabular-nums">{block.endTime}</span>
                  {isCurrent ? (
                    <span className="mt-1 font-display text-[10px] font-bold tracking-[0.1em] text-[#F5BB03] uppercase">
                      Ahora
                    </span>
                  ) : isNext ? (
                    <span className="mt-1 font-display text-[10px] font-bold tracking-[0.1em] text-[#FBF5E7]/70 uppercase">
                      Próximo
                    </span>
                  ) : null}
                </div>

                {rooms.map((room, col) => {
                  const track = trackAt(tracks, room.id, block.id);
                  const isSelected = selected?.roomId === room.id && selected?.scheduleId === block.id;
                  const className = classNames(
                    "relative min-h-28 border-r border-b border-[#FBF5E7]/12 p-2 text-left transition-colors",
                    isCurrent ? "bg-[#FBF5E7]/[0.05]" : "bg-transparent",
                    isSelected && "!bg-[#F5BB03]/[0.12]",
                    onSelect &&
                      "hover:bg-[#FBF5E7]/[0.08] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#F5BB03]"
                  );
                  const body = track ? (
                    <span
                      className={classNames(
                        "flex h-full flex-col gap-1.5 border-l-2 px-2.5 py-2 transition-shadow duration-500",
                        // A card that just landed rises into its cell
                        now !== undefined &&
                          now - new Date(track.createdAt).getTime() < NEW_FOR_MS &&
                          "conf-rise [--rise:12px]",
                        isSelected ? "bg-[#FBF5E7]/[0.1]" : "bg-[#FBF5E7]/[0.04]",
                        pulsing?.has(track.id) && "shadow-[0_0_0_2px_#F5BB03]"
                      )}
                      style={{ borderColor: room.color }}
                    >
                      <span className="text-sm leading-snug font-medium text-pretty text-[#FBF5E7]">{track.title}</span>
                      {tags(track)}
                      {track.speaker ? (
                        <span className="mt-auto truncate text-xs text-[#FBF5E7]/65">{track.speaker}</span>
                      ) : null}
                    </span>
                  ) : (
                    <span className="flex h-full items-center justify-center">
                      <span className="text-[11px] tracking-[0.1em] text-[#FBF5E7]/40 uppercase">Libre</span>
                    </span>
                  );

                  return onSelect ? (
                    <button
                      key={room.id}
                      aria-label={
                        track
                          ? `${track.title}, ${room.name}, ${block.startTime}`
                          : `${room.name} libre a las ${block.startTime}`
                      }
                      aria-pressed={isSelected}
                      className={className}
                      data-cell={cellKey(block.id, room.id)}
                      data-col={col}
                      data-row={row}
                      type="button"
                      onClick={() => onSelect({ roomId: room.id, scheduleId: block.id })}
                      onMouseEnter={() => onHover?.(room.id)}
                    >
                      {body}
                    </button>
                  ) : (
                    <div key={room.id} className={className}>
                      {body}
                    </div>
                  );
                })}
              </Fragment>
            );
          })}
        </div>
      </div>
    </>
  );
}
