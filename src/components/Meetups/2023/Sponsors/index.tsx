"use client";

import { alphabeticalSort } from "app/lib/utils";

import Sponsor from "../Sponsor";

type SponsorsProps = {
  title: string;
  subtitle: string;
  sponsors?: {
    name: string;
    logo: string;
    url: string;
  }[];
};

export default function Sponsors({ title, subtitle, sponsors }: SponsorsProps) {
  return (
    <section
      className="relative flex w-full max-w-[800px] flex-1 flex-col items-center justify-center gap-4 pt-[64px]"
      id="sponsors"
    >
      <span>
        <h2 className="text-center text-5xl font-bold text-yellow-400">{title}</h2>
        <p className="mb-2 mt-2 text-center text-lg font-[400] text-white">{subtitle}</p>
      </span>
      <div className="grid w-full max-w-[800px] grid-cols-1 justify-items-center gap-5 md:grid-cols-3 lg:grid-cols-4">
        {alphabeticalSort(sponsors).map(({ name, logo, url }) => (
          <Sponsor key={name} logo={logo} name={name} url={url} />
        ))}
      </div>
    </section>
  );
}
