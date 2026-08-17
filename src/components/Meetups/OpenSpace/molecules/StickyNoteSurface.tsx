"use client";

import * as React from "react";

import { cn } from "app/lib/utils";
import { stickyNoteRotation, stickyNoteStyle } from "../../../../lib/rooms/palette";
import { DogEar } from "../atoms/DogEar";

interface StickyNoteSurfaceProps {
  noteId: string;
  title: string;
  speaker?: string | null;
  /** Resolved room color (explicit or palette fallback). */
  color: string;
  className?: string;
  /** Merged last so callers can override e.g. boxShadow. */
  style?: React.CSSProperties;
  /** Overlays (badges, buttons) rendered above the dog-ear. */
  children?: React.ReactNode;
}

/**
 * THE post-it. Single source of the sticky-note look — gradient by room
 * color, 2px darkened border, asymmetric radius, deterministic tilt and
 * dog-ear — shared verbatim by the admin board, the drag ghost and the
 * kiosk wall so they can never drift apart.
 */
export function StickyNoteSurface({
  noteId,
  title,
  speaker,
  color,
  className,
  style,
  children,
}: StickyNoteSurfaceProps) {
  const surface = stickyNoteStyle(color);
  const rotation = stickyNoteRotation(noteId);

  return (
    <div
      className={cn(
        "relative flex h-full flex-col items-center justify-center border-2 p-2 text-center text-white md:p-3",
        className
      )}
      style={{ ...surface, transform: `rotate(${rotation}deg)`, ...style }}
    >
      <DogEar />

      {children}

      <div className="relative z-10 w-full space-y-0.5">
        <h3 className="line-clamp-3 hyphens-auto break-words text-xs font-semibold leading-snug md:text-sm">{title}</h3>
        {speaker && (
          <p className="line-clamp-1 text-[10px] font-medium leading-tight opacity-80 md:text-xs">{speaker}</p>
        )}
      </div>
    </div>
  );
}
