"use client";

import { m } from "motion/react";
import Link from "next/link";

import type { PhotoSources } from "lib/timeline/image";

export type HeroTile = { slug: string; title: string; year: string; alt: string; sources: PhotoSources };

/**
 * The hero's contact sheet: one photo per era, dealt onto the page one after another, each opening
 * its event. Beside the title on wide screens (three columns, the middle one lower); a row to swipe
 * under the buttons on the rest, so it doesn't push the page down.
 */
export default function HeroTiles({ tiles }: { tiles: HeroTile[] }) {
  return (
    <ul
      aria-label="Momentos de la historia"
      className="-mx-5 flex snap-x scroll-px-5 [scrollbar-width:none] gap-3 overflow-x-auto px-5 pb-1 sm:mx-0 sm:scroll-px-0 sm:px-0 xl:grid xl:grid-cols-3 xl:gap-4 xl:overflow-visible xl:pb-10 [&::-webkit-scrollbar]:hidden"
    >
      {tiles.map((tile, i) => (
        <m.li
          key={tile.slug}
          animate={{ opacity: 1, y: 0, rotate: 0 }}
          className="w-28 shrink-0 snap-start sm:w-32 xl:w-auto xl:[&:nth-child(3n+2)]:translate-y-10"
          initial={{ opacity: 0, y: 28, rotate: i % 2 ? 3 : -3 }}
          transition={{ delay: 0.25 + i * 0.08, type: "spring", stiffness: 220, damping: 22 }}
        >
          <Link
            className="group relative block aspect-[3/4] overflow-hidden rounded-2xl bg-zinc-900 shadow-lg ring-1 shadow-black/40 ring-white/10 transition-transform duration-300 hover:-translate-y-1"
            href={`/timeline/${tile.slug}`}
            title={tile.title}
          >
            <img
              alt={tile.alt}
              className="size-full object-cover transition duration-500 group-hover:scale-105"
              decoding="async"
              loading="lazy"
              sizes={tile.sources.sizes}
              src={tile.sources.src}
              srcSet={tile.sources.srcSet}
            />
            <span
              aria-hidden
              className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/70 to-transparent"
            />
            <span className="absolute bottom-2 left-2 font-terminal text-[12px] text-white">{tile.year}</span>
          </Link>
        </m.li>
      ))}
    </ul>
  );
}
