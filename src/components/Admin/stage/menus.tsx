"use client";

import { Fragment, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { MoreHorizontal, type LucideIcon } from "lucide-react";

import { cn } from "app/lib/utils";
import { Button } from "components/shared/ui/button";
import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
} from "components/shared/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "components/shared/ui/dropdown-menu";

/** One action of a scene or a queued step, shown in its ⋯ menu and its long-press menu alike. */
export type MenuAction = {
  label: string;
  icon: LucideIcon;
  onSelect?: () => void;
  /** Opens in a new tab instead. */
  href?: string;
  /** `air` and `preview` colour the icon like the tally; `danger` colours the whole item. */
  tone?: "air" | "preview" | "danger";
  disabled?: boolean;
  /** Draws a separator above it. */
  group?: boolean;
};

/** Thumb-sized rows on touchscreens. */
const ITEM = "pointer-coarse:min-h-11 pointer-coarse:text-base pointer-coarse:[&_svg]:size-5";
const TONE = {
  air: "[&_svg]:text-live-foreground",
  preview: "[&_svg]:text-success-foreground",
  danger: "text-destructive focus:text-destructive [&_svg]:text-destructive",
} as const;

/** An action's content. A link is the item itself (asChild), so it keeps the item's layout. */
function content(action: MenuAction) {
  const Icon = action.icon;

  return action.href ? (
    <a href={action.href} rel="noopener" target="_blank">
      <Icon /> {action.label}
    </a>
  ) : (
    <>
      <Icon /> {action.label}
    </>
  );
}

/** The actions as a ⋯ menu. */
export function ActionsDropdown({ title, actions }: { title?: string; actions: MenuAction[] }) {
  return (
    <DropdownMenuContent align="end" className="w-56 pointer-coarse:w-64">
      {title && <DropdownMenuLabel className="truncate text-xs text-muted-foreground">{title}</DropdownMenuLabel>}
      {actions.map((action) => (
        <Fragment key={action.label}>
          {action.group && <DropdownMenuSeparator />}
          <DropdownMenuItem
            asChild={Boolean(action.href)}
            className={cn(ITEM, action.tone && TONE[action.tone])}
            disabled={action.disabled}
            onSelect={action.onSelect}
          >
            {content(action)}
          </DropdownMenuItem>
        </Fragment>
      ))}
    </DropdownMenuContent>
  );
}

/**
 * The ⋯ button and its menu. The menu itself mounts on the first press: a grid
 * of two hundred cards would otherwise carry two hundred idle menus, and every
 * one of them re-renders with its card.
 */
export function ActionsMenuButton({
  label,
  title,
  actions,
  className,
  onPointerDown,
}: {
  label: string;
  title?: string;
  actions: () => MenuAction[];
  className?: string;
  onPointerDown?: (event: PointerEvent<HTMLButtonElement>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const button = (props: {
    onPointerDown?: (event: PointerEvent<HTMLButtonElement>) => void;
    onKeyDown?: (event: KeyboardEvent<HTMLButtonElement>) => void;
  }) => (
    <Button aria-label={label} className={className} size="icon" variant="ghost" {...props}>
      <MoreHorizontal className="h-4 w-4" />
    </Button>
  );

  if (!mounted)
    // Opens the way the menu's own trigger would: on press (not on click), or Enter/Space/↓.
    return button({
      onPointerDown: (event) => {
        onPointerDown?.(event);
        if (event.button !== 0 || event.ctrlKey) return;
        event.preventDefault();
        setMounted(true);
        setOpen(true);
      },
      onKeyDown: (event) => {
        if (!["Enter", " ", "ArrowDown"].includes(event.key)) return;
        event.preventDefault();
        setMounted(true);
        setOpen(true);
      },
    });

  return (
    <DropdownMenu modal={false} open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>{button({ onPointerDown })}</DropdownMenuTrigger>
      <ActionsDropdown actions={actions()} title={title} />
    </DropdownMenu>
  );
}

/** How long a finger holds still (within LONG_PRESS_SLOP px) before the list's menu opens. */
const LONG_PRESS_MS = 550;
const LONG_PRESS_SLOP = 10;

/**
 * The menu opens under the finger that held, and when that finger lifts the
 * browser may "click" whatever is there — the menu's first item, «Al aire ya».
 * The mouse events that lift produces are dropped; the next touch or key (a
 * deliberate pick) ends the guard at once.
 */
function guardTheLift() {
  const types = ["mousedown", "mouseup", "click"] as const;
  const swallow = (event: Event) => {
    event.stopPropagation();
    event.preventDefault();
  };
  const off = () => {
    for (const type of types) window.removeEventListener(type, swallow, true);
    window.removeEventListener("pointerdown", off, true);
    window.removeEventListener("keydown", off, true);
  };
  for (const type of types) window.addEventListener(type, swallow, true);
  window.addEventListener("pointerdown", off, true);
  window.addEventListener("keydown", off, true);
  window.addEventListener("pointerup", () => setTimeout(off, 400), { capture: true, once: true });
}

/**
 * A long-press that forgives a finger's drift. The menu primitive opens on a
 * hold too, but gives up on the first pixel of movement, and a real finger
 * always moves a little; this one opens the same menu, where the finger is, by
 * sending it the event a right-click would. Scrolling, swiping or lifting
 * early cancels it. Wire its handlers on the element that triggers the menu.
 */
export function useLongPress() {
  const press = useRef<{ x: number; y: number; timer: ReturnType<typeof setTimeout> } | null>(null);
  const cancel = () => {
    if (press.current) clearTimeout(press.current.timer);
    press.current = null;
  };
  useEffect(() => cancel, []);

  return {
    start: (event: PointerEvent<HTMLElement>) => {
      cancel();
      const { clientX: x, clientY: y, target } = event;
      press.current = {
        x,
        y,
        timer: setTimeout(() => {
          press.current = null;
          guardTheLift();
          target.dispatchEvent(
            new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: x, clientY: y })
          );
        }, LONG_PRESS_MS),
      };
    },
    move: (event: PointerEvent<HTMLElement>) => {
      const at = press.current;
      if (at && Math.hypot(event.clientX - at.x, event.clientY - at.y) > LONG_PRESS_SLOP) cancel();
    },
    cancel,
  };
}

/** The same actions on a right-click (desktop) or a long-press (touch). */
export function ActionsContext({ title, actions }: { title?: string; actions: MenuAction[] }) {
  return (
    <ContextMenuContent className="w-56 pointer-coarse:w-64">
      {title && <ContextMenuLabel className="truncate text-xs text-muted-foreground">{title}</ContextMenuLabel>}
      {actions.map((action) => (
        <Fragment key={action.label}>
          {action.group && <ContextMenuSeparator />}
          <ContextMenuItem
            asChild={Boolean(action.href)}
            className={cn(ITEM, action.tone && TONE[action.tone])}
            disabled={action.disabled}
            onSelect={action.onSelect}
          >
            {content(action)}
          </ContextMenuItem>
        </Fragment>
      ))}
    </ContextMenuContent>
  );
}
