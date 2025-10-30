import { useCallback } from "react";
import type { CellCoordinates } from "../types";
import { ROOM_STYLES, ROOM_BOX_SHADOWS } from "../utils/constants";
import { calculateCardTransform } from "../utils/calculations";

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

interface UseCardStylesProps {
  dragState: DragState;
  getCachedElement: (key: string) => Element | null;
}

/**
 * Custom hook for calculating card styles and transforms
 * Cards now follow room colors instead of note type colors
 */
export const useCardStyles = ({ dragState, getCachedElement }: UseCardStylesProps) => {
  const getCardStyle = useCallback(
    (note: StickyNote, isDragged: boolean, isSwapTarget: boolean): React.CSSProperties => {
      const roomKey = note.room.toLowerCase() as keyof typeof ROOM_STYLES;
      const cardStyle = ROOM_STYLES[roomKey] || ROOM_STYLES.ventana;

      return {
        pointerEvents: dragState.isDragging && dragState.draggedNote?.id !== note.id ? "none" : "auto",
        borderRadius: "12px 16px 8px 20px",
        transform: getCardTransform(note, isDragged, isSwapTarget),
        boxShadow: isDragged
          ? ROOM_BOX_SHADOWS.dragged
          : isSwapTarget
            ? ROOM_BOX_SHADOWS.swapTarget[roomKey] || ROOM_BOX_SHADOWS.swapTarget.ventana
            : ROOM_BOX_SHADOWS.normal,
        background: cardStyle.background,
        border: "3px solid",
        borderColor: cardStyle.borderColor,
      };
    },
    [dragState]
  );

  const getCardClasses = useCallback((note: StickyNote): string => {
    return "w-[calc(100%-8px)] h-[calc(100%-8px)] top-1 left-1 touch-none";
  }, []);

  const getCardTransform = useCallback(
    (note: StickyNote, isDragged: boolean, isSwapTarget: boolean): string => {
      return calculateCardTransform(
        note,
        isDragged,
        isSwapTarget,
        dragState.draggedNote,
        dragState.hoveredCell,
        getCachedElement
      );
    },
    [dragState, getCachedElement]
  );

  return {
    getCardStyle,
    getCardClasses,
    getCardTransform,
  };
};
