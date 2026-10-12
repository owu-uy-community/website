import type { Metadata } from "next";
import { headers } from "next/headers";

import { INTERNAL_ROUTES } from "app/lib/constants";

import Footer from "../components/Footer";
import MotionRoot from "../components/MotionRoot";
import Navbar from "../components/Navbar";
import PillLink from "../components/PillLink";
import Reveal from "../components/Reveal";
import {
  cleanName,
  pick,
  SHARE_DESIGNS,
  SHARE_DISCLAIMER,
  SHARE_FORMATS,
  shareImagePath,
  sharePageUrl,
  type ShareDesign,
} from "../share";

/*
 * The page people post: /credencial?nombre=Ada&d=voy (conf.owu.uy). Its link preview is
 * their own badge; whoever clicks through lands here, sees it, and is sent to make theirs.
 */

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const DESCRIPTION =
  "Sábado 7 de noviembre en Sinergia Faro, Montevideo: charlas, open space y comunidad. Armá tu credencial y reservá tu entrada en conf.owu.uy.";

async function read(searchParams: Props["searchParams"]) {
  const params = await searchParams;
  const one = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };

  return { name: cleanName(one("nombre")), design: pick<ShareDesign>(one("d"), SHARE_DESIGNS, "voy") };
}

function titleFor(design: ShareDesign, name: string) {
  if (design === "evento") return "Se viene OWU CONF 2026";
  if (!name) return "Mi credencial de OWU CONF 2026";

  return design === "venis" ? `${name} te invita a OWU CONF 2026` : `${name} va a OWU CONF 2026`;
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { name, design } = await read(searchParams);
  const title = titleFor(design, name);
  // The preview image comes from whichever host serves the page, so deploy previews unfurl too
  const host = (await headers()).get("host") ?? "conf.owu.uy";
  const image = {
    url: shareImagePath(design, "link", name),
    width: SHARE_FORMATS.link.width,
    height: SHARE_FORMATS.link.height,
    alt: `${title} — credencial para compartir, no es una entrada`,
  };

  return {
    metadataBase: new URL(`${host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https"}://${host}`),
    title,
    description: DESCRIPTION,
    // One page per name: shareable, not something to index
    robots: { index: false, follow: true },
    openGraph: {
      title,
      description: DESCRIPTION,
      url: sharePageUrl(design, name),
      siteName: "OWU CONF",
      locale: "es_UY",
      type: "website",
      images: [image],
    },
    twitter: { card: "summary_large_image", title, description: DESCRIPTION, images: [image] },
  };
}

export default async function SharedBadgePage({ searchParams }: Props) {
  const { name, design } = await read(searchParams);

  return (
    <MotionRoot>
      <div className="min-h-[100dvh] w-full overflow-x-clip bg-black">
        <Navbar />
        <main className="mx-auto w-full max-w-[1100px] px-8 pt-14 pb-24">
          <Reveal y={16}>
            <p className="font-display text-sm leading-none font-semibold tracking-[0.18em] text-[#FBF5E7] uppercase">
              Credencial para compartir
            </p>
            <h1 className="mt-4 font-display text-3xl leading-none font-extrabold tracking-[-0.02em] text-balance text-[#FBF5E7] uppercase sm:text-5xl">
              {titleFor(design, name)}
            </h1>
          </Reveal>

          <Reveal delay={0.1} y={20}>
            <img
              alt={`${titleFor(design, name)}: credencial para compartir, no es una entrada`}
              className="mt-10 aspect-[1200/630] w-full border-2 border-[#FBF5E7]/10 bg-[#0B0B0B]"
              height={SHARE_FORMATS.link.height}
              src={shareImagePath(design, "link", name)}
              width={SHARE_FORMATS.link.width}
            />
          </Reveal>

          <Reveal delay={0.18} y={20}>
            <p className="mt-6 flex items-start gap-3 border-l-4 border-[#F5BB03] bg-[#F5BB03]/10 px-4 py-3 text-base text-[#FBF5E7]">
              <span aria-hidden="true" className="font-display font-extrabold text-[#F5BB03]">
                !
              </span>
              {SHARE_DISCLAIMER} OWU CONF es un evento gratuito: la entrada se reserva desde conf.owu.uy.
            </p>
            <div className="mt-10 flex flex-wrap gap-4 max-sm:justify-center">
              <PillLink href={`${INTERNAL_ROUTES.conf.current}#entradas`}>ARMÁ TU CREDENCIAL</PillLink>
              <PillLink href={INTERNAL_ROUTES.conf.current} variant="outline">
                CONOCÉ OWU CONF
              </PillLink>
            </div>
          </Reveal>
        </main>
        <Footer />
      </div>
    </MotionRoot>
  );
}
