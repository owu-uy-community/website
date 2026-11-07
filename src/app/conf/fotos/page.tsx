import Link from "next/link";
import type { Metadata } from "next";

import { INTERNAL_ROUTES } from "app/lib/constants";
import { PHOTOS_PER_PHONE } from "lib/conf-photos";

import Footer from "../components/Footer";
import MotionRoot from "../components/MotionRoot";
import Navbar from "../components/Navbar";
import SectionHeader from "../components/SectionHeader";
import PhotoUploader from "./PhotoUploader";

const DESCRIPTION = "Subí las fotos que sacaste hoy en OWU CONF 2026, desde el celular y sin registrarte.";

export const metadata: Metadata = {
  title: "Compartí tus fotos | OWU CONF",
  description: DESCRIPTION,
  alternates: { canonical: "https://conf.owu.uy/fotos" },
  robots: { index: false },
};

export default function PhotosPage() {
  return (
    <MotionRoot>
      <div className="min-h-[100dvh] w-full overflow-x-clip bg-black">
        <Navbar />
        <main className="mx-auto w-full max-w-[720px] px-4 pt-12 pb-20 sm:px-8">
          <Link
            className="font-display text-sm leading-none font-bold text-[#FBF5E7]/60 uppercase transition-colors hover:text-[#F5BB03] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#F5BB03]"
            href={INTERNAL_ROUTES.conf.current}
          >
            ← VOLVER A OWU CONF
          </Link>
          <div className="mt-6">
            <SectionHeader
              eyebrow="FOTOS"
              title={
                <>
                  COMPARTÍ TUS <span className="text-[#F5BB03]">FOTOS</span>
                </>
              }
            />
          </div>
          <p className="mt-6 text-lg leading-relaxed text-[#FBF5E7]/90">
            Subí las fotos que sacaste hoy: hasta {PHOTOS_PER_PHONE} desde cada celular. Solo fotos, sin videos.
          </p>
          <PhotoUploader />
          <p className="mt-10 text-sm leading-6 text-[#FBF5E7]/60">
            Las fotos pueden aparecer en las pantallas y redes de OWU. Subí solo fotos que sacaste vos y en las que la
            gente esté de acuerdo en aparecer.
          </p>
        </main>
        <Footer />
      </div>
    </MotionRoot>
  );
}
