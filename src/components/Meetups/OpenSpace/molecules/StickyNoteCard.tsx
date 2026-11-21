"use client";

import * as React from "react";
import { useCallback, useLayoutEffect, useRef } from "react";
import { useDraggable } from "@dnd-kit/core";
import { ArrowLeftRight, Tv } from "lucide-react";

import { cn } from "app/lib/utils";
import { CompactNoteSurface, firstName, type BoardEditor } from "components/Admin/agenda/CompactNoteSurface";
import { PersonAvatar } from "components/Admin/ui/person";
import { Button } from "components/shared/ui/button";
import { roomSwapShadow } from "lib/rooms/palette";
import { DRAG_BOX_SHADOW } from "../utils/constants";
import { StickyNoteSurface } from "./StickyNoteSurface";

import type { StickyNote } from "../../../../lib/orpc";

/** One source of truth: the FLIP effect must restore exactly this value. */
const CARD_TRANSITION = "transform 220ms cubic-bezier(0.22, 1, 0.36, 1)";

/** The kiosk's post-it, or the admin's calm compact card. */
export type BoardVariant = "postit" | "compact";

interface StickyNoteCardProps {
  note: StickyNote;
  variant: BoardVariant;
  /** Resolved room color (explicit or palette fallback). */
  color: string;
  /**
   * In the user's hand: the card hides completely — the DragOverlay ghost is
   * the visible copy — so the grid underneath always previews the end state.
   */
  isActive: boolean;
  /** Right after a drop: stay hidden while the ghost glides into the cell. */
  isSettling: boolean;
  /** Temporarily slid to the drag origin, previewing the swap. */
  isSwapPreview: boolean;
  /** Pixel offset toward the drag origin while previewing a swap. */
  previewOffset: { x: number; y: number } | null;
  /** Currently cast to the sticky-note screen. */
  isCast: boolean;
  /** Open in this screen's inspector. */
  isSelected: boolean;
  /** Another admin has it open right now. */
  editor: BoardEditor | null;
  /** Compact card badges: it needs what its room lacks. */
  lacksTV: boolean;
  lacksWhiteboard: boolean;
  /** Touched by a remote update moments ago — ring in place. */
  wasJustUpdated: boolean;
  /** Timestamp of the last drag end, to swallow the synthetic click. */
  lastDragEndAt: React.MutableRefObject<number>;
  /** Drop-time screen positions: remounts FLIP from here (mid-flight swaps). */
  flipRects?: React.MutableRefObject<Map<string, { left: number; top: number }>>;
  onOpen: (note: StickyNote) => void;
  onCast?: (note: StickyNote) => void;
}

/**
 * Deliberately motion-free: this repo has a documented motion frameloop
 * freeze (see /admin/screen history), so every interaction here is dnd-kit +
 * plain CSS transitions — nothing can strand the board mid-animation.
 */
