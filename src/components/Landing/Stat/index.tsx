"use client";

import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { useEffect } from "react";

type StatProps = {
  title: string;
  count: number | null;
  subtitle: string;
  play?: boolean;
  index?: number;
};

export default function Stat({ title, count, subtitle, play = false, index = 0 }: StatProps) {
  const target = count ?? 0;
  const prefersReducedMotion = useReducedMotion();

  const motionCount = useMotionValue(0);
  const display = useTransform(motionCount, (latest) => `+${Math.round(latest)}`);

  useEffect(() => {
    if (!play) return;

    if (prefersReducedMotion) {
      motionCount.set(target);
      return;
    }

    const controls = animate(motionCount, target, {
      duration: 2,
      delay: index * 0.15,
      ease: [0.16, 1, 0.3, 1],
    });

    return () => controls.stop();
  }, [play, target, index, prefersReducedMotion, motionCount]);

  return (
    <div className="flex flex-col items-center gap-1 text-center text-white">
      <p className="font-title text-4xl font-extrabold tabular-nums text-yellow-400 sm:text-5xl">
        {/* The invisible ghost reserves the final width so the box never resizes (no layout shift);
            the animated value overlays it left-anchored so the "+" stays pinned (no digit-jump jitter). */}
        <span className="relative inline-block text-left">
          <span aria-hidden className="invisible">
            +{target}
          </span>
          <motion.span className="absolute left-0 top-0">{display}</motion.span>
        </span>
      </p>
      <p className="text-lg font-semibold leading-tight sm:text-xl">{title}</p>
      <p className="text-sm text-zinc-400">{subtitle}</p>
    </div>
  );
}
