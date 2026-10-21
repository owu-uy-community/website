import Image from "next/image";

import { cn } from "app/lib/utils";

type Photo = { src: string; alt: string; caption: string };

const TILTS = ["-rotate-6 translate-y-3", "rotate-2 -translate-y-1", "-rotate-1 translate-y-4", "rotate-6 translate-y-1"];

/** A fan of printed photos from past events; each lifts and straightens on hover */
export default function Polaroids({ photos, className }: { photos: Photo[]; className?: string }) {
  return (
    <ul className={cn("flex items-center justify-center", className)}>
      {photos.map((photo, index) => (
        <li
          key={photo.src}
          className={cn(
            "relative -mx-3.5 w-[6.5rem] shrink-0 bg-[#f4efe4] p-1.5 pb-7 sm:p-2 sm:pb-9 shadow-[0_24px_48px_-20px_rgba(0,0,0,0.95)] transition-[transform,translate,rotate] duration-300 ease-out hover:z-10 hover:-translate-y-5 hover:rotate-0 sm:-mx-5 sm:w-40 lg:-mx-6 lg:w-44 motion-reduce:transition-none",
            TILTS[index % TILTS.length]
          )}
        >
          <Image
            alt={photo.alt}
            className="aspect-[4/5] w-full object-cover"
            height={220}
            sizes="(min-width: 640px) 176px, 104px"
            src={photo.src}
            width={176}
          />
          <span className="owu-marker absolute inset-x-2 bottom-2 truncate text-center text-[11px] leading-none sm:text-[15px] text-zinc-800">
            {photo.caption}
          </span>
        </li>
      ))}
    </ul>
  );
}
