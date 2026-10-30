import * as React from "react";
import { TriangleAlert } from "lucide-react";

import { cn } from "app/lib/utils";
import { PersonAvatar } from "components/Admin/ui/person";
import { StatusDot } from "components/Admin/ui/status";
import { Badge } from "components/shared/ui/badge";

export type BoardEditor = { name: string; image: string | null };

export const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

/**
 * The calm card of the "Compacta" view (admin only; the kiosk keeps its post-its): a raised
 * surface with the room's colour as a 2px top edge, and only the badges that need a look.
 */
export function CompactNoteSurface({
  title,
  speaker,
  color,
  lacksTV = false,
  lacksWhiteboard = false,
  isCast = false,
  isSelected = false,
  editor = null,
  className,
  style,
  children,
}: {
  title: string;
  speaker?: string | null;
  /** Resolved room colour. */
  color: string;
  /** Needs a TV / a whiteboard its room doesn't have. */
  lacksTV?: boolean;
  lacksWhiteboard?: boolean;
  /** On the sticky-note screen right now. */
  isCast?: boolean;
  isSelected?: boolean;
  /** Another admin has it open. */
  editor?: BoardEditor | null;
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}) {
  const edge = `inset 0 2px 0 ${color}`;

  return (
    <div
      className={cn(
        "relative flex h-full min-w-0 flex-col rounded-lg border bg-raised p-2.5 text-left transition-[border-color,box-shadow] duration-150",
        isSelected ? "border-primary/70" : "border-input hover:border-white/15",
        className
      )}
      style={{ boxShadow: isSelected ? `${edge}, 0 0 0 3px hsl(var(--primary) / 0.14)` : edge, ...style }}
    >
      {children}
      <h3 className="line-clamp-2 text-ui leading-[18px] font-medium break-words text-foreground">{title}</h3>
      {speaker ? <p className="mt-1 truncate text-meta text-muted-foreground">{speaker}</p> : null}

      <div className="mt-auto flex min-w-0 items-center gap-1.5 overflow-hidden pt-1.5">
        {isCast ? (
          <Badge variant="destructive">
            <StatusDot tone="live" />
            En pantalla
          </Badge>
        ) : null}
        {lacksTV ? (
          <Badge title="Necesita TV y la sala no tiene" variant="warning">
            <TriangleAlert aria-hidden />
            Sin TV
          </Badge>
        ) : null}
        {lacksWhiteboard ? (
          <Badge title="Necesita pizarra y la sala no tiene" variant="warning">
            <TriangleAlert aria-hidden />
            Sin pizarra
          </Badge>
        ) : null}
        {editor ? (
          <span
            className="ml-auto flex min-w-0 items-center gap-1 text-2xs text-info-foreground"
            title={`${editor.name} la está editando`}
          >
            <PersonAvatar
              className="ring-1 ring-info-foreground/70"
              image={editor.image}
              name={editor.name}
              size={16}
            />
            <span className="truncate">{firstName(editor.name)}</span>
          </span>
        ) : null}
      </div>

      {editor ? (
        <span aria-hidden className="pointer-events-none absolute inset-0 rounded-lg ring-1 ring-info-foreground/60" />
      ) : null}
    </div>
  );
}
