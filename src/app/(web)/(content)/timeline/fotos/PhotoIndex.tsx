"use client";

import { Camera, Search } from "lucide-react";
import { AnimatePresence, m } from "motion/react";
import Link from "next/link";
import { useDeferredValue, useState } from "react";

import { CommunityLogo } from "components/community/ui";
import { normalize } from "lib/timeline/format";
import { thumbSources } from "lib/timeline/image";
import type { PhotoCommunity } from "lib/timeline/photos";

const number = new Intl.NumberFormat("es-UY");
const COLUMNS: Record<number, string> = { 1: "grid-cols-1", 2: "grid-cols-2", 3: "grid-cols-3", 4: "grid-cols-4" };

/**
 * The communities with photos as cards (a contact sheet of their history), filtered by name; the
 * ecosystem's groups (companies, academia, the State) after them, apart, as the rest of the history
 * counts communities
 */
export default function PhotoIndex({ communities }: { communities: PhotoCommunity[] }) {
  const [query, setQuery] = useState("");
  const term = normalize(useDeferredValue(query).trim());
  const matches = term ? communities.filter((c) => normalize(c.name).includes(term)) : communities;
  const own = matches.filter((c) => c.layer === "community");
  const others = matches.filter((c) => c.layer === "ecosystem");

  return (
    <div className="flex flex-col gap-6">
      <label className="relative max-w-md">
        <span className="sr-only">Buscar una comunidad</span>
        <Search
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-zinc-400"
        />
        <input
          className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.04] pr-4 pl-10 text-[15px] text-zinc-100 placeholder:text-zinc-400 focus:border-yellow-400/50 focus:outline-none"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscá una comunidad…"
          type="search"
          value={query}
        />
      </label>
      <p aria-live="polite" className="text-sm text-zinc-400">
        {own.length} {own.length === 1 ? "comunidad" : "comunidades"} con fotos
        {others.length ? ` · ${others.length} del ecosistema` : ""}
      </p>
      <Cards items={own} />
      {others.length ? (
        <section aria-labelledby="fotos-ecosistema" className="mt-8 flex flex-col gap-4">
          <h2 className="text-sm font-medium text-zinc-400" id="fotos-ecosistema">
            Del ecosistema: empresas, academia y el Estado
          </h2>
          <Cards items={others} lazy />
        </section>
      ) : null}
    </div>
  );
}

/** A grid of cards; `lazy` when it starts below the fold */
function Cards({ items, lazy = false }: { items: PhotoCommunity[]; lazy?: boolean }) {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <AnimatePresence initial={false}>
        {items.map((community, index) => (
          <m.li
            key={community.slug}
            layout
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97 }}
            initial={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1], delay: Math.min(index, 9) * 0.03 }}
          >
            <Link
              className="group block overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.02] transition-colors hover:border-white/20 focus-visible:ring-2 focus-visible:ring-yellow-400 focus-visible:outline-none"
              href={`/timeline/fotos/${community.slug}`}
            >
              {/* One column per cover: up to four moments of its history, side by side */}
              <span
                aria-hidden
                className={`grid aspect-[2/1] gap-px bg-white/[0.06] ${COLUMNS[community.covers.length]}`}
              >
                {community.covers.map((src, column) => {
                  const thumb = thumbSources(src, 160);
                  // The first row of cards is on screen at load
                  const top = !lazy && index < 3;
                  return (
                    <img
                      key={src}
                      alt=""
                      className="size-full bg-zinc-900 object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                      decoding="async"
                      fetchPriority={top && index === 0 && column === 0 ? "high" : undefined}
                      loading={top ? "eager" : "lazy"}
                      src={thumb.src}
                      srcSet={thumb.srcSet}
                    />
                  );
                })}
              </span>
              <span className="flex items-center gap-3 p-4">
                <CommunityLogo logo={community.logo ?? null} name={community.name} size="sm" />
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-zinc-100 group-hover:text-yellow-200">
                    {community.name}
                  </span>
                  <span className="flex items-center gap-1.5 text-[13px] text-zinc-400">
                    <Camera aria-hidden className="size-3.5" /> {number.format(community.photos)} fotos de{" "}
                    {community.events} {community.events === 1 ? "evento" : "eventos"} ·{" "}
                    {community.from === community.to ? community.from : `${community.from}–${community.to}`}
                  </span>
                </span>
              </span>
            </Link>
          </m.li>
        ))}
      </AnimatePresence>
    </ul>
  );
}
