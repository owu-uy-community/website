"use client";
import { useInView } from "motion/react";
import { useRef } from "react";

import { SectionKey } from "components/shared/Navbar/navSections";
import { useNavigationContext } from "components/shared/Navbar/navigationProvider";
import SectionHeading from "components/Landing/SectionHeading";

import Stat from "../Stat";

type StatsProps = {
  stats?: readonly {
    title: string;
    subtitle: string;
    count: number | null;
  }[];
};

export default function Stats({ stats }: StatsProps) {
  const { sectionsRefs } = useNavigationContext();
  const statsGridRef = useRef<HTMLDivElement>(null);
  const statsInView = useInView(statsGridRef, { once: true, amount: 0.3 });

  return (
    <section
      ref={sectionsRefs[SectionKey.Stats]}
      className="flex w-full flex-col items-center gap-12 pt-24 sm:pt-28 lg:pt-32"
      id={SectionKey.Stats}
    >
      <SectionHeading subtitle="¡Creciendo juntos, nuestra comunidad en números!" title="Nuestra comunidad en cifras" />
      <div className="grid w-full place-items-center gap-10 xl:grid-cols-[1fr_550px] xl:gap-8">
        <img
          alt="Ilustración de un carpincho"
          className="w-full min-w-[280px] max-w-[600px] self-center object-contain"
          src="/icons/community.svg"
        />
        {stats ? (
          <div ref={statsGridRef} className="grid grid-cols-2 place-items-center gap-x-10 gap-y-12 sm:gap-x-16">
            {stats.map(({ title, subtitle, count }, index) => (
              <Stat
                key={`${title}-${subtitle}`}
                count={count}
                index={index}
                play={statsInView}
                subtitle={subtitle}
                title={title}
              />
            ))}
          </div>
        ) : (
          <div className="flex w-full flex-col items-center justify-center gap-4 text-center text-white">
            <img alt="No encontrado" className="w-full max-w-[300px] object-contain" src="/icons/not_found.svg" />
            <span>
              <h2 className="text-lg font-semibold">¡Lo sentimos!</h2>
              <p className="text-lg">No se han encontrado estadísticas</p>
            </span>
          </div>
        )}
      </div>
    </section>
  );
}
