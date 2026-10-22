"use client";

import { Maximize2, Shuffle } from "lucide-react";
import { motion, useInView, useReducedMotion } from "motion/react";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";

import { cn } from "app/lib/utils";
import { EASE_OUT, Reveal } from "components/community/motion";
import { buttonClassName, Section } from "components/community/ui";

import PhotoLightbox from "./PhotoLightbox";
import { EVENTS, PHOTOS, type Photo } from "./photos";

/*
 * The people, before anything else: a wall of photos that fits one screen.
 * Four columns that end on the same line, the first one wider and opening with
 * the room. Every couple of seconds one cell crossfades to a photo nobody is
 * showing, so the whole archive gets seen; "Mezclar" does the whole wall at
 * once. Any cell opens the lightbox. The wall rests while hovered, off screen,
 * behind the lightbox, or when the visitor asked for reduced motion.
 */

const ROOMS = PHOTOS.filter((photo) => photo.room);
const MOMENTS = PHOTOS.filter((photo) => !photo.room);

type Weight = 3 | 4 | 5 | 7;

// Each number is a cell's share of its column; phones show the first two columns
const COLUMNS: { phone: boolean; cells: Weight[] }[] = [
  { phone: true, cells: [7, 5] },
  { phone: true, cells: [4, 5, 3] },
  { phone: false, cells: [5, 3, 4] },
  { phone: false, cells: [3, 4, 5] },
];
const WEIGHT: Record<Weight, string> = { 3: "lg:flex-3", 4: "lg:flex-4", 5: "lg:flex-5", 7: "lg:flex-7" };
const CELL_COUNT = COLUMNS.reduce((count, column) => count + column.cells.length, 0);

// The container is 1152px wide at most; the first column takes a third of it
const SIZES = {
  room: "(min-width: 1152px) 384px, (min-width: 1024px) 33vw, 100vw",
  wide: "(min-width: 1152px) 384px, (min-width: 1024px) 33vw, 50vw",
  rest: "(min-width: 1152px) 256px, (min-width: 1024px) 22vw, 50vw",
};

// Cells take their turn in this order, so swaps hop around instead of sweeping
const ORDER = [3, 8, 0, 5, 10, 2, 7, 1, 9, 6, 4];
const TICK_MS = 2400;

const initial = (): Photo[] =>
  Array.from({ length: CELL_COUNT }, (_, index) => (index === 0 ? ROOMS[0]! : MOMENTS[index - 1]!));

type Layer = { photo: Photo; fade: boolean };

/** One photo in a cell; a late layer waits until loaded, then fades in over the one below */
function PhotoLayer({
  layer,
  sizes,
  onReady,
  onSettled,
  onFailed,
}: {
  layer: Layer;
  sizes: string;
  onReady: () => void;
  onSettled: () => void;
  onFailed: () => void;
}) {
  const [ready, setReady] = useState(!layer.fade);
  const ref = useRef<HTMLImageElement>(null);
  const show = () => {
    setReady(true);
    onReady();
  };

  useEffect(() => {
    if (ref.current?.complete && ref.current.naturalWidth > 0) show();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <motion.span
      animate={{ opacity: ready ? 1 : 0 }}
      className="absolute inset-0 block"
      initial={false}
      transition={{ duration: 0.9, ease: EASE_OUT }}
      onAnimationComplete={() => ready && onSettled()}
    >
      <Image
        ref={ref}
        alt={layer.photo.alt}
        className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04] motion-reduce:transition-none"
        fill
        sizes={sizes}
        src={layer.photo.src}
        style={layer.photo.focus ? { objectPosition: layer.photo.focus } : undefined}
        onError={onFailed}
        onLoad={show}
      />
    </motion.span>
  );
}

/** A cell: the photo, its title, and on hover the event line and a zoom button */
function Tile({ photo, sizes, onOpen }: { photo: Photo; sizes: string; onOpen: (photo: Photo) => void }) {
  const [layers, setLayers] = useState<Layer[]>([{ photo, fade: false }]);
  // The photo whose title shows: it switches the moment the next one starts to appear
  const [current, setCurrent] = useState(photo);

  useEffect(() => {
    setLayers((stack) =>
      stack[stack.length - 1]?.photo.src === photo.src ? stack : [...stack.slice(-1), { photo, fade: true }]
    );
  }, [photo]);

  return (
    <button
      aria-label={`Ampliar foto: ${current.caption}`}
      className="group relative block h-full w-full cursor-zoom-in overflow-hidden rounded-2xl bg-white/[0.04] text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yellow-400"
      type="button"
      onClick={() => onOpen(current)}
    >
      {layers.map((layer) => (
        <PhotoLayer
          key={layer.photo.src}
          layer={layer}
          sizes={sizes}
          onFailed={() =>
            setLayers((stack) =>
              stack.length > 1 ? stack.filter((item) => item.photo.src !== layer.photo.src) : stack
            )
          }
          onReady={() => setCurrent(layer.photo)}
          onSettled={() => setLayers((stack) => stack.slice(-1))}
        />
      ))}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-white/[0.08] ring-inset"
      />
      <span className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 bg-gradient-to-t from-zinc-950/85 via-zinc-950/30 to-transparent p-3.5 pt-14 sm:p-4">
        <span className="min-w-0">
          <span className="line-clamp-2 font-title text-[14px] leading-tight font-semibold text-white sm:text-[15px]">
            {current.caption}
          </span>
          <span className="grid grid-rows-[0fr] transition-[grid-template-rows] duration-300 group-hover:grid-rows-[1fr] group-focus-visible:grid-rows-[1fr]">
            <span className="block min-h-0 overflow-hidden text-[12px] text-zinc-300">
              <span className="block pt-0.5">{EVENTS[current.event]}</span>
            </span>
          </span>
        </span>
        <span className="flex size-8 shrink-0 translate-y-1 items-center justify-center rounded-full bg-yellow-400 text-zinc-950 opacity-0 transition-[opacity,transform] duration-300 group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100">
          <Maximize2 aria-hidden className="size-3.5" />
        </span>
      </span>
    </button>
  );
}

