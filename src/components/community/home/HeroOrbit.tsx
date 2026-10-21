"use client";

import { AnimatePresence, motion, useInView, useReducedMotion } from "motion/react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties } from "react";

import { initials } from "components/community/ui";

type Tile = { slug: string; name: string; logo: string | null };

/* Where each tile sits around the headline (percent of the hero), its size, tilt and parallax depth */
const SLOTS = [
  { x: 6, y: 18, size: 76, rot: -8, depth: 1.1, dur: 9.4 },
  { x: 14, y: 52, size: 60, rot: 6, depth: 0.7, dur: 10.8 },
  { x: 4, y: 78, size: 68, rot: -4, depth: 0.9, dur: 8.6 },
  { x: 22, y: 82, size: 52, rot: 9, depth: 0.6, dur: 11.5 },
  { x: 86, y: 16, size: 72, rot: 7, depth: 1.2, dur: 9.9 },
  { x: 92, y: 48, size: 58, rot: -6, depth: 0.8, dur: 10.2 },
  { x: 80, y: 80, size: 70, rot: 5, depth: 1, dur: 8.9 },
  { x: 70, y: 90, size: 50, rot: -9, depth: 0.6, dur: 11.1 },
];

// One tile changes at a time, hopping around the ring; the whole ring turns over in SLOTS.length × SWAP_MS
const SWAP_MS = 15_000;
const ORDER = [2, 5, 0, 7, 3, 6, 1, 4];

/**
 * The member communities floating around the hero: each tile drifts on its own
 * and leans toward the pointer (fine pointers only). Eight at a time; every few
 * seconds one gives its place to a community not on screen, so all of them get
 * their turn. It rests while a tile is hovered, off screen, or under reduced
 * motion. Desktop only; decorative for screen readers, but every tile is a real
 * link to the group.
 */
export default function HeroOrbit({ tiles }: { tiles: Tile[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(() => tiles.slice(0, SLOTS.length));
  const [hovered, setHovered] = useState(false);
  const inView = useInView(ref, { amount: 0.2 });
  const reduceMotion = useReducedMotion();
  const cursor = useRef({ next: SLOTS.length, turn: 0 });
  const shownRef = useRef(shown);
  shownRef.current = shown;

  useEffect(() => {
    const node = ref.current;
    if (!node || !window.matchMedia("(pointer: fine)").matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let frame = 0;
    const onMove = (event: PointerEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const x = (event.clientX / window.innerWidth - 0.5) * 36;
        const y = (event.clientY / window.innerHeight - 0.5) * 28;
        node.style.setProperty("--px", x.toFixed(2));
        node.style.setProperty("--py", y.toFixed(2));
      });
    };
    window.addEventListener("pointermove", onMove, { passive: true });

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onMove);
    };
  }, []);

  useEffect(() => {
    if (!inView || hovered || reduceMotion || tiles.length <= SLOTS.length) return;

    const id = setInterval(() => {
      const state = cursor.current;
      const slot = ORDER[state.turn++ % ORDER.length]!;
      // The next community in line that no slot is showing right now
      let candidate = tiles[state.next++ % tiles.length]!;

      for (let tries = 0; tries < tiles.length && shownRef.current.some((tile) => tile.slug === candidate.slug); tries++) {
        candidate = tiles[state.next++ % tiles.length]!;
      }
      setShown((current) => current.map((tile, index) => (index === slot ? candidate : tile)));
    }, SWAP_MS);

    return () => clearInterval(id);
  }, [inView, hovered, reduceMotion, tiles]);

  return (
    <div ref={ref} aria-hidden className="pointer-events-none absolute inset-0 hidden xl:block">
      {SLOTS.map((slot, index) => {
        const tile = shown[index];

        if (!tile) return null;

        return (
          <div
            key={index}
            className="owu-orbit-tile absolute"
            style={{ left: `${slot.x}%`, top: `${slot.y}%`, "--depth": slot.depth } as CSSProperties}
          >
            {/* The leaving tile shrinks away; the one arriving plays the same entrance as on load */}
            <AnimatePresence initial={false} mode="wait">
              <motion.div key={tile.slug} exit={{ opacity: 0, scale: 0.6 }} transition={{ duration: 0.3 }}>
                <Link
                  className="owu-orbit-drift pointer-events-auto relative flex items-center justify-center overflow-hidden rounded-[22%] border border-white/10 bg-white shadow-[0_18px_40px_-18px_rgba(0,0,0,0.9)] transition-[filter,scale] duration-300 hover:scale-110"
                  href={`/comunidades#${tile.slug}`}
                  style={
                    {
                      width: slot.size,
                      height: slot.size,
                      marginLeft: -slot.size / 2,
                      marginTop: -slot.size / 2,
                      "--rot": `${slot.rot}deg`,
                      "--dur": `${slot.dur}s`,
                      "--delay": `${index * -1.3}s`,
                      animationDelay: `${index * 70}ms, ${index * -1.3}s`,
                    } as CSSProperties
                  }
                  tabIndex={-1}
                  title={tile.name}
                  onPointerEnter={() => setHovered(true)}
                  onPointerLeave={() => setHovered(false)}
                >
                  {tile.logo ? (
                    <Image alt="" className="object-cover" fill sizes={`${slot.size}px`} src={tile.logo} />
                  ) : (
                    <span className="font-title text-lg font-bold text-zinc-900">{initials(tile.name)}</span>
                  )}
                </Link>
              </motion.div>
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}
