"use client";

import * as React from "react";
import { useState, useEffect } from "react";

import { TimeSlotLabel } from "../atoms/TimeSlotLabel";
import { RoomHeader } from "../molecules/RoomHeader";
import { StickyNoteCard } from "../molecules/StickyNoteCard";
import { EmptyCell } from "../atoms/EmptyCell";
import { MOBILE_BREAKPOINT } from "../utils/constants";

import type { StickyNote } from "../../../../lib/orpc";

interface DragState {
  isDragging: boolean;
  draggedNote: StickyNote | null;
  dragOffset: { x: number; y: number };
  mousePosition: { x: number; y: number };
  startPosition: { x: number; y: number };
  hoveredCell: { room: string; timeSlot: string } | null;
  dragVelocity: { x: number; y: number };
  lastMousePosition: { x: number; y: number };
  dragStartTime: number;
  swapPreview: {
    targetNote: StickyNote | null;
    isSwapping: boolean;
  };
  columnDrag: {
    isDragging: boolean;
    draggedRoomIndex: number | null;
    startX: number;
    currentX: number;
    hoveredIndex: number | null;
    previewRooms: string[] | null;
  };
}

interface Schedule {
  id: string;
  highlightInKiosk: boolean;
}

interface TimeGridProps {
  rooms: string[];
  timeSlots: string[];
  schedulesData?: Schedule[];
  dragState: DragState;
  editingTimeIndex: number | null;
  editingTimeValue: string;
  hoveredEmptyCell: { room: string; timeSlot: string } | null;
  noteColors: Record<string, string>;
  getNotesForCell: (room: string, timeSlot: string) => StickyNote[];
  onRoomMouseDown: (e: React.MouseEvent, index: number) => void;
  onTimeDoubleClick: (index: number) => void;
  onTimeEditChange: (value: string) => void;
  onTimeEdit: (e: React.KeyboardEvent) => void;
  onTimeEditBlur: () => void;
  onTimeEditSave?: () => void;
  onTimeDelete?: (timeIndex: number) => void;
  onEmptyCellMouseEnter: (room: string, timeSlot: string) => void;
  onEmptyCellMouseLeave: () => void;
  onEmptyCellClick: (room: string, timeSlot: string) => void;
  onCardMouseDown: (e: React.MouseEvent | React.TouchEvent, note: StickyNote) => void;
  onCardDirectClick: (note: StickyNote) => void;
  onCardCast?: (note: StickyNote) => void;
  onToggleScheduleHighlight?: (timeIndex: number) => void;
  highlightedNoteId?: string | null;
  getCardStyle: (note: StickyNote, isDragged: boolean, isSwapTarget: boolean) => React.CSSProperties;
  getCardClasses: (note: StickyNote) => string;
  getCardTransform: (note: StickyNote, isDragged: boolean, isSwapTarget: boolean) => string;
}

