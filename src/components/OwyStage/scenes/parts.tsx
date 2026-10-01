"use client";

import { useMemo } from "react";
import { m } from "motion/react";
import { encode } from "uqr";

import { EASE_OUT } from "app/conf/components/Reveal";
import { SPONSORS_2026 } from "app/conf/components/Sponsors";
import { CONF_DATES } from "app/lib/constants";

/** Building blocks shared by the scenes. */

/** Masked line rise from the /conf hero, at wall scale. */
export function Rise({
  children,
  delay,
  className = "",
}: {
  children: React.ReactNode;
  delay: number;
  className?: string;
}) {
  return (
    <span className={`block overflow-hidden pt-[0.05em] pb-[0.1em] ${className}`}>
      <m.span
        animate={{ y: 0, rotate: 0 }}
        className="block origin-bottom-left"
        initial={{ y: "110%", rotate: 3 }}
        transition={{ duration: 0.8, delay, ease: EASE_OUT }}
      >
        {children}
      </m.span>
    </span>
  );
}

export function LogoReveal({ delay = 0, className = "" }: { delay?: number; className?: string }) {
  return (
    <m.img
      alt="OWU CONF"
      animate={{ clipPath: "inset(0 0% 0 0)", opacity: 1 }}
      className={`w-[1200px] ${className}`}
      initial={{ clipPath: "inset(0 100% 0 0)", opacity: 0.6 }}
      src="/images/logos/conf.webp"
      transition={{ duration: 1.1, delay, ease: EASE_OUT }}
    />
  );
}

export const DATE_LABEL = new Intl.DateTimeFormat("es-UY", {
  weekday: "long",
  day: "2-digit",
  month: "long",
  year: "numeric",
  timeZone: "America/Montevideo",
})
  .format(new Date(CONF_DATES.event))
  .toUpperCase();

const SPONSOR_LOOP = [...SPONSORS_2026, ...SPONSORS_2026];

export function SponsorRow({ reverse, height = 110 }: { reverse?: boolean; height?: number }) {
  return (
    <div className="flex w-full overflow-hidden">
      <div
        className="animate-marquee flex w-max items-center"
        style={{ animationDuration: reverse ? "34s" : "28s", animationDirection: reverse ? "reverse" : "normal" }}
      >
        {[0, 1].map((half) => (
          <div key={half} aria-hidden={half === 1} className="flex items-center gap-[120px] pr-[120px]">
            {SPONSOR_LOOP.map(({ name, logo }, i) => (
              <div
                key={`${name}-${i}`}
                className="flex shrink-0 items-center justify-center"
                style={{ height, width: height * 2.7 }}
              >
                <img alt={name} className="max-h-full max-w-full object-contain brightness-0 invert" src={logo} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** The La Meetup III gallery (public/images/conf/gallery); #10 was never published. */
export const MOMENT_PHOTOS = Array.from({ length: 30 }, (_, i) => i + 1)
  .filter((n) => n !== 10)
  .map((n) => `/images/conf/gallery/momento-${String(n).padStart(2, "0")}.webp`);

/** "HH:MM" in the event's timezone, comparable to the schedule strings. */
export function nowHHMM(timeZone = "America/Montevideo"): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hour12: false }).format(
    new Date()
  );
}

/** QR on a cream card (dark modules on light stays scannable on any wall). */
export function QrCode({ value, size = 420 }: { value: string; size?: number }) {
  const qr = useMemo(() => encode(value, { border: 0, ecc: "M" }), [value]);
  const path = useMemo(
    () => qr.data.flatMap((row, y) => row.map((on, x) => (on ? `M${x} ${y}h1v1h-1z` : ""))).join(""),
    [qr]
  );
  const pad = size * 0.06;

  return (
    <div className="inline-block bg-[#FBF5E7]" style={{ padding: pad }}>
      <svg height={size} shapeRendering="crispEdges" viewBox={`0 0 ${qr.size} ${qr.size}`} width={size}>
        <path d={path} fill="#000" />
      </svg>
    </div>
  );
}
