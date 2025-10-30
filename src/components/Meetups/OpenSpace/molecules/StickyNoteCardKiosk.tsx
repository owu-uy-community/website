"use client";

import * as React from "react";
import { Card } from "components/shared/ui/card";
import { DogEar } from "../atoms/DogEar";
import { ROOM_STYLES, ROOM_BOX_SHADOWS } from "../utils/constants";

import type { StickyNote } from "../../../../lib/orpc";

interface StickyNoteCardKioskProps {
  note: StickyNote;
  noteColors: Record<string, string>;
}

/**
 * Read-only sticky note card optimized for TV/kiosk display
 * No interactions, larger text, and cleaner appearance
 * Colors now follow room assignment instead of note type
 */
export const StickyNoteCardKiosk = React.memo(({ note, noteColors }: StickyNoteCardKioskProps) => {
  const roomKey = note.room.toLowerCase() as keyof typeof ROOM_STYLES;
  const roomStyle = ROOM_STYLES[roomKey] || ROOM_STYLES.ventana;

  return (
    <Card
      className="relative h-full min-h-[100px] w-full border-2 shadow-lg"
      style={{
        background: roomStyle.background,
        borderColor: roomStyle.borderColor,
        boxShadow: ROOM_BOX_SHADOWS.normal,
      }}
    >
      <div className="relative flex h-full flex-col items-center justify-center p-4 text-center">
        <DogEar />

        <div className="relative z-10 w-full space-y-2">
          {/* Title - Extra large for LED screen readability */}
          <h3 className="line-clamp-3 hyphens-auto break-words text-xl font-bold leading-tight text-gray-800">
            {note.title}
          </h3>

          {/* Speaker - If available */}
          {note.speaker && <p className="line-clamp-2 text-lg font-medium text-gray-800">{note.speaker}</p>}
        </div>
      </div>
    </Card>
  );
});

StickyNoteCardKiosk.displayName = "StickyNoteCardKiosk";
