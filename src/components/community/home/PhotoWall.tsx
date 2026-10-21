"use client";

import { motion, useInView, useReducedMotion } from "motion/react";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";

import { cn } from "app/lib/utils";
import { EASE_OUT, Reveal } from "components/community/motion";

/*
 * The people, before anything else: a wall of photos from the last meetups.
 * The big cell shows the room; the rest show the moments. Every couple of
 * seconds one cell crossfades to the next photo, so the whole archive gets
 * seen without anyone scrolling. It rests while hovered, off screen, or when
 * the visitor asked for reduced motion.
 */

type Photo = { src: string; alt: string; caption: string };

const gallery = (n: string) => `/images/conf/gallery/${n}.webp`;
const intro = (n: number) => `/images/2025/intro/${n}.webp`;

/** Full-room shots that hold up at the biggest size */
const CROWD: Photo[] = [
  { src: gallery("tangram-1"), alt: "Toda la sala de La Meetup III con los brazos en alto para la foto grupal", caption: "La Meetup III · Nov 2025" },
  { src: intro(8), alt: "Foto grupal de La Meetup 2024 con toda la sala", caption: "La Meetup 2024" },
  { src: gallery("momento-02"), alt: "El público colmando la sala principal durante la apertura", caption: "Sala llena en la apertura" },
  { src: gallery("tangram-2"), alt: "Un grupo de asistentes sacándose una selfie con la sala detrás", caption: "La selfie de rigor" },
  { src: intro(4), alt: "Una ronda de gente sentada en círculo armando la grilla del open space", caption: "La ronda del open space" },
  { src: gallery("momento-09"), alt: "Foto grupal de los asistentes a La Meetup III", caption: "Los que se quedaron hasta el final" },
];

/** The moments; the first ones are what the page opens with */
const MOMENTS: Photo[] = [
  { src: gallery("momento-15"), alt: "Cuatro asistentes compartiendo una mesa y riéndose durante el after", caption: "El after" },
  { src: gallery("tangram-4"), alt: "Tres asistentes brindando y riéndose entre charlas", caption: "Entre charlas" },
  { src: intro(5), alt: "Una mano sosteniendo la credencial de La Meetup en la entrada", caption: "La entrada es gratis" },
  { src: intro(1), alt: "Asistentes charlando en grupos en la entrada del venue antes de las charlas", caption: "Networking" },
  { src: gallery("tangram-6"), alt: "La mesa llena de stickers de las comunidades de OWU", caption: "Stickers" },
  { src: intro(3), alt: "La grilla del open space armada con post-its sobre una pizarra", caption: "La grilla del open space" },
  { src: gallery("tangram-7"), alt: "El equipo organizador celebrando frente al cartel de La Meetup III", caption: "El equipo que lo hace posible" },
  { src: gallery("momento-13"), alt: "El público disfrutando del evento al atardecer", caption: "Charlas al atardecer" },
  { src: gallery("momento-26"), alt: "Asistentes conversando en los sillones durante la pausa", caption: "Charla de pasillo" },
  { src: gallery("momento-20"), alt: "Dúo de speakers presentando su charla en comunidad", caption: "Charla a dúo" },
  { src: gallery("tangram-5"), alt: "Una speaker sonriendo frente a la pantalla de su charla", caption: "Speakers de la comunidad" },
  { src: gallery("momento-12"), alt: "Mesa de acreditación con stickers de la comunidad", caption: "Stickers para todos" },
  { src: gallery("momento-30"), alt: "Grupos de asistentes charlando de pie en las afueras del venue", caption: "Networking afuera" },
  { src: gallery("momento-14"), alt: "El equipo organizador celebrando sobre el escenario", caption: "El equipo" },
  { src: gallery("momento-16"), alt: "El equipo organizador en la foto final del evento", caption: "La foto del equipo" },
  { src: gallery("momento-18"), alt: "El tablero del open space proyectado en pantalla", caption: "Open space en pantalla" },
  { src: gallery("momento-28"), alt: "Dos speakers compartiendo el escenario", caption: "Dos speakers, un escenario" },
  { src: gallery("momento-29"), alt: "El público siguiendo las charlas de la tarde", caption: "Las charlas de la tarde" },
  { src: gallery("momento-04"), alt: "Asistentes siguiendo una charla con atención", caption: "Público atento" },
  { src: gallery("momento-19"), alt: "Un speaker a puro micrófono sobre el escenario", caption: "A puro micrófono" },
  { src: gallery("momento-22"), alt: "Charla sobre bioimplantes con visuales en pantalla", caption: "Charla sobre bioimplantes" },
  { src: gallery("momento-06"), alt: "Cierre del evento con el logo de OWU en pantalla", caption: "El cierre" },
  { src: gallery("momento-01"), alt: "Charla de apertura en el escenario principal de La Meetup III", caption: "La apertura" },
  { src: gallery("momento-07"), alt: "Presentación en el escenario de La Meetup III", caption: "Sobre el escenario" },
  { src: gallery("momento-08"), alt: "Facilitación del Mercado de Ideas en el escenario", caption: "Mercado de ideas" },
  { src: gallery("momento-17"), alt: "Una speaker abriendo su charla desde el podio", caption: "Desde el podio" },
  { src: gallery("momento-21"), alt: "Presentación de una charla desde el podio de speakers", caption: "Presentando" },
  { src: intro(7), alt: "Un speaker en el escenario de La Meetup 2024 junto al globo de Owy", caption: "Owy en escena" },
  { src: intro(6), alt: "Owy, la mascota de OWU, flotando sobre el escenario de La Meetup 2024", caption: "Owy, la mascota" },
  { src: intro(9), alt: "El equipo organizador abrazado frente al cartel de La Meetup", caption: "El equipo de 2024" },
  { src: gallery("tangram-3"), alt: "Un speaker señalando la pantalla durante su charla", caption: "Desde el escenario" },
  { src: gallery("momento-05"), alt: "El público participando de una sesión", caption: "Preguntas del público" },
];

