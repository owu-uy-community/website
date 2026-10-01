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
  onEdit: () => void;
  onToggleHighlight?: () => void;
}

export function TimeSlotLabel({ timeSlot, isHighlighted = false, onEdit, onToggleHighlight }: TimeSlotLabelProps) {
  const [start, end] = timeSlot.split(" - ");

  return (
    <div className="group/time border-border/60 bg-card sticky left-0 z-10 h-32 border-r border-b">
      {/* Star tint as an overlay so the sticky background stays opaque. */}
      {isHighlighted && <div aria-hidden className="bg-primary/[0.08] pointer-events-none absolute inset-0" />}

      <button
        aria-label={`Editar horario ${timeSlot}`}
        className="hover:bg-muted/40 flex h-full w-full flex-col items-center justify-center px-1 pt-6 transition-colors md:pt-0"
        type="button"
        onClick={onEdit}
      >
        <span className="font-terminal text-foreground relative text-xs font-medium tabular-nums md:text-sm">
          {start}
        </span>
        {end && (
          <span className="font-terminal text-muted-foreground relative text-[10px] tabular-nums md:text-xs">
            {end}
          </span>
        )}
      </button>

      {onToggleHighlight && (
        <Button
          className={cn(
            "absolute top-0.5 right-0.5 h-8 w-8 transition-opacity md:h-6 md:w-6",
            isHighlighted
              ? "text-primary hover:text-primary opacity-100"
              : "text-muted-foreground opacity-100 group-hover/time:opacity-100 focus-visible:opacity-100 md:opacity-0"
          )}
          size="icon"
          aria-label={isHighlighted ? "Quitar del kiosco" : "Resaltar en el kiosco"}
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
