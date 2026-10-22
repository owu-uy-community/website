"use client";

import { animate, motion, MotionConfig, useInView, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { Children, useEffect, useRef, type ReactNode } from "react";

import { cn } from "app/lib/utils";

/*
 * The site's motion vocabulary, in three moves: a block that rises into view,
 * a grid whose items follow one another, and a number that counts up. Under
 * MotionRoot, a visitor who asked for reduced motion gets fades without movement.
 */

/**
 * Wraps the community site. Components start from the same hidden state on the server
 * and the client (no hydration mismatch); Motion drops the movement for reduced motion.
 */
export function MotionRoot({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}

export const EASE_OUT = [0.22, 1, 0.36, 1] as const;

// Fire once the block's top edge is a little way into the screen. A share of the block's own height
// ("amount: 0.2") never arrives for blocks taller than the viewport on a phone, which left them invisible.
const VIEWPORT = { once: true, amount: "some", margin: "0px 0px -12% 0px" } as const;

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
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      transition={{ duration: 0.6, ease: EASE_OUT, delay }}
      viewport={VIEWPORT}
      whileInView={{ opacity: 1, y: 0 }}
    >
      {children}
    </motion.div>
  );
}

const staggerItem = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: EASE_OUT } },
};

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
  return (
    <motion.div
      className={className}
      initial="hidden"
      variants={{ hidden: {}, show: { transition: { staggerChildren: interval, staggerDirection: 1 } } }}
      viewport={VIEWPORT}
      whileInView="show"
    >
      {Children.map(children, (child, index) =>
        child == null || child === false ? null : (
          // Each item fills its grid cell so cards in a row keep the same height
          <motion.div key={index} className={cn("min-w-0 [&>*]:h-full", itemClassName)} variants={staggerItem}>
            {child}
          </motion.div>
        )
      )}
    </motion.div>
  );
}

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
    const controls = animate(count, value, { duration, ease: [0.16, 1, 0.3, 1] });

    return () => controls.stop();
  }, [inView, reduceMotion, value, duration, count]);

  return (
    <span ref={ref} className={cn("relative inline-block", className)}>
      {/* The ghost reserves the final width so nothing around it shifts while counting */}
      <span aria-hidden className="invisible">
        {prefix}
        {format(value)}
        {suffix}
      </span>
      <motion.span aria-hidden className="absolute inset-0">
        {text}
      </motion.span>
      <span className="sr-only">
        {prefix}
        {format(value)}
        {suffix}
      </span>
    </span>
  );
}
