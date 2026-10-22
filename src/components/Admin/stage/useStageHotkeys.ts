"use client";

import { useEffect, useRef, type MouseEvent } from "react";

import { useShortcuts, type Shortcut } from "components/Admin/shell/shortcuts";

/** The keys the desk handles itself, listed in the admin's `?` sheet (which also has ⌘B and ?). */
const SHORTCUTS: [string, string][] = [
  ["space / enter", "TAKE, con el barrido"],
  ["backspace", "CUT, de golpe"],
  ["/", "Buscar una escena"],
  ["q", "Mandar la preview a la cola"],
  ["1 – 9", "Favorito n a la preview"],
  ["shift+1 – 9", "Favorito n al aire ya"],
  ["g", "Guion: reproducir o pausar"],
  ["arrowleft / arrowright", "Guion: paso anterior / siguiente"],
];
const SHEET: Shortcut[] = SHORTCUTS.map(([keys, label], index) => ({
  id: `escenas.${index}`,
  keys,
  label,
  group: "Escenas",
  run: () => {},
  displayOnly: true,
}));

/** Typing, or inside a dialog or menu: the keys belong to it. */
function busy(el: HTMLElement | null) {
  if (!el || el === document.body) return false;
  const tag = el.tagName;

  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    el.isContentEditable ||
    el.closest("[role=dialog],[role=alertdialog],[role=menu],[role=listbox]") !== null
  );
}

/** A focused control that Space, Enter or the arrows already operate. */
const ownsKeys = (el: HTMLElement | null) =>
  Boolean(
    el?.closest(
      "button,a,[role=button],[role=tab],[role=switch],[role=checkbox],[role=option],[role=menuitem],[role=separator],[role=slider]"
    )
  );

/**
 * After a click or a tap, give the focus back: otherwise the button keeps it
 * and the next Space presses the same button again instead of TAKE. Keyboard
 * activations (detail 0) keep their focus, as they should.
 */
export const releaseFocus = (event: MouseEvent<HTMLElement>) => {
  if (event.detail > 0) event.currentTarget.blur();
};

type Handlers = {
  take: () => void;
  cut: () => void;
  search: () => void;
  queue: () => void;
  favorite: (index: number, air: boolean) => void;
  guionToggle: () => void;
  guionStep: (direction: 1 | -1) => void;
};

/** The desk's keyboard. Bound once; always calls the latest handlers. `?` is the admin's own. */
export function useStageHotkeys(handlers: Handlers) {
  const latest = useRef(handlers);
  latest.current = handlers;
  useShortcuts(SHEET);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.ctrlKey || event.metaKey || event.altKey || busy(target)) return;
      const run = latest.current;
      const key = event.key;

      // Holding a key must never fire twice (a second TAKE would send the next scene).
      if (event.repeat) return;
      if (key === " " || key === "Enter") {
        if (ownsKeys(target)) return;
        event.preventDefault();
        run.take();

        return;
      }
      if (key === "Backspace") {
        if (ownsKeys(target)) return;
        event.preventDefault();
        run.cut();

        return;
      }
      if (key === "/") {
        event.preventDefault();
        run.search();

        return;
      }
      // `code`, not `key`: with Shift the key is "!" on most layouts.
      const digit = /^Digit([1-9])$/.exec(event.code);
      if (digit) {
        event.preventDefault();
        run.favorite(Number(digit[1]) - 1, event.shiftKey);

        return;
      }
      if (key === "ArrowRight" || key === "ArrowLeft") {
        if (ownsKeys(target)) return;
        event.preventDefault();
        run.guionStep(key === "ArrowRight" ? 1 : -1);

        return;
      }
      const letter = key.toLowerCase();
      if (letter === "q") {
        event.preventDefault();
        run.queue();
      }
      if (letter === "g") {
        event.preventDefault();
        run.guionToggle();
      }
    };
    window.addEventListener("keydown", onKey);

    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
