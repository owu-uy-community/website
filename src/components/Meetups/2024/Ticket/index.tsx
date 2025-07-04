/* eslint-disable @typescript-eslint/no-unsafe-assignment */
"use client";

import { useState, useEffect } from "react";
import classNames from "classnames";
import "atropos/css";

type Sponsor = {
  readonly name: string;
  readonly image: string;
  readonly website?: string;
};

type TicketProps = {
  sponsors?: readonly Sponsor[];
};

export default function Ticket({ sponsors }: TicketProps) {
  const [currentSponsors, setCurrentSponsors] = useState<readonly Sponsor[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      const nextIndex = (currentIndex + 1) % (sponsors?.length ?? 0);

      setCurrentIndex(nextIndex);
    }, 6000);

    return () => {
      clearInterval(interval);
    };
  }, [currentIndex]);

  useEffect(() => {
    if (sponsors?.length) {
      const slicedSponsors = sponsors.slice(currentIndex, currentIndex + 5);

      setCurrentSponsors(slicedSponsors);
    }
  }, [currentIndex, sponsors ?? []]);

  return (
    <div
      className={classNames(
        "aspect-none mx-auto block h-full w-full min-w-[280px] cursor-pointer overflow-hidden rounded-[30px] border border-gray-700/10 bg-transparent p-5 opacity-100 shadow-[inset_0_4px_30px] shadow-gray-700/25 transition duration-500 ease-in-out md:aspect-[2/1] lg:min-w-[550px]"
      )}
    >
      <div
        className={classNames(
          "relative grid h-full overflow-hidden rounded-[10px] border border-gray-300/20 bg-[#24292e]/50 py-6 transition duration-500 ease-in-out md:flex"
        )}
      >
        <div className="absolute left-1/2 top-1/2 h-[300%] w-1/2 -translate-x-1/2 -translate-y-1/2 rotate-45 bg-gradient-to-r from-[#41b3ff00] via-[#b0a9ff13] to-[#41b3ff00]" />
        <span
          className={classNames(
            "ticket-dash-border hidden h-full items-center justify-center px-4 py-0 text-center font-mono text-3xl font-bold leading-none text-white [writing-mode:vertical-lr] lg:flex"
          )}
        >
          #0001
        </span>
        <div className="flex w-full flex-col px-5 text-left">
          <span className="spacing text-sm tracking-wider text-gray-300 lg:text-lg">#LaMeetup</span>
          <p className="text-xs font-semibold text-yellow-400 lg:absolute lg:right-4 lg:top-6">01.11.2025</p>
          <p className="text-gray-400/150 text-xs text-gray-400 lg:absolute lg:right-4 lg:top-11">SINERGIA FARO</p>
          <img alt="OWU Uruguay" className="mt-4 max-w-[90px] object-cover lg:max-w-[190px]" src="/ticket_logo.webp" />
          <p className="text-gray-400/150 absolute bottom-6 right-4 text-xs text-gray-400">
            ¡Haz clic para ver más información!
          </p>
          <div className="mt-[5px] flex h-[35px] w-full flex-row items-center gap-2">
            {currentSponsors.map((sponsor) => (
              <img
                key={sponsor.name}
                alt={sponsor.name}
                className="w-full max-w-[75px] object-scale-down brightness-0 contrast-100 invert filter"
                loading="eager"
                src={sponsor.image}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
