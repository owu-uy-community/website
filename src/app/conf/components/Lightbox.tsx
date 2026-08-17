"use client";

import { useEffect } from "react";
import { flushSync } from "react-dom";

export type LightboxPhoto = {
  src: string;
  alt: string;
};

/* Shared morph name (see ::view-transition-group in globals.css) */
const VT_NAME = "lightbox-photo";

/* Runs the state change inside a View Transition when the browser supports it */
export function withViewTransition(update: () => void) {
  if (!document.startViewTransition) {
    update();

    return;
  }

  document.startViewTransition(() => {
    flushSync(update);
  });
}

/* The clicked thumbnail "flies" into the lightbox */
export function openWithMorph(thumb: HTMLImageElement | null, update: () => void) {
  if (thumb && document.startViewTransition) {
    thumb.style.viewTransitionName = VT_NAME;
    document.startViewTransition(() => {
      flushSync(update);
      thumb.style.viewTransitionName = "";
    });

    return;
  }

  update();
}

function DownloadIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4" viewBox="0 0 24 24">
      <path d="M12 3v12m0 0 5-5m-5 5-5-5M4 21h16" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

type LightboxProps = {
  photos: LightboxPhoto[];
  /** Active index, or null when closed */
  index: number | null;
  /** Download filename prefix, e.g. "la-meetup-iii-momento" */
  downloadPrefix: string;
  onClose: () => void;
  onStep: (delta: number) => void;
};

export default function Lightbox({ photos, index, downloadPrefix, onClose, onStep }: LightboxProps) {
  const open = index !== null;

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowRight") onStep(1);
      if (event.key === "ArrowLeft") onStep(-1);
    };

    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [open, onClose, onStep]);

  if (index === null) return null;

  const photo = photos[index];

  return (
    <div
      aria-label={photo.alt}
      aria-modal="true"
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/90 backdrop-blur-xs animate-[lightbox-fade-in_250ms_ease-out]"
      role="dialog"
      onClick={onClose}
    >
      <figure
        className="flex max-h-[100dvh] w-full max-w-[1200px] flex-col items-center justify-center gap-5 px-14 py-6 sm:px-20"
        onClick={(event) => event.stopPropagation()}
      >
        <img
          alt={photo.alt}
          className="max-h-[74dvh] w-auto max-w-full select-none object-contain"
          src={photo.src}
          style={{ viewTransitionName: VT_NAME }}
        />
        <figcaption className="flex w-full flex-col items-center gap-4 text-center sm:flex-row sm:justify-between sm:text-left">
          <span className="max-w-[560px] text-sm leading-relaxed text-[#FBF5E7]/85 sm:text-base">
            {photo.alt}
            <span className="mt-1 block font-display text-xs font-semibold uppercase tracking-[0.18em] text-[#FBF5E7]/50">
              La Meetup III · {String(index + 1).padStart(2, "0")} / {photos.length}
            </span>
          </span>
          <a
            className="inline-flex h-11 shrink-0 items-center gap-2.5 rounded-full bg-[#F5BB03] px-6 font-display text-sm font-bold uppercase leading-none text-black transition-colors hover:bg-[#FBF5E7] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#F5BB03]"
            download={`${downloadPrefix}-${String(index + 1).padStart(2, "0")}.webp`}
            href={photo.src}
          >
            <DownloadIcon />
            Descargar
          </a>
        </figcaption>
      </figure>

      <button
        aria-label="Cerrar foto"
        className="absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-full border border-[#FBF5E7]/25 text-[#FBF5E7] transition-colors hover:border-[#F5BB03] hover:text-[#F5BB03] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#F5BB03] sm:right-6 sm:top-6"
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onClose();
        }}
      >
        <svg aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
          <path d="m6 6 12 12M18 6 6 18" strokeLinecap="round" />
        </svg>
      </button>

      <button
        aria-label="Foto anterior"
        className="absolute left-2 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center transition-transform hover:-translate-x-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#F5BB03] sm:left-5"
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onStep(-1);
        }}
      >
        <svg aria-hidden="true" className="h-6 w-4" fill="none" viewBox="0 0 10 16">
          <polygon fill="#F5BB03" points="10,0 10,16 0,8" />
        </svg>
      </button>
      <button
        aria-label="Foto siguiente"
        className="absolute right-2 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center transition-transform hover:translate-x-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#F5BB03] sm:right-5"
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onStep(1);
        }}
      >
        <svg aria-hidden="true" className="h-6 w-4 rotate-180" fill="none" viewBox="0 0 10 16">
          <polygon fill="#F5BB03" points="10,0 10,16 0,8" />
        </svg>
      </button>
    </div>
  );
}
