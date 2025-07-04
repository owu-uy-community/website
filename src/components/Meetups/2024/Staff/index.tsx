"use client";

import { alphabeticalSort } from "app/lib/utils";

import Member from "../Member";

type StaffProps = {
  staff?: {
    firstname: string;
    lastname: string;
    picture?: {
      url: string;
    };
    jobtitle: string;
    linkedin?: string;
    github?: string;
    twitter?: string;
  }[];
};

export default function Staff({ staff = [] }: StaffProps) {
  return (
    <section
      className="relative flex w-full max-w-[1200px] flex-1 flex-col items-center justify-center gap-4"
      id="speakers"
    >
      <span>
        <h2 className="text-center text-5xl font-bold text-yellow-400">Equipo de Organización</h2>
        <p className="mt-2 text-center text-lg font-[400] text-white">Personas que organizan el evento</p>
      </span>
      <div className="flex flex-row flex-wrap items-center justify-center gap-5">
        {alphabeticalSort(staff, "lastname").map(
          ({ firstname, lastname, picture, jobtitle, linkedin, github, twitter }) => (
            <Member
              key={lastname}
              github={github}
              image={picture?.url ?? "/carpincho.png"}
              linkedin={linkedin}
              name={`${firstname} ${lastname}`}
              role={jobtitle}
              twitter={twitter}
            />
          )
        )}
      </div>
    </section>
  );
}