export function TimeGrid({
  rooms,
  timeSlots,
  schedulesData = [],
  dragState,
  editingTimeIndex,
  editingTimeValue,
  hoveredEmptyCell,
  noteColors,
  getNotesForCell,
  onRoomMouseDown,
  onTimeDoubleClick,
  onTimeEditChange,
  onTimeEdit,
  onTimeEditBlur,
  onTimeEditSave,
  onTimeDelete,
  onEmptyCellMouseEnter,
  onEmptyCellMouseLeave,
  onEmptyCellClick,
  onCardMouseDown,
  onCardDirectClick,
  onCardCast,
  onToggleScheduleHighlight,
  highlightedNoteId,
  getCardStyle,
  getCardClasses,
  getCardTransform,
}: TimeGridProps) {
  const displayRooms = dragState.columnDrag.previewRooms || rooms;
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkIsMobile = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    };

    checkIsMobile();
    window.addEventListener("resize", checkIsMobile);

    return () => window.removeEventListener("resize", checkIsMobile);
  }, []);

  return (
    <div
      className="openspace-time-grid grid min-w-[600px] md:min-w-[800px]"
      style={{
        gridTemplateColumns: `${isMobile ? "100px" : "120px"} repeat(${rooms.length}, 1fr)`,
      }}
    >
      {/* Header Row */}
      <div className="flex h-16 items-center justify-center border-b border-zinc-600 bg-zinc-800 md:h-20">
        <span className="text-xs font-medium text-zinc-200 md:text-base">Horarios</span>
      </div>

      {displayRooms.map((room, index) => {
        const originalIndex = rooms.indexOf(room);
        const isBeingDragged =
          dragState.columnDrag.isDragging && dragState.columnDrag.draggedRoomIndex === originalIndex;
        const isHoveredTarget = dragState.columnDrag.hoveredIndex === index && dragState.columnDrag.isDragging;

        return (
          <RoomHeader
            key={`${room}-${index}`}
            room={room}
            index={originalIndex}
            isBeingDragged={isBeingDragged}
            isHoveredTarget={isHoveredTarget}
            onMouseDown={onRoomMouseDown}
          />
        );
      })}

      {/* Time Slots and Cells */}
      {timeSlots.map((timeSlot, timeIndex) => (
        <React.Fragment key={`timeslot-${timeIndex}`}>
          <TimeSlotLabel
            key={`time-${timeSlot}`}
            timeSlot={timeSlot}
            isEditing={editingTimeIndex === timeIndex}
            editValue={editingTimeValue}
            isHighlighted={schedulesData[timeIndex]?.highlightInKiosk || false}
            onDoubleClick={() => onTimeDoubleClick(timeIndex)}
            onEditChange={onTimeEditChange}
            onEditKeyDown={onTimeEdit}
            onEditBlur={onTimeEditBlur}
            onSave={onTimeEditSave}
            onDelete={onTimeDelete ? () => onTimeDelete(timeIndex) : undefined}
            onToggleHighlight={onToggleScheduleHighlight ? () => onToggleScheduleHighlight(timeIndex) : undefined}
          />

          {rooms.map((room) => {
            const cellNotes = getNotesForCell(room, timeSlot);
            const isHovered =
              dragState.isDragging &&
              dragState.hoveredCell?.room === room &&
              dragState.hoveredCell?.timeSlot === timeSlot;

            const isEmptyAndHovered =
              cellNotes.length === 0 && hoveredEmptyCell?.room === room && hoveredEmptyCell?.timeSlot === timeSlot;

            const isRowHighlighted = schedulesData[timeIndex]?.highlightInKiosk || false;

            return (
              <div
                key={`${room}-${timeSlot}`}
                data-cell={`${room}-${timeSlot}`}
                className={`openspace-drop-zone relative h-28 border-b border-l p-2 transition-colors duration-200 md:h-32 md:p-3 ${
                  isRowHighlighted
                    ? "border-yellow-500/30 border-zinc-600 bg-yellow-500/10"
                    : "border-zinc-600 bg-zinc-900"
                } ${isHovered ? "hover" : ""}`}
                onMouseEnter={() => onEmptyCellMouseEnter(room, timeSlot)}
                onMouseLeave={onEmptyCellMouseLeave}
                onClick={() => cellNotes.length === 0 && onEmptyCellClick(room, timeSlot)}
              >
                <EmptyCell isHovered={isEmptyAndHovered} onClick={() => onEmptyCellClick(room, timeSlot)} />

                {cellNotes.map((note) => {
                  const isDragged = dragState.draggedNote?.id === note.id;
                  const isSwapTarget = dragState.swapPreview.targetNote?.id === note.id;
                  const isHighlighted = highlightedNoteId === note.id;

                  return (
                    <StickyNoteCard
                      key={note.id}
                      note={note}
                      isDragged={isDragged}
                      isSwapTarget={isSwapTarget}
                      isHighlighted={isHighlighted}
                      noteColors={noteColors}
                      onMouseDown={(e) => onCardMouseDown(e, note)}
                      onDirectClick={onCardDirectClick}
                      onCast={onCardCast}
                      style={getCardStyle(note, isDragged, isSwapTarget)}
                      className={getCardClasses(note)}
                    />
                  );
                })}
              </div>
            );
          })}
        </React.Fragment>
      ))}
    </div>
  );
}
