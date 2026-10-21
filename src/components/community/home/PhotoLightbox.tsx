"use client";

import { ChevronLeft, ChevronRight, Download, ExternalLink, X, ZoomIn, ZoomOut } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { cn } from "app/lib/utils";
import { EASE_OUT } from "components/community/motion";
import { buttonClassName } from "components/community/ui";

import { EVENTS, fileName, type Photo } from "./photos";

/*
 * The archive one photo at a time: arrows, keys or a swipe to move, a click to
 * see the real pixels (then drag to pan), the original in a new tab, a
 * download, and a filmstrip to jump anywhere. It lives on <body> so no
 * transformed ancestor can trap it.
 */

const pad = (n: number) => String(n).padStart(2, "0");
const tool = buttonClassName("secondary", "sm", "px-3");
const arrow =
  "absolute top-1/2 z-10 flex size-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-zinc-950/60 text-zinc-200 backdrop-blur-md transition-colors hover:border-white/20 hover:text-white";

export default function PhotoLightbox({
  photos,
  index,
  onClose,
  onStep,
}: {
  photos: Photo[];
  /** Active photo, or null when closed */
  index: number | null;
  onClose: () => void;
  onStep: (delta: number) => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const reduceMotion = useReducedMotion();
  const closeRef = useRef<HTMLButtonElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  // Where a pointer went down and whether it travelled: a drag pans or swipes, a tap clicks
  const pointer = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const open = index !== null;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      else if (event.key === "ArrowRight") onStep(1);
      else if (event.key === "ArrowLeft") onStep(-1);
    };

    document.addEventListener("keydown", onKey);
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [open, onClose, onStep]);

  // Each photo opens unzoomed, with its thumbnail in view and its neighbours warming up
  useEffect(() => {
    if (index === null) return;

    setZoomed(false);
    stripRef.current?.children[index]?.scrollIntoView({ inline: "center", block: "nearest", behavior: reduceMotion ? "auto" : "smooth" });
    for (const delta of [1, -1]) {
      const neighbour = photos[(index + delta + photos.length) % photos.length];

      if (neighbour) new window.Image().src = neighbour.src;
    }
  }, [index, photos, reduceMotion]);

  // Zooming in lands on the middle of the photo
  useEffect(() => {
    const stage = stageRef.current;

    if (!zoomed || !stage) return;

    stage.scrollTo({ left: (stage.scrollWidth - stage.clientWidth) / 2, top: (stage.scrollHeight - stage.clientHeight) / 2 });
  }, [zoomed]);

  if (!mounted) return null;

  const photo = index === null ? undefined : photos[index];

  return createPortal(
    <AnimatePresence>
      {photo && index !== null ? (
        <motion.div
          key="lightbox"
          animate={{ opacity: 1 }}
          aria-label={photo.alt}
          aria-modal="true"
          className="fixed inset-0 z-[110] flex flex-col bg-zinc-950/95 text-zinc-50 backdrop-blur-sm"
          exit={{ opacity: 0 }}
          initial={{ opacity: 0 }}
          role="dialog"
          transition={{ duration: 0.2 }}
        >
          {/* ------------------------------------------------------------ bar */}
          <div className="flex items-center justify-between gap-4 px-4 py-3 sm:px-6">
            <div className="min-w-0">
              <p className="truncate font-title text-[15px] font-semibold text-white sm:text-base">{photo.caption}</p>
              <p className="mt-0.5 flex min-w-0 items-center gap-2.5 text-[13px] text-zinc-400">
                <span className="truncate">{EVENTS[photo.event]}</span>
                <span className="shrink-0 font-terminal text-xs whitespace-nowrap text-zinc-500 tabular-nums">
                  {pad(index + 1)} / {pad(photos.length)}
                </span>
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
              <button aria-label={zoomed ? "Alejar" : "Acercar"} className={tool} type="button" onClick={() => setZoomed((current) => !current)}>
                {zoomed ? <ZoomOut aria-hidden className="size-4" /> : <ZoomIn aria-hidden className="size-4" />}
                <span className="hidden sm:inline">{zoomed ? "Alejar" : "Acercar"}</span>
              </button>
              <a aria-label="Abrir la foto original en otra pestaña" className={tool} href={photo.src} rel="noopener" target="_blank">
                <ExternalLink aria-hidden className="size-4" />
                <span className="hidden sm:inline">Original</span>
              </a>
              <a aria-label="Descargar la foto" className={tool} download={fileName(photo)} href={photo.src}>
                <Download aria-hidden className="size-4" />
                <span className="hidden sm:inline">Descargar</span>
              </a>
              <button ref={closeRef} aria-label="Cerrar" className={buttonClassName("secondary", "sm", "w-9 px-0")} type="button" onClick={onClose}>
                <X aria-hidden className="size-4" />
              </button>
            </div>
          </div>

          {/* ---------------------------------------------------------- stage */}
          <div className="relative min-h-0 flex-1">
            <div
              ref={stageRef}
              className={cn("h-full w-full overflow-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden", zoomed ? "cursor-grab active:cursor-grabbing" : "cursor-zoom-in")}
              onClick={(event) => {
                if (event.target === event.currentTarget || (event.target as HTMLElement).dataset.backdrop) {
                  if (!pointer.current?.moved) onClose();
                }
              }}
              onPointerDown={(event) => {
                pointer.current = { x: event.clientX, y: event.clientY, moved: false };
              }}
              onPointerMove={(event) => {
                const start = pointer.current;

                if (!start || event.buttons !== 1) return;
                if (Math.abs(event.clientX - start.x) > 8 || Math.abs(event.clientY - start.y) > 8) start.moved = true;
                if (zoomed) {
                  event.currentTarget.scrollBy(start.x - event.clientX, start.y - event.clientY);
                  start.x = event.clientX;
                  start.y = event.clientY;
                }
              }}
              onPointerUp={(event) => {
                const start = pointer.current;

                if (start?.moved && !zoomed && Math.abs(event.clientX - start.x) > 48) onStep(event.clientX < start.x ? 1 : -1);
              }}
            >
              <div
                className={cn("flex items-center justify-center p-4 sm:p-6", zoomed ? "h-max min-h-full w-max min-w-full" : "h-full w-full")}
                data-backdrop="true"
              >
                <motion.img
                  key={photo.src}
                  alt={photo.alt}
                  animate={{ opacity: 1 }}
                  className={cn("block select-none", zoomed ? "max-w-none cursor-grab active:cursor-grabbing" : "max-h-[calc(100svh-11rem)] max-w-full object-contain")}
                  draggable={false}
                  initial={reduceMotion ? false : { opacity: 0 }}
                  src={photo.src}
                  transition={{ duration: 0.25, ease: EASE_OUT }}
                  onClick={() => {
                    if (!pointer.current?.moved) setZoomed((current) => !current);
                  }}
                />
              </div>
            </div>

            <button aria-label="Foto anterior" className={cn(arrow, "left-3 sm:left-5")} type="button" onClick={() => onStep(-1)}>
              <ChevronLeft aria-hidden className="size-5" />
            </button>
            <button aria-label="Foto siguiente" className={cn(arrow, "right-3 sm:right-5")} type="button" onClick={() => onStep(1)}>
              <ChevronRight aria-hidden className="size-5" />
            </button>
          </div>

          {/* ------------------------------------------------------ filmstrip */}
          <div ref={stripRef} className="flex shrink-0 gap-1.5 overflow-x-auto px-4 py-3 [scrollbar-width:none] sm:px-6 [&::-webkit-scrollbar]:hidden">
            {photos.map((item, i) => (
              <button
                key={item.src}
                aria-current={i === index ? "true" : undefined}
                aria-label={`Foto ${i + 1}: ${item.caption}`}
                className={cn(
                  "relative h-12 w-16 shrink-0 overflow-hidden rounded-lg transition-[opacity,box-shadow] duration-200",
                  i === index ? "opacity-100 ring-2 ring-yellow-400" : "opacity-50 hover:opacity-100"
                )}
                type="button"
                onClick={() => onStep(i - index)}
              >
                <Image
                  alt=""
                  className="object-cover"
                  fill
                  sizes="64px"
                  src={item.src}
                  style={item.focus ? { objectPosition: item.focus } : undefined}
                />
              </button>
            ))}
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body
  );
}
