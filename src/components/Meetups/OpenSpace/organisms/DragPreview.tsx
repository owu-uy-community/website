import { Card } from "components/shared/ui/card";
import { DogEar } from "../atoms/DogEar";
import { useMemo, useState, useEffect } from "react";
import { ROOM_STYLES, DRAG_BOX_SHADOW, MOBILE_BREAKPOINT } from "../utils/constants";

import type { StickyNote } from "../../../../lib/orpc";

interface Position {
  x: number;
  y: number;
}

interface DragPreviewProps {
  draggedNote: StickyNote;
  mousePosition: Position;
  dragOffset: Position;
  noteColors: Record<string, string>;
}

export function DragPreview({ draggedNote, mousePosition, dragOffset, noteColors }: DragPreviewProps) {
  // Get the actual dimensions of the dragged card
  const [cardDimensions, setCardDimensions] = useState<{ width: number; height: number }>(() => {
    // Try to get dimensions from the actual card element
    const cardElement = document.querySelector(`[data-note-id="${draggedNote.id}"]`);
    if (cardElement) {
      const rect = cardElement.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    }
    // Fallback to responsive defaults
    const isMobile = typeof window !== "undefined" && window.innerWidth < MOBILE_BREAKPOINT;
    return {
      width: isMobile ? 140 : 180,
      height: isMobile ? 72 : 88,
    };
  });

  // Update dimensions when drag starts if not already set
  useEffect(() => {
    const cardElement = document.querySelector(`[data-note-id="${draggedNote.id}"]`);
    if (cardElement) {
      const rect = cardElement.getBoundingClientRect();
      setCardDimensions({ width: rect.width, height: rect.height });
    }
  }, [draggedNote.id]);

  // Memoize the computed styles
  const dragPreviewStyle = useMemo(() => {
    const roomKey = draggedNote.room.toLowerCase() as keyof typeof ROOM_STYLES;
    const roomStyle = ROOM_STYLES[roomKey] || ROOM_STYLES.ventana;

    return {
      left: mousePosition.x - dragOffset.x,
      top: mousePosition.y - dragOffset.y,
      width: `${cardDimensions.width}px`,
      height: `${cardDimensions.height}px`,
      borderRadius: "12px 16px 8px 20px",
      transform: "rotate(0deg) scale(1.0)", // Remove scaling to maintain original size
      boxShadow: DRAG_BOX_SHADOW,
      background: roomStyle.background,
      border: "3px solid",
      borderColor: roomStyle.borderColor,
    };
  }, [draggedNote.room, mousePosition.x, mousePosition.y, dragOffset.x, dragOffset.y, cardDimensions]);

  // Memoize the class name
  const className = useMemo(
    () => "fixed pointer-events-none z-50 touch-none text-white transition-transform duration-100 ease-out",
    []
  );

  return (
    <Card className={className} style={dragPreviewStyle}>
      <div className="relative flex h-full flex-col items-center justify-center p-2 text-center md:p-3">
        <DogEar />
        <div className="relative z-10 w-full space-y-0.5">
          <h3 className="hyphens-auto break-words text-xs font-bold leading-tight text-white md:text-sm">
            {draggedNote.title}
          </h3>
        </div>
      </div>
    </Card>
  );
}