export default function PhotoWall() {
  const [shown, setShown] = useState<Photo[]>(initial);
  const [active, setActive] = useState<number | null>(null);
  const [hovered, setHovered] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.15 });
  const reduceMotion = useReducedMotion();
  const cursors = useRef({ room: 1, moment: CELL_COUNT - 1, turn: 0 });
  const timers = useRef<number[]>([]);
  const opener = useRef<HTMLElement | null>(null);
  const shownRef = useRef(shown);
  shownRef.current = shown;

  /** Gives a cell the next photo in its line that no cell is showing right now */
  const advance = useCallback((cell: number) => {
    const state = cursors.current;
    const pool = cell === 0 ? ROOMS : MOMENTS;
    const key = cell === 0 ? "room" : "moment";
    let candidate = pool[state[key]++ % pool.length]!;

    for (let tries = 0; tries < pool.length && shownRef.current.some((photo) => photo.src === candidate.src); tries++) {
      candidate = pool[state[key]++ % pool.length]!;
    }
    setShown((current) => current.map((photo, index) => (index === cell ? candidate : photo)));
  }, []);

  const paused = !inView || hovered || reduceMotion || active !== null;

  useEffect(() => {
    if (paused) return;

    const id = setInterval(() => advance(ORDER[cursors.current.turn++ % ORDER.length]!), TICK_MS);

    return () => clearInterval(id);
  }, [paused, advance]);

  useEffect(() => () => timers.current.forEach((timer) => clearTimeout(timer)), []);

  const shuffle = () => {
    timers.current.forEach((timer) => clearTimeout(timer));
    timers.current = ORDER.map((cell, i) => window.setTimeout(() => advance(cell), i * 70));
  };

  const openAt = useCallback((photo: Photo) => {
    opener.current = document.activeElement as HTMLElement | null;
    setActive(Math.max(0, PHOTOS.indexOf(photo)));
  }, []);
  const close = useCallback(() => {
    setActive(null);
    requestAnimationFrame(() => opener.current?.focus());
  }, []);
  const step = useCallback((delta: number) => {
    setActive((current) => (current === null ? current : (current + delta + PHOTOS.length) % PHOTOS.length));
  }, []);

  let cell = 0;

  return (
    <Section
      actions={
        <>
          <button className={buttonClassName("secondary", "sm")} type="button" onClick={shuffle}>
            <Shuffle aria-hidden className="size-4" />
            Mezclar
          </button>
          <button className={buttonClassName("secondary", "sm")} type="button" onClick={() => openAt(PHOTOS[0]!)}>
            <Maximize2 aria-hidden className="size-4" />
            Ver las {PHOTOS.length}
          </button>
        </>
      }
      description="Meetups gratis, charlas, open space, stickers y after. Gente que viene a aprender y se queda por la gente."
      id="gente"
      title="Esto pasa cuando nos juntamos"
    >
      <div
        ref={ref}
        className="grid grid-cols-2 gap-2 sm:gap-3 lg:h-[clamp(420px,calc(100svh-22rem),620px)] lg:grid-cols-[1.5fr_1fr_1fr_1fr]"
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
      >
        {COLUMNS.map((column, c) => (
          <div
            key={c}
            className={cn("lg:flex lg:h-full lg:min-h-0 lg:flex-col lg:gap-3", column.phone ? "contents" : "hidden")}
          >
            {column.cells.map((weight) => {
              const index = cell++;
              const room = index === 0;

              return (
                <Reveal
                  key={index}
                  className={cn(
                    "min-h-0",
                    WEIGHT[weight],
                    room ? "col-span-2 aspect-[16/10]" : "aspect-[4/3]",
                    "lg:aspect-auto"
                  )}
                  delay={index * 0.04}
                >
                  <Tile
                    photo={shown[index]!}
                    sizes={room ? SIZES.room : c === 0 ? SIZES.wide : SIZES.rest}
                    onOpen={openAt}
                  />
                </Reveal>
              );
            })}
          </div>
        ))}
      </div>

      <PhotoLightbox index={active} photos={PHOTOS} onClose={close} onStep={step} />
    </Section>
  );
}
