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
  onDoubleClick: () => void;
  onToggleHighlight?: () => void;
}

export function TimeSlotLabel({
  timeSlot,
  isHighlighted = false,
  onDoubleClick,
  onToggleHighlight,
}: TimeSlotLabelProps) {
  const [start, end] = timeSlot.split(" - ");

  return (
    <div
      className="group/time sticky left-0 z-10 flex h-28 cursor-pointer flex-col items-center justify-center border-b border-r border-border/60 bg-card px-1 md:h-32"
      title="Doble click para editar el horario"
      onDoubleClick={onDoubleClick}
    >
      {/* Star tint as an overlay so the sticky background stays opaque. */}
      {isHighlighted && <div aria-hidden className="pointer-events-none absolute inset-0 bg-primary/[0.08]" />}

      <span className="relative font-terminal text-xs font-medium tabular-nums text-foreground md:text-sm">
        {start}
      </span>
      {end && (
        <span className="relative font-terminal text-[10px] tabular-nums text-muted-foreground md:text-xs">{end}</span>
      )}

      {onToggleHighlight && (
        <Button
          className={cn(
            "absolute right-0.5 top-0.5 h-6 w-6 transition-opacity",
            isHighlighted
              ? "text-primary opacity-100 hover:text-primary"
              : "text-muted-foreground opacity-0 focus-visible:opacity-100 group-hover/time:opacity-100"
          )}
          size="icon"
          title={isHighlighted ? "Quitar del kiosco" : "Resaltar en el kiosco"}
          variant="ghost"
          onClick={(e) => {
            e.stopPropagation();
            onToggleHighlight();
          }}
        >
          <Star className={cn("h-3.5 w-3.5", isHighlighted && "fill-current")} />
        </Button>
      )}
    </div>
  );
}