// The container is 1152px wide at most; each cell is a fraction of it on desktop
const SPAN = {
  3: { cell: "lg:col-span-3", sizes: "(min-width: 1152px) 288px, (min-width: 1024px) 25vw, 50vw" },
  4: { cell: "lg:col-span-4", sizes: "(min-width: 1152px) 384px, (min-width: 1024px) 33vw, 100vw" },
  6: { cell: "lg:col-span-6", sizes: "(min-width: 1152px) 576px, (min-width: 1024px) 50vw, 100vw" },
};

type Cell = { span: keyof typeof SPAN; crowd?: boolean; className?: string };

// Desktop: the room over two rows with four moments beside it, three wide ones, four more.
// Phones: the room, six moments in pairs, the team across the bottom.
const CELLS: Cell[] = [
  { span: 6, crowd: true, className: "col-span-2 aspect-[16/10] lg:row-span-2" },
  { span: 3 },
  { span: 3 },
  { span: 3 },
  { span: 3 },
  { span: 4 },
  { span: 4 },
  { span: 4, className: "col-span-2 aspect-[16/9]" },
  { span: 3, className: "hidden lg:block" },
  { span: 3, className: "hidden lg:block" },
  { span: 3, className: "hidden lg:block" },
  { span: 3, className: "hidden lg:block" },
];

// Cells take their turn in this order, so swaps hop around instead of sweeping
const ORDER = [2, 7, 0, 5, 10, 3, 8, 1, 11, 6, 4, 9];
const TICK_MS = 2400;

const initial = (): Photo[] => {
  let next = 0;

  return CELLS.map((cell) => (cell.crowd ? CROWD[0] : MOMENTS[next++]));
};

type Layer = Photo & { fade: boolean };

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
    <motion.div
      animate={{ opacity: ready ? 1 : 0 }}
      className="absolute inset-0"
      initial={false}
      transition={{ duration: 0.9, ease: EASE_OUT }}
      onAnimationComplete={() => ready && onSettled()}
    >
      <Image
        ref={ref}
        alt={layer.alt}
        className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04] motion-reduce:transition-none"
        fill
        sizes={sizes}
        src={layer.src}
        onError={onFailed}
        onLoad={show}
      />
    </motion.div>
  );
}

function Tile({ photo, sizes }: { photo: Photo; sizes: string }) {
  const [layers, setLayers] = useState<Layer[]>([{ ...photo, fade: false }]);
  const [caption, setCaption] = useState(photo.caption);

  useEffect(() => {
    setLayers((current) => (current[current.length - 1]?.src === photo.src ? current : [...current.slice(-1), { ...photo, fade: true }]));
  }, [photo]);

  return (
    <figure className="group relative h-full overflow-hidden rounded-2xl bg-white/[0.04]">
      {layers.map((layer) => (
        <PhotoLayer
          key={layer.src}
          layer={layer}
          sizes={sizes}
          onFailed={() => setLayers((current) => (current.length > 1 ? current.filter((item) => item.src !== layer.src) : current))}
          onReady={() => setCaption(layer.caption)}
          onSettled={() => setLayers((current) => current.slice(-1))}
        />
      ))}
      <figcaption className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-zinc-950/75 via-zinc-950/20 to-transparent px-4 pt-14 pb-3.5 text-[13px] font-medium text-white sm:text-sm">
        {caption}
      </figcaption>
    </figure>
  );
}

export default function PhotoWall({ className }: { className?: string }) {
  const [shown, setShown] = useState<Photo[]>(initial);
  const [hovered, setHovered] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.15 });
  const reduceMotion = useReducedMotion();
  const cursors = useRef({ crowd: 1, moments: CELLS.length - 1, turn: 0 });
  const shownRef = useRef(shown);
  shownRef.current = shown;

  useEffect(() => {
    if (!inView || hovered || reduceMotion) return;

    const id = setInterval(() => {
      const state = cursors.current;
      const cell = ORDER[state.turn++ % ORDER.length]!;
      const pool = CELLS[cell]!.crowd ? CROWD : MOMENTS;
      const key = CELLS[cell]!.crowd ? "crowd" : "moments";
      // The next photo in line that no cell is showing right now
      let candidate = pool[state[key]++ % pool.length]!;
      for (let tries = 0; tries < pool.length && shownRef.current.some((photo) => photo.src === candidate.src); tries++) {
        candidate = pool[state[key]++ % pool.length]!;
      }
      setShown((current) => current.map((photo, index) => (index === cell ? candidate : photo)));
    }, TICK_MS);

    return () => clearInterval(id);
  }, [inView, hovered, reduceMotion]);

  return (
    <div
      ref={ref}
      className={cn("grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-12 lg:auto-rows-[200px] xl:auto-rows-[220px]", className)}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
    >
      {CELLS.map(({ span, className: cell }, index) => (
        <Reveal key={index} className={cn("aspect-[4/3] lg:aspect-auto", SPAN[span].cell, cell)} delay={index * 0.05}>
          <Tile photo={shown[index]!} sizes={SPAN[span].sizes} />
        </Reveal>
      ))}
    </div>
  );
}
