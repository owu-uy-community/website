"use client";

import { LazyMotion, m, MotionConfig, useInView, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { useEffect, useRef, type ReactNode } from "react";

import { cn } from "app/lib/utils";

/*
 * The site's Motion pieces: the root config and a number that counts up. Under MotionRoot, a
 * visitor who asked for reduced motion gets fades without movement. Blocks and grids that rise
 * into view are plain CSS (./reveal), so they never wait for this library.
 */

// The animation engine (layout animations included, for the navbar's marker) loads after the page
// instead of with it; until then `m` components render their current state, unanimated
const loadFeatures = () => import("./motion-features").then((module) => module.default);

/**
 * Wraps the community site. Components start from the same hidden state on the server
 * and the client (no hydration mismatch); Motion drops the movement for reduced motion.
 * Use `m.*`, not `motion.*`, under it: `motion` brings the whole engine back into the page.
 */
export function MotionRoot({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <LazyMotion features={loadFeatures}>{children}</LazyMotion>
    </MotionConfig>
  );
}

export const EASE_OUT = [0.22, 1, 0.36, 1] as const;

const format = (value: number) => new Intl.NumberFormat("es-UY").format(Math.round(value));

/** Counts from zero to the value once it scrolls into view; the final figure is in the markup for crawlers */
export function CountUp({
  value,
  prefix = "",
  suffix = "",
  className,
  duration = 1.6,
}: {
  value: number;
  prefix?: string;
  suffix?: string;
  className?: string;
  duration?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const reduceMotion = useReducedMotion();
  const count = useMotionValue(0);
  const text = useTransform(count, (latest) => `${prefix}${format(latest)}${suffix}`);

  useEffect(() => {
    if (!inView) return;
    if (reduceMotion) {
      count.set(value);

      return;
    }
    let controls: { stop: () => void } | undefined;
    let cancelled = false;
    void import("motion/react").then(({ animate }) => {
      if (!cancelled) controls = animate(count, value, { duration, ease: [0.16, 1, 0.3, 1] });
    });

    return () => {
      cancelled = true;
      controls?.stop();
    };
  }, [inView, reduceMotion, value, duration, count]);

  return (
    <span ref={ref} className={cn("relative inline-block", className)}>
      {/* The ghost reserves the final width so nothing around it shifts while counting */}
      <span aria-hidden className="invisible">
        {prefix}
        {format(value)}
        {suffix}
      </span>
      <m.span aria-hidden className="absolute inset-0">
        {text}
      </m.span>
      <span className="sr-only">
        {prefix}
        {format(value)}
        {suffix}
      </span>
    </span>
  );
}
