"use client";

import * as React from "react";
import { useMemo, useState } from "react";

import { Card } from "components/shared/ui/card";
import { Button } from "components/shared/ui/button";
import { DogEar } from "../atoms/DogEar";
import { Tv } from "lucide-react";

import type { StickyNote } from "../../../../lib/orpc";

interface StickyNoteCardProps {
  note: StickyNote;
  isDragged: boolean;
  isSwapTarget: boolean;
  isHighlighted?: boolean;
  noteColors: Record<string, string>;
  onMouseDown: (e: React.MouseEvent | React.TouchEvent) => void;
  onDirectClick?: (note: StickyNote) => void;
  onCast?: (note: StickyNote) => void;
  style?: React.CSSProperties;
  className?: string;
}

const StickyNoteCardComponent = ({
  note,
  isDragged,
  isSwapTarget,
  isHighlighted = false,
  noteColors,
  onMouseDown,
  onDirectClick,
  onCast,
  style,
  className,
}: StickyNoteCardProps) => {
  const [isHovering, setIsHovering] = useState(false);
  // Memoize the class names computation to avoid string concatenation on every render
  const cardClassName = useMemo(() => {
    const baseClasses = "openspace-sticky-note absolute cursor-move border-2 text-white";

    // Use consistent transitions to prevent flickering
    const transitionClasses = "transition-all duration-200 ease-out"; // Consistent timing for all states

    const stateClasses = isDragged
      ? "dragging opacity-30 shadow-lg" // Higher opacity to reduce flicker on release
      : isSwapTarget
        ? "opacity-80 shadow-2xl z-20 ring-2 ring-white/30" // More prominent swap target styling
        : isHighlighted
          ? "ring-4 ring-yellow-400 shadow-2xl z-30 animate-pulse" // Highlighted state for cast notes
          : "hover:shadow-xl z-10";

    return `${baseClasses} ${transitionClasses} ${stateClasses} ${className || ""}`;
  }, [isDragged, isSwapTarget, isHighlighted, className]);

  // Handle clicks for recently moved cards
  const handleClick = useMemo(
    () => (e: React.MouseEvent) => {
      const cardElement = e.currentTarget as HTMLElement;
      if (cardElement.getAttribute("data-recently-moved") === "true" && onDirectClick) {
        e.preventDefault();
        e.stopPropagation();
        onDirectClick(note);
      }
    },
    [note, onDirectClick]
  );

  const handleCastClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (onCast) {
      onCast(note);
    }
  };

  const handleCastMouseDown = (e: React.MouseEvent) => {
    // Prevent the card's onMouseDown from triggering drag
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <Card
      className={cardClassName}
      onMouseDown={onMouseDown}
      onTouchStart={onMouseDown}
      onClick={handleClick}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      style={style}
      data-note-id={note.id}
    >
      <div className="relative flex h-full flex-col items-center justify-center p-2 text-center md:p-3">
        <DogEar />

        {/* Cast Button - Shows on hover */}
        {onCast && isHovering && !isDragged && (
          <div
            className="absolute right-1 top-1 z-[100]"
            onMouseDown={handleCastMouseDown}
            onMouseEnter={(e) => e.stopPropagation()}
          >
            <Button
              size="sm"
              variant={isHighlighted ? "destructive" : "secondary"}
              className={`h-8 w-8 p-0 opacity-90 hover:opacity-100 ${isHighlighted ? "animate-pulse" : ""}`}
              onClick={handleCastClick}
              onMouseDown={handleCastMouseDown}
              title={isHighlighted ? "Clear from screen (LIVE)" : "Cast to screen"}
            >
              <Tv className="h-5 w-5" />
            </Button>
          </div>
        )}

        <div className="relative z-10 w-full space-y-0.5">
          <h3 className="hyphens-auto break-words text-xs font-bold leading-tight md:text-sm">{note.title}</h3>
          {note.speaker && (
            <p className="text-[10px] font-medium leading-tight opacity-90 md:text-xs">{note.speaker}</p>
          )}
        </div>
      </div>
    </Card>
  );
};

// Memoize the component to prevent unnecessary re-renders when props haven't changed
export const StickyNoteCard = React.memo(StickyNoteCardComponent, (prevProps, nextProps) => {
  // Custom comparison function to avoid re-renders for style objects that have the same values
  return (
    prevProps.note.id === nextProps.note.id &&
    prevProps.note.title === nextProps.note.title &&
    prevProps.note.speaker === nextProps.note.speaker &&
    prevProps.note.room === nextProps.note.room &&
    prevProps.isDragged === nextProps.isDragged &&
    prevProps.isSwapTarget === nextProps.isSwapTarget &&
    prevProps.isHighlighted === nextProps.isHighlighted &&
    prevProps.className === nextProps.className &&
    prevProps.onDirectClick === nextProps.onDirectClick &&
    prevProps.onCast === nextProps.onCast &&
    JSON.stringify(prevProps.style) === JSON.stringify(nextProps.style)
  );
});

StickyNoteCard.displayName = "StickyNoteCard";
