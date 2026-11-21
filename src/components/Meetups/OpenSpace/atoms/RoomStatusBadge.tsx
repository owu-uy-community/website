import * as React from "react";

import { cn } from "app/lib/utils";
import type { RoomStatus } from "lib/orpc/rooms/schemas";

const LABELS: Record<Exclude<RoomStatus, "open">, string> = { full: "Llena", evacuate: "Evacuar" };

/**
 * A room's host marked it full or to evacuate. Open rooms show nothing: the calm state has no
 * badge. `wall` sizes it for the kiosk TV next to the room's name.
 */
export function RoomStatusBadge({ status, wall = false }: { status: RoomStatus; wall?: boolean }) {
  if (status === "open") return null;
  const evacuate = status === "evacuate";

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center border font-medium whitespace-nowrap",
        wall
          ? "gap-[0.45em] rounded-md px-[0.55em] py-[0.2em] font-terminal text-[clamp(0.7rem,0.95vw,1.5rem)] font-semibold tracking-[0.12em] uppercase"
          : "h-5 gap-1 rounded-sm px-1.5 font-sans text-2xs tracking-normal normal-case",
        evacuate
          ? "border-live/40 bg-live-surface text-live-foreground"
          : "border-warning/30 bg-warning-surface text-warning-foreground"
      )}
    >
      {evacuate ? (
        <span
          aria-hidden
          className={cn(
            "shrink-0 rounded-full bg-live motion-safe:animate-blink-step",
            wall ? "size-[0.5em]" : "size-1.5"
          )}
        />
      ) : null}
      {LABELS[status]}
    </span>
  );
}
