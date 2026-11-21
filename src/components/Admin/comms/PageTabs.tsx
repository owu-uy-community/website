"use client";

import { useEffect, useRef, type RefObject } from "react";
import type * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";

/**
 * A strip of tabs that scrolls sideways on a narrow screen keeps the active one in view: a swipe on the
 * content can land on a tab that's off screen. Only the strip scrolls, never the page.
 */
export function useActiveTabInView(strip: RefObject<HTMLElement | null>, value: string) {
  useEffect(() => {
    const list = strip.current;
    if (!list) return;
    const reveal = (smooth: boolean) => {
      const tab = list.querySelector<HTMLElement>('[data-state="active"]');
      if (!tab || list.scrollWidth <= list.clientWidth) return;
      const box = list.getBoundingClientRect();
      const { left, right } = tab.getBoundingClientRect();
      const by = left < box.left ? left - box.left - 16 : right > box.right ? right - box.right + 16 : 0;
      if (by === 0) return;
      const still = !smooth || matchMedia("(prefers-reduced-motion: reduce)").matches;
      list.scrollBy({ left: by, behavior: still ? "auto" : "smooth" });
    };
    reveal(true);
    // The counts arrive after the tabs: a tab growing before the active one can push it back out of view.
    // (The first notice is only the observer starting: skipping it keeps the smooth scroll smooth.)
    let started = false;
    const observer = new ResizeObserver(() => {
      if (started) reveal(false);
      started = true;
    });
    for (const tab of list.children) observer.observe(tab);
    return () => observer.disconnect();
  }, [strip, value]);
}

/** A page's sections as underlined tabs, each with an optional mono count. */
export function PageTabs({
  items,
  value,
}: {
  items: { value: string; label: string; count?: React.ReactNode }[];
  /** The active tab, kept in view. */
  value: string;
}) {
  const strip = useRef<HTMLDivElement>(null);
  useActiveTabInView(strip, value);

  return (
    <TabsPrimitive.List
      ref={strip}
      className="mb-5 flex [scrollbar-width:none] gap-5 overflow-x-auto border-b border-border"
    >
      {items.map((item) => (
        <TabsPrimitive.Trigger
          key={item.value}
          className="relative inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-sm text-ui font-medium whitespace-nowrap text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/70 data-[state=active]:text-foreground data-[state=active]:after:absolute data-[state=active]:after:inset-x-0 data-[state=active]:after:-bottom-px data-[state=active]:after:h-0.5 data-[state=active]:after:rounded-full data-[state=active]:after:bg-primary pointer-coarse:h-11 pointer-coarse:min-w-11"
          value={item.value}
        >
          {item.label}
          {item.count === undefined ? null : (
            <span className="font-terminal text-[10.5px] text-muted-foreground tabular-nums">{item.count}</span>
          )}
        </TabsPrimitive.Trigger>
      ))}
    </TabsPrimitive.List>
  );
}
