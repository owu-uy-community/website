"use client";

import * as React from "react";
import { Presentation, Tv } from "lucide-react";

import { cn } from "app/lib/utils";
import { Badge } from "components/shared/ui/badge";
import type { Room } from "lib/orpc";
import { roomIconFor } from "../../../../lib/rooms/icons";
import { RoomStatusBadge } from "../atoms/RoomStatusBadge";

interface RoomHeaderProps {
  room: string;
  /** Resolved room color (explicit or palette fallback). */
  color?: string;
  /** Picked shape key from ROOM_ICONS; null/unset renders no icon. */
  icon?: string | null;
  /** What the room has and its status on the day; without it only the name shows. */
  details?: Pick<Room, "capacity" | "hasTV" | "hasWhiteboard" | "status">;
  /** Switched off: hidden on public screens, dimmed here so it can be turned back on. */
  inactive?: boolean;
  /** Opens the room editor; without it the header is plain text. */
  onEdit?: () => void;
}

const has = (details: NonNullable<RoomHeaderProps["details"]>) =>
  [details.hasTV && "TV", details.hasWhiteboard && "pizarra", details.capacity && `${details.capacity} personas`]
    .filter(Boolean)
    .join(", ");

/** A board column's head: colour (or shape), name, its status if it isn't open, and what it has. */
export function RoomHeader({ room, color, icon, details, inactive = false, onEdit }: RoomHeaderProps) {
  const Shape = roomIconFor(icon);

  const content = (
    <>
      {Shape ? (
        <Shape
          aria-hidden
          className={cn("size-3.5 shrink-0", inactive && "opacity-50")}
          style={{ color: color, fill: color }}
        />
      ) : (
        <span
          aria-hidden
          className={cn("size-2 shrink-0 rounded-full", inactive && "opacity-50")}
          style={{ backgroundColor: color }}
        />
      )}
      <span
        className={cn("min-w-0 truncate text-ui font-semibold", inactive ? "text-muted-foreground" : "text-foreground")}
      >
        {room}
      </span>
      {/* Sized like "Llena" and "Evacuar", so a narrow column still has room for the name. */}
      {inactive ? (
        <Badge variant="outline">Inactiva</Badge>
      ) : details ? (
        <RoomStatusBadge status={details.status} />
      ) : null}
      {details ? (
        <span className="ml-auto flex shrink-0 items-center gap-1.5 text-muted-foreground">
          {/* A full, evacuating or switched-off room needs its name and badge more than its kit. */}
          {details.hasTV && details.status === "open" && !inactive ? <Tv aria-hidden className="size-3.5" /> : null}
          {details.hasWhiteboard && details.status === "open" && !inactive ? (
            <Presentation aria-hidden className="size-3.5" />
          ) : null}
          {details.capacity && !inactive ? (
            <span aria-hidden className="font-terminal text-2xs tabular-nums">
              {details.capacity}
            </span>
          ) : null}
          {has(details) ? <span className="sr-only">Tiene {has(details)}</span> : null}
        </span>
      ) : null}
    </>
  );

  const className = "flex h-11 w-full min-w-0 items-center gap-1.5 border-l border-border px-3 text-left";

  if (!onEdit) return <div className={className}>{content}</div>;

  return (
    <button
      className={cn(
        className,
        "transition-colors hover:bg-raised focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:outline-hidden focus-visible:ring-inset"
      )}
      title={inactive ? `Editar "${room}" (inactiva)` : `Editar "${room}"`}
      type="button"
      onClick={onEdit}
    >
      {content}
    </button>
  );
}
