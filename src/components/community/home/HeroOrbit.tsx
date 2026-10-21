"use client";

import Link from "next/link";
import { useEffect, useRef, type CSSProperties } from "react";

type Tile = { slug: string; name: string; logo: string };

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

/**
 * The member communities floating around the hero: each tile drifts on its own
 * and leans toward the pointer (fine pointers only). Desktop only; decorative
 * for screen readers, but every tile is a real link to the group.
 */
export default function HeroOrbit({ tiles }: { tiles: Tile[] }) {
  const ref = useRef<HTMLDivElement>(null);

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

  return (
    <div ref={ref} aria-hidden className="pointer-events-none absolute inset-0 hidden xl:block">
      {tiles.slice(0, SLOTS.length).map((tile, index) => {
        const slot = SLOTS[index];

        return (
          <div
            key={tile.slug}
            className="owu-orbit-tile absolute"
            style={{ left: `${slot.x}%`, top: `${slot.y}%`, "--depth": slot.depth } as CSSProperties}
          >
            <Link
              className="owu-orbit-drift pointer-events-auto flex items-center justify-center rounded-[26%] border border-white/10 bg-white p-2.5 shadow-[0_18px_40px_-18px_rgba(0,0,0,0.9)] transition-[filter,scale] duration-300 hover:scale-110"
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
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img alt="" className="max-h-full max-w-full object-contain" src={tile.logo} />
            </Link>
          </div>
        );
      })}
    </div>
  );
}
