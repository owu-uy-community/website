import { useState, useCallback, useEffect, useRef } from "react";
import type { Position, CellCoordinates } from "../types";
import { isClick, getCellFromPosition, findNoteInCell, getCellKey } from "../utils/calculations";
import { RECENTLY_MOVED_TIMEOUT } from "../utils/constants";
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

const initialDragState: DragState = {
  isDragging: false,
  draggedNote: null,
  dragOffset: { x: 0, y: 0 },
  mousePosition: { x: 0, y: 0 },
  startPosition: { x: 0, y: 0 },
  hoveredCell: null,
  dragVelocity: { x: 0, y: 0 },
  lastMousePosition: { x: 0, y: 0 },
  dragStartTime: 0,
  swapPreview: {
    targetNote: null,
    isSwapping: false,
  },
  columnDrag: {
    isDragging: false,
    draggedRoomIndex: null,
    startX: 0,
    currentX: 0,
    hoveredIndex: null,
    previewRooms: null,
  },
};

interface LayoutCache {
  isMobile: boolean;
  timeColumnWidth: number;
  cellWidth: number;
  cellHeight: number;
}

interface UseDragAndDropProps {
  notes: StickyNote[];
  rooms: string[];
  timeSlots: string[];
  onNotesChange: (notes: StickyNote[]) => void | Promise<void>;
  onRoomsChange: (rooms: string[]) => void;
  onEditNote: (note: StickyNote) => void;
  boardRectRef: React.RefObject<DOMRect | null>;
  layoutCache: LayoutCache;
  updateBoardRect: (element: HTMLDivElement | null) => void;
  clearElementCache: () => void;
}

/**
 * Custom hook for drag and drop functionality
 */