const StickyNoteCardComponent = ({
  note,
  variant,
  color,
  isActive,
  isSettling,
  isSwapPreview,
  previewOffset,
  isCast,
  isSelected,
  editor,
  lacksTV,
  lacksWhiteboard,
  wasJustUpdated,
  lastDragEndAt,
  flipRects,
  onOpen,
  onCast,
}: StickyNoteCardProps) => {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: note.id,
    data: { note },
    attributes: { roleDescription: "charla movible" },
  });
  const hidden = isActive || isDragging || isSettling;

  const elementRef = useRef<HTMLDivElement | null>(null);
  const setRefs = useCallback(
    (node: HTMLDivElement | null) => {
      elementRef.current = node;
      setNodeRef(node);
    },
    [setNodeRef]
  );

  // FLIP continuation: when a swap partner remounts in its new cell, start
  // from the drop-time position (possibly mid-slide) and let the existing
  // CSS transition carry it the rest of the way — no reversal, no cut.
  useLayoutEffect(() => {
    if (!flipRects) return;
    const from = flipRects.current.get(note.id);
    if (!from) return;
    flipRects.current.delete(note.id);

    const el = elementRef.current;
    if (!el) return;
    const to = el.getBoundingClientRect();
    const dx = from.left - to.left;
    const dy = from.top - to.top;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;

    el.style.transition = "none";
    el.style.transform = `translate(${dx}px, ${dy}px)`;
    void el.getBoundingClientRect(); // commit the start position
    requestAnimationFrame(() => {
      // Restore the React-managed inline value, not "" (which would drop the
      // transition entirely and turn the release into a cut).
      el.style.transition = CARD_TRANSITION;
      el.style.transform = "";
    });
    // Runs only for the freshly-mounted element.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleClick = () => {
    // A drop over the source card fires a click on mouseup; ignore it.
    if (Date.now() - lastDragEndAt.current < 250) return;
    onOpen(note);
  };

  const stopDragActivation = (e: React.SyntheticEvent) => {
    e.stopPropagation();
  };

  const swapBadge = isSwapPreview ? (
    <span className="absolute -top-1.5 -left-1.5 z-20 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md">
      <ArrowLeftRight className="h-3.5 w-3.5" />
    </span>
  ) : null;

  return (
    <div
      ref={setRefs}
      data-note-id={note.id}
      className={cn(
        "group/card absolute inset-1.5 touch-auto rounded-lg select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        hidden ? "pointer-events-none z-[4] opacity-0" : "z-[5]",
        isSwapPreview && "z-[6]"
      )}
      style={{
        transform: previewOffset ? `translate(${previewOffset.x}px, ${previewOffset.y}px)` : undefined,
        transition: CARD_TRANSITION,
      }}
      onClick={handleClick}
      // Space picks the card up (dnd-kit's keyboard sensor); Enter opens it, unless it's in hand.
      onKeyDownCapture={(event) => {
        if (event.key === "Enter" && !isDragging) {
          event.preventDefault();
          onOpen(note);
        }
      }}
      {...attributes}
      {...listeners}
    >
      {/* Outlines, not rings: both surfaces paint their own inline box-shadow, which hides a ring. */}
      {variant === "compact" ? (
        <CompactNoteSurface
          className={cn(
            "duration-200 animate-in fade-in",
            !hidden && "cursor-grab active:cursor-grabbing",
            wasJustUpdated && !isSelected && "outline-2 outline-primary/60"
          )}
          color={color}
          editor={editor}
          isCast={isCast}
          isSelected={isSelected}
          lacksTV={lacksTV}
          lacksWhiteboard={lacksWhiteboard}
          speaker={note.speaker}
          style={isSwapPreview ? { boxShadow: `inset 0 2px 0 ${color}, ${roomSwapShadow(color)}` } : undefined}
          title={note.title}
        >
          {swapBadge}
        </CompactNoteSurface>
      ) : (
        <StickyNoteSurface
          className={cn(
            "duration-200 animate-in fade-in",
            onCast && "pt-8 md:pt-8 pointer-fine:md:pt-3",
            !hidden && "cursor-grab active:cursor-grabbing",
            isCast
              ? "outline-2 outline-offset-2 outline-primary"
              : isSelected
                ? "outline-2 outline-offset-2 outline-foreground/80"
                : editor
                  ? "outline-2 outline-info-foreground/70"
                  : wasJustUpdated && "outline-2 outline-primary/60"
          )}
          color={color}
          noteId={note.id}
          speaker={note.speaker}
          style={isSwapPreview ? { boxShadow: roomSwapShadow(color) } : undefined}
          title={note.title}
        >
          {swapBadge}

          {editor ? (
            <span
              className="absolute bottom-1.5 left-1.5 z-20 flex max-w-[calc(100%-0.75rem)] items-center gap-1 rounded-full bg-background/90 py-0.5 pr-2 pl-0.5 text-2xs text-info-foreground shadow-sm"
              title={`${editor.name} la está editando`}
            >
              <PersonAvatar image={editor.image} name={editor.name} size={16} />
              <span className="truncate">{firstName(editor.name)}</span>
            </span>
          ) : null}

          {onCast && !hidden && (
            <div
              className={cn(
                "absolute top-1 right-1 z-20 transition-opacity",
                isCast
                  ? "opacity-100"
                  : // Revealed on hover only where there is hover: a tablet has no way to find it.
                    "opacity-100 group-hover/card:opacity-100 focus-within:opacity-100 pointer-fine:md:opacity-0"
              )}
              onMouseDown={stopDragActivation}
              onTouchStart={stopDragActivation}
            >
              <Button
                className="h-8 w-8 shadow-md md:h-7 md:w-7"
                aria-label={isCast ? "Quitar de la pantalla (en vivo)" : "Enviar a la pantalla"}
                size="icon"
                title={isCast ? "Quitar de la pantalla (en vivo)" : "Enviar a la pantalla"}
                variant={isCast ? "destructive" : "secondary"}
                onClick={(e) => {
                  e.stopPropagation();
                  onCast(note);
                }}
              >
                <Tv />
              </Button>
            </div>
          )}
        </StickyNoteSurface>
      )}
    </div>
  );
};

export const StickyNoteCard = React.memo(StickyNoteCardComponent);
StickyNoteCard.displayName = "StickyNoteCard";

/** Static clone rendered inside the DragOverlay while dragging. */
export function StickyNoteGhost({ note, color, variant }: { note: StickyNote; color: string; variant: BoardVariant }) {
  if (variant === "compact") {
    return (
      <div className="h-full w-full cursor-grabbing" style={{ transform: "scale(1.03)" }}>
        <CompactNoteSurface
          color={color}
          speaker={note.speaker}
          style={{ boxShadow: `inset 0 2px 0 ${color}, 0 16px 32px -8px rgb(0 0 0 / 0.6)` }}
          title={note.title}
        />
      </div>
    );
  }

  return (
    <div className="h-full w-full cursor-grabbing" style={{ transform: "rotate(-2deg) scale(1.04)" }}>
      <StickyNoteSurface
        className="pt-8 md:pt-8 pointer-fine:md:pt-3"
        color={color}
        noteId={note.id}
        speaker={note.speaker}
        style={{ boxShadow: DRAG_BOX_SHADOW }}
        title={note.title}
      />
    </div>
  );
}
