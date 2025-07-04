"use client";

import { alphabeticalSort } from "app/lib/utils";

import Speaker from "../Speaker";

type SpeakersProps = {
  title: string;
  subtitle: string;
  speakers?: {
    name: string;
    role: string;
    image: string;
    linkedin: string;
  }[];
};

export default function Speakers({ title, subtitle, speakers }: SpeakersProps) {
  return (
    <section
      className="relative flex w-full max-w-[800px] flex-1 flex-col items-center justify-center gap-4 pt-[64px]"
      id="speakers"
    >
      <span>
        <h2 className="text-center text-5xl font-bold text-yellow-400">{title}</h2>
        <p className="mt-2 text-center text-lg font-[400] text-white">{subtitle}</p>
      </span>
      <div className="grid w-full max-w-[800px] grid-cols-1 gap-x-5 gap-y-5 sm:grid-cols-2 lg:grid-cols-2">
        {alphabeticalSort(speakers).map(({ image, name, role, linkedin }) => (
          <Speaker key={name} image={image} linkedin={linkedin} name={name} role={role} />
        ))}
      </div>
    </section>
  );
}
