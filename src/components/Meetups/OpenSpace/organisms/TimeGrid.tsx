"use client";

import * as React from "react";
import { useDroppable } from "@dnd-kit/core";
import { Plus } from "lucide-react";

import { cn } from "app/lib/utils";
import type { BoardEditor } from "components/Admin/agenda/CompactNoteSurface";
import { MicroLabel } from "components/Admin/ui/page";

import { TimeSlotLabel } from "../atoms/TimeSlotLabel";
import { RoomHeader } from "../molecules/RoomHeader";
import { StickyNoteCard, type BoardVariant } from "../molecules/StickyNoteCard";

import type { Room, StickyNote } from "../../../../lib/orpc";

interface Schedule {
  id: string;
  highlightInKiosk: boolean;
}

interface TimeGridProps {
  /** Post-its exactly like the kiosk's, or the admin's compact cards. */
  variant: BoardVariant;
  rooms: string[];
  /** Resolved color per room name (explicit or palette fallback). */
  roomColors?: Record<string, string>;
  /** Picked shape key per room name; rooms without one render no icon. */
  roomIcons?: Record<string, string | null>;
  /** The whole room per name: resources, capacity, status. */
  roomsByName?: Record<string, Room>;
  timeSlots: string[];
  schedulesData?: Schedule[];
  /** The block on now (its label), on the event's clock. */
  nowSlot?: string | null;
  /** Note being dragged (or settling right after the drop). */
  activeNote: StickyNote | null;
  settlingId: string | null;
  /** Occupant of the hovered cell, sliding toward the drag origin. */
  swapPreviewId: string | null;
  /** Pixel offset that slides the swap-preview note to the drag origin. */
  swapPreviewOffset: { x: number; y: number } | null;
  /** Note currently cast to the sticky-note screen. */
  highlightedNoteId?: string | null;
  /** Note open in this screen's inspector. */
  selectedNoteId?: string | null;
  /** Who else has a note open, by note id. */
  editors?: ReadonlyMap<string, BoardEditor>;
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
  /** Rooms switched off: their column is dimmed. */
  inactiveRooms?: ReadonlySet<string>;
}

interface BoardCellProps {
  variant: BoardVariant;
  room: string;
  roomDetails?: Room;
  timeSlot: string;
  color: string;
  notes: StickyNote[];
  isInactive: boolean;
  activeNote: StickyNote | null;
  settlingId: string | null;
  swapPreviewId: string | null;
  swapPreviewOffset: { x: number; y: number } | null;
  highlightedNoteId?: string | null;
  selectedNoteId?: string | null;
  editors?: ReadonlyMap<string, BoardEditor>;
  recentlyUpdatedIds: ReadonlySet<string>;
  lastDragEndAt: React.MutableRefObject<number>;
  /** Drop-time screen positions for FLIP continuation on remount. */
  flipRects: React.MutableRefObject<Map<string, { left: number; top: number }>>;
  onOpenNote: (note: StickyNote) => void;
  onCastNote?: (note: StickyNote) => void;
  onEmptyCellClick: (room: string, timeSlot: string) => void;
}

function BoardCell({
  variant,
  room,
  roomDetails,
  timeSlot,
  color,
  notes,
  isInactive,
  activeNote,
  settlingId,
  swapPreviewId,
  swapPreviewOffset,
  highlightedNoteId,
  selectedNoteId,
  editors,
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
        "group/cell relative h-32 border-l border-border transition-colors duration-150",
        isInactive && "bg-muted/30",
        isDropTarget && "bg-primary/[0.07]",
        isEmpty && isIdle && "cursor-pointer",
        isEmpty && isIdle && variant === "postit" && "hover:bg-muted/40"
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

      {/* The kiosk shows nothing in an empty cell; on the compact board it's a visible "+" slot. */}
      {isEmpty && isIdle && (
        <button
          aria-label={`Agregar charla en ${room}, ${timeSlot}`}
          className={cn(
            "absolute inset-1.5 flex items-center justify-center rounded-lg border border-dashed transition-[opacity,border-color,color] duration-150 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:outline-hidden",
            variant === "compact"
              ? "border-input text-faint hover:border-primary/40 hover:text-muted-foreground"
              : "border-border text-muted-foreground opacity-100 pointer-fine:md:opacity-0 pointer-fine:md:group-hover/cell:opacity-100"
          )}
          type="button"
        >
          <Plus aria-hidden className="size-4" />
        </button>
      )}

      {notes.map((note) => (
        <StickyNoteCard
          key={note.id}
          color={color}
          editor={editors?.get(note.id) ?? null}
          isActive={activeNote?.id === note.id}
          isCast={highlightedNoteId === note.id}
          isSelected={selectedNoteId === note.id}
          isSettling={settlingId === note.id}
          isSwapPreview={swapPreviewId === note.id}
          flipRects={flipRects}
          lacksTV={note.needsTV && roomDetails != null && !roomDetails.hasTV}
          lacksWhiteboard={note.needsWhiteboard && roomDetails != null && !roomDetails.hasWhiteboard}
          lastDragEndAt={lastDragEndAt}
          note={note}
          previewOffset={swapPreviewId === note.id ? swapPreviewOffset : null}
          variant={variant}
          wasJustUpdated={recentlyUpdatedIds.has(note.id)}
          onCast={variant === "postit" ? onCastNote : undefined}
          onOpen={onOpenNote}
        />
      ))}
    </div>
  );
}

