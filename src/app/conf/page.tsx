import type { Metadata } from "next";

import getEvents from "app/(web)/(content)/(meetups)/2024/la-meetup/services/getEvents";

import About from "./components/About";
import Footer from "./components/Footer";
import Hero from "./components/Hero";
import Marquee from "./components/Marquee";
import Meetups from "./components/Meetups";
import Moments from "./components/Moments";
import MotionRoot from "./components/MotionRoot";
import Navbar from "./components/Navbar";
import Reveal from "./components/Reveal";
import Speakers from "./components/Speakers";
import Sponsors from "./components/Sponsors";
import Team from "./components/Team";

const DESCRIPTION =
  "OWU CONF: la conferencia de la comunidad tecnológica de Uruguay. Sábado 07 de noviembre de 2026 en Sinergia Faro, Montevideo. Una jornada de charlas, open space y comunidad.";
const OG_IMAGE = "https://conf.owu.uy/images/conf/og.png";

export const metadata: Metadata = {
  title: "OWU CONF",
  description: DESCRIPTION,
  alternates: { canonical: "https://conf.owu.uy" },
  openGraph: {
    title: "OWU CONF",
    description: DESCRIPTION,
    url: "https://conf.owu.uy",
    siteName: "OWU CONF",
    locale: "es_UY",
    type: "website",
    images: [{ url: OG_IMAGE, width: 1800, height: 945, alt: "OWU CONF — 07.11.2026, Sinergia Faro, Montevideo" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "OWU CONF",
    description: DESCRIPTION,
    images: [OG_IMAGE],
  },
};

/* schema.org Event markup for Google rich results */
const EVENT_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "Event",
  name: "OWU CONF 2026",
  description: DESCRIPTION,
  url: "https://conf.owu.uy",
  startDate: "2026-11-07",
  endDate: "2026-11-07",
  eventStatus: "https://schema.org/EventScheduled",
  eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
  image: [OG_IMAGE],
  location: {
    "@type": "Place",
    name: "Sinergia Faro",
    address: {
      "@type": "PostalAddress",
      streetAddress: "Víctor Soliño 349",
      addressLocality: "Montevideo",
      addressCountry: "UY",
    },
  },
  organizer: {
    "@type": "Organization",
    name: "OWU — Open Web Uruguay",
    url: "https://owu.uy",
  },
};

export default async function ConfPage() {
  const events = await getEvents().catch(() => []);

  return (
    <MotionRoot>
      {/* Static constant; escaping "<" keeps any future text from closing the script tag */}
      <script
        dangerouslySetInnerHTML={{ __html: JSON.stringify(EVENT_JSON_LD).replace(/</g, "\\u003c") }}
        type="application/ld+json"
      />
      <div className="min-h-[100dvh] w-full overflow-x-clip bg-black">
        <Navbar />
        <main>
          <Hero />
          <Reveal amount={0.3} delay={0.5} duration={0.8} y={28}>
            <Marquee className="mt-[42px]" />
          </Reveal>
          <About />
          {/* Yellow divider band between sections */}
          <Reveal grow="x" amount={0.9} className="mt-16 h-10 w-full bg-[#F5BB03]" duration={0.9} />
          {/*
           * PROGRAMACIÓN section is hidden while the schedule is tentative. To bring it
           * back, mount <Program /> here and uncomment the PROGRAMA link in the Navbar.
           */}
          <Speakers />
          <Moments />
          <Sponsors />
          <Team />
          <Meetups events={events} />
        </main>
        <Footer />
      </div>
    </MotionRoot>
  );
}
