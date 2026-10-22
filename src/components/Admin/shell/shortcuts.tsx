"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "components/shared/ui/dialog";
import { Kbd } from "components/shared/ui/kbd";

/**
 * One keyboard map for the admin. Shortcuts ignore typing (inputs, textareas, contentEditable),
 * respect a handler that already took the key (`defaultPrevented`), and run the highest
 * priority match. Sequences ("g a") wait 800 ms for their second key. Everything registered
 * shows up in the `?` sheet, so the map documents itself.
 */
export type Shortcut = {
  id: string;
  /** "mod+k", "?", "g a", "shift+p", "enter", "space". `mod` is ⌘ on a Mac and Ctrl elsewhere. */
  keys: string;
  label: string;
  group: string;
  run: (event: KeyboardEvent) => void;
  /** Higher wins when two shortcuts share keys (a page over the shell). */
  priority?: number;
  /** Fire even while typing in a field (only for chords with mod). */
  allowInInputs?: boolean;
  /** Listed in the sheet but handled elsewhere (e.g. the scenes desk's own hotkeys). */
  displayOnly?: boolean;
};

const registry = new Map<string, Shortcut>();
const listeners = new Set<() => void>();
let version = 0;

function emit() {
  version += 1;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Register shortcuts for as long as the calling component is mounted. */
export function useShortcuts(shortcuts: Shortcut[]) {
  const latest = useRef(shortcuts);
  latest.current = shortcuts;
  const signature = shortcuts.map((shortcut) => `${shortcut.id}:${shortcut.keys}:${shortcut.label}`).join("|");

  useEffect(() => {
    const ids = latest.current.map((shortcut) => shortcut.id);
    for (const shortcut of latest.current) {
      registry.set(shortcut.id, {
        ...shortcut,
        run: (event) => latest.current.find((s) => s.id === shortcut.id)?.run(event),
      });
    }
    emit();
    return () => {
      for (const id of ids) registry.delete(id);
      emit();
    };
  }, [signature]);
}

const isMac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

function isTyping(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT" ||
    target.closest("[cmdk-root]") !== null
  );
}

/** "mod+k" → "meta+k" on a Mac; normalized so modifier order never matters. */
function normalize(combo: string) {
  const parts = combo.toLowerCase().split("+");
  const key = parts.pop() ?? "";
  const mods = parts.map((part) => (part === "mod" ? (isMac() ? "meta" : "ctrl") : part)).sort();
  return [...mods, key].join("+");
}

function comboOf(event: KeyboardEvent) {
  const key = event.key === " " ? "space" : event.key.toLowerCase();
  const mods = [event.altKey && "alt", event.ctrlKey && "ctrl", event.metaKey && "meta"].filter(Boolean) as string[];
  // Shift is part of the character for symbols ("?" is shift+/); keep it only for letters.
  if (event.shiftKey && /^[a-z]$/.test(key)) mods.push("shift");
  return [...mods.sort(), key].join("+");
}

/** The one keydown listener. Mount once, in the shell. */
export function ShortcutListener() {
  useEffect(() => {
    let pending: { first: string; at: number } | null = null;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat) return;
      const typing = isTyping(event.target);
      const combo = comboOf(event);
      const candidates = [...registry.values()].filter((shortcut) => !shortcut.displayOnly);

      // Second key of a sequence ("g" then "a").
      if (pending && Date.now() - pending.at < 800) {
        const sequence = `${pending.first} ${combo}`;
        pending = null;
        const match = candidates
          .filter((shortcut) => shortcut.keys.split(" ").length === 2 && shortcut.keys === sequence)
          .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))[0];
        if (match && !typing) {
          event.preventDefault();
          match.run(event);
          return;
        }
      }

      const single = candidates
        .filter((shortcut) => !shortcut.keys.includes(" ") && normalize(shortcut.keys) === combo)
        .filter((shortcut) => !typing || shortcut.allowInInputs)
        .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))[0];
      if (single) {
        event.preventDefault();
        single.run(event);
        return;
      }

      if (!typing && candidates.some((shortcut) => shortcut.keys.startsWith(`${combo} `))) {
        pending = { first: combo, at: Date.now() };
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return null;
}

const SHEET_EVENT = "owu-admin:shortcut-sheet";

export function openShortcutSheet() {
  window.dispatchEvent(new Event(SHEET_EVENT));
}

/** How a combo reads: "⌘ K", "G A", "⇧ P". */
export function KeyHint({ keys }: { keys: string }) {
  const mac = isMac();
  const label = (part: string) =>
    ({
      mod: mac ? "⌘" : "Ctrl",
      meta: "⌘",
      ctrl: "Ctrl",
      shift: "⇧",
      alt: mac ? "⌥" : "Alt",
      enter: "⏎",
      escape: "esc",
      arrowup: "↑",
      arrowdown: "↓",
      arrowleft: "←",
      arrowright: "→",
      backspace: "⌫",
      space: "espacio",
    })[part] ?? part.toUpperCase();

  return (
    <span className="flex items-center gap-1">
      {keys
        .split(" ")
        .flatMap((step, stepIndex) =>
          step.split("+").map((part, partIndex) => <Kbd key={`${stepIndex}-${partIndex}`}>{label(part)}</Kbd>)
        )}
    </span>
  );
}

/** The `?` sheet: every shortcut registered right now, grouped. */
export function ShortcutSheet() {
  const [open, setOpen] = useState(false);
  useSyncExternalStore(
    subscribe,
    () => version,
    () => 0
  );

  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener(SHEET_EVENT, show);
    return () => window.removeEventListener(SHEET_EVENT, show);
  }, []);

  useShortcuts([
    { id: "shell.shortcuts", keys: "?", label: "Ver los atajos", group: "General", run: () => setOpen(true) },
  ]);

  const groups = new Map<string, Shortcut[]>();
  for (const shortcut of registry.values()) {
    groups.set(shortcut.group, [...(groups.get(shortcut.group) ?? []), shortcut]);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Atajos de teclado</DialogTitle>
          <DialogDescription>
            Los de esta página y los de todo el admin. No se activan mientras escribís.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
          {[...groups.entries()].map(([group, shortcuts]) => (
            <section key={group}>
              <h3 className="mb-1.5 font-terminal text-[10.5px] tracking-[0.14em] text-muted-foreground uppercase">
                {group}
              </h3>
              <ul className="divide-y divide-border">
                {shortcuts.map((shortcut) => (
                  <li key={shortcut.id} className="flex h-8 items-center justify-between gap-3 text-ui">
                    <span className="truncate text-subtle">{shortcut.label}</span>
                    <KeyHint keys={shortcut.keys} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
