"use client";

import { alphabeticalSort } from "app/lib/utils";

import Community from "../Community";

type CommunitiesProps = {
  title: string;
  subtitle: string;
  communities?: {
    name: string;
    logo: string;
    url: string;
  }[];
};

export default function Communities({ title, subtitle, communities }: CommunitiesProps) {
  return (
    <section
      className="relative flex w-full max-w-[800px] flex-1 flex-col items-center justify-center gap-4 pt-[64px]"
      id="comunidades-aliadas"
    >
      <span>
        <h2 className="text-center text-5xl font-bold text-yellow-400">{title}</h2>
        <p className="mt-2 text-center text-lg font-[400] text-white">{subtitle}</p>
      </span>
      <div className="grid w-full max-w-[800px] grid-cols-1 justify-items-center gap-5 md:grid-cols-3 lg:grid-cols-4">
        {alphabeticalSort(communities).map(({ name, logo, url }) => (
          <Community key={name} logo={logo} name={name} url={url} />
        ))}
      </div>
    </section>
  );
}
