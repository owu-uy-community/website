"use client";

import dynamic from "next/dynamic";
import { useState } from "react";

import { cn } from "app/lib/utils";
import type { PhotoSources } from "lib/timeline/image";

export type GalleryPhoto = {
  /** The grid tile (the first one is the big feature tile) */
  tile: PhotoSources;
  /** The lightbox, at screen width */
  full: PhotoSources;
  /** As published: what a takedown names (overrides.json hidePhotos) */
  src?: string;
  alt: string;
  /** "Foto: …" */
  credit?: string;
  page?: string;
  license?: string;
};

// Its code (Radix Dialog, gestures) loads on the first open; hovering the grid warms it
const loadLightbox = () => import("./Lightbox");
// Its own (empty) Suspense boundary: without a `loading`, the first open suspends up to the
// nearest one above (the archive, the page) and blanks it while the chunk loads, losing the scroll
const Lightbox = dynamic(loadLightbox, { loading: () => null });

// The big tile plus 12: four full rows on desktop. Fewer photos compete with the first one for bandwidth
const FIRST = 13;

/** Fades a photo in once decoded; one cached before hydration is shown right away */
function Tile({
  photo,
  index,
  onOpen,
  count,
}: {
  photo: GalleryPhoto;
  index: number;
  onOpen: () => void;
  count: number;
}) {
  const feature = index === 0;

  return (
    <li className={cn("relative", feature && "col-span-2 row-span-2")}>
      <button
        aria-label={`Ver la foto ${index + 1} de ${count}`}
        className="group relative block aspect-[4/3] size-full overflow-hidden rounded-xl bg-zinc-900 focus-visible:ring-2 focus-visible:ring-yellow-400 focus-visible:outline-none"
        onClick={onOpen}
        type="button"
      >
        <img
          ref={(img) => {
            if (img?.complete) img.dataset.loaded = "";
          }}
          alt={photo.alt}
          // The big one shows at once (it is the page's largest paint); the rest fade in as they decode
          className={cn(
            "absolute inset-0 size-full object-cover transition-[opacity,transform] duration-500 group-hover:scale-[1.03]",
            !feature && "opacity-0 data-[loaded]:opacity-100"
          )}
          decoding="async"
          fetchPriority={feature ? "high" : undefined}
          loading={feature ? "eager" : "lazy"}
          onLoad={(event) => {
            event.currentTarget.dataset.loaded = "";
          }}
          sizes={photo.tile.sizes}
          src={photo.tile.src}
          srcSet={photo.tile.srcSet}
        />
      </button>
    </li>
  );
}

/**
 * The event's photos: a fixed-aspect grid (nothing jumps while they load), the first one big,
 * each opening full size in the lightbox. Every photo is served from where it is published.
 */
export default function Gallery({ photos, title }: { photos: GalleryPhoto[]; title: string }) {
  const [open, setOpen] = useState<number | null>(null);
  const [all, setAll] = useState(false);
  const shown = all ? photos : photos.slice(0, FIRST);

  return (
    <>
      <ul
        className="grid grid-flow-dense grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4"
        onFocus={() => void loadLightbox()}
        onPointerEnter={() => void loadLightbox()}
      >
        {shown.map((photo, index) => (
          <Tile key={photo.tile.src} count={photos.length} index={index} onOpen={() => setOpen(index)} photo={photo} />
        ))}
      </ul>
      {photos.length > FIRST && !all ? (
        <button
          className="mt-4 inline-flex h-9 items-center rounded-full border border-white/10 px-4 text-sm text-zinc-300 transition-colors hover:border-yellow-400/40 hover:text-white"
          onClick={() => setAll(true)}
          type="button"
        >
          Ver las {photos.length} fotos
        </button>
      ) : null}
      {open !== null ? <Lightbox index={open} onChange={setOpen} photos={photos} title={title} /> : null}
    </>
  );
}
