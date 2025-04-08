import Link from "next/link";

import { randomArraySort } from "app/lib/utils";

import Sponsor from "../Sponsor";

type SponsorsProps = {
  sponsors?: {
    name: string;
    logo: {
      url: string;
    };
    website?: string;
  }[];
};

export default function Sponsors({ sponsors = [] }: SponsorsProps) {
  const sponsorsList = randomArraySort(sponsors);

  return (
    <div className="flex w-full max-w-[1200px] flex-col items-center gap-5">
      <span>
        <h2 className="text-center text-5xl font-bold text-yellow-400">Sponsors</h2>
        <p className="mt-2 text-center text-lg font-[400] text-white">
          ¡Nuestros aliados y patrocinadores que hacen este evento posible!
        </p>
      </span>
      <div className="flex flex-row flex-wrap items-center justify-center gap-5">
        {sponsorsList.map(({ name, logo, website }) => (
          <Sponsor key={name} image={logo.url} name={name} website={website} />
        ))}
      </div>
      <Link
        className="mt-2 inline-flex w-full max-w-[280px] skew-x-[-21deg] cursor-pointer items-center justify-center self-center border-2 border-yellow-400 px-5 py-2.5 text-base font-semibold uppercase text-white ease-in before:absolute before:-inset-0.5 before:origin-right before:scale-x-0 before:bg-yellow-400 hover:scale-110 hover:text-black hover:before:origin-left hover:before:scale-x-100 aria-disabled:pointer-events-none aria-disabled:border-[#666] aria-disabled:bg-[#666] aria-disabled:text-[#111] motion-safe:transition-[color,transform] motion-safe:before:transition-transform motion-safe:before:duration-300 motion-safe:before:ease-in motion-safe:hover:delay-100 motion-safe:hover:ease-out motion-safe:hover:before:delay-100 motion-safe:hover:before:ease-out"
        href="/la-meetup/sponsors"
      >
        <span className="inline-flex skew-x-[21deg] items-center justify-center text-center">¡QUIERO SER SPONSOR!</span>
      </Link>
    </div>
  );
}
