"use client";

import { useEffect, useState } from "react";

// How long the leaving word takes to rise out (matches .owu-word in globals.css)
const EXIT_MS = 600;

/**
 * Cycles the hero verb ("Aprendemos", "Construimos"…) with a short rise; static when motion is reduced.
 *
 * Two long-lived slots take turns (.owu-word in globals.css): one shows the word, the other waits
 * below the line, clipped by the mask. Both are painted from the first frame, so Chrome never takes
 * a later word for the Largest Contentful Paint: when each word was a newly mounted element, a
 * visitor still on the hero had their LCP pushed to 2.7 s, then 5.3 s.
 */
export default function RotatingWord({ words, interval = 2600 }: { words: readonly string[]; interval?: number }) {
  const [index, setIndex] = useState(0);
  // Right after a turn the other slot is still rising out with the previous word
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (words.length < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let settle: ReturnType<typeof setTimeout> | undefined;
    const turn = setInterval(() => {
      setIndex((current) => current + 1);
      setLeaving(true);
      settle = setTimeout(() => setLeaving(false), EXIT_MS);
    }, interval);

    return () => {
      clearInterval(turn);
      clearTimeout(settle);
    };
  }, [interval, words.length]);

  const word = (at: number) => words[((at % words.length) + words.length) % words.length] ?? "";
  // The widest word reserves the space, so the line never reflows as words change
  const widest = words.reduce((longest, candidate) => (candidate.length > longest.length ? candidate : longest), "");

  return (
    <span className="relative inline-grid overflow-hidden pb-[0.14em] align-bottom text-yellow-400">
      <span aria-hidden className="invisible col-start-1 row-start-1">
        {widest}
      </span>
      {[0, 1].map((slot) => {
        const current = index % 2 === slot;

        return (
          <span
            key={slot}
            aria-hidden={!current}
            className="owu-word col-start-1 row-start-1 text-center"
            data-state={current ? "current" : leaving ? "past" : "next"}
          >
            {current ? word(index) : word(leaving ? index - 1 : index + 1)}
          </span>
        );
      })}
    </span>
  );
}
