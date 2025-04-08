"use client";
import { SectionKey } from "components/shared/Navbar/navSections";
import { useNavigationContext } from "components/shared/Navbar/navigationProvider";

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

  return (
    <section
      ref={sectionsRefs[SectionKey.Stats]}
      className="flex w-full flex-col items-center justify-center gap-12 pt-20"
      id={SectionKey.Stats}
    >
      <span className="flex flex-col gap-1">
        <h2 className="text-center text-4xl font-semibold text-white">Nuestra comunidad en cifras</h2>
        <h3 className="text-center text-zinc-400">¡Creciendo juntos, nuestra comunidad en números!</h3>
      </span>
      <div className="grid w-full place-items-center gap-5 xl:grid-cols-[1fr_550px]">
        <img
          alt="Ilustración de un carpincho"
          className="w-full min-w-[280px] max-w-[600px] self-center object-contain"
          src="/community.svg"
        />
        {stats ? (
          <div className="grid grid-cols-2 place-items-center gap-16">
            {stats.map(({ title, subtitle, count }) => (
              <Stat key={`${title}-${subtitle}`} count={count} subtitle={subtitle} title={title} />
            ))}
          </div>
        ) : (
          <div className="flex w-full flex-col items-center justify-center gap-4 text-center text-white">
            <img alt="No encontrado" className="w-full max-w-[300px] object-contain" src="/not_found.svg" />
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
