"use client";

import { Fragment } from "react";
import type { LucideIcon } from "lucide-react";

import { cn } from "app/lib/utils";
import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
} from "components/shared/ui/context-menu";
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
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
  air: "[&_svg]:text-red-400",
  preview: "[&_svg]:text-green-400",
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
