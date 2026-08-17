"use client";

import * as React from "react";

import { cn } from "app/lib/utils";
import { roomColorFor } from "../../../../lib/rooms/palette";
import { StickyNoteSurface } from "./StickyNoteSurface";

import type { StickyNote } from "../../../../lib/orpc";

interface StickyNoteCardKioskProps {
  note: StickyNote;
  /** Touched by a remote update moments ago — ring in place. */
  wasJustUpdated?: boolean;
}

/**
 * Read-only post-it for the TV/kiosk wall: exactly the management board's
 * card (shared StickyNoteSurface), minus the interactions.
 */
export const StickyNoteCardKiosk = React.memo(({ note, wasJustUpdated = false }: StickyNoteCardKioskProps) => {
  const color = roomColorFor(note.roomId, note.roomColor);

  return (
    <div className="absolute inset-1.5">
      <StickyNoteSurface
        className={cn("duration-200 animate-in fade-in", wasJustUpdated && "ring-2 ring-primary/70")}
        color={color}
        noteId={note.id}
        speaker={note.speaker}
        title={note.title}
      />
    </div>
  );
});

StickyNoteCardKiosk.displayName = "StickyNoteCardKiosk";
