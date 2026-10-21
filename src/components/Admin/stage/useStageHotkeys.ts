"use client";

import { useEffect, useRef, type MouseEvent } from "react";

export const SHORTCUTS: [string, string][] = [
  ["Espacio / ↵", "TAKE: la preview sale al aire, con el barrido"],
  ["⌫", "CUT: la preview sale al aire de golpe"],
  ["/", "Buscar una escena"],
  ["Q", "Mandar la preview a la cola"],
  ["1 – 9", "Favorito n a la preview"],
  ["⇧ + 1 – 9", "Favorito n al aire ya"],
  ["G", "Guion: reproducir o pausar"],
  ["← / →", "Guion: paso anterior / siguiente"],
  ["⌘B", "Mostrar u ocultar el menú lateral"],
  ["?", "Esta ayuda"],
];

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
  help: () => void;
};

/** The desk's keyboard. Bound once; always calls the latest handlers. */
export function useStageHotkeys(handlers: Handlers) {
  const latest = useRef(handlers);
  latest.current = handlers;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.ctrlKey || event.metaKey || event.altKey || busy(target)) return;
      const run = latest.current;
      const key = event.key;

      if (key === "?") {
        event.preventDefault();
        run.help();

        return;
      }
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
