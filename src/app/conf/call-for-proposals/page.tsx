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
  "Postulá tu charla para OWU CONF, la conferencia de tecnología de la comunidad uruguaya. Sábado 07 de noviembre de 2026 en Sinergia Faro, Montevideo.";
const OG_IMAGE = "https://conf.owu.uy/images/conf/og.png";

export const metadata: Metadata = {
  title: "Call for Proposals | OWU CONF",
  description: DESCRIPTION,
  alternates: { canonical: "https://conf.owu.uy/call-for-proposals" },
  openGraph: {
    title: "Call for Proposals | OWU CONF",
    description: DESCRIPTION,
    url: "https://conf.owu.uy/call-for-proposals",
    siteName: "OWU CONF",
    locale: "es_UY",
    type: "website",
    images: [{ url: OG_IMAGE, width: 1800, height: 945, alt: "OWU CONF — 07.11.2026, Sinergia Faro, Montevideo" }],
  },
  twitter: { card: "summary_large_image", title: "Call for Proposals | OWU CONF", description: DESCRIPTION, images: [OG_IMAGE] },
};

const TOPICS = [
  { title: "Tecnología", description: "Lenguajes, frameworks, herramientas y todo lo que estés construyendo." },
  { title: "Comunidad", description: "Open source, cómo se arman comunidades y por qué importan." },
  { title: "Liderazgo", description: "Desarrollo profesional, equipos y las lecciones que costaron caro." },
  { title: "IA & Datos", description: "Inteligencia artificial, machine learning y datos en la práctica." },
];

export default function CallForProposalsPage() {
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
                eyebrow="CALL FOR SPEAKERS"
                title={
                  <>
                    POSTULÁ <span className="text-[#F5BB03]">TU CHARLA</span>
                  </>
                }
              />

              <Reveal delay={0.12} y={24}>
                <p className="mt-8 text-lg leading-relaxed text-[#FBF5E7]/90">
                  El escenario de OWU CONF es de la comunidad. Si tenés una historia de tecnología, comunidad u open
                  source para contar, este es tu lugar: no importa si nunca diste una charla, te acompañamos a
                  prepararla.
                </p>
              </Reveal>
              <Reveal delay={0.22} y={24}>
                <p className="mt-5 text-lg leading-relaxed text-[#FBF5E7]/90">
                  ¿No tenés una charla pero conocés a alguien que sí? También podés nominarlo.
                </p>
              </Reveal>

              <Reveal delay={0.28} y={18}>
                <p className="mt-6 border-l-2 border-[#F5BB03] pl-5 text-base leading-7 text-[#FBF5E7]/80">
                  Fecha límite para enviar propuestas:{" "}
                  <strong className="font-display font-bold uppercase text-[#F5BB03]">15 de septiembre</strong>
                </p>
              </Reveal>

              <Reveal delay={0.3} y={18}>
                <Countdown className="mt-6" expiredLabel="CONVOCATORIA CERRADA" target={CONF_DATES.cfpDeadline} />
              </Reveal>

              <Reveal delay={0.32} y={20}>
                <h2 className="mt-10 font-display text-xl font-bold uppercase leading-none text-[#FBF5E7] min-[1440px]:text-2xl">
                  Temas de interés
                </h2>
              </Reveal>
              <ul className="mt-6 flex flex-col gap-4">
                {TOPICS.map(({ title, description }, i) => (
                  <li key={title}>
                    <Reveal delay={0.38 + i * 0.09} x={-28} y={0}>
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

              <Reveal delay={0.5} y={20}>
                <p className="mt-10 border-l-2 border-[#F5BB03] pl-5 text-base leading-7 text-[#FBF5E7]/70">
                  Las charlas se presentan en un único track, así que buscamos temas lo suficientemente amplios para
                  una audiencia diversa.
                </p>
              </Reveal>
            </div>

            {/* Heights measured against the live form (3165px @360w, 2617px @792w) plus a small buffer */}
            <FormEmbed
              heightClassName="h-[3300px] sm:h-[2700px]"
              src={EXTERNAL_SERVICES.googleForms.callForProposalsConf}
              title="Call for Proposals de OWU CONF"
            />
          </div>
        </main>
        <Footer />
      </div>
    </MotionRoot>
  );
}