const ROW = "grid [grid-template-columns:var(--board-columns-mobile)] md:[grid-template-columns:var(--board-columns)]";

export function TimeGrid({
  variant,
  rooms,
  roomColors,
  roomIcons,
  roomsByName,
  timeSlots,
  schedulesData = [],
  nowSlot,
  activeNote,
  settlingId,
  swapPreviewId,
  swapPreviewOffset,
  highlightedNoteId,
  selectedNoteId,
  editors,
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
  inactiveRooms,
}: TimeGridProps) {
  return (
    <div
      className="w-full min-w-[var(--board-min-width-mobile)] select-none md:min-w-[var(--board-min-width)]"
      style={
        {
          "--board-min-width-mobile": `${72 + rooms.length * 220}px`,
          "--board-min-width": `${76 + rooms.length * 150}px`,
          "--board-columns-mobile": `72px repeat(${rooms.length}, minmax(220px, 1fr))`,
          "--board-columns": `76px repeat(${rooms.length}, minmax(150px, 1fr))`,
        } as React.CSSProperties
      }
    >
      {/* Room headers: sticky on top, the corner sticky on both axes. */}
      <div className={cn(ROW, "sticky top-0 z-20 border-b border-border bg-card")}>
        <div className="sticky left-0 z-10 flex h-11 items-end bg-card px-3 pb-2">
          <MicroLabel>Hora</MicroLabel>
        </div>
        {rooms.map((room) => (
          <RoomHeader
            key={room}
            color={roomColors?.[room] ?? "#a1a1aa"}
            details={roomsByName?.[room]}
            icon={roomIcons?.[room]}
            inactive={inactiveRooms?.has(room) ?? false}
            room={room}
            onEdit={onEditRoom ? () => onEditRoom(room) : undefined}
          />
        ))}
      </div>

      {timeSlots.map((timeSlot, timeIndex) => {
        const isRowHighlighted = schedulesData[timeIndex]?.highlightInKiosk || false;
        const isNow = timeSlot === nowSlot;

        return (
          <div
            key={timeSlot}
            className={cn(
              ROW,
              "border-b border-border",
              isNow && "bg-[linear-gradient(90deg,hsl(var(--primary)/0.06),hsl(var(--primary)/0.015))]"
            )}
          >
            <TimeSlotLabel
              isHighlighted={isRowHighlighted}
              isNow={isNow}
              timeSlot={timeSlot}
              onEdit={() => onEditSchedule(timeIndex)}
              onToggleHighlight={onToggleScheduleHighlight ? () => onToggleScheduleHighlight(timeIndex) : undefined}
            />

            {rooms.map((room) => (
              <BoardCell
                key={`${room}::${timeSlot}`}
                activeNote={activeNote}
                color={roomColors?.[room] ?? "#a1a1aa"}
                editors={editors}
                highlightedNoteId={highlightedNoteId}
                isInactive={inactiveRooms?.has(room) ?? false}
                flipRects={flipRects}
                lastDragEndAt={lastDragEndAt}
                notes={getNotesForCell(room, timeSlot)}
                recentlyUpdatedIds={recentlyUpdatedIds}
                room={room}
                roomDetails={roomsByName?.[room]}
                selectedNoteId={selectedNoteId}
                settlingId={settlingId}
                swapPreviewId={swapPreviewId}
                swapPreviewOffset={swapPreviewOffset}
                timeSlot={timeSlot}
                variant={variant}
                onCastNote={onCastNote}
                onEmptyCellClick={onEmptyCellClick}
                onOpenNote={onOpenNote}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}
