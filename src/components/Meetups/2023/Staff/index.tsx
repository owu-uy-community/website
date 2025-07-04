"use client";

import { alphabeticalSort } from "app/lib/utils";

import Member from "../Member";

type StaffProps = {
  title: string;
  subtitle: string;
  staff?: {
    name: string;
    role: string;
    image: string;
    linkedin: string;
  }[];
};

export default function Staff({ title, subtitle, staff }: StaffProps) {
  return (
    <section
      className="relative flex w-full max-w-[800px] flex-1 flex-col items-center justify-center gap-4 pt-[64px]"
      id="organization-team"
    >
      <span>
        <h2 className="text-center text-5xl font-bold text-yellow-400">{title}</h2>
        <p className="mt-2 text-center text-lg font-[400] text-white">{subtitle}</p>
      </span>
      <div className="flex w-full max-w-[800px] flex-row flex-wrap items-center justify-center gap-5">
        {alphabeticalSort(staff).map(({ name, role, image, linkedin }) => (
          <Member key={name} image={image} linkedin={linkedin} name={name} role={role} />
        ))}
      </div>
    </section>
  );
}
