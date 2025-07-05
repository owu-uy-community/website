"use client";
import Link from "next/link";

import { addUtmParams } from "app/lib/utils";

type Sponsor = {
  name: string;
  image: string;
  website?: string;
};

export default function Sponsor({ name, image, website }: Sponsor) {
  return (
    <Link
      className="relative flex min-w-[250px] max-w-[300px] flex-1 flex-col items-center justify-center rounded-md bg-white/10 p-[1px] transition-all"
      href={addUtmParams(website ?? "#")}
      target="_blank"
    >
      <div className="flex w-full flex-1 flex-col justify-between gap-2 rounded-md bg-[#000214]/50 px-6 py-5 transition">
        <span>
          <figure className="flex items-center justify-center">
            <img
              alt={name}
              className="h-32 w-56 rounded-md object-contain brightness-0 contrast-100 invert filter transition"
              loading="lazy"
              src={image}
            />
          </figure>
        </span>
      </div>
    </Link>
  );
}
