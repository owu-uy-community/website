"use client";

import { m } from "motion/react";

import { CONF_DATES, INTERNAL_ROUTES, MAPS_URLS } from "app/lib/constants";

import Countdown from "./Countdown";
import PillLink from "./PillLink";
import { EASE_OUT } from "./Reveal";

const HEADLINE = [
  { text: "IDEAS", className: "text-[#F5BB03]" },
  { text: "TECNOLOGÍA", className: "text-[#FBF5E7]" },
  { text: "COMUNIDAD", className: "text-[#0162C8]" },
];

/* Content blocks stagger in after the headline finishes */
const contentEntrance = (order: number) => ({
  initial: { opacity: 0, y: 26 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.65, delay: 0.55 + order * 0.12, ease: EASE_OUT },
});

export default function Hero() {
  return (
    <section className="relative w-full min-[1440px]:min-h-[620px]" id="inicio">
      <div className="relative mx-auto w-full max-w-[1440px] px-8 pb-16 pt-16 text-center sm:text-left min-[1440px]:pb-[33px]">
        {/* Fluid clamp on mobile: "TECNOLOGÍA" measures 6.35px per font-px and must fit (100vw - 79px) */}
        <h1 className="font-display text-[length:clamp(34px,11.6vw,54px)] font-extrabold leading-[0.95] tracking-[-0.02em] sm:text-[68px] min-[1440px]:text-[84px]">
          {HEADLINE.map(({ text, className }, i) => (
            <span key={text} className="block overflow-hidden pb-[0.08em] pt-[0.04em]">
              <m.span
                animate={{ y: 0, rotate: 0 }}
                className={`block origin-bottom-left ${className}`}
                initial={{ y: "110%", rotate: 3 }}
                transition={{ duration: 0.8, delay: 0.12 + i * 0.11, ease: EASE_OUT }}
              >
                {text}
              </m.span>
            </span>
          ))}
        </h1>

        <m.p
          className="mx-auto mt-7 max-w-[560px] text-pretty text-lg leading-relaxed text-[#FBF5E7]/90 sm:mx-0 min-[1440px]:text-xl"
          {...contentEntrance(0)}
        >
          Una jornada de charlas, open space y encuentro.
          <br />
          La conferencia de la comunidad tecnológica de Uruguay, hecha por la comunidad y para la comunidad.
        </m.p>

        <m.div className="mt-8" {...contentEntrance(1)}>
          <p className="font-display text-xl font-extrabold uppercase leading-none tracking-[-0.01em] text-[#F5BB03] sm:text-2xl min-[1440px]:text-[28px]">
            Sábado 07 de noviembre de 2026
          </p>
          <a
            className="group mt-3.5 inline-flex items-center gap-2 text-base text-[#FBF5E7]/75 transition-colors hover:text-[#F5BB03] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#F5BB03] min-[1440px]:text-lg"
            href={MAPS_URLS.meetupLocation}
            rel="noopener"
            target="_blank"
          >
            <svg aria-hidden="true" className="h-[18px] w-[18px] shrink-0" fill="none" stroke="#F5BB03" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M12 21s-7-5.2-7-11a7 7 0 1 1 14 0c0 5.8-7 11-7 11Z" strokeLinejoin="round" />
              <circle cx="12" cy="10" r="2.6" />
            </svg>
            <span className="decoration-[#F5BB03] decoration-2 underline-offset-4 group-hover:underline">
              Sinergia Faro · Víctor Soliño 349
            </span>
            <span aria-hidden="true" className="hidden text-sm sm:inline">
              ↗
            </span>
          </a>
        </m.div>

        {/* w-fit is measured by the CTA row, so the countdown below stretches to exactly the buttons' width */}
        <div className="mx-auto w-fit sm:mx-0">
          <m.div {...contentEntrance(2)}>
            <Countdown className="mt-8" expiredLabel="¡LLEGÓ EL DÍA!" fullWidth target={CONF_DATES.event} />
          </m.div>

          <m.div
            className="mt-8 flex flex-wrap items-center justify-center gap-4 sm:justify-start"
            {...contentEntrance(3)}
          >
            <PillLink href={INTERNAL_ROUTES.conf.callForProposals}>¡POSTULAR MI CHARLA!</PillLink>
            <PillLink href={INTERNAL_ROUTES.conf.sponsors} variant="outline">
              ¡QUIERO SER SPONSOR!
            </PillLink>
          </m.div>
        </div>

        {/* Right edge aligns with the navbar content line (inner px-8 edge); desktop LCP image */}
        <m.img
          alt="La comunidad OWU reunida en La Meetup"
          animate={{ clipPath: "polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)", scale: 1, opacity: 1 }}
          className="absolute right-8 top-[140px] hidden h-[419px] w-[674px] max-w-none object-cover min-[1440px]:block"
          fetchPriority="high"
          initial={{ clipPath: "polygon(0% 0%, 100% 0%, 100% 0%, 0% 62%)", scale: 1.06, opacity: 0 }}
          src="/images/conf/hero-crowd.webp"
          transition={{ duration: 1.1, delay: 0.45, ease: EASE_OUT }}
        />
      </div>

      <m.img
        alt="La comunidad OWU reunida en La Meetup"
        animate={{ opacity: 1, y: 0 }}
        className="mx-8 mt-2 w-[calc(100%-4rem)] max-w-[674px] object-cover min-[1440px]:hidden"
        initial={{ opacity: 0, y: 24 }}
        src="/images/conf/hero-crowd.webp"
        transition={{ duration: 0.8, delay: 0.6, ease: EASE_OUT }}
      />
    </section>
  );
}
