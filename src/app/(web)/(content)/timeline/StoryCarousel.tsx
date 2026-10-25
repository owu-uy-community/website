"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { m } from "motion/react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { cn } from "app/lib/utils";
import { Carousel, type CarouselApi, CarouselContent, CarouselItem } from "components/shared/ui/carousel";
import type { LifelineMarker } from "components/lifeline/types";

import type { GalleryPhoto } from "./[slug]/Gallery";

// Its own (empty) Suspense boundary: without a `loading`, the first open suspends up to the
// nearest one above (the archive, the page) and blanks it while the chunk loads, losing the scroll
const CARD_SIZES = "(max-width: 767px) 80vw, 1px";

const Lightbox = dynamic(() => import("./[slug]/Lightbox"), { loading: () => null });

/**
 * The story on phones: one card per year, swiped sideways (the vertical rail nested a scroller
 * inside the page, which fought the thumb). Year chips under it jump anywhere; the card in view is
 * lit, its neighbours wait half-faded at the edges.
 */
export default function StoryCarousel({ markers }: { markers: LifelineMarker[] }) {
  const [api, setApi] = useState<CarouselApi>();
  const [current, setCurrent] = useState(0);
  const [photos, setPhotos] = useState<{ list: GalleryPhoto[]; index: number; title: string } | null>(null);
  const chips = useRef<HTMLOListElement>(null);

  useEffect(() => {
    if (!api) return;
    const onSelect = () => setCurrent(api.selectedScrollSnap());
    onSelect();
    api.on("select", onSelect);
    return () => {
      api.off("select", onSelect);
    };
  }, [api]);

  // The chip of the year in view stays centered in its row. Only the row scrolls: scrollIntoView
  // also scrolled the page, which jumped to the story on load and fought links into the archive
  useEffect(() => {
    const row = chips.current;
    const chip = row?.children[current] as HTMLElement | undefined;
    if (!row || !chip) return;
    row.scrollTo({ left: chip.offsetLeft - (row.clientWidth - chip.offsetWidth) / 2, behavior: "smooth" });
  }, [current]);

  return (
    <div className="flex flex-col gap-4">
      <Carousel opts={{ align: "start", containScroll: "trimSnaps" }} setApi={setApi}>
        <CarouselContent className="-ml-3 px-5">
          {markers.map((marker, index) => {
            const gallery: GalleryPhoto[] = (marker.photos ?? []).map((photo) => ({
              tile: { src: photo.src, srcSet: photo.srcSet, sizes: CARD_SIZES },
              full: { src: photo.src, srcSet: photo.srcSet, sizes: "100vw" },
              alt: photo.alt,
            }));
            return (
              <CarouselItem key={marker.id} className="basis-[86%] items-start justify-start pl-3">
                <m.article
                  animate={{ opacity: current === index ? 1 : 0.65, scale: current === index ? 1 : 0.96 }}
                  className="flex w-full flex-col gap-4 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5"
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                >
                  <header className="flex items-end justify-between gap-3">
                    <h3 className="font-title text-4xl font-extrabold tracking-tight text-white">
                      {marker.label ?? marker.year}
                    </h3>
                    <span className="pb-1 font-terminal text-[12px] text-zinc-300">{marker.age}</span>
                  </header>
                  {marker.badges?.length ? (
                    <div className="flex gap-2">
                      {marker.badges.map((badge) => (
                        <img
                          key={badge.src}
                          alt={badge.alt}
                          className="size-7 rounded-md bg-white object-contain"
                          src={badge.src}
                        />
                      ))}
                    </div>
                  ) : null}
                  <div className="flex flex-col gap-3 text-[15px] leading-relaxed text-zinc-300">
                    {marker.events.map((line, i) => (
                      <p key={i}>
                        {(Array.isArray(line) ? line : [{ type: "text" as const, value: String(line) }]).map(
                          (segment, j) =>
                            segment.type === "link" ? (
                              <Link
                                key={j}
                                className="text-white underline decoration-yellow-400/50 underline-offset-4"
                                href={segment.href}
                              >
                                {segment.value}
                              </Link>
                            ) : (
                              <span key={j}>{segment.value}</span>
                            )
                        )}
                      </p>
                    ))}
                  </div>
                  {gallery.length ? (
                    <div className={cn("grid gap-2", gallery.length > 1 ? "grid-cols-2" : "grid-cols-1")}>
                      {gallery.map((photo, i) => (
                        <button
                          key={photo.tile.src}
                          aria-label={`Ver la foto: ${photo.alt}`}
                          className="aspect-[4/3] overflow-hidden rounded-xl bg-zinc-900"
                          onClick={() =>
                            setPhotos({ list: gallery, index: i, title: String(marker.label ?? marker.year) })
                          }
                          type="button"
                        >
                          <img
                            alt={photo.alt}
                            className="size-full object-cover"
                            decoding="async"
                            loading="lazy"
                            sizes={CARD_SIZES}
                            src={photo.tile.src}
                            srcSet={photo.tile.srcSet}
                          />
                        </button>
                      ))}
                    </div>
                  ) : null}
                </m.article>
              </CarouselItem>
            );
          })}
        </CarouselContent>
      </Carousel>

      <div className="flex items-center gap-2 px-5">
        <button
          aria-label="Año anterior"
          className="flex size-9 shrink-0 items-center justify-center rounded-full border border-white/10 text-zinc-200 disabled:opacity-40"
          disabled={current === 0}
          onClick={() => api?.scrollPrev()}
          type="button"
        >
          <ChevronLeft className="size-4" />
        </button>
        <ol
          ref={chips}
          // Positioned: the chips measure their offsets from it
          className="relative flex min-w-0 flex-1 [scrollbar-width:none] gap-1 overflow-x-auto [&::-webkit-scrollbar]:hidden"
        >
          {markers.map((marker, index) => (
            <li key={marker.id}>
              <button
                aria-current={current === index ? "true" : undefined}
                className={cn(
                  "relative rounded-full px-2.5 py-1 font-terminal text-[12px] tabular-nums transition-colors",
                  current === index ? "text-zinc-950" : "text-zinc-400"
                )}
                onClick={() => api?.scrollTo(index)}
                type="button"
              >
                {current === index ? (
                  <m.span
                    layoutId="story-chip"
                    className="absolute inset-0 rounded-full bg-yellow-400"
                    transition={{ type: "spring", stiffness: 500, damping: 40 }}
                  />
                ) : null}
                <span className="relative">{marker.label ?? marker.year}</span>
              </button>
            </li>
          ))}
        </ol>
        <button
          aria-label="Año siguiente"
          className="flex size-9 shrink-0 items-center justify-center rounded-full border border-white/10 text-zinc-200 disabled:opacity-40"
          disabled={current === markers.length - 1}
          onClick={() => api?.scrollNext()}
          type="button"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>

      {photos ? (
        <Lightbox
          index={photos.index}
          onChange={(index) => setPhotos(index === null ? null : { ...photos, index })}
          photos={photos.list}
          title={photos.title}
        />
      ) : null}
    </div>
  );
}
