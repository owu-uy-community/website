import type { Position, CellCoordinates } from "../types";
import {
  MOBILE_BREAKPOINT,
  MOBILE_TIME_COLUMN_WIDTH,
  DESKTOP_TIME_COLUMN_WIDTH,
  MOBILE_CELL_HEIGHT,
  DESKTOP_CELL_HEIGHT,
  MOBILE_HEADER_HEIGHT,
  DESKTOP_HEADER_HEIGHT,
  CLICK_THRESHOLD_PX,
} from "./constants";

import type { StickyNote } from "../../../../lib/orpc";

interface LayoutCache {
  isMobile: boolean;
  timeColumnWidth: number;
  cellWidth: number;
  cellHeight: number;
}

/**
 * Calculate if the current viewport is mobile
 */
export const getIsMobile = (): boolean => {
  if (typeof window === "undefined") return false;
  return window.innerWidth < MOBILE_BREAKPOINT;
};

/**
 * Create initial layout cache
 */
export const createLayoutCache = (): LayoutCache => {
  const isMobile = getIsMobile();
  return {
    isMobile,
    timeColumnWidth: isMobile ? MOBILE_TIME_COLUMN_WIDTH : DESKTOP_TIME_COLUMN_WIDTH,
    cellWidth: 0, // Will be calculated dynamically
    cellHeight: isMobile ? MOBILE_CELL_HEIGHT : DESKTOP_CELL_HEIGHT,
  };
};

/**
 * Determine if a mouse movement is a click or drag
 */
export const isClick = (start: Position, end: Position): boolean => {
  const distance = Math.sqrt(Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2));
  return distance < CLICK_THRESHOLD_PX;
};

/**
 * Calculate cell coordinates from mouse position
 */
export const getCellFromPosition = (
  mousePos: Position,
  boardRect: DOMRect,
  layoutCache: LayoutCache,
  rooms: string[],
  timeSlots: string[]
): CellCoordinates | null => {
  const x = mousePos.x - boardRect.left;
  const y = mousePos.y - boardRect.top;

  const headerHeight = layoutCache.isMobile ? MOBILE_HEADER_HEIGHT : DESKTOP_HEADER_HEIGHT;
  const cellWidth = (boardRect.width - layoutCache.timeColumnWidth) / rooms.length;

  const roomIndex = Math.floor((x - layoutCache.timeColumnWidth) / cellWidth);
  const timeIndex = Math.floor((y - headerHeight) / layoutCache.cellHeight);

  if (roomIndex >= 0 && roomIndex < rooms.length && timeIndex >= 0 && timeIndex < timeSlots.length) {
    return {
      room: rooms[roomIndex],
      timeSlot: timeSlots[timeIndex],
    };
  }

  return null;
};

/**
 * Calculate base rotation for a note based on its ID
 */
export const calculateBaseRotation = (noteId: string): number => {
  return ((Number.parseInt(noteId) % 5) - 2) * 1;
};

/**
 * Generate unique cell key for caching
 */
export const getCellKey = (room: string, timeSlot: string): string => {
  return `${room}-${timeSlot}`;
};

/**
 * Calculate transform for card animation
 */
export const calculateCardTransform = (
  note: StickyNote,
  isDragged: boolean,
  isSwapTarget: boolean,
  draggedNote: StickyNote | null,
  hoveredCell: CellCoordinates | null,
  getCachedElement: (key: string) => Element | null
): string => {
  const baseRotation = calculateBaseRotation(note.id);

  if (isDragged) {
    if (hoveredCell) {
      const targetCellKey = getCellKey(hoveredCell.room, hoveredCell.timeSlot);
      const currentCellKey = getCellKey(note.room, note.timeSlot);

      const targetCell = getCachedElement(targetCellKey);
      const currentCell = getCachedElement(currentCellKey);

      if (targetCell && currentCell) {
        const targetRect = targetCell.getBoundingClientRect();
        const currentRect = currentCell.getBoundingClientRect();
        const deltaX = targetRect.left - currentRect.left;
        const deltaY = targetRect.top - currentRect.top;

        // Enhanced dragged card preview - show it clearly moving to target position
        return `translate(${deltaX}px, ${deltaY}px) rotate(${baseRotation * 1.5}deg) translateY(-4px) scale(0.95)`;
      }
    }
    return `rotate(${baseRotation * 2}deg) translateY(-2px)`;
  } else if (isSwapTarget && draggedNote) {
    const sourceCellKey = getCellKey(draggedNote.room, draggedNote.timeSlot);
    const currentCellKey = getCellKey(note.room, note.timeSlot);

    const sourceCell = getCachedElement(sourceCellKey);
    const currentCell = getCachedElement(currentCellKey);

    if (sourceCell && currentCell) {
      const sourceRect = sourceCell.getBoundingClientRect();
      const currentRect = currentCell.getBoundingClientRect();
      const deltaX = sourceRect.left - currentRect.left;
      const deltaY = sourceRect.top - currentRect.top;

      // Enhanced swap target animation - more prominent movement and effects
      return `translate(${deltaX}px, ${deltaY}px) rotate(${baseRotation * 2}deg) translateY(-6px) scale(1.05)`;
    }
    return `rotate(${baseRotation * 2}deg) translateY(-6px) scale(1.05)`;
  }

  return `rotate(${baseRotation}deg)`;
};

/**
 * Find existing note in a cell
 */
export const findNoteInCell = (
  notes: StickyNote[],
  room: string,
  timeSlot: string,
  excludeId?: string
): StickyNote | null => {
  for (const note of notes) {
    if (note.room === room && note.timeSlot === timeSlot && note.id !== excludeId) {
      return note;
    }
  }
  return null;
};

/**
 * Filter notes based on search term
 */
export const filterNotes = (notes: StickyNote[], searchTerm: string): StickyNote[] => {
  if (!searchTerm) return notes;

  const lowerSearchTerm = searchTerm.toLowerCase();
  return notes.filter(
    (note) =>
      note.title.toLowerCase().includes(lowerSearchTerm) || note.speaker?.toLowerCase().includes(lowerSearchTerm)
  );
};
