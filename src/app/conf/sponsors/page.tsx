import Link from "next/link";
import type { Metadata } from "next";

import { CONF_DATES, EXTERNAL_SERVICES, INTERNAL_ROUTES } from "app/lib/constants";

import Countdown from "../components/Countdown";
import Footer from "../components/Footer";
import FormEmbed from "../components/FormEmbed";
import MotionRoot from "../components/MotionRoot";
import Navbar from "../components/Navbar";
import Reveal from "../components/Reveal";
import SectionHeader from "../components/SectionHeader";

const DESCRIPTION =
  "Sumá tu marca a OWU CONF, la conferencia de tecnología de la comunidad uruguaya. Sábado 07 de noviembre de 2026 en Sinergia Faro, Montevideo.";
const OG_IMAGE = "https://conf.owu.uy/images/conf/og.png";

export const metadata: Metadata = {
  title: "Quiero ser Sponsor | OWU CONF",
  description: DESCRIPTION,
  alternates: { canonical: "https://conf.owu.uy/sponsors" },
  openGraph: {
    title: "Quiero ser Sponsor | OWU CONF",
    description: DESCRIPTION,
    url: "https://conf.owu.uy/sponsors",
    siteName: "OWU CONF",
    locale: "es_UY",
    type: "website",
    images: [{ url: OG_IMAGE, width: 1800, height: 945, alt: "OWU CONF — 07.11.2026, Sinergia Faro, Montevideo" }],
  },
  twitter: { card: "summary_large_image", title: "Quiero ser Sponsor | OWU CONF", description: DESCRIPTION, images: [OG_IMAGE] },
};

const REASONS = [
  {
    title: "Visibilidad",
    description: "Tu marca frente a cientos de personas del ecosistema tech uruguayo, durante toda la jornada.",
  },
  {
    title: "Talento",
    description: "Contacto directo con desarrolladores, diseñadores y estudiantes en un ambiente distendido.",
  },
  {
    title: "Comunidad",
    description: "Apoyo concreto a un evento sin fines de lucro, organizado a pulmón por la comunidad.",
  },
];

export default function SponsorsFormPage() {
  return (
    <MotionRoot>
      <div className="min-h-[100dvh] w-full overflow-x-clip bg-black">
        <Navbar />
        <main className="mx-auto w-full max-w-[1440px] px-8 pt-16">
          <Reveal y={16}>
            <Link
              className="font-display text-sm font-bold uppercase leading-none text-[#FBF5E7]/60 transition-colors hover:text-[#F5BB03] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#F5BB03]"
              href={INTERNAL_ROUTES.conf.current}
            >
              ← VOLVER A OWU CONF
            </Link>
          </Reveal>

          <div className="mt-6 grid gap-12 lg:grid-cols-[minmax(0,520px)_1fr] lg:gap-16">
            <div className="lg:sticky lg:top-28 lg:self-start">
              <SectionHeader
                eyebrow="SPONSORS"
                title={
                  <>
                    SUMÁ TU <span className="text-[#F5BB03]">MARCA</span>
                  </>
                }
              />

              <Reveal delay={0.12} y={24}>
                <p className="mt-8 text-lg leading-relaxed text-[#FBF5E7]/90">
                  OWU CONF es posible gracias a las empresas que impulsan los eventos de la comunidad. ¿Querés sumar
                  la tuya?
                </p>
              </Reveal>

              <Reveal delay={0.24} y={20}>
                <h2 className="mt-10 font-display text-xl font-bold uppercase leading-none text-[#FBF5E7] min-[1440px]:text-2xl">
                  ¿Por qué ser sponsor?
                </h2>
              </Reveal>
              <ul className="mt-6 flex flex-col gap-4">
                {REASONS.map(({ title, description }, i) => (
                  <li key={title}>
                    <Reveal delay={0.3 + i * 0.09} x={-28} y={0}>
                      <div className="flex gap-3 text-base leading-7 text-[#FBF5E7]/90">
                        <span aria-hidden="true" className="font-display text-lg font-bold text-[#F5BB03]">
                          ⤷
                        </span>
                        <span>
                          <strong className="text-[#FBF5E7]">{title}:</strong> {description}
                        </span>
                      </div>
                    </Reveal>
                  </li>
                ))}
              </ul>

              <Reveal delay={0.42} y={20}>
                <p className="mt-10 border-l-2 border-[#F5BB03] pl-5 text-base leading-7 text-[#FBF5E7]/70">
                  Dejanos tus datos y te enviamos el brochure de sponsorship con los beneficios y todos los
                  detalles.
                </p>
              </Reveal>

              <Reveal delay={0.48} y={18}>
                <p className="mt-10 font-display text-xs font-semibold uppercase leading-none tracking-[0.18em] text-[#FBF5E7]/60">
                  Aceptamos postulaciones hasta el{" "}
                  <strong className="text-[#F5BB03]">15 de septiembre</strong>
                </p>
                <Countdown className="mt-4" expiredLabel="CONVOCATORIA CERRADA" target={CONF_DATES.sponsorsDeadline} />
              </Reveal>
            </div>

            {/* Heights measured against the live form (1799px @360w, 1690px @792w) plus a small buffer */}
            <FormEmbed
              heightClassName="h-[1900px] sm:h-[1750px]"
              src={EXTERNAL_SERVICES.googleForms.sponsorsConf}
              title="Formulario de sponsors de OWU CONF"
            />
          </div>
        </main>
        <Footer />
      </div>
    </MotionRoot>
  );
}
