"use client";

import { AnimatePresence, m, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";

/** Cycles the hero verb ("Aprendemos", "Construimos"…) with a short rise; static when motion is reduced */
export default function RotatingWord({ words, interval = 2600 }: { words: readonly string[]; interval?: number }) {
  const [index, setIndex] = useState(0);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (reduceMotion || words.length < 2) return;
    const id = setInterval(() => setIndex((current) => (current + 1) % words.length), interval);

    return () => clearInterval(id);
  }, [interval, reduceMotion, words.length]);

  const word = words[index] ?? "";
  // The widest word reserves the space, so the line never reflows as words change
  const widest = words.reduce((longest, candidate) => (candidate.length > longest.length ? candidate : longest), "");

  return (
    <span className="relative inline-grid overflow-hidden pb-[0.14em] align-bottom text-yellow-400">
      <span aria-hidden className="invisible col-start-1 row-start-1">
        {widest}
      </span>
      <AnimatePresence initial={false} mode="popLayout">
        <m.span
          key={word}
          animate={{ y: "0%", opacity: 1 }}
          className="col-start-1 row-start-1 text-center"
          exit={{ y: "-100%", opacity: 0 }}
          initial={{ y: "100%", opacity: 0 }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        >
          {word}
        </m.span>
      </AnimatePresence>
    </span>
  );
}
