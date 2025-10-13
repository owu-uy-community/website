"use client";

import Image from "next/image";

type StaffCardProps = {
  firstname: string;
  lastname: string;
  picture?: { url: string };
  jobTitle?: string;
  linkedin?: string;
};

export default function StaffCard({ firstname, lastname, picture, jobTitle, linkedin }: StaffCardProps) {
  const fullName = `${firstname} ${lastname}`;
  const imageSrc = picture?.url || "/placeholder.webp";

  const cardContent = (
    <article className="group flex h-full w-full flex-1 cursor-pointer flex-col items-center justify-center rounded-md bg-white/10 p-[1px] transition-all hover:bg-white/20">
      <div className="flex h-full w-full flex-1 flex-col items-center gap-4 rounded-md bg-[#000214]/50 px-6 py-6 transition">
        {/* Circular profile image with border ring */}
        <div className="relative h-[120px] w-[120px] md:h-[150px] md:w-[150px]">
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

        {/* Staff Name */}
        <div className="flex flex-col items-center gap-1 text-center">
          <h4 className="text-center font-black uppercase tracking-wide text-yellow-400">
            <div className="text-sm">
              {firstname} {lastname}
            </div>
          </h4>

          {/* Staff details */}
          <div className="flex flex-col items-center gap-1 text-center">
            {jobTitle && <p className="text-[13px] font-medium text-gray-300">{jobTitle}</p>}
          </div>
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
        className="lg: block w-full min-w-[230px] max-w-[300px] lg:max-w-[240px]"
      >
        {cardContent}
      </a>
    );
  }

  return cardContent;
}
