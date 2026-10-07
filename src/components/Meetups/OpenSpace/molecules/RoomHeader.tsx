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
  /** Switched off: hidden on public screens, dimmed here so it can be turned back on. */
  inactive?: boolean;
  /** Opens the room editor; without it the header is plain text. */
  onEdit?: () => void;
}

export function RoomHeader({ room, color, icon, inactive = false, onEdit }: RoomHeaderProps) {
  const Shape = roomIconFor(icon);

  const content = (
    <>
      {Shape ? (
        <Shape
          aria-hidden
          className={cn("h-3.5 w-3.5 shrink-0", inactive && "opacity-50")}
          style={{ color: color, fill: color }}
        />
      ) : null}
      <span
        className={cn(
          "truncate font-display text-xs font-semibold tracking-wide uppercase md:text-sm",
          inactive ? "text-muted-foreground" : "text-foreground"
        )}
      >
        {room}
      </span>
      {inactive ? (
        <span className="shrink-0 rounded-full border border-border px-1.5 py-0.5 font-terminal text-[10px] tracking-wider text-muted-foreground uppercase">
          Inactiva
        </span>
      ) : null}
    </>
  );

  const className =
    "sticky top-0 z-20 flex h-14 w-full min-w-0 items-center justify-center gap-2 border-b border-r border-border/60 bg-card px-2";

  if (!onEdit) return <div className={className}>{content}</div>;

  return (
    <button
      className={cn(className, "transition-colors hover:bg-muted/60")}
      title={inactive ? `Editar "${room}" (inactiva)` : `Editar "${room}"`}
      type="button"
      onClick={onEdit}
    >
      {content}
    </button>
  );
}
