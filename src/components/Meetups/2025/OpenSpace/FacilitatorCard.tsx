"use client";

import Image from "next/image";
import SocialLinks from "../Speakers/SocialLinks";

type FacilitatorCardProps = {
  firstname: string;
  lastname: string;
  picture?: { url: string };
  jobTitle?: string;
  github?: string;
  linkedin?: string;
  x?: string;
};

export default function FacilitatorCard({
  firstname,
  lastname,
  picture,
  jobTitle,
  github,
  linkedin,
  x,
}: FacilitatorCardProps) {
  const fullName = `${firstname} ${lastname}`;
  const imageSrc = picture?.url || "/images/events/placeholder.webp";

  const cardContent = (
    <article className="group flex h-full w-full flex-col items-center rounded-md bg-white/10 p-[1px] transition-all hover:bg-white/20">
      <div className="flex h-full w-full flex-col items-center rounded-md bg-[#000214]/50 px-6 py-6 transition">
        {/* Circular profile image with border ring */}
        <div className="relative mb-4 h-[120px] w-[120px] shrink-0 md:h-[150px] md:w-[150px]">
          <div className="absolute inset-0 rounded-full bg-zinc-800 p-[3px]">
            <div className="h-full w-full overflow-hidden rounded-full bg-[#000214]/50">
              <Image
                className="h-full w-full cursor-pointer object-cover object-center transition-all duration-300 group-hover:scale-105"
                alt={`Fotografía de ${fullName}`}
                src={imageSrc}
                width={150}
                height={150}
                priority={false}
              />
            </div>
          </div>
        </div>

        {/* Facilitator Name */}
        <div className="flex flex-1 flex-col items-center justify-center gap-1 text-center">
          <h4 className="text-center font-black uppercase tracking-wide text-yellow-400">
            <div className="text-sm">
              {firstname} {lastname}
            </div>
          </h4>

          {/* Facilitator details */}
          <div className="flex flex-col items-center gap-1 text-center">
            {jobTitle && <p className="text-[13px] font-medium text-gray-300">{jobTitle}</p>}
          </div>

          {/* Social Links - Centered - Only show if card is not wrapped in a link */}
          {!linkedin && (github || x) && (
            <div className="mt-3 flex items-center justify-center gap-3">
              <SocialLinks github={github} linkedin="" x={x} speakerName={fullName} />
            </div>
          )}
        </div>
      </div>
    </article>
  );

  if (linkedin) {
    return (
      <a
        href={linkedin}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Perfil de LinkedIn de ${fullName}`}
        className="block w-full min-w-[230px] max-w-[300px] lg:max-w-[240px]"
      >
        {cardContent}
      </a>
    );
  }

  return cardContent;
}
