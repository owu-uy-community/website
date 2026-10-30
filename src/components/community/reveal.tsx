"use client";

import { Children, useEffect, useRef, type CSSProperties, type ReactNode } from "react";

import { cn } from "app/lib/utils";

/*
 * Blocks that rise into view, and grids whose items follow one another. The server HTML always
 * shows them, so nothing on screen waits for JavaScript (or the Largest Contentful Paint for an
 * animation). Once hydrated, only what is still below the fold hides, then rises in as it scrolls
 * into the screen. Reduced motion skips it. The styles are .owu-reveal in globals.css.
 */

type Watcher = (entry: IntersectionObserverEntry) => void;

const watchers = new WeakMap<Element, Watcher>();
let observer: IntersectionObserver | undefined;

/**
 * One observer for every block on the page. Its first report says where each block starts without
 * measuring it here: a getBoundingClientRect per block, between attribute writes, forced a layout
 * of the whole page for each one while it hydrated.
 */
function watch(node: Element, watcher: Watcher) {
  // Fire once the block's top edge is a little way into the screen
  observer ??= new IntersectionObserver(
    (entries) => {
      for (const entry of entries) watchers.get(entry.target)?.(entry);
    },
    { rootMargin: "0px 0px -12% 0px" }
  );
  watchers.set(node, watcher);
  observer.observe(node);

  return () => {
    watchers.delete(node);
    observer?.unobserve(node);
  };
}

function useReveal() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let first = true;
    const stop = watch(node, (entry) => {
      if (first) {
        first = false;
        // On screen (or already scrolled past) since the first paint: it stays as it is
        if (entry.isIntersecting || entry.boundingClientRect.top < 0) return stop();
        node.dataset.reveal = "hidden";
      } else if (entry.isIntersecting) {
        node.dataset.reveal = "shown";
        stop();
      }
    });

    return stop;
  }, []);

  return ref;
}

export function Reveal({
  children,
  className,
  delay = 0,
  y = 16,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  y?: number;
}) {
  const ref = useReveal();

  return (
    <div
      ref={ref}
      className={cn("owu-reveal", className)}
      style={{ "--reveal-delay": `${delay}s`, "--reveal-y": `${y}px` } as CSSProperties}
    >
      {children}
    </div>
  );
}

/** A grid or list whose children enter one after another, left to right */
export function Stagger({
  children,
  className,
  itemClassName,
  interval = 0.07,
}: {
  children: ReactNode;
  className?: string;
  itemClassName?: string;
  interval?: number;
}) {
  const ref = useReveal();

  return (
    <div ref={ref} className={className}>
      {Children.map(children, (child, index) =>
        child == null || child === false ? null : (
          // Keyed by the child's own key (Children.map carries it), so filtering keeps the cards that stay.
          // Each item fills its grid cell so cards in a row keep the same height
          <div
            className={cn("owu-reveal-item min-w-0 [&>*]:h-full", itemClassName)}
            style={{ "--reveal-delay": `${index * interval}s` } as CSSProperties}
          >
            {child}
          </div>
        )
      )}
    </div>
  );
}
