"use client";

import * as React from "react";

import { cn } from "app/lib/utils";
import { roomIconFor } from "../../../../lib/rooms/icons";

interface RoomHeaderProps {
  room: string;
  /** Resolved room color (explicit or palette fallback). */
  color?: string;
  /** Picked shape key from ROOM_ICONS; null/unset renders no icon. */
  icon?: string | null;
  /** Opens the room editor; without it the header is plain text. */
  onEdit?: () => void;
}

export function RoomHeader({ room, color, icon, onEdit }: RoomHeaderProps) {
  const Shape = roomIconFor(icon);

  const content = (
    <>
      {Shape ? <Shape aria-hidden className="h-3.5 w-3.5 shrink-0" style={{ color: color, fill: color }} /> : null}
      <span className="truncate font-display text-xs font-semibold uppercase tracking-wide text-foreground md:text-sm">
        {room}
      </span>
    </>
  );

  const className =
    "sticky top-0 z-20 flex h-14 w-full items-center justify-center gap-2 border-b border-r border-border/60 bg-card px-2";

  if (!onEdit) return <div className={className}>{content}</div>;

  return (
    <button
      className={cn(className, "transition-colors hover:bg-muted/60")}
      title={`Editar "${room}"`}
      type="button"
      onClick={onEdit}
    >
      {content}
    </button>
  );
}