export const useDragAndDrop = ({
  notes,
  rooms,
  timeSlots,
  onNotesChange,
  onRoomsChange,
  onEditNote,
  boardRectRef,
  layoutCache,
  updateBoardRect,
  clearElementCache,
}: UseDragAndDropProps) => {
  const [dragState, setDragState] = useState<DragState>(initialDragState);

  // Mouse event handlers for card dragging
  const handleCardMouseDown = useCallback((e: React.MouseEvent | React.TouchEvent, note: StickyNote) => {
    e.preventDefault();
    e.stopPropagation();

    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;

    const rect = (e.target as HTMLElement).getBoundingClientRect();

    setDragState({
      isDragging: true,
      draggedNote: note,
      dragOffset: {
        x: clientX - rect.left,
        y: clientY - rect.top,
      },
      mousePosition: { x: clientX, y: clientY },
      startPosition: { x: clientX, y: clientY },
      hoveredCell: null,
      dragVelocity: { x: 0, y: 0 },
      lastMousePosition: { x: clientX, y: clientY },
      dragStartTime: Date.now(),
      swapPreview: {
        targetNote: null,
        isSwapping: false,
      },
      columnDrag: initialDragState.columnDrag,
    });
  }, []);

  const handleCardMouseMove = useCallback(
    (e: React.MouseEvent | React.TouchEvent | MouseEvent | TouchEvent) => {
      if (!dragState.isDragging || !dragState.draggedNote) return;

      e.preventDefault();
      e.stopPropagation();

      const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
      const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;

      let hoveredCell: CellCoordinates | null = null;
      let swapPreview: { targetNote: StickyNote | null; isSwapping: boolean } = { targetNote: null, isSwapping: false };

      if (boardRectRef.current) {
        const mousePos = { x: clientX, y: clientY };
        hoveredCell = getCellFromPosition(mousePos, boardRectRef.current, layoutCache, rooms, timeSlots);

        if (hoveredCell) {
          const existingNote = findNoteInCell(notes, hoveredCell.room, hoveredCell.timeSlot, dragState.draggedNote.id);

          if (existingNote) {
            swapPreview = {
              targetNote: existingNote,
              isSwapping: true,
            };
          }
        }
      }

      const velocity = {
        x: clientX - dragState.lastMousePosition.x,
        y: clientY - dragState.lastMousePosition.y,
      };

      setDragState((prev) => ({
        ...prev,
        mousePosition: { x: clientX, y: clientY },
        lastMousePosition: { x: clientX, y: clientY },
        dragVelocity: velocity,
        hoveredCell,
        swapPreview,
      }));
    },
    [
      dragState.isDragging,
      dragState.draggedNote,
      dragState.lastMousePosition,
      notes,
      rooms,
      timeSlots,
      layoutCache,
      boardRectRef,
    ]
  );

  const handleCardMouseUp = useCallback(
    (e: React.MouseEvent | React.TouchEvent | MouseEvent | TouchEvent) => {
      if (!dragState.isDragging || !dragState.draggedNote) return;

      e.preventDefault();
      e.stopPropagation();

      const clientX = "changedTouches" in e ? e.changedTouches[0].clientX : e.clientX;
      const clientY = "changedTouches" in e ? e.changedTouches[0].clientY : e.clientY;
      const endPosition: Position = { x: clientX, y: clientY };

      if (isClick(dragState.startPosition, endPosition)) {
        // It's a click - find current note data and edit
        const currentNote = notes.find((n) => n.id === dragState.draggedNote?.id);
        if (currentNote) {
          onEditNote(currentNote);
        }
      } else if (dragState.hoveredCell) {
        // Check if the card is being dropped in its original position
        const isOriginalPosition =
          dragState.draggedNote &&
          dragState.hoveredCell.room === dragState.draggedNote.room &&
          dragState.hoveredCell.timeSlot === dragState.draggedNote.timeSlot;

        if (isOriginalPosition) {
          // Card dropped back in original position - animate back without state change
          setDragState((prev) => ({
            ...prev,
            isDragging: false, // Hide drag preview immediately
            hoveredCell: null,
            swapPreview: { targetNote: null, isSwapping: false },
            mousePosition: { x: 0, y: 0 },
          }));

          setTimeout(() => {
            setDragState(initialDragState);
          }, 320); // Allow transition animation to complete
          return;
        }

        // It's a drag to a different position - update notes
        let updatedNote: StickyNote | null = null;

        if (dragState.swapPreview.isSwapping && dragState.swapPreview.targetNote) {
          // Swap notes - let React Query handle the optimistic updates
          onNotesChange(
            notes.map((note) => {
              if (note.id === dragState.draggedNote?.id) {
                const updated = {
                  ...note,
                  room: dragState.hoveredCell!.room,
                  timeSlot: dragState.hoveredCell!.timeSlot,
                };
                updatedNote = updated;
                return updated;
              } else if (note.id === dragState.swapPreview.targetNote?.id) {
                return {
                  ...note,
                  room: dragState.draggedNote!.room,
                  timeSlot: dragState.draggedNote!.timeSlot,
                };
              }
              return note;
            })
          );
        } else {
          // Move note
          onNotesChange(
            notes.map((note) => {
              if (note.id === dragState.draggedNote?.id) {
                const updated = {
                  ...note,
                  room: dragState.hoveredCell!.room,
                  timeSlot: dragState.hoveredCell!.timeSlot,
                };
                updatedNote = updated;
                return updated;
              }
              return note;
            })
          );
        }

        // Use double requestAnimationFrame to ensure DOM updates have settled
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            // This ensures the optimistic update and DOM updates have been applied
            setDragState((prev) => ({
              ...prev,
              isDragging: false,
              hoveredCell: null,
              swapPreview: { targetNote: null, isSwapping: false },
              mousePosition: { x: 0, y: 0 },
            }));

            // Complete reset after CSS transition completes
            setTimeout(() => {
              setDragState(initialDragState);
            }, 200); // Match CSS transition duration-200
          });
        });

        // Mark card as recently moved for easier editing
        if (updatedNote) {
          setTimeout(() => {
            const cardElement = document.querySelector(`[data-note-id="${updatedNote!.id}"]`);
            if (cardElement) {
              cardElement.setAttribute("data-recently-moved", "true");
              setTimeout(() => cardElement.removeAttribute("data-recently-moved"), RECENTLY_MOVED_TIMEOUT);
            }
          }, 100);
        }
      } else {
        // Card was dragged but not dropped in a valid cell - animate back to original position
        // Immediately hide drag preview but keep dragged note for transition
        setDragState((prev) => ({
          ...prev,
          isDragging: false, // Hide drag preview immediately
          hoveredCell: null,
          swapPreview: { targetNote: null, isSwapping: false },
          mousePosition: { x: 0, y: 0 },
        }));

        // Reset the dragged note after transition completes to allow smooth return animation
        setTimeout(() => {
          setDragState(initialDragState);
        }, 320); // Slightly longer than the 300ms transition duration
        return;
      }

      setDragState(initialDragState);
    },
    [dragState, notes, onNotesChange, onEditNote]
  );

  // Room column drag handlers
  const handleRoomMouseDown = useCallback((e: React.MouseEvent, roomIndex: number) => {
    e.preventDefault();
    e.stopPropagation();

    const clientX = e.clientX;

    setDragState((prev) => ({
      ...prev,
      columnDrag: {
        isDragging: true,
        draggedRoomIndex: roomIndex,
        startX: clientX,
        currentX: clientX,
        hoveredIndex: null,
        previewRooms: null,
      },
    }));
  }, []);

  const handleRoomMouseMove = useCallback(
    (e: React.MouseEvent | MouseEvent) => {
      if (!dragState.columnDrag.isDragging || dragState.columnDrag.draggedRoomIndex === null) return;

      e.preventDefault();
      e.stopPropagation();

      const clientX = e.clientX;

      if (boardRectRef.current) {
        const boardRect = boardRectRef.current;
        const cellWidth = (boardRect.width - layoutCache.timeColumnWidth) / rooms.length;
        const relativeX = clientX - boardRect.left - layoutCache.timeColumnWidth;
        const hoveredIndex = Math.floor(relativeX / cellWidth);

        const validHoveredIndex = hoveredIndex >= 0 && hoveredIndex < rooms.length ? hoveredIndex : null;

        let previewRooms = null;
        if (validHoveredIndex !== null && validHoveredIndex !== dragState.columnDrag.draggedRoomIndex) {
          previewRooms = [...rooms];
          const draggedRoom = previewRooms[dragState.columnDrag.draggedRoomIndex];
          previewRooms.splice(dragState.columnDrag.draggedRoomIndex, 1);
          previewRooms.splice(validHoveredIndex, 0, draggedRoom);
        }

        setDragState((prev) => ({
          ...prev,
          columnDrag: {
            ...prev.columnDrag,
            currentX: clientX,
            hoveredIndex: validHoveredIndex,
            previewRooms,
          },
        }));
      }
    },
    [dragState.columnDrag, rooms, layoutCache, boardRectRef]
  );

  const handleRoomMouseUp = useCallback(
    (e: React.MouseEvent | MouseEvent) => {
      if (!dragState.columnDrag.isDragging || dragState.columnDrag.draggedRoomIndex === null) return;

      e.preventDefault();
      e.stopPropagation();

      if (dragState.columnDrag.previewRooms) {
        onRoomsChange(dragState.columnDrag.previewRooms);
      }

      setDragState((prev) => ({
        ...prev,
        columnDrag: initialDragState.columnDrag,
      }));
    },
    [dragState.columnDrag, onRoomsChange]
  );

  // Direct click handler for recently moved cards
  const handleDirectClick = useCallback(
    (note: StickyNote) => {
      const currentNote = notes.find((n) => n.id === note.id) || note;
      onEditNote(currentNote);
    },
    [notes, onEditNote]
  );

  // Global mouse event listeners
  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (dragState.isDragging) {
        handleCardMouseMove(e);
      }
      if (dragState.columnDrag.isDragging) {
        handleRoomMouseMove(e);
      }
    };

    const handleGlobalMouseUp = (e: MouseEvent) => {
      if (dragState.isDragging) {
        handleCardMouseUp(e);
      }
      if (dragState.columnDrag.isDragging) {
        handleRoomMouseUp(e);
      }
    };

    const handleGlobalTouchMove = (e: TouchEvent) => {
      if (dragState.isDragging) {
        handleCardMouseMove(e);
      }
    };

    const handleGlobalTouchEnd = (e: TouchEvent) => {
      if (dragState.isDragging) {
        handleCardMouseUp(e);
      }
    };

    if (dragState.isDragging || dragState.columnDrag.isDragging) {
      updateBoardRect(null); // Update board rect when dragging starts

      document.addEventListener("mousemove", handleGlobalMouseMove);
      document.addEventListener("mouseup", handleGlobalMouseUp);
      document.addEventListener("touchmove", handleGlobalTouchMove, { passive: false });
      document.addEventListener("touchend", handleGlobalTouchEnd);
    } else {
      clearElementCache(); // Clear cache when not dragging
    }

    return () => {
      document.removeEventListener("mousemove", handleGlobalMouseMove);
      document.removeEventListener("mouseup", handleGlobalMouseUp);
      document.removeEventListener("touchmove", handleGlobalTouchMove);
      document.removeEventListener("touchend", handleGlobalTouchEnd);
    };
  }, [
    dragState.isDragging,
    dragState.columnDrag.isDragging,
    handleCardMouseMove,
    handleCardMouseUp,
    handleRoomMouseMove,
    handleRoomMouseUp,
    updateBoardRect,
    clearElementCache,
  ]);

  return {
    dragState,
    handleCardMouseDown,
    handleRoomMouseDown,
    handleDirectClick,
  };
};
