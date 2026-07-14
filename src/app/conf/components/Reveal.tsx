"use client";

import { m } from "motion/react";

export const EASE_OUT = [0.22, 1, 0.36, 1] as const;

type RevealProps = {
  children?: React.ReactNode;
  className?: string;
  /** Delay in seconds before animating (manual stagger between items) */
  delay?: number;
  /** Initial offset */
  y?: number;
  x?: number;
  scale?: number;
  rotate?: number;
  /** "x" animates scaleX 0→1 (bands/dividers) */
  grow?: "x";
  /** Fraction of the element that must be visible to trigger */
  amount?: number;
  duration?: number;
};

/* Reveals once on viewport entry, using the page's shared easing */
export default function Reveal({
  children,
  className,
  delay = 0,
  y = 28,
  x = 0,
  scale = 1,
  rotate = 0,
  grow,
  amount = 0.25,
  duration = 0.7,
}: RevealProps) {
  return (
    <m.div
      className={className}
      initial={grow === "x" ? { scaleX: 0 } : { opacity: 0, x, y, scale, rotate }}
      style={grow === "x" ? { transformOrigin: "left center" } : undefined}
      transition={{ duration, delay, ease: EASE_OUT }}
      viewport={{ amount, once: true }}
      whileInView={grow === "x" ? { scaleX: 1 } : { opacity: 1, x: 0, y: 0, scale: 1, rotate: 0 }}
    >
      {children}
    </m.div>
  );
}
