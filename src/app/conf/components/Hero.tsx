import Image from "next/image";
import type { CSSProperties } from "react";

import { CONF_DATES, INTERNAL_ROUTES, MAPS_URLS } from "app/lib/constants";

import { confUtm } from "../utm";

import Countdown from "./Countdown";
import PillLink from "./PillLink";

const HEADLINE = [
  { text: "IDEAS", className: "text-[#F5BB03]" },
  { text: "TECNOLOGÍA", className: "text-[#FBF5E7]" },
  { text: "COMUNIDAD", className: "text-[#0162C8]" },
];

/*
 * The entrance is CSS (.conf-rise* in globals.css), so it plays from the first paint instead of
 * waiting for the page to hydrate. Content blocks stagger in after the headline finishes.
 */
const entranceDelay = (order: number) => ({ "--d": `${550 + order * 120}ms` }) as CSSProperties;

// One photo for both layouts: the same sizes pick the same file, so it downloads once
const HERO_PHOTO = { src: "/images/conf/hero-crowd.webp", width: 707, height: 440 };
const HERO_SIZES = "(min-width: 1440px) 674px, calc(100vw - 4rem)";

export default function Hero() {
  return (
    <section className="relative w-full min-[1440px]:min-h-[620px]" id="inicio">
      <div className="relative mx-auto w-full max-w-[1440px] px-8 pt-16 pb-16 text-center min-[1440px]:pb-[33px] sm:text-left">
        {/* Fluid clamp on mobile: "TECNOLOGÍA" measures 6.35px per font-px and must fit (100vw - 79px) */}
        <h1 className="font-display text-[length:clamp(34px,11.6vw,54px)] leading-[0.95] font-extrabold tracking-[-0.02em] min-[1440px]:text-[84px] sm:text-[68px]">
          {HEADLINE.map(({ text, className }, i) => (
            <span key={text} className="block overflow-hidden pt-[0.04em] pb-[0.08em]">
              <span
                className={`conf-rise-line block origin-bottom-left ${className}`}
                style={{ "--d": `${120 + i * 110}ms` } as CSSProperties}
              >
                {text}
              </span>
            </span>
          ))}
        </h1>

        <p
          className="conf-rise mx-auto mt-7 max-w-[560px] text-lg leading-relaxed text-pretty text-[#FBF5E7]/90 min-[1440px]:text-xl sm:mx-0"
          style={entranceDelay(0)}
        >
          Una jornada de charlas, open space y encuentro.
          <br />
          La conferencia de la comunidad tecnológica de Uruguay, hecha por la comunidad y para la comunidad.
        </p>

        <div className="conf-rise mt-8" style={entranceDelay(1)}>
          <p className="font-display text-xl leading-none font-extrabold tracking-[-0.01em] text-[#F5BB03] uppercase min-[1440px]:text-[28px] sm:text-2xl">
            Sábado 07 de noviembre de 2026
          </p>
          <a
            className="group mt-3.5 inline-flex items-center gap-2 text-base text-[#FBF5E7]/75 transition-colors hover:text-[#F5BB03] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#F5BB03] min-[1440px]:text-lg"
            href={confUtm(MAPS_URLS.meetupLocation, "hero-venue")}
            rel="noopener"
            target="_blank"
          >
            <svg
              aria-hidden="true"
              className="h-[18px] w-[18px] shrink-0"
              fill="none"
              stroke="#F5BB03"
              strokeWidth="2"
              viewBox="0 0 24 24"
            >
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
        </div>

        {/* w-fit is measured by the CTA row, so the countdown below stretches to exactly the buttons' width */}
        <div className="mx-auto w-fit sm:mx-0">
          <div className="conf-rise" style={entranceDelay(2)}>
            <Countdown className="mt-8" expiredLabel="¡LLEGÓ EL DÍA!" fullWidth target={CONF_DATES.event} />
          </div>

          <div
            className="conf-rise mt-8 flex flex-wrap items-center justify-center gap-4 sm:justify-start"
            style={entranceDelay(3)}
          >
            <PillLink href="#entradas">¡QUIERO MI ENTRADA!</PillLink>
            <PillLink href={INTERNAL_ROUTES.conf.sponsors} variant="outline">
              ¡QUIERO SER SPONSOR!
            </PillLink>
          </div>
        </div>

        {/* Right edge aligns with the navbar content line (inner px-8 edge); desktop LCP image */}
        <Image
          alt="La comunidad OWU reunida en La Meetup"
          className="conf-hero-photo absolute top-[140px] right-8 hidden h-[419px] w-[674px] max-w-none object-cover min-[1440px]:block"
          fetchPriority="high"
          preload
          sizes={HERO_SIZES}
          {...HERO_PHOTO}
        />
      </div>

      <Image
        alt="La comunidad OWU reunida en La Meetup"
        className="conf-rise mx-8 mt-2 w-[calc(100%-4rem)] max-w-[674px] object-cover min-[1440px]:hidden"
        loading="eager"
        sizes={HERO_SIZES}
        style={{ "--d": "600ms", "--rise": "24px" } as CSSProperties}
        {...HERO_PHOTO}
      />
    </section>
  );
}
