"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { cn } from "app/lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "components/shared/ui/dialog";
import { Kbd } from "components/shared/ui/kbd";
import { Switch } from "components/shared/ui/switch";

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

// ---------------------------------------------------------------------------
// "Atajos de una tecla": letters, symbols and sequences like "g c" can be turned off on a device
// (WCAG 2.1.4). Chords with ⌘/Ctrl/Alt keep working: typing never fires them by accident.
// ---------------------------------------------------------------------------
const SINGLE_KEYS = "owu:atajos-una-tecla";
const singleKeyListeners = new Set<() => void>();

function singleKeysOn() {
  try {
    return localStorage.getItem(SINGLE_KEYS) !== "off";
  } catch {
    return true;
  }
}

export function setSingleKeyShortcuts(on: boolean) {
  try {
    if (on) localStorage.removeItem(SINGLE_KEYS);
    else localStorage.setItem(SINGLE_KEYS, "off");
  } catch {
    // No storage (private mode): the switch lasts while the page is open
  }
  for (const listener of singleKeyListeners) listener();
}

/** Whether single-key shortcuts and sequences are on, on this device (on until someone turns them off). */
export function useSingleKeyShortcuts() {
  return useSyncExternalStore(
    (listener) => {
      singleKeyListeners.add(listener);
      window.addEventListener("storage", listener);
      return () => {
        singleKeyListeners.delete(listener);
        window.removeEventListener("storage", listener);
      };
    },
    singleKeysOn,
    () => true
  );
}

/** A letter, digit or symbol without ⌘/Ctrl/Alt ("c", "?", "shift+p"), or a sequence ("g c"). */
export function isSingleKey(keys: string) {
  if (keys.includes(" ")) return true;
  const parts = keys.toLowerCase().split("+");
  const key = parts.pop() ?? "";

  return key.length === 1 && !parts.some((part) => ["mod", "ctrl", "meta", "alt"].includes(part));
}

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
      const singleKeys = singleKeysOn();
      const candidates = [...registry.values()].filter(
        (shortcut) => !shortcut.displayOnly && (singleKeys || !isSingleKey(shortcut.keys))
      );

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

const noop = () => () => {};

/**
 * How a combo reads: "⌘ K", "Ctrl K", "G A", "⇧ P". Hidden on touchscreens, where there's no
 * keyboard to press it on (`className` can bring it back), and, for ⌘/Ctrl/⌥, until the browser
 * says which platform it is: a Mac never flashes "Ctrl" while the page hydrates.
 */
export function KeyHint({ keys, className }: { keys: string; className?: string }) {
  const platform = useSyncExternalStore(
    noop,
    () => (isMac() ? "mac" : "other"),
    () => null
  );
  if (platform === null && /\b(mod|alt)\b/.test(keys)) return null;
  const mac = platform === "mac";
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
    <span className={cn("flex items-center gap-1 pointer-coarse:hidden", className)}>
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
  const singleKeys = useSingleKeyShortcuts();
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
          <DialogDescription>Los de esta página y los generales. No se activan mientras escribís.</DialogDescription>
        </DialogHeader>
        <div className="flex min-h-11 items-center gap-3 rounded-lg border border-border px-3 py-2">
          <span className="min-w-0 flex-1">
            <label className="block text-ui font-medium text-foreground" htmlFor="single-key-shortcuts">
              Atajos de una tecla
            </label>
            <span className="block text-meta text-muted-foreground" id="single-key-shortcuts-hint">
              Letras, símbolos y secuencias como G C. Apagalos si se te disparan sin querer: los que llevan ⌘ o Ctrl
              siguen andando.
            </span>
          </span>
          <Switch
            aria-describedby="single-key-shortcuts-hint"
            checked={singleKeys}
            id="single-key-shortcuts"
            onCheckedChange={setSingleKeyShortcuts}
          />
        </div>
        <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
          {[...groups.entries()].map(([group, shortcuts]) => (
            <section key={group}>
              <h3 className="mb-1.5 font-terminal text-[10.5px] tracking-[0.14em] text-muted-foreground uppercase">
                {group}
              </h3>
              <ul className="divide-y divide-border">
                {shortcuts.map((shortcut) => (
                  <li
                    key={shortcut.id}
                    className={cn(
                      "flex h-8 items-center justify-between gap-3 text-ui",
                      !singleKeys && isSingleKey(shortcut.keys) && "opacity-50"
                    )}
                  >
                    <span className="truncate text-subtle">{shortcut.label}</span>
                    <KeyHint className="pointer-coarse:flex" keys={shortcut.keys} />
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
