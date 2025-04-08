"use client";
import Image from "next/image";

import { SectionKey } from "components/shared/Navbar/navSections";
import { useNavigationContext } from "components/shared/Navbar/navigationProvider";
import { RichText } from "components/shared/RichText";

type StoryProps = {
  content?: unknown;
  image?: string;
};

export default function Story({ content, image }: StoryProps) {
  const { sectionsRefs } = useNavigationContext();

  return (
    <section
      ref={sectionsRefs[SectionKey.Story]}
      className="flex w-full flex-col justify-center gap-8 self-center pt-20 text-white"
      id={SectionKey.Story}
    >
      <span className="flex flex-col gap-1">
        <h2 className="text-center text-3xl font-bold sm:text-4xl">¿Qué es OWU Uruguay?</h2>
        <h3 className="text-center text-zinc-400">Nuestra Historia</h3>
      </span>
      <span className="grid place-items-center md:grid-cols-[1fr_500px]">
        <div className="flex w-full flex-col gap-4">
          <RichText content={content as string} />
        </div>
        <div className="flex min-h-[400px] w-full flex-col items-center justify-end xl:items-end">
          <span className="relative min-h-[400px] w-full max-w-[400px]">
            <Image
              fill
              alt="ilustración de un carpincho"
              className="w-full max-w-[400px] object-contain"
              src={image ?? ""}
            />
          </span>
        </div>
      </span>
    </section>
  );
}
