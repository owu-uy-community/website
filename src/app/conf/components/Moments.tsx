"use client";

import classNames from "classnames";
import { useCallback, useState } from "react";

import Lightbox, { openWithMorph, withViewTransition, type LightboxPhoto } from "./Lightbox";
import Reveal from "./Reveal";
import SectionHeader from "./SectionHeader";

type Moment = LightboxPhoto;

/* Pro photos from La Meetup III (Nov 2025), in two strips scrolling opposite ways */
const ROW_ONE: Moment[] = [
  { src: "/images/conf/gallery/momento-01.webp", alt: "Charla de apertura en el escenario principal de La Meetup III" },
  { src: "/images/conf/gallery/momento-02.webp", alt: "El público colmando la sala principal durante la apertura" },
  { src: "/images/conf/gallery/momento-03.webp", alt: "Un speaker presentando frente a la pantalla" },
  { src: "/images/conf/gallery/momento-04.webp", alt: "Asistentes siguiendo una charla con atención" },
  { src: "/images/conf/gallery/momento-05.webp", alt: "El público participando de una sesión" },
  { src: "/images/conf/gallery/momento-06.webp", alt: "Cierre del evento con el logo de OWU en pantalla" },
  { src: "/images/conf/gallery/momento-07.webp", alt: "Presentación en el escenario de La Meetup III" },
  { src: "/images/conf/gallery/momento-08.webp", alt: "Facilitación del Mercado de Ideas en el escenario" },
  { src: "/images/conf/gallery/momento-17.webp", alt: "Una speaker abriendo su charla desde el podio" },
  { src: "/images/conf/gallery/momento-18.webp", alt: "El tablero del open space proyectado en pantalla" },
  { src: "/images/conf/gallery/momento-19.webp", alt: "Un speaker a puro micrófono sobre el escenario" },
  { src: "/images/conf/gallery/momento-20.webp", alt: "Dúo de speakers presentando su charla en comunidad" },
  { src: "/images/conf/gallery/momento-21.webp", alt: "Presentación de una charla desde el podio de speakers" },
  { src: "/images/conf/gallery/momento-22.webp", alt: "Charla sobre bioimplantes con visuales en pantalla" },
  { src: "/images/conf/gallery/momento-23.webp", alt: "Cierre de la jornada desde el podio de La Meetup III" },
];

const ROW_TWO: Moment[] = [
  { src: "/images/conf/gallery/momento-09.webp", alt: "Foto grupal de los asistentes a La Meetup III" },
  { src: "/images/conf/gallery/momento-11.webp", alt: "Una asistente registrando el evento con su celular" },
  { src: "/images/conf/gallery/momento-12.webp", alt: "Mesa de acreditación con stickers de la comunidad" },
  { src: "/images/conf/gallery/momento-13.webp", alt: "El público disfrutando del evento al atardecer" },
  { src: "/images/conf/gallery/momento-14.webp", alt: "El equipo organizador celebrando sobre el escenario" },
  { src: "/images/conf/gallery/momento-15.webp", alt: "Asistentes compartiendo la mesa durante el after" },
  { src: "/images/conf/gallery/momento-16.webp", alt: "El equipo organizador en la foto final del evento" },
  { src: "/images/conf/gallery/momento-24.webp", alt: "El escenario de La Meetup III listo antes de abrir" },
  { src: "/images/conf/gallery/momento-25.webp", alt: "Una speaker presentando junto al banner de sponsors" },
  { src: "/images/conf/gallery/momento-26.webp", alt: "Networking entre asistentes durante la pausa" },
  { src: "/images/conf/gallery/momento-27.webp", alt: "El tótem de speakers junto al escenario" },
  { src: "/images/conf/gallery/momento-28.webp", alt: "Dos speakers compartiendo el escenario" },
  { src: "/images/conf/gallery/momento-29.webp", alt: "El público siguiendo las charlas de la tarde" },
  { src: "/images/conf/gallery/momento-30.webp", alt: "La comunidad de after en las afueras del venue" },
];

const MOMENTS: Moment[] = [...ROW_ONE, ...ROW_TWO];

function ZoomIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="#0B0B0B" strokeWidth="2.4" viewBox="0 0 24 24">
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M15.5 15.5 21 21M10.5 7.5v6M7.5 10.5h6" strokeLinecap="round" />
    </svg>
  );
}

type PhotoStripProps = {
  moments: Moment[];
  reverse?: boolean;
  paused: boolean;
  onOpen: (moment: Moment, thumb: HTMLImageElement | null) => void;
};

function PhotoStrip({ moments, reverse = false, paused, onOpen }: PhotoStripProps) {
  return (
    <div className="group/strip w-full overflow-hidden">
      <div
        className={classNames(
          "animate-marquee flex w-max gap-1 [animation-duration:90s] group-hover/strip:[animation-play-state:paused]",
          reverse && "[animation-direction:reverse]",
          paused && "[animation-play-state:paused]"
        )}
      >
        {[...moments, ...moments].map(({ src, alt }, i) => {
          const isClone = i >= moments.length;

          return (
            <button
              key={`${src}-${i}`}
              aria-hidden={isClone || undefined}
              aria-label={`Ampliar foto: ${alt}`}
              className="group/item relative shrink-0 cursor-zoom-in overflow-hidden transition-opacity duration-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#F5BB03] group-hover/strip:opacity-40 hover:!opacity-100"
              tabIndex={isClone ? -1 : undefined}
              type="button"
              onClick={(event) => onOpen({ src, alt }, event.currentTarget.querySelector("img"))}
            >
              <img
                alt={isClone ? "" : alt}
                className="h-[200px] w-auto object-cover transition-transform duration-500 ease-out group-hover/item:scale-105 sm:h-[240px] min-[1440px]:h-[280px]"
                loading="lazy"
                src={src}
              />
<span
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover/item:opacity-100"
              />
              <span
                aria-hidden="true"
                className="pointer-events-none absolute bottom-3 right-3 flex h-8 w-8 translate-y-2 items-center justify-center rounded-full bg-[#F5BB03] opacity-0 transition-all duration-300 group-hover/item:translate-y-0 group-hover/item:opacity-100"
              >
                <ZoomIcon />
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function Moments() {
  const [active, setActive] = useState<number | null>(null);

  const openLightbox = useCallback((moment: Moment, thumb: HTMLImageElement | null) => {
    const index = MOMENTS.findIndex(({ src }) => src === moment.src);

    if (index === -1) return;

    openWithMorph(thumb, () => setActive(index));
  }, []);

  const closeLightbox = useCallback(() => {
    withViewTransition(() => setActive(null));
  }, []);

  const step = useCallback((delta: number) => {
    withViewTransition(() => {
      setActive((current) => (current === null ? current : (current + delta + MOMENTS.length) % MOMENTS.length));
    });
  }, []);

  return (
    <section className="mt-16 w-full scroll-mt-24 sm:mt-24" id="momentos">
      <div className="mx-auto w-full max-w-[1440px] px-8">
        <SectionHeader eyebrow="COMUNIDAD" title="ASÍ SE VIVIÓ LA MEETUP III" />

        <Reveal delay={0.12} y={22}>
          <p className="mt-6 max-w-[640px] text-pretty text-lg leading-relaxed text-[#FBF5E7]/90">
            Charlas, open space, stickers y after: la tercera edición de La Meetup fue la antesala de OWU CONF.
          </p>
        </Reveal>
      </div>

      <div className="mt-10 flex flex-col gap-1 overflow-hidden">
        {/* Each strip enters from the side it will scroll toward */}
        <Reveal amount={0.3} duration={0.9} x={90} y={0}>
          <PhotoStrip moments={ROW_ONE} paused={active !== null} onOpen={openLightbox} />
        </Reveal>
        <Reveal amount={0.3} delay={0.12} duration={0.9} x={-90} y={0}>
          <PhotoStrip reverse moments={ROW_TWO} paused={active !== null} onOpen={openLightbox} />
        </Reveal>
      </div>

      <Lightbox
        downloadPrefix="la-meetup-iii-momento"
        index={active}
        photos={MOMENTS}
        onClose={closeLightbox}
        onStep={step}
      />
    </section>
  );
}
