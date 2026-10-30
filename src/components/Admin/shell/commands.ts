"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import type { LucideIcon } from "lucide-react";

/**
 * What a palette entry does: go somewhere, open a public screen, run something here, or open a
 * scope (a sub-list: "Poner escena al aire…" → the scenes). Pages add their own entries with
 * `useCommands`; they show up while the page is mounted.
 */
export type CommandPerform =
  | { type: "navigate"; href: string }
  | { type: "external"; href: string }
  | { type: "run"; run: () => unknown }
  | { type: "push"; scope: CommandScope };

export type CommandEntry = {
  id: string;
  title: string;
  /** Muted text after the title ("312 / 450 acreditados", the talk's room). */
  subtitle?: string;
  /** Right side: a hint ("guion 16:50") and/or a shortcut ("g a"). */
  hint?: string;
  shortcut?: string;
  icon: LucideIcon;
  /** Tailwind text class for the icon: the entry's tone. */
  tone?: string;
  keywords?: string[];
  perform: CommandPerform;
};

export type CommandScope = {
  id: string;
  label: string;
  placeholder: string;
  /** Entries of the scope; may load (talks, people) when the scope opens. */
  entries: () => CommandEntry[] | Promise<CommandEntry[]>;
};

/** Where a group sits in the palette: suggestions on top, navigation last. */
export type CommandGroupId = "suggested" | "actions" | "page" | "navigate" | "tools";

type Registered = { group: CommandGroupId; heading?: string; entries: CommandEntry[] };

const registry = new Map<string, Registered>();
const listeners = new Set<() => void>();
let version = 0;

const emit = () => {
  version += 1;
  for (const listener of listeners) listener();
};

/** Add entries to the palette while the calling component is mounted. */
export function useCommands(id: string, group: CommandGroupId, entries: CommandEntry[], heading?: string) {
  const latest = useRef(entries);
  latest.current = entries;
  const signature = entries
    .map((entry) => `${entry.id}:${entry.title}:${entry.subtitle ?? ""}:${entry.hint ?? ""}`)
    .join("|");

  useEffect(() => {
    registry.set(id, { group, heading, entries: latest.current });
    emit();
    return () => {
      registry.delete(id);
      emit();
    };
  }, [id, group, heading, signature]);
}

/** Every registered group, re-read when pages add or drop entries. */
export function useRegisteredCommands(): Registered[] {
  useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => version,
    () => 0
  );
  return [...registry.values()];
}
