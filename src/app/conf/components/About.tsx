import Link from "next/link";

import { INTERNAL_ROUTES } from "app/lib/constants";

import Reveal from "./Reveal";
import SectionHeader from "./SectionHeader";
import TangramGallery from "./TangramGallery";

const EDITIONS = [
  { year: "2023", name: "La Meetup I", href: INTERNAL_ROUTES.meetups.meetup2023 },
  { year: "2024", name: "La Meetup II", href: INTERNAL_ROUTES.meetups.meetup2024 },
  { year: "2025", name: "La Meetup III", href: INTERNAL_ROUTES.meetups.meetup2025 },
  { year: "2026", name: "OWU CONF", href: null },
];

/* Skim-reading highlights: full white for concepts, yellow reserved for date/venue */
function Hl({ children, yellow = false }: { children: React.ReactNode; yellow?: boolean }) {
  return (
    <strong className={yellow ? "font-semibold text-[#F5BB03]" : "font-semibold text-[#FBF5E7]"}>{children}</strong>
  );
}

/*
 * SEO-oriented copy: each paragraph opens with the terms people search for
 * (conferencia de tecnología, Uruguay/Montevideo, open source) while reading naturally.
 */
const PARAGRAPHS: React.ReactNode[] = [
  <>
    OWU CONF es <Hl>la conferencia de tecnología de la comunidad uruguaya</Hl>: una jornada en Montevideo con{" "}
    <Hl>charlas técnicas, open space y networking</Hl>. Nace de <Hl>La Meetup</Hl>, el encuentro que desde 2023
    reúne a las comunidades tech de Uruguay.
  </>,
  <>
    La organiza <Hl>OWU</Hl>, la comunidad que desde 2011 promueve{" "}
    <Hl>las tecnologías abiertas, el open source y los estándares web</Hl> en el país.
  </>,
  <>
    En 2026 la meetup se convierte en conferencia: <Hl yellow>el sábado 7 de noviembre, en Sinergia Faro</Hl>.{" "}
    <Hl>Mismo espíritu de siempre.</Hl>
  </>,
];

export default function About() {
  return (
    <section className="mx-auto mt-[50px] w-full max-w-[1440px] scroll-mt-24 px-8 pt-[37px]" id="sobre-owu">
      <div className="grid gap-12 lg:grid-cols-[minmax(0,560px)_1fr] lg:gap-16">
        <div className="flex flex-col">
          {/* C→C++ style dev pun; custom scale keeps it on a single line at every width */}
          <SectionHeader
            eyebrow="SOBRE OWU CONF"
            title={
              <>
                OWU CONF = <span className="text-[#F5BB03]">LA MEETUP++</span>
              </>
            }
            titleSizeClassName="whitespace-nowrap text-[length:clamp(18px,6.1vw,30px)] sm:text-4xl min-[1440px]:text-[42px]"
          />
          {PARAGRAPHS.map((paragraph, i) => (
            <Reveal key={i} delay={0.12 + i * 0.1} y={24}>
              <p className={`text-pretty text-lg leading-relaxed text-[#FBF5E7]/90 ${i === 0 ? "mt-8" : "mt-5"}`}>{paragraph}</p>
            </Reveal>
          ))}

          <Reveal delay={0.45} y={18}>
            <Link
              className="mt-6 inline-block font-display text-sm font-bold uppercase leading-none text-[#0162C8] transition-colors hover:text-[#F5BB03] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#F5BB03] min-[1440px]:text-base"
              href="/"
            >
              CONOCÉ MÁS →
            </Link>
          </Reveal>

          {/* mt-auto pins it to the column bottom (the grid row stretches to the tangram height), right above the timeline */}
          <Reveal className="mt-auto" delay={0.15} y={30}>
            <p className="mt-6 font-display text-3xl font-extrabold uppercase leading-[1.05] tracking-[-0.02em] text-[#FBF5E7] min-[1440px]:text-4xl">
              DE MEETUP
              <br />A CONFERENCIA.
            </p>
          </Reveal>
        </div>

        <TangramGallery />
      </div>

      <div className="relative mt-10">
        {/* Desktop track: final segment turns yellow approaching 2026 */}
        <div aria-hidden="true" className="absolute left-[2px] right-1/4 top-[7px] hidden sm:block">
          <Reveal grow="x" amount={1} className="h-[2px] bg-[#FBF5E7]/15" duration={1} />
        </div>
        <div aria-hidden="true" className="absolute left-1/2 right-1/4 top-[7px] hidden sm:block">
          <Reveal grow="x" amount={1} className="h-[2px] bg-[#F5BB03]" delay={0.55} duration={0.7} />
        </div>
        {/* Mobile vertical track */}
        <div aria-hidden="true" className="absolute bottom-6 left-[7px] top-1 w-[2px] bg-[#FBF5E7]/15 sm:hidden" />

        <ol className="grid gap-y-10 sm:grid-cols-4">
          {EDITIONS.map(({ year, name, href }, i) => {
            const isConf = !href;

            const marker = (
              <span
                aria-hidden="true"
                className={`absolute block rotate-45 ${
                  isConf
                    ? "left-0 top-0 h-4 w-4 bg-[#F5BB03]"
                    : "left-[2px] top-[2px] h-3 w-3 border-2 border-[#FBF5E7]/40 bg-black transition-colors group-hover:border-[#F5BB03]"
                }`}
              />
            );

            const text = (
              <span className="block pl-8 sm:pl-0 sm:pt-8">
                <span
                  className={`block font-display text-sm font-bold leading-none ${
                    isConf ? "text-[#F5BB03]" : "text-[#FBF5E7]/60"
                  }`}
                >
                  {year}
                </span>
                <span
                  className={`mt-2 block font-display text-lg font-semibold uppercase leading-none ${
                    isConf ? "text-[#F5BB03]" : "text-[#FBF5E7] transition-colors group-hover:text-[#F5BB03]"
                  }`}
                >
                  {name}
                </span>
                <span className={`mt-2 block text-sm ${isConf ? "text-[#F5BB03]/80" : "text-[#FBF5E7]/50"}`}>
                  {isConf ? "07/11/2026" : "Revivir la edición →"}
                </span>
              </span>
            );

            return (
              <li key={year} className="relative">
                <Reveal delay={0.15 + i * 0.14} scale={isConf ? 0.8 : 1} y={22}>
                  {href ? (
                    <Link
                      className="group block focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#F5BB03]"
                      href={href}
                    >
                      {marker}
                      {text}
                    </Link>
                  ) : (
                    <div>
                      {marker}
                      {text}
                    </div>
                  )}
                </Reveal>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
