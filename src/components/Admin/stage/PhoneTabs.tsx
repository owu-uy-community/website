"use client";

import { AnimatePresence, motion } from "motion/react";
import { LayoutGrid, ListOrdered, ListVideo, SlidersHorizontal, type LucideIcon } from "lucide-react";

import { cn } from "app/lib/utils";

import { haptic } from "./haptics";

export type PhoneTab = "queue" | "library" | "edit" | "guion";
export const PHONE_TABS: PhoneTab[] = ["queue", "library", "edit", "guion"];

const TABS: [PhoneTab, string, LucideIcon][] = [
  ["queue", "Cola", ListOrdered],
  ["library", "Escenas", LayoutGrid],
  ["edit", "Editar", SlidersHorizontal],
  ["guion", "Guion", ListVideo],
];

/**
 * The phone's bottom bar, like an iOS tab bar: thumb-reachable, above the
 * home indicator (safe area), with the queue's count and a dot where there is
 * something to look at.
 */
export function PhoneTabs({
  tab,
  queued,
  preview,
  guionPlaying,
  onTab,
}: {
  tab: PhoneTab;
  queued: number;
  preview: boolean;
  guionPlaying: boolean;
  onTab: (tab: PhoneTab) => void;
}) {
  const badge: Record<PhoneTab, number | "dot" | null> = {
    queue: queued || null,
    library: null,
    edit: preview ? "dot" : null,
    guion: guionPlaying ? "dot" : null,
  };

  return (
    <nav aria-label="Secciones del desk" className="shrink-0 border-t bg-background pb-[env(safe-area-inset-bottom)]">
      <div className="grid grid-cols-4 px-[env(safe-area-inset-left)]">
        {TABS.map(([id, label, Icon]) => {
          const active = tab === id;
          const mark = badge[id];

          return (
            <button
              key={id}
              aria-current={active ? "page" : undefined}
              aria-label={typeof mark === "number" ? `${label}, ${mark}` : label}
              className={cn(
                "relative flex h-14 touch-manipulation flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors",
                active ? "text-foreground" : "text-muted-foreground"
              )}
              type="button"
              onClick={() => {
                if (!active) haptic(5);
                onTab(id);
              }}
            >
              {active && (
                <motion.span
                  className="absolute inset-x-5 top-0 h-0.5 rounded-full bg-primary"
                  layoutId="phone-tab"
                  transition={{ type: "spring", stiffness: 520, damping: 40 }}
                />
              )}
              <span className="relative">
                <Icon className={cn("h-5 w-5 transition-transform", active && "scale-110 text-primary")} />
                <AnimatePresence>
                  {mark !== null && (
                    <motion.span
                      key={mark === "dot" ? "dot" : "count"}
                      animate={{ scale: 1 }}
                      className={cn(
                        "absolute -top-1.5 -right-2.5 grid place-items-center rounded-full bg-primary font-bold text-primary-foreground",
                        mark === "dot" ? "h-2 w-2" : "h-4 min-w-4 px-1 text-[10px] leading-none"
                      )}
                      exit={{ scale: 0 }}
                      initial={{ scale: 0 }}
                      transition={{ type: "spring", stiffness: 600, damping: 22 }}
                    >
                      {mark === "dot" ? null : mark}
                    </motion.span>
                  )}
                </AnimatePresence>
              </span>
              {label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
