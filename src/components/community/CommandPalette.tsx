"use client";

import dynamic from "next/dynamic";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

// The dialog (cmdk, its list and the search index) loads the first time someone opens it
const CommandPaletteDialog = dynamic(() => import("./CommandPaletteDialog"));

const PaletteContext = createContext<{ open: () => void }>({ open: () => {} });

/** Opens the palette from anywhere inside the site chrome (navbar button, hero hints) */
export const useCommandPalette = () => useContext(PaletteContext);

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

export function CommandPaletteProvider({ children }: { children: ReactNode }) {
  // null until it first opens: nothing of the dialog is downloaded before that
  const [isOpen, setIsOpen] = useState<boolean | null>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.key === "k" || event.key === "K") && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setIsOpen((current) => !current);
      } else if (event.key === "/" && !isTyping(event.target)) {
        event.preventDefault();
        setIsOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);

    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const context = useMemo(() => ({ open: () => setIsOpen(true) }), []);

  return (
    <PaletteContext.Provider value={context}>
      {children}
      {isOpen === null ? null : <CommandPaletteDialog open={isOpen} onOpenChange={setIsOpen} />}
    </PaletteContext.Provider>
  );
}
