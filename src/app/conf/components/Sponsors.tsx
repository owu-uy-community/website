import { CONF_DATES, INTERNAL_ROUTES } from "app/lib/constants";

import Countdown from "./Countdown";
import PillLink from "./PillLink";
import Reveal from "./Reveal";
import SectionHeader from "./SectionHeader";

type Sponsor = {
  name: string;
  logo: string;
  website: string;
  /** Compensates extreme aspect ratios: square lockups look tiny at the standard height and vice versa */
  sizeClassName?: string;
};

/* CONFIRMED sponsors only for OWU CONF 2026 (also feeds the hero carousel) */
export const SPONSORS_2026: Sponsor[] = [
  { name: "Crunchloop", logo: "/images/conf/sponsors/crunchloop.svg", website: "https://www.crunchloop.io/" },
  { name: "Estudio Hahn", logo: "/images/conf/sponsors/han.svg", website: "https://estudiohahn.com/" },
  { name: "Mimiquate", logo: "/images/conf/sponsors/mimiquate.svg", website: "https://www.mimiquate.com/" },
  { name: "Neocoast", logo: "/images/conf/sponsors/neocoast.svg", website: "https://www.neocoast.com/" },
  { name: "RevenueCat", logo: "/images/conf/sponsors/revenuecat.svg", website: "https://www.revenuecat.com/" },
  { name: "Segalerba", logo: "/images/conf/sponsors/segalerba.svg", website: "https://segalerba.com.uy/" },
  { name: "Sentry", logo: "/images/conf/sponsors/sentry.svg", website: "https://sentry.io/" },
  { name: "Streaver", logo: "/images/conf/sponsors/streaver.svg", website: "https://www.streaver.com/" },
  { name: "Trupropel", logo: "/images/conf/sponsors/trupropel.svg", website: "https://www.trupropel.com/" },
  { name: "WyeWorks", logo: "/images/conf/sponsors/wyeworks.svg", website: "https://www.wyeworks.com/" },
  { name: "Xmartlabs", logo: "/images/conf/sponsors/xmartlabs.svg", website: "https://xmartlabs.com/" },
];

export default function Sponsors() {
  return (
    <section className="mx-auto mt-16 w-full max-w-[1440px] scroll-mt-24 px-8 sm:mt-[96px]" id="sponsors">
      <SectionHeader eyebrow="EMPRESAS" title="SPONSORS" />

      <div className="mt-8 flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
        <Reveal delay={0.12} y={22}>
          <p className="max-w-[640px] text-pretty text-lg leading-relaxed text-[#FBF5E7]/90">
            OWU CONF es posible gracias a las empresas que impulsan los eventos de la comunidad. ¿Querés sumar la
            tuya?
          </p>
        </Reveal>
        <Reveal className="shrink-0 max-sm:text-center" delay={0.25} y={18}>
          <PillLink href={INTERNAL_ROUTES.conf.sponsors}>¡QUIERO SER SPONSOR!</PillLink>
        </Reveal>
      </div>

      <Reveal delay={0.15} y={20}>
        <div className="mt-12 flex flex-col gap-8 border-2 border-[#FBF5E7]/15 p-5 sm:p-8 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="font-display text-xs font-semibold uppercase leading-none tracking-[0.18em] text-[#FBF5E7]/60">
              Aceptamos postulaciones
            </p>
            <p className="mt-3 text-balance font-display text-2xl font-extrabold uppercase leading-none tracking-[-0.02em] text-[#F5BB03] sm:text-3xl">
              Hasta el 15 de septiembre
            </p>
          </div>
          <Countdown
            className="shrink-0"
            expiredLabel="CONVOCATORIA CERRADA"
            size="lg"
            target={CONF_DATES.sponsorsDeadline}
          />
        </div>
      </Reveal>

      <Reveal delay={0.1} y={16}>
        <p className="mt-14 font-display text-xs font-semibold uppercase tracking-[0.18em] text-[#FBF5E7]/60">
          Nos acompañan en 2026
        </p>
      </Reveal>
      <ul className="mt-6 grid grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-3 lg:grid-cols-6">
        {SPONSORS_2026.map(({ name, logo, website, sizeClassName }, i) => (
          <li key={name}>
            <Reveal amount={0.4} delay={0.12 + i * 0.07} scale={0.8} y={18}>
              <a
                className="group flex h-[96px] items-center justify-center transition-transform hover:-translate-y-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#F5BB03]"
                href={website}
                rel="noopener"
                target="_blank"
                title={name}
              >
                {/* min(180px,100%): brand-size cap without overflowing the cell on narrow grids */}
                <img
                  alt={name}
                  className={`w-auto object-contain opacity-75 brightness-0 invert transition-opacity group-hover:opacity-100 ${
                    sizeClassName ?? "max-h-[52px] max-w-[min(180px,100%)]"
                  }`}
                  loading="lazy"
                  src={logo}
                />
              </a>
            </Reveal>
          </li>
        ))}
      </ul>

      <div className="mt-16">
        <SectionHeader eyebrow="INSTITUCIONAL" title="APOYAN" />
      </div>

      <div className="mt-10 flex flex-col flex-wrap items-center justify-center gap-x-16 gap-y-10 sm:flex-row">
        <Reveal amount={0.4} delay={0.1} y={24}>
          <a
            className="group block focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#F5BB03]"
            href="https://www.gub.uy/ministerio-educacion-cultura"
            rel="noopener"
            target="_blank"
          >
            <img
              alt="Evento declarado de interés Ministerial — Ministerio de Educación y Cultura (MEC Uruguay)"
              className="w-full max-w-[320px] opacity-75 transition-opacity group-hover:opacity-100 md:max-w-[380px]"
              loading="lazy"
              src="/images/2025/government/mec.webp"
            />
          </a>
        </Reveal>
        <Reveal amount={0.4} delay={0.22} y={24}>
          <a
            className="group block focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#F5BB03]"
            href="https://www.anii.org.uy/"
            rel="noopener"
            target="_blank"
          >
            {/* Inversion baked into the asset (white boxes, knocked-out letters): CSS filters crush this logo */}
            <img
              alt="Evento declarado de interés por la ANII — Agencia Nacional de Investigación e Innovación"
              className="w-full max-w-[300px] opacity-75 transition-opacity group-hover:opacity-100 md:max-w-[360px]"
              loading="lazy"
              src="/images/conf/apoyan/anii.webp"
            />
          </a>
        </Reveal>
      </div>
    </section>
  );
}
