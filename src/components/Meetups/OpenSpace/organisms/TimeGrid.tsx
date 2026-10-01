"use client";

import * as React from "react";
import { useDroppable } from "@dnd-kit/core";
import { Plus } from "lucide-react";

import { cn } from "app/lib/utils";

import { TimeSlotLabel } from "../atoms/TimeSlotLabel";
import { RoomHeader } from "../molecules/RoomHeader";
import { StickyNoteCard } from "../molecules/StickyNoteCard";

import type { StickyNote } from "../../../../lib/orpc";

interface Schedule {
  id: string;
  highlightInKiosk: boolean;
}

interface TimeGridProps {
  rooms: string[];
  /** Resolved color per room name (explicit or palette fallback). */
  roomColors?: Record<string, string>;
  /** Picked shape key per room name; rooms without one render no icon. */
  roomIcons?: Record<string, string | null>;
  timeSlots: string[];
  schedulesData?: Schedule[];
  /** Note being dragged (or settling right after the drop). */
  activeNote: StickyNote | null;
  settlingId: string | null;
  /** Occupant of the hovered cell, sliding toward the drag origin. */
  swapPreviewId: string | null;
  /** Pixel offset that slides the swap-preview note to the drag origin. */
  swapPreviewOffset: { x: number; y: number } | null;
  /** Note currently cast to the sticky-note screen. */
  highlightedNoteId?: string | null;
  recentlyUpdatedIds: ReadonlySet<string>;
  lastDragEndAt: React.MutableRefObject<number>;
  /** Drop-time screen positions for FLIP continuation on remount. */
  flipRects: React.MutableRefObject<Map<string, { left: number; top: number }>>;
  getNotesForCell: (room: string, timeSlot: string) => StickyNote[];
  onOpenNote: (note: StickyNote) => void;
  onCastNote?: (note: StickyNote) => void;
  onEmptyCellClick: (room: string, timeSlot: string) => void;
  onEditSchedule: (timeIndex: number) => void;
  onToggleScheduleHighlight?: (timeIndex: number) => void;
  /** Click on a room header to edit that column's room. */
  onEditRoom?: (room: string) => void;
}

interface BoardCellProps {
  room: string;
  timeSlot: string;
  color: string;
  notes: StickyNote[];
  isRowHighlighted: boolean;
  activeNote: StickyNote | null;
  settlingId: string | null;
  swapPreviewId: string | null;
  swapPreviewOffset: { x: number; y: number } | null;
  highlightedNoteId?: string | null;
  recentlyUpdatedIds: ReadonlySet<string>;
  lastDragEndAt: React.MutableRefObject<number>;
  /** Drop-time screen positions for FLIP continuation on remount. */
  flipRects: React.MutableRefObject<Map<string, { left: number; top: number }>>;
  onOpenNote: (note: StickyNote) => void;
  onCastNote?: (note: StickyNote) => void;
  onEmptyCellClick: (room: string, timeSlot: string) => void;
}

function BoardCell({
  room,
  timeSlot,
  color,
  notes,
  isRowHighlighted,
  activeNote,
  settlingId,
  swapPreviewId,
  swapPreviewOffset,
  highlightedNoteId,
  recentlyUpdatedIds,
  lastDragEndAt,
  flipRects,
  onOpenNote,
  onCastNote,
  onEmptyCellClick,
}: BoardCellProps) {
  const { isOver, setNodeRef } = useDroppable({
    id: `cell::${room}::${timeSlot}`,
    data: { room, timeSlot },
  });

  const isSourceCell = activeNote?.room === room && activeNote?.timeSlot === timeSlot;
  const isDropTarget = isOver && activeNote != null && !isSourceCell;
  const isEmpty = notes.length === 0;
  const isIdle = activeNote == null;

  return (
    <div
      ref={setNodeRef}
      data-board-cell=""
      className={cn(
        "group/cell border-border/60 relative h-32 border-r border-b transition-colors duration-150",
        isRowHighlighted && "bg-primary/[0.06]",
        isDropTarget && "bg-primary/[0.07]",
        isEmpty && isIdle && "hover:bg-muted/40 cursor-pointer"
      )}
      onClick={() => {
        if (isEmpty && isIdle) onEmptyCellClick(room, timeSlot);
      }}
    >
      {/* Landing slot: where the card in hand will end up. Tinted with THIS
          room's color because the card adopts it after the drop. */}
      {isDropTarget && (
        <div
          className="pointer-events-none absolute inset-1.5 z-[1] rounded-lg border-2 border-dashed"
          style={{ borderColor: color, backgroundColor: `${color}14` }}
        />
      )}

      {isEmpty && isIdle && (
        <button
          aria-label={`Agregar charla en ${room}, ${timeSlot}`}
          className="border-border absolute inset-1.5 flex items-center justify-center rounded-md border border-dashed opacity-100 transition-opacity duration-150 md:opacity-0 md:group-hover/cell:opacity-100 md:focus-visible:opacity-100"
          type="button"
        >
          <Plus className="text-muted-foreground h-4 w-4" />
        </button>
      )}

      {notes.map((note) => (
        <StickyNoteCard
          key={note.id}
          color={color}
          isActive={activeNote?.id === note.id}
          isCast={highlightedNoteId === note.id}
          isSettling={settlingId === note.id}
          isSwapPreview={swapPreviewId === note.id}
          flipRects={flipRects}
          lastDragEndAt={lastDragEndAt}
          note={note}
          previewOffset={swapPreviewId === note.id ? swapPreviewOffset : null}
          wasJustUpdated={recentlyUpdatedIds.has(note.id)}
          onCast={onCastNote}
          onOpen={onOpenNote}
        />
      ))}
    </div>
  );
}

