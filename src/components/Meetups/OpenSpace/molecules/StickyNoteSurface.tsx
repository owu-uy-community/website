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
  /**
   * Wall mode: type sized against the cell instead of fixed at 14px.
   *
   * The board and the wall are the same post-it at wildly different scales — on the UCU screen
   * (3584x960) a card is 672x177, and 14px in it reads as a smudge from the back of the room.
   * `cq` units measure the cell the note sits in, so one rule covers every wall geometry and the
   * laptop preview, and the height term keeps a three-line title from being clipped.
   */
  wall?: boolean;
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
  wall = false,
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
        <h3
          className={cn(
            "line-clamp-3 hyphens-auto break-words font-semibold leading-snug",
            wall ? "text-[clamp(0.75rem,min(19cqh,5cqw),2.5rem)]" : "text-xs md:text-sm"
          )}
        >
          {title}
        </h3>
        {speaker && (
          <p
            className={cn(
              "line-clamp-1 font-medium leading-tight opacity-80",
              wall ? "text-[clamp(0.625rem,min(11cqh,3cqw),1.5rem)]" : "text-[10px] md:text-xs"
            )}
          >
            {speaker}
          </p>
        )}
      </div>
    </div>
  );
}
