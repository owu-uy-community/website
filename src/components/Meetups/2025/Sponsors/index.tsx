"use client";
import Link from "next/link";

import { alphabeticalSort } from "app/lib/utils";
import Sponsor from "components/shared/Sponsor";
import Image from "next/image";

type SponsorsProps = {
  sponsors?: {
    name: string;
    logo: {
      url: string;
    };
    website?: string;
  }[];
};

export default function Sponsors({ sponsors = [] }: SponsorsProps) {
  return (
    <div id="sponsors" className="mb-10 mt-16 flex w-full max-w-[1200px] flex-col items-center gap-5">
      <span>
        <h2 className="mb-4 text-center text-4xl font-bold text-white md:text-5xl">Sponsors</h2>
        <p className="mx-auto mt-2 max-w-3xl text-balance text-center text-base leading-relaxed text-gray-300 lg:text-lg">
          ¡Nuestros aliados y patrocinadores que hacen este evento posible!
        </p>
      </span>
      <div className="flex flex-row flex-wrap items-center justify-center gap-5">
        {alphabeticalSort(sponsors).map(({ name, logo, website }) => (
          <Sponsor key={name} image={logo.url} name={name} website={website} />
        ))}
      </div>
      <Link href="/static/2025/goverment/declaracion_interes_mec.pdf" target="_blank" prefetch={false}>
        <img
          src={"/static/2025/goverment/mec.webp"}
          alt="Evento declarado de interés Ministerial (MEC Uruguay)"
          className="mt-5 w-full max-w-[280px] md:max-w-[400px]"
          crossOrigin="anonymous"
        />
      </Link>
    </div>
  );
}
