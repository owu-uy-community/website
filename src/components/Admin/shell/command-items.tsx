"use client";

import type { ReactNode } from "react";
import { Command as CommandPrimitive } from "cmdk";
import { ExternalLink } from "lucide-react";

import { cn } from "app/lib/utils";

import type { CommandEntry } from "./commands";
import { KeyHint } from "./shortcuts";

/* The palette's rows, groups and matching, shared by the admin's ⌘K and the organizer panel's. */

/** The id travels after this mark: it keeps values unique but never takes part in the match. */
export const ID_MARK = "\u241f";

const fold = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

/**
 * Every word typed has to appear (accents and case ignored); titles that start with the
 * search rank first. Predictable where a fuzzy match would find "lob" in "Kubernetes".
 */
export function matchEntry(value: string, search: string, keywords?: string[]) {
  const text = fold(`${value.split(ID_MARK)[0]} ${(keywords ?? []).join(" ")}`);
  const words = fold(search).split(/\s+/).filter(Boolean);
  if (!words.every((word) => text.includes(word))) return 0;
  return text.startsWith(words[0] ?? "") ? 1 : 0.5;
}

export function CommandRow({
  entry,
  onRun,
}: {
  entry: CommandEntry;
  onRun: (entry: CommandEntry, newTab: boolean) => void;
}) {
  const Icon = entry.icon;

  return (
    <CommandPrimitive.Item
      className="group relative flex h-9 cursor-default items-center gap-3 rounded-lg px-2.5 text-ui outline-hidden select-none data-[disabled=true]:opacity-50 data-[selected=true]:bg-raised data-[selected=true]:shadow-[inset_0_0_0_1px_hsl(var(--input))] pointer-coarse:h-11"
      keywords={entry.keywords}
      value={`${entry.title} ${entry.subtitle ?? ""}${ID_MARK}${entry.id}`}
      onSelect={() => onRun(entry, false)}
    >
      <span className="flex size-6 shrink-0 items-center justify-center rounded-[6px] bg-background ring-1 ring-border group-data-[selected=true]:bg-primary group-data-[selected=true]:ring-primary">
        <Icon
          aria-hidden
          className={cn("size-3.5", entry.tone ?? "text-subtle", "group-data-[selected=true]:text-primary-foreground")}
        />
      </span>
      <span className="truncate text-foreground">{entry.title}</span>
      {entry.subtitle ? <span className="truncate text-meta text-muted-foreground">{entry.subtitle}</span> : null}
      <span className="ml-auto flex shrink-0 items-center gap-2">
        {entry.hint ? <span className="text-meta text-faint">{entry.hint}</span> : null}
        {entry.shortcut ? <KeyHint keys={entry.shortcut} /> : null}
        {entry.perform.type === "push" ? <span className="text-faint">…</span> : null}
        {entry.perform.type === "external" ? <ExternalLink aria-hidden className="size-3.5 text-faint" /> : null}
      </span>
    </CommandPrimitive.Item>
  );
}

export function CommandGroup({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <CommandPrimitive.Group
      className="px-1.5 pt-2.5 [&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:font-terminal [&_[cmdk-group-heading]]:text-[10.5px] [&_[cmdk-group-heading]]:tracking-[0.14em] [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:uppercase"
      heading={heading}
    >
      {children}
    </CommandPrimitive.Group>
  );
}
