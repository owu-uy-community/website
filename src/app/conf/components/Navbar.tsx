"use client";

import Link from "next/link";
import { m } from "motion/react";

import { SOCIAL_LINKS } from "app/lib/constants";
import { addUtmParams } from "app/lib/utils";

import PillLink from "./PillLink";
import { EASE_OUT } from "./Reveal";

const NAV_LINKS = [
  { label: "SOBRE OWU CONF", href: "#sobre-owu" },
  // { label: "PROGRAMA", href: "#programa" }, // restore together with the hidden PROGRAMACIÓN section
  { label: "SPEAKERS", href: "#speakers" },
  { label: "SPONSORS", href: "#sponsors" },
  { label: "EQUIPO", href: "#equipo" },
  { label: "MEETUPS", href: "#agenda" },
];

export default function Navbar() {
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

        <div className="flex items-center gap-8 min-[1440px]:gap-10">
          <nav aria-label="Secciones" className="hidden items-center gap-7 lg:flex min-[1440px]:gap-10">
            {NAV_LINKS.map(({ label, href }) => (
              <a
                key={href}
                className="font-display text-base font-semibold text-[#FBF5E7] transition-colors hover:text-[#F5BB03] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#F5BB03]"
                href={href}
              >
                {label}
              </a>
            ))}
          </nav>

          <PillLink
            external
            href={addUtmParams(SOCIAL_LINKS.slack)}
            sizeClassName="h-9 px-4 text-sm sm:h-12 sm:px-6 sm:text-base"
          >
            SUMATE
          </PillLink>
        </div>
      </div>
    </m.header>
  );
}
