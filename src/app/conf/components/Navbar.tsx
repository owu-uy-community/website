"use client";

import Link from "next/link";
import { m } from "motion/react";

import { CONF_DATES, INTERNAL_ROUTES, SOCIAL_LINKS } from "app/lib/constants";
import { useMounted } from "hooks/useMounted";
import { wallClock } from "lib/slot-day";

import { confUtm } from "../utm";

import PillLink from "./PillLink";
import { EASE_OUT } from "./Reveal";

const NAV_LINKS = [
  { label: "SOBRE OWU CONF", hash: "#sobre-owu" },
  { label: "PROGRAMA", hash: "#programa" },
  { label: "SPEAKERS", hash: "#speakers" },
  { label: "OPEN SPACE", hash: "#open-space" },
  { label: "SPONSORS", hash: "#sponsors" },
  { label: "EQUIPO", hash: "#equipo" },
  { label: "MEETUPS", hash: "#agenda" },
];

/** The conf day on Montevideo's clock: the navbar then points at the live board. */
const isConfDay = () => wallClock(new Date(), "America/Montevideo").slice(0, 10) === CONF_DATES.event.slice(0, 10);

export default function Navbar({ home = false }: { home?: boolean }) {
  // Off the landing the sections live on /conf: the conf host sends that to "/", and the browser keeps the #
  const base = home ? "" : INTERNAL_ROUTES.conf.current;
  // A clock read: only after hydration, so the server's render (built once) still matches
  const live = useMounted() && isConfDay();

  return (
    <m.header
      animate={{ y: 0, opacity: 1 }}
      className="sticky top-0 z-50 w-full border-b border-white/5 bg-black/90 backdrop-blur"
      initial={{ y: -84, opacity: 0 }}
      transition={{ duration: 0.7, ease: EASE_OUT }}
    >
      <div className="mx-auto flex h-16 w-full max-w-[1440px] items-center justify-between px-5 sm:h-20 sm:px-8">
        <Link aria-label="OWU CONF — inicio" href="/conf">
          <img alt="OWU CONF" className="h-8 w-auto sm:h-11" src="/images/conf/logo.png" />
        </Link>

        <div className="flex items-center gap-4 min-[1440px]:gap-10 sm:gap-8">
          {/* From xl: seven sections fit on one line there, and wrapped into three below it */}
          <nav aria-label="Secciones" className="hidden items-center gap-7 min-[1440px]:gap-10 xl:flex">
            {NAV_LINKS.map(({ label, hash }) => (
              <a
                key={hash}
                className="font-display text-base font-semibold whitespace-nowrap text-[#FBF5E7] transition-colors hover:text-[#F5BB03] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#F5BB03]"
                href={`${base}${hash}`}
              >
                {label}
              </a>
            ))}
          </nav>

          {live ? (
            <Link
              className="inline-flex items-center gap-2 font-display text-sm font-bold whitespace-nowrap text-[#F5BB03] transition-colors hover:text-[#FBF5E7] sm:text-base"
              href={INTERNAL_ROUTES.conf.openspace}
            >
              <span aria-hidden="true" className="h-2 w-2 animate-pulse rounded-full bg-[#F5BB03]" />
              EN VIVO
            </Link>
          ) : null}

          <PillLink
            external
            href={confUtm(SOCIAL_LINKS.slack, "navbar-cta")}
            sizeClassName="h-9 px-4 text-sm sm:h-12 sm:px-6 sm:text-base"
          >
            SUMATE
          </PillLink>
        </div>
      </div>
    </m.header>
  );
}
