"use client";

import { useEffect, useState } from "react";

import { Images } from "lucide-react";
import { m } from "motion/react";
import Link from "next/link";

import { cn } from "app/lib/utils";

import { settleOn } from "./archive-data";

const SECTIONS = [
  { id: "historia", label: "Historia" },
  { id: "comunidades", label: "Comunidades" },
  { id: "numeros", label: "Números" },
  { id: "archivo", label: "Archivo" },
] as const;

/**
 * The page's own nav, pinned under the site's: its three parts with the current one lit, and a
 * jump to any year of the archive (whose rows may not be loaded yet: the archive scrolls there
 * once they are, see the hash handling in Archive).
 */
export default function SectionNav({ years }: { years: number[] }) {
  const [active, setActive] = useState<string>("");

  useEffect(() => {
    const visible = new Map<string, boolean>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) visible.set(entry.target.id, entry.isIntersecting);
        // The last section crossing the band 40% down the screen is the one being read
        setActive(SECTIONS.findLast(({ id }) => visible.get(id))?.id ?? "");
      },
      { rootMargin: "-40% 0px -55% 0px" }
    );
    for (const { id } of SECTIONS) {
      const element = document.getElementById(id);
      if (element) observer.observe(element);
    }
    return () => observer.disconnect();
  }, []);

  const jump = (year: string) => {
    if (!year) return;
    history.replaceState(history.state, "", `${location.pathname}${location.search}#anio-${year}`);
    // The year's rows may not be loaded yet: the archive then lands there itself once they are
    if (document.getElementById(`anio-${year}`)) settleOn(`anio-${year}`);
    else document.getElementById("archivo")?.scrollIntoView();
  };

  return (
    <nav aria-label="En esta página" className="pointer-events-none sticky top-[4.75rem] z-30 px-5 py-2">
      <div className="pointer-events-auto mx-auto flex w-fit max-w-full [scrollbar-width:none] items-center gap-1 overflow-x-auto rounded-full border border-white/10 bg-zinc-950/85 p-1 shadow-lg backdrop-blur [&::-webkit-scrollbar]:hidden">
        {SECTIONS.map(({ id, label }) => (
          <a
            key={id}
            aria-current={active === id ? "location" : undefined}
            className={cn(
              "relative rounded-full px-2.5 py-1.5 text-[13px] whitespace-nowrap transition-colors sm:px-3.5",
              active === id ? "font-medium text-zinc-950" : "text-zinc-300 hover:bg-white/[0.06] hover:text-white"
            )}
            href={`#${id}`}
          >
            {/* The lit pill slides to the part being read */}
            {active === id ? (
              <m.span
                layoutId="section-nav"
                className="absolute inset-0 rounded-full bg-yellow-400"
                transition={{ type: "spring", stiffness: 500, damping: 38 }}
              />
            ) : null}
            <span className="relative">{label}</span>
          </a>
        ))}
        <Link
          className="inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[13px] whitespace-nowrap text-zinc-300 transition-colors hover:bg-white/[0.06] hover:text-white sm:px-3.5"
          href="/timeline/fotos"
        >
          <Images aria-hidden className="size-3.5" /> Fotos
        </Link>
        <label className="relative">
          <span className="sr-only">Ir a un año del archivo</span>
          <select
            className="h-8 cursor-pointer appearance-none rounded-full bg-white/[0.06] px-2.5 text-[13px] text-zinc-200 hover:bg-white/[0.1] focus:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400 sm:pr-3 sm:pl-3.5"
            defaultValue=""
            onChange={(event) => {
              jump(event.target.value);
              event.target.value = "";
            }}
          >
            <option disabled value="">
              Año…
            </option>
            {years.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </label>
      </div>
    </nav>
  );
}
