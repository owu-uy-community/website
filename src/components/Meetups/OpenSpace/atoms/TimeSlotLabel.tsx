"use client";

import * as React from "react";
import { Star } from "lucide-react";

import { cn } from "app/lib/utils";
import { Button } from "components/shared/ui/button";

interface TimeSlotLabelProps {
  /** Display string, e.g. "10:00 - 10:45". */
  timeSlot: string;
  /** Row starred to highlight in the kiosk. */
  isHighlighted?: boolean;
  /** The block on now, on the event's clock. */
  isNow?: boolean;
  onEdit: () => void;
  onToggleHighlight?: () => void;
}

/** The board's time rail: start and end in mono, and "AHORA" under the block that is on. */
export function TimeSlotLabel({
  timeSlot,
  isHighlighted = false,
  isNow = false,
  onEdit,
  onToggleHighlight,
}: TimeSlotLabelProps) {
  const [start, end] = timeSlot.split(" - ");

  return (
    <div className="group/time sticky left-0 z-10 h-32 bg-background">
      {/* Tint and rail as overlays, so the sticky background stays opaque over the cards. */}
      {isNow ? (
        <>
          <div aria-hidden className="pointer-events-none absolute inset-0 bg-primary/[0.06]" />
          <span aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-0.5 bg-primary" />
        </>
      ) : null}

      <button
        aria-label={`Editar horario ${timeSlot}`}
        className="relative flex h-full w-full flex-col items-start px-3 pt-2.5 text-left transition-colors hover:bg-white/[0.03] focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:outline-hidden focus-visible:ring-inset"
        type="button"
        onClick={onEdit}
      >
        <span
          className={cn("font-terminal text-ui font-medium tabular-nums", isNow ? "text-foreground" : "text-subtle")}
        >
          {start}
        </span>
        {end ? <span className="font-terminal text-2xs text-muted-foreground tabular-nums">{end}</span> : null}
        {isNow ? (
          <span className="mt-2 rounded-[5px] bg-primary px-1.5 py-px font-terminal text-3xs font-semibold tracking-[0.12em] text-primary-foreground uppercase">
            Ahora
          </span>
        ) : null}
      </button>

      {/* The kiosk features one block at a time, so the mark lives here, once per row. */}
      {onToggleHighlight && (
        <Button
          className={cn(
            "absolute bottom-1.5 left-2 transition-opacity",
            isHighlighted
              ? "gap-1 px-1.5 text-primary opacity-100 hover:text-primary"
              : "text-muted-foreground opacity-100 group-hover/time:opacity-100 focus-visible:opacity-100 pointer-fine:md:opacity-0"
          )}
          size={isHighlighted ? "xs" : "icon-xs"}
          aria-label={isHighlighted ? "Quitar del kiosco" : "Resaltar en el kiosco"}
          aria-pressed={isHighlighted}
          title={isHighlighted ? "Quitar del kiosco" : "Resaltar en el kiosco"}
          variant="ghost"
          onClick={(e) => {
            e.stopPropagation();
            onToggleHighlight();
          }}
        >
          <Star className={cn(isHighlighted && "fill-current")} />
          {isHighlighted ? "Kiosco" : null}
        </Button>
      )}
    </div>
  );
}
