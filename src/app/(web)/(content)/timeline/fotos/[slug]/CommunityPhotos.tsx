"use client";

import { Camera } from "lucide-react";
import { m } from "motion/react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo, useState } from "react";

import { cn } from "app/lib/utils";

import { photoSources } from "lib/timeline/image";
import type { PhotoGroup } from "lib/timeline/photos";

import { useNear } from "../../archive-data";
import type { LightboxPhoto } from "../../[slug]/Lightbox";

// The lightbox code loads on the first open; hovering the wall warms it
const loadLightbox = () => import("../../[slug]/Lightbox");
// Its own (empty) Suspense boundary: without a `loading`, the first open suspends up to the
// nearest one above (the archive, the page) and blanks it while the chunk loads, losing the scroll
const Lightbox = dynamic(loadLightbox, { loading: () => null });

const TILE_SIZES = "(min-width: 1024px) 288px, (min-width: 640px) 33vw, 50vw";
const GRID = "grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4";
const TILE = "aspect-[4/3] rounded-xl";
const EASE_OUT = [0.22, 1, 0.36, 1] as const;

/**
 * One event's photos: its header stays pinned while they scroll by; the photos render once the
 * group gets near the screen, empty tiles of the same grid holding their places until then.
 */
function Group({
  group,
  offset,
  onOpen,
  yearAnchor,
  first,
}: {
  group: PhotoGroup;
  offset: number;
  onOpen: (index: number) => void;
  yearAnchor: boolean;
  /** The group at the top: in the HTML from the start, its first photo the page's largest paint */
  first: boolean;
}) {
  const [ref, near] = useNear<HTMLElement>("900px");

  return (
    <section
      ref={ref}
      aria-labelledby={`g-${group.slug}`}
      className="scroll-mt-36"
      id={yearAnchor ? `fotos-${group.year}` : undefined}
    >
      <header className="sticky top-[4.5rem] z-10 -mx-2 mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-xl bg-zinc-950/90 px-2 py-2.5 backdrop-blur">
        <h2 className="min-w-0 text-[15px] font-semibold text-zinc-100" id={`g-${group.slug}`}>
          <Link
            className="decoration-yellow-400/60 underline-offset-4 hover:underline"
            href={`/timeline/${group.slug}`}
          >
            {group.title}
          </Link>
        </h2>
        <p className="flex items-center gap-2 font-terminal text-[12px] text-zinc-400">
          {group.when}
          <span className="inline-flex items-center gap-1">
            <Camera aria-hidden className="size-3.5" /> {group.photos.length}
          </span>
        </p>
      </header>
      {near || first ? (
        <ul className={GRID}>
          {group.photos.map((photo, index) => {
            const sources = photoSources(photo.src, TILE_SIZES);
            return (
              <m.li
                key={photo.src}
                animate={{ opacity: 1, y: 0 }}
                initial={first ? false : { opacity: 0, y: 8 }}
                transition={{ duration: 0.4, ease: EASE_OUT, delay: Math.min(index, 12) * 0.03 }}
              >
                <button
                  aria-label={`Ver la foto ${index + 1} de ${group.photos.length} de ${group.title}`}
                  className={cn(
                    TILE,
                    "group relative block w-full overflow-hidden bg-zinc-900 focus-visible:ring-2 focus-visible:ring-yellow-400 focus-visible:outline-none"
                  )}
                  onClick={() => onOpen(offset + index)}
                  type="button"
                >
                  <img
                    alt={photo.alt ?? ""}
                    className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                    decoding="async"
                    fetchPriority={first && index === 0 ? "high" : undefined}
                    loading={first && index < 8 ? "eager" : "lazy"}
                    sizes={sources.sizes}
                    src={sources.src}
                    srcSet={sources.srcSet}
                  />
                </button>
              </m.li>
            );
          })}
        </ul>
      ) : (
        // The same grid with empty tiles, one per photo: as tall as the photos will be, last row included
        <ul aria-hidden className={cn(GRID, "animate-pulse")}>
          {group.photos.map((photo) => (
            <li key={photo.src} className={cn(TILE, "bg-zinc-900")} />
          ))}
        </ul>
      )}
    </section>
  );
}

/** Every photo of a community, grouped by event, with one lightbox that walks across all of them */
export default function CommunityPhotos({ groups, community }: { groups: PhotoGroup[]; community: string }) {
  const [open, setOpen] = useState<number | null>(null);

  // The lightbox's list (every photo, with its event) and where each group starts in it
  const { all, offsets } = useMemo(() => {
    const all: LightboxPhoto[] = [];
    const offsets: number[] = [];
    for (const group of groups) {
      offsets.push(all.length);
      const event = { title: group.title, when: group.when, href: `/timeline/${group.slug}` };
      for (const photo of group.photos) {
        all.push({
          tile: photoSources(photo.src, TILE_SIZES),
          full: photoSources(photo.src, "100vw"),
          alt: photo.alt ?? "",
          credit: photo.credit,
          page: photo.page,
          license: photo.license,
          event,
        });
      }
    }
    return { all, offsets };
  }, [groups]);

  return (
    <div
      className="flex flex-col gap-10"
      onFocus={() => void loadLightbox()}
      onPointerEnter={() => void loadLightbox()}
    >
      {groups.map((group, index) => (
        <Group
          key={group.slug}
          group={group}
          offset={offsets[index]}
          onOpen={setOpen}
          first={index === 0}
          yearAnchor={index === 0 || groups[index - 1].year !== group.year}
        />
      ))}
      {open !== null ? <Lightbox index={open} onChange={setOpen} photos={all} title={`Fotos de ${community}`} /> : null}
    </div>
  );
}
