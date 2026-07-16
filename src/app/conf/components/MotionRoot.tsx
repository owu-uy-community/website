"use client";

import { domAnimation, LazyMotion, MotionConfig } from "motion/react";

/**
 * Animation context for /conf: loads only the domAnimation subset (smaller bundle,
 * `m.*` instead of `motion.*`) and honors the system prefers-reduced-motion setting.
 */
export default function MotionRoot({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <LazyMotion strict features={domAnimation}>
        {children}
      </LazyMotion>
    </MotionConfig>
  );
}
