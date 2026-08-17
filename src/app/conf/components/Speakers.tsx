"use client";

import classNames from "classnames";
import { useCallback, useState } from "react";

import { CONF_DATES, INTERNAL_ROUTES } from "app/lib/constants";

import Countdown from "./Countdown";
import Lightbox, { openWithMorph, withViewTransition, type LightboxPhoto } from "./Lightbox";
import PillLink from "./PillLink";
import Reveal from "./Reveal";
import SectionHeader from "./SectionHeader";

/*
 * Speaker mini-gallery from La Meetup III: two vertical columns scrolling opposite
 * ways (the vertical twin of the Moments strips), with top/bottom fade, hover pause
 * and click-to-zoom via the shared lightbox.
 */
const SPEAKER_PHOTOS: LightboxPhoto[] = [
  { src: "/images/conf/speakers/speaker-01.webp", alt: "Conversatorio sobre el escenario de La Meetup III" },
  { src: "/images/conf/speakers/speaker-02.webp", alt: "Un speaker presentando desde el podio de La Meetup III" },
  { src: "/images/conf/speakers/speaker-03.webp", alt: "Un speaker dando su charla frente a la pantalla" },
  { src: "/images/conf/speakers/speaker-04.webp", alt: "Presentación de una charla en La Meetup III" },
  { src: "/images/conf/speakers/speaker-05.webp", alt: "Un speaker compartiendo su historia con la comunidad" },
  { src: "/images/conf/speakers/speaker-06.webp", alt: "Una charla a puro micrófono en La Meetup III" },
  { src: "/images/conf/speakers/speaker-07.webp", alt: "Un speaker presentando junto a la pantalla principal" },
  { src: "/images/conf/speakers/speaker-08.webp", alt: "Una speaker con micrófono en mano durante su charla" },
  { src: "/images/conf/speakers/speaker-09.webp", alt: "Un speaker exponiendo desde el podio" },
  { src: "/images/conf/speakers/speaker-10.webp", alt: "Cierre de una charla en el escenario de La Meetup III" },
];

const GALLERY_COLUMNS: { indexes: number[]; className: string }[] = [
  { indexes: [0, 3, 7, 4, 9], className: "[animation-duration:38s]" },
  { indexes: [1, 6, 8, 2, 5], className: "[animation-direction:reverse] [animation-duration:46s]" },
];

export default function Speakers() {
  const [active, setActive] = useState<number | null>(null);

  const closeLightbox = useCallback(() => {
    withViewTransition(() => setActive(null));
  }, []);

  const step = useCallback((delta: number) => {
    withViewTransition(() => {
      setActive((current) =>
        current === null ? current : (current + delta + SPEAKER_PHOTOS.length) % SPEAKER_PHOTOS.length
      );
    });
  }, []);

  return (
    <section className="mx-auto mt-[29px] w-full max-w-[1440px] scroll-mt-24 px-8 pt-[37px]" id="speakers">
      <SectionHeader eyebrow="CALL FOR SPEAKERS" title="SPEAKERS" />

      <div className="mt-10 flex flex-col items-start gap-12 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-[640px]">
          <Reveal delay={0.1} y={26}>
            <p className="text-balance font-display text-2xl font-extrabold uppercase leading-[1.15] tracking-[-0.02em] text-[#FBF5E7] sm:text-3xl min-[1440px]:text-4xl">
              La grilla se anuncia <span className="text-[#F5BB03]">muy pronto.</span>
            </p>
          </Reveal>
          <Reveal delay={0.22} y={24}>
            <p className="mt-5 text-pretty text-lg leading-relaxed text-[#FBF5E7]/90">
              El escenario de OWU CONF es de la comunidad. Si tenés una historia de tecnología, comunidad u open
              source para contar, este es tu lugar: no importa si nunca diste una charla, te acompañamos a
              prepararla.
            </p>
          </Reveal>
          <Reveal className="max-sm:text-center" delay={0.34} y={20}>
            <PillLink className="mt-8" href={INTERNAL_ROUTES.conf.callForProposals}>
              ¡POSTULAR MI CHARLA!
            </PillLink>
          </Reveal>
          {/* w-fit is measured by the deadline line, so the countdown below stretches to exactly its width */}
          <div className="mx-auto w-fit sm:mx-0">
            <Reveal className="max-sm:text-center" delay={0.44} y={14}>
              <p className="mt-4 text-sm text-[#FBF5E7]/60">
                Fecha límite para enviar propuestas:{" "}
                <strong className="font-semibold text-[#F5BB03]">15 de septiembre</strong>
              </p>
            </Reveal>
            <Reveal delay={0.54} y={14}>
              <Countdown
                className="mt-5"
                expiredLabel="CONVOCATORIA CERRADA"
                fullWidth
                target={CONF_DATES.cfpDeadline}
              />
            </Reveal>
          </div>
        </div>

        <Reveal amount={0.3} className="hidden w-full max-w-[480px] shrink-0 md:block" delay={0.15} x={48} y={0}>
          <div className="flex h-[460px] gap-2 min-[1440px]:h-[520px] [mask-image:linear-gradient(to_bottom,transparent,black_12%,black_88%,transparent)]">
            {GALLERY_COLUMNS.map(({ indexes, className }, col) => (
              <div key={col} className="flex-1 overflow-hidden">
                <div
                  className={classNames(
                    "animate-marquee-y flex h-max flex-col gap-2 hover:[animation-play-state:paused]",
                    className,
                    active !== null && "[animation-play-state:paused]"
                  )}
                >
                  {[...indexes, ...indexes].map((photoIndex, j) => {
                    const { src, alt } = SPEAKER_PHOTOS[photoIndex];
                    const isClone = j >= indexes.length;

                    return (
                      <button
                        key={`${src}-${j}`}
                        aria-hidden={isClone || undefined}
                        aria-label={`Ampliar foto: ${alt}`}
                        className="cursor-zoom-in focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#F5BB03]"
                        tabIndex={isClone ? -1 : undefined}
                        type="button"
                        onClick={(event) => {
                          const thumb = event.currentTarget.querySelector("img");

                          openWithMorph(thumb, () => setActive(photoIndex));
                        }}
                      >
                        <img
                          alt={isClone ? "" : alt}
                          className="aspect-[3/4] w-full object-cover transition-transform duration-500 ease-out hover:scale-105"
                          loading="lazy"
                          src={src}
                        />
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </Reveal>
      </div>

      <Lightbox
        downloadPrefix="la-meetup-iii-speaker"
        index={active}
        photos={SPEAKER_PHOTOS}
        onClose={closeLightbox}
        onStep={step}
      />
    </section>
  );
}
