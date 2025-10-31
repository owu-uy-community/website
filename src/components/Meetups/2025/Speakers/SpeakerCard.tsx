"use client";

import Image from "next/image";
import { MicVocal, MicVocalIcon, Presentation } from "lucide-react";
import SpeakerModal from "./SpeakerModal";
import SocialLinks from "./SocialLinks";

type Speaker = {
  firstname: string;
  lastname: string;
  picture?: { url: string };
  jobTitle?: string;
  company?: string;
  github?: string;
  linkedin?: string;
  x?: string;
};

type SpeakerCardProps = {
  firstname: string;
  lastname: string;
  picture?: { url: string };
  jobTitle?: string;
  company?: string;
  github?: string;
  linkedin?: string;
  x?: string;
  talkTitle?: string;
  talkDescription?: string;
  allSpeakers?: Speaker[]; // All speakers for this talk
};

export default function SpeakerCard({
  firstname,
  lastname,
  picture,
  jobTitle,
  company,
  github,
  linkedin,
  x,
  talkTitle,
  talkDescription,
  allSpeakers,
}: SpeakerCardProps) {
  const fullName = `${firstname} ${lastname}`;
  const imageSrc = picture?.url || "/images/events/placeholder.webp";

  const cardContent = (
    <article className="group flex h-full w-full min-w-[230px] max-w-[300px] cursor-pointer flex-col items-center rounded-md bg-white/10 p-[1px] transition-all hover:bg-white/20 lg:max-w-[240px]">
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

        {/* Speaker Name */}
        <div className="flex flex-1 flex-col items-center justify-center gap-1 text-center">
          <h4 className="text-center font-black uppercase tracking-wide text-yellow-400">
            <div className="text-sm">
              {firstname} {lastname}
            </div>
          </h4>

          {/* Speaker details */}
          <div className="flex flex-col items-center gap-1 text-center">
            {jobTitle && <p className="text-[13px] font-medium text-gray-300">{jobTitle}</p>}
            {company && (
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 md:text-xs">{company}</p>
            )}
          </div>

          {/* Social Links and Presentation Icon - Centered */}
          {(github || linkedin || x || (talkTitle && talkDescription)) && (
            <div className="mt-3 flex items-center justify-center gap-3">
              <div onClick={(e) => e.stopPropagation()}>
                <SocialLinks github={github} linkedin={linkedin} x={x} speakerName={fullName} />
              </div>
              {talkTitle && talkDescription && (
                <button
                  type="button"
                  className="text-white transition-colors hover:text-yellow-400 focus:outline-none"
                  aria-label={`Ver descripción de la charla de ${fullName}`}
                  title="Ver descripción de la charla"
                >
                  <MicVocalIcon size={22} strokeWidth={2.5} />
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </article>
  );

  return (
    <SpeakerModal
      trigger={cardContent}
      firstname={firstname}
      lastname={lastname}
      picture={picture}
      jobTitle={jobTitle}
      company={company}
      github={github}
      linkedin={linkedin}
      x={x}
      talkTitle={talkTitle}
      talkDescription={talkDescription}
      allSpeakers={allSpeakers}
    />
  );
}
