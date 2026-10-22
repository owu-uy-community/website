"use client";

import { AnimatePresence, motion, useInView, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { EASE_OUT } from "components/community/motion";
import { cardClassName, Cells, CommunityLogo } from "components/community/ui";

export type GridCommunity = { slug: string; name: string; logo: string | null; next: string | null; blurb: string };

const SLOTS = 11;
const SWAP_MS = 3000;
// Cells take turns in this order, so swaps hop around the grid instead of sweeping it
const ORDER = [4, 9, 1, 6, 10, 2, 7, 0, 5, 8, 3];

/**
 * Eleven community cards plus a closing tile. Every few seconds one card hands its
 * place to a group that isn't on screen, so every community gets its turn. It rests
 * while the pointer or keyboard focus is on the grid, off screen, or under reduced motion.
 */
export default function CommunityGrid({ communities, cta }: { communities: GridCommunity[]; cta: ReactNode }) {
  const [shown, setShown] = useState(() => communities.slice(0, SLOTS));
  const [held, setHeld] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.2 });
  const reduceMotion = useReducedMotion();
  const cursor = useRef({ next: SLOTS, turn: 0 });
  const shownRef = useRef(shown);
  shownRef.current = shown;

  useEffect(() => {
    if (!inView || held || reduceMotion || communities.length <= SLOTS) return;

    const id = setInterval(() => {
      const state = cursor.current;
      const slot = ORDER[state.turn++ % ORDER.length]!;
      // The next group in line that no card is showing right now
      let candidate = communities[state.next++ % communities.length]!;

      for (
        let tries = 0;
        tries < communities.length && shownRef.current.some((c) => c.slug === candidate.slug);
        tries++
      ) {
        candidate = communities[state.next++ % communities.length]!;
      }
      setShown((current) => current.map((community, index) => (index === slot ? candidate : community)));
    }, SWAP_MS);

    return () => clearInterval(id);
  }, [inView, held, reduceMotion, communities]);

  return (
    <div
      ref={ref}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setHeld(false);
      }}
      onFocus={() => setHeld(true)}
      onPointerEnter={() => setHeld(true)}
      onPointerLeave={() => setHeld(false)}
    >
      <Cells className="grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
        {shown.map((community, index) => (
          // The card stays put; what's inside crossfades to the next group
          <Link key={index} className={cardClassName(true, "grid p-5 sm:p-6")} href={`/comunidades#${community.slug}`}>
            <AnimatePresence initial={false}>
              <motion.span
                key={community.slug}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                className="col-start-1 row-start-1 flex min-w-0 flex-col gap-5"
                exit={{ opacity: 0, y: -8, filter: "blur(4px)" }}
                initial={{ opacity: 0, y: 8, filter: "blur(4px)" }}
                transition={{ duration: 0.5, ease: EASE_OUT }}
              >
                <CommunityLogo logo={community.logo} name={community.name} />
                <span className="block min-w-0">
                  <span className="block truncate font-title text-[15px] font-semibold text-white">
                    {community.name}
                  </span>
                  <span className="mt-1 block truncate text-[13px] text-zinc-500">
                    {community.next ? (
                      <span className="font-medium text-yellow-400">{community.next}</span>
                    ) : (
                      community.blurb
                    )}
                  </span>
                </span>
              </motion.span>
            </AnimatePresence>
          </Link>
        ))}
        {cta}
      </Cells>
    </div>
  );
}