export function TimeGrid({
  rooms,
  roomColors,
  roomIcons,
  timeSlots,
  schedulesData = [],
  activeNote,
  settlingId,
  swapPreviewId,
  swapPreviewOffset,
  highlightedNoteId,
  recentlyUpdatedIds,
  lastDragEndAt,
  flipRects,
  getNotesForCell,
  onOpenNote,
  onCastNote,
  onEmptyCellClick,
  onEditSchedule,
  onToggleScheduleHighlight,
  onEditRoom,
}: TimeGridProps) {
  return (
    <div
      className="grid w-full min-w-[var(--board-min-width-mobile)] [grid-template-columns:var(--board-columns-mobile)] select-none md:min-w-[var(--board-min-width)] md:[grid-template-columns:var(--board-columns)]"
      style={
        {
          "--board-min-width-mobile": `${72 + rooms.length * 220}px`,
          "--board-min-width": `${88 + rooms.length * 170}px`,
          "--board-columns-mobile": `72px repeat(${rooms.length}, minmax(220px, 1fr))`,
          "--board-columns": `88px repeat(${rooms.length}, minmax(170px, 1fr))`,
        } as React.CSSProperties
      }
    >
      {/* Corner cell — sticky on both axes */}
      <div className="border-border/60 bg-card sticky top-0 left-0 z-30 flex h-14 items-center justify-center border-r border-b">
        <span className="font-terminal text-muted-foreground text-[10px] tracking-[0.18em] uppercase">Hora</span>
      </div>

      {rooms.map((room) => (
        <RoomHeader
          key={room}
          color={roomColors?.[room] ?? "#a1a1aa"}
          icon={roomIcons?.[room]}
          room={room}
          onEdit={onEditRoom ? () => onEditRoom(room) : undefined}
        />
      ))}

      {timeSlots.map((timeSlot, timeIndex) => {
        const isRowHighlighted = schedulesData[timeIndex]?.highlightInKiosk || false;

        return (
          <React.Fragment key={timeSlot}>
            <TimeSlotLabel
              isHighlighted={isRowHighlighted}
              timeSlot={timeSlot}
              onEdit={() => onEditSchedule(timeIndex)}
              onToggleHighlight={onToggleScheduleHighlight ? () => onToggleScheduleHighlight(timeIndex) : undefined}
            />

            {rooms.map((room) => (
              <BoardCell
                key={`${room}::${timeSlot}`}
                activeNote={activeNote}
                color={roomColors?.[room] ?? "#a1a1aa"}
                highlightedNoteId={highlightedNoteId}
                isRowHighlighted={isRowHighlighted}
                flipRects={flipRects}
                lastDragEndAt={lastDragEndAt}
                notes={getNotesForCell(room, timeSlot)}
                recentlyUpdatedIds={recentlyUpdatedIds}
                room={room}
                settlingId={settlingId}
                swapPreviewId={swapPreviewId}
                swapPreviewOffset={swapPreviewOffset}
                timeSlot={timeSlot}
                onCastNote={onCastNote}
                onEmptyCellClick={onEmptyCellClick}
                onOpenNote={onOpenNote}
              />
            ))}
          </React.Fragment>
        );
      })}
    </div>
  );
}
