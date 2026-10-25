"use client";

import { m } from "motion/react";
import Link from "next/link";

import type { PhotoSources } from "lib/timeline/image";

export type HeroTile = { slug: string; title: string; year: string; alt: string; sources: PhotoSources };

/**
 * The hero's contact sheet: one photo per era, dealt onto the page one after another, each opening
 * its event. Desktop only (xl): beside the title there's room; on smaller screens it would push
 * the content down.
 */
export default function HeroTiles({ tiles }: { tiles: HeroTile[] }) {
  return (
    <ul
      aria-label="Momentos de la historia"
      className="absolute top-20 right-8 hidden w-[22rem] grid-cols-3 gap-2 xl:grid"
    >
      {tiles.map((tile, i) => (
        <m.li
          key={tile.slug}
          animate={{ opacity: 1, y: i % 3 === 1 ? 24 : 0, rotate: 0 }}
          initial={{ opacity: 0, y: (i % 3 === 1 ? 24 : 0) + 28, rotate: i % 2 ? 3 : -3 }}
          transition={{ delay: 0.25 + i * 0.09, type: "spring", stiffness: 220, damping: 22 }}
        >
          <Link
            className="group relative block aspect-[3/4] overflow-hidden rounded-xl bg-zinc-900 ring-1 ring-white/10 transition-transform duration-300 hover:-translate-y-1"
            href={`/timeline/${tile.slug}`}
            title={tile.title}
          >
            <img
              alt={tile.alt}
              className="size-full object-cover opacity-80 grayscale-[35%] transition duration-500 group-hover:scale-105 group-hover:opacity-100 group-hover:grayscale-0"
              decoding="async"
              loading="lazy"
              sizes={tile.sources.sizes}
              src={tile.sources.src}
              srcSet={tile.sources.srcSet}
            />
            <span className="absolute bottom-1.5 left-1.5 rounded-md bg-zinc-950/80 px-1.5 py-0.5 font-terminal text-[11px] text-zinc-200 backdrop-blur">
              {tile.year}
            </span>
          </Link>
        </m.li>
      ))}
    </ul>
  );
}
