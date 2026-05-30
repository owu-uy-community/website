"use client";
import Image from "next/image";

import { SectionKey } from "components/shared/Navbar/navSections";
import { useNavigationContext } from "components/shared/Navbar/navigationProvider";
import { RichText } from "components/shared/RichText";
import SectionHeading from "components/Landing/SectionHeading";

type StoryProps = {
  content?: unknown;
  image?: string;
};

export default function Story({ content, image }: StoryProps) {
  const { sectionsRefs } = useNavigationContext();

  return (
    <section
      ref={sectionsRefs[SectionKey.Story]}
      className="flex w-full flex-col gap-12 pt-24 text-white sm:pt-28 lg:pt-32"
      id={SectionKey.Story}
    >
      <SectionHeading subtitle="Nuestra Historia" title="¿Qué es OWU Uruguay?" />
      <div className="grid items-center gap-10 md:grid-cols-[1fr_420px] lg:gap-16 xl:grid-cols-[1fr_480px]">
        <div className="richtext flex w-full max-w-[60ch] flex-col gap-4 text-base leading-relaxed text-zinc-300">
          <RichText content={content as string} />
        </div>
        <div className="flex w-full justify-center md:justify-end">
          <span className="relative aspect-square w-full max-w-[420px]">
            <Image
              fill
              alt="Ilustración de un carpincho"
              className="object-contain"
              sizes="(max-width: 768px) 80vw, 420px"
              src={image ?? ""}
            />
          </span>
        </div>
      </div>
    </section>
  );
}
