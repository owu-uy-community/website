"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";

import { cn } from "app/lib/utils";

/**
 * A row that scrolls sideways (tabs, steps) without a scrollbar, with an edge fade and a chevron
 * while there's more to the right: what's hidden never looks like it isn't there.
 */
export function ScrollCue({ children, className }: { children: ReactNode; className?: string }) {
  const strip = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState(false);

  useEffect(() => {
    const element = strip.current;
    if (!element) return;
    const check = () => setMore(element.scrollLeft + element.clientWidth < element.scrollWidth - 1);
    check();
    element.addEventListener("scroll", check, { passive: true });
    const observer = new ResizeObserver(check);
    observer.observe(element);

    return () => {
      element.removeEventListener("scroll", check);
      observer.disconnect();
    };
  }, []);

  return (
    <div className="relative min-w-0">
      <div ref={strip} className={cn("[scrollbar-width:none] overflow-x-auto", className)}>
        {children}
      </div>
      {more ? (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 flex w-10 items-center justify-end bg-gradient-to-l from-background via-background/80 to-transparent"
          data-testid="scroll-cue"
        >
          <ChevronRight className="size-4 text-muted-foreground" />
        </span>
      ) : null}
    </div>
  );
}
