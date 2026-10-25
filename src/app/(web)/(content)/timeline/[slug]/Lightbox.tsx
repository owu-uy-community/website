"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { ArrowLeft, ArrowRight, ArrowUpRight, X } from "lucide-react";
import { m } from "motion/react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { cn } from "app/lib/utils";

import type { GalleryPhoto } from "./Gallery";

/** A photo, and when it comes from a list of several events (a community's photos), which one */
export type LightboxPhoto = GalleryPhoto & { event?: { title: string; when: string; href: string } };

/**
 * Full-size photos: ←/→ or a swipe to move, Esc to close. The next and previous photos are
 * fetched ahead so moving is instant.
 */
export default function Lightbox({
  photos,
  index,
  onChange,
  title,
}: {
  photos: LightboxPhoto[];
  index: number;
  onChange: (index: number | null) => void;
  title: string;
}) {
  const photo = photos[index];
  const step = (by: number) => onChange((index + by + photos.length) % photos.length);
  const swipe = useRef<number | null>(null);
  const [loaded, setLoaded] = useState<string | null>(null);
  const ready = loaded === photo.full.src;

  useEffect(() => {
    for (const neighbor of [photos[index + 1], photos[index - 1]]) {
      if (!neighbor) continue;
      const image = new window.Image();
      image.sizes = "100vw";
      if (neighbor.full.srcSet) image.srcset = neighbor.full.srcSet;
      image.src = neighbor.full.src;
    }
  }, [photos, index]);

  return (
    <Dialog.Root defaultOpen onOpenChange={(open) => !open && onChange(null)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm" />
        <Dialog.Content
          className="fixed inset-0 z-[100] flex touch-pan-y flex-col items-center justify-center gap-4 p-4 outline-none sm:p-10"
          onKeyDown={(event) => {
            if (event.key === "ArrowRight") step(1);
            if (event.key === "ArrowLeft") step(-1);
          }}
          onPointerDown={(event) => {
            swipe.current = event.clientX;
          }}
          onPointerUp={(event) => {
            if (swipe.current === null) return;
            const dx = event.clientX - swipe.current;
            swipe.current = null;
            if (Math.abs(dx) > 60) step(dx < 0 ? 1 : -1);
          }}
        >
          <Dialog.Title className="sr-only">{title}</Dialog.Title>
          <Dialog.Description className="sr-only">
            Foto {index + 1} de {photos.length}
          </Dialog.Description>
          {/* A fixed box: the caption and the arrows stay still from one photo to the next. The
              tile it was opened from is already in the cache, so it shows at once, softened, and
              the full photo fades in over it */}
          <div className="relative h-[68dvh] w-full sm:h-[76vh]">
            <img
              key={photo.tile.src}
              alt=""
              aria-hidden
              className={cn(
                "absolute inset-0 size-full object-contain blur-[2px] transition-opacity duration-300 select-none",
                ready && "opacity-0"
              )}
              decoding="async"
              draggable={false}
              sizes={photo.tile.sizes}
              src={photo.tile.src}
              srcSet={photo.tile.srcSet}
            />
            <m.img
              key={photo.full.src}
              alt={photo.alt}
              animate={{ opacity: ready ? 1 : 0, scale: ready ? 1 : 0.995 }}
              className="absolute inset-0 size-full object-contain select-none"
              decoding="async"
              draggable={false}
              initial={{ opacity: 0, scale: 0.995 }}
              onLoad={() => setLoaded(photo.full.src)}
              sizes="100vw"
              src={photo.full.src}
              srcSet={photo.full.srcSet}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            />
          </div>
          <div className="flex w-full max-w-4xl flex-wrap items-center justify-between gap-3 text-sm text-zinc-400">
            {photo.event ? (
              <Link
                className="w-full truncate font-medium text-zinc-100 underline decoration-white/20 underline-offset-4 hover:decoration-yellow-400"
                href={photo.event.href}
              >
                {photo.event.title} <span className="font-normal text-zinc-400">· {photo.event.when}</span>
              </Link>
            ) : null}
            <p>
              <span className="font-terminal text-zinc-400 tabular-nums">
                {index + 1}/{photos.length}
              </span>
              {photo.credit ? <span className="ml-3">{photo.credit}</span> : null}
              {photo.license ? <span className="ml-2">· {photo.license}</span> : null}
            </p>
            {photo.page ? (
              <a
                className="inline-flex items-center gap-1 text-zinc-300 underline decoration-white/20 underline-offset-4 hover:decoration-yellow-400"
                href={photo.page}
                rel="noopener noreferrer"
                target="_blank"
              >
                Ver la original <ArrowUpRight aria-hidden className="size-3.5" />
              </a>
            ) : null}
          </div>
          {photos.length > 1 ? (
            <>
              <button
                aria-label="Foto anterior"
                className="absolute top-1/2 left-3 hidden size-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 sm:flex"
                onClick={() => step(-1)}
                type="button"
              >
                <ArrowLeft className="size-5" />
              </button>
              <button
                aria-label="Foto siguiente"
                className="absolute top-1/2 right-3 hidden size-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 sm:flex"
                onClick={() => step(1)}
                type="button"
              >
                <ArrowRight className="size-5" />
              </button>
            </>
          ) : null}
          <Dialog.Close
            aria-label="Cerrar"
            className="absolute top-4 right-4 flex size-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
          >
            <X className="size-5" />
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
