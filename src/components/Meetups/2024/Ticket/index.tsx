/* eslint-disable @typescript-eslint/no-unsafe-assignment */
"use client";

import { useState, useEffect } from "react";
import classNames from "classnames";
import "atropos/css";
import { useTicketRelease } from "contexts/TicketReleaseContext";

type Sponsor = {
  readonly name: string;
  readonly image: string;
  readonly website?: string;
};

type TicketProps = {
  sponsors?: readonly Sponsor[];
  releaseDate?: string; // ISO date string for ticket release (kept for backward compatibility but will use context)
  ticketUrl?: string; // URL for ticket purchase after release (kept for backward compatibility but will use context)
};

type TimeLeft = {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
};

export default function Ticket({ sponsors, releaseDate: _releaseDate, ticketUrl: _ticketUrl }: TicketProps) {
  // Use centralized ticket release state
  const { isReleased, releaseDate, ticketUrl } = useTicketRelease();

  const [currentSponsors, setCurrentSponsors] = useState<readonly Sponsor[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState<TimeLeft>({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
  });
  const [localReleaseTime, setLocalReleaseTime] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Format release date to user's local time
  useEffect(() => {
    if (releaseDate) {
      const date = new Date(releaseDate);
      const options: Intl.DateTimeFormatOptions = {
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      };
      const formattedDate = date.toLocaleDateString("es-UY", options);
      setLocalReleaseTime(formattedDate);
    }
  }, [releaseDate]);

  // Countdown calculation
  const calculateTimeLeft = () => {
    if (!releaseDate) return { days: 0, hours: 0, minutes: 0, seconds: 0 };

    const difference = +new Date(releaseDate) - +new Date();

    if (difference > 0) {
      return {
        days: Math.floor(difference / (1000 * 60 * 60 * 24)),
        hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
        minutes: Math.floor((difference / 1000 / 60) % 60),
        seconds: Math.floor((difference / 1000) % 60),
      };
    }

    return { days: 0, hours: 0, minutes: 0, seconds: 0 };
  };

  // Countdown timer effect - only updates countdown display, not release status
  useEffect(() => {
    if (!releaseDate) {
      setIsLoading(false);
      return;
    }

    const initialTimeLeft = calculateTimeLeft();
    setTimeLeft(initialTimeLeft);
    setIsLoading(false);

    const timer = setInterval(() => {
      const newTimeLeft = calculateTimeLeft();
      setTimeLeft(newTimeLeft);
      // Note: isReleased state is now managed by TicketReleaseContext
    }, 1000);

    return () => clearInterval(timer);
  }, [releaseDate]);

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

  const formatNumber = (num: number) => String(num).padStart(2, "0");

  return (
    <div
      className={classNames(
        "mx-auto block w-full overflow-hidden rounded-[20px] border border-gray-700/10 bg-transparent p-2 opacity-100 shadow-[inset_0_4px_30px] shadow-gray-700/25 transition duration-500 ease-in-out sm:aspect-[2/1] sm:h-full sm:rounded-[30px] sm:p-5 lg:min-w-[550px] lg:max-w-[550px]",
        {
          "cursor-pointer hover:border-gray-600/20": isReleased && ticketUrl,
          "cursor-default": !isReleased || !ticketUrl,
        }
      )}
    >
      <div
        className={classNames(
          "relative flex flex-col overflow-hidden rounded-[10px] border border-gray-300/20 bg-[#24292e]/50 transition duration-500 ease-in-out sm:h-full sm:min-h-0 sm:flex-row"
        )}
      >
        <div className="absolute left-1/2 top-1/2 h-[300%] w-1/2 -translate-x-1/2 -translate-y-1/2 rotate-45 bg-gradient-to-r from-[#41b3ff00] via-[#b0a9ff13] to-[#41b3ff00]" />

        {/* Loading Skeleton Overlay */}
        {isLoading && (
          <div className="pointer-events-none absolute inset-0 z-20 animate-pulse rounded-[10px] bg-[#24292e]/95 backdrop-blur-sm"></div>
        )}

        {/* Countdown Overlay */}
        {!isLoading && !isReleased && releaseDate && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-[10px] bg-[#24292e]/95 backdrop-blur-sm">
            <div className="flex flex-col gap-3 px-3 text-center sm:gap-4 sm:px-4">
              <h3 className="mb-1 text-sm font-bold leading-tight text-white sm:mb-2 sm:text-base lg:text-lg">
                Entradas disponibles desde el <br />
                {/* eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing */}
                <span className="text-yellow-400">{localReleaseTime || "13 de octubre de 2025, 00:00"}</span>
              </h3>

              <div className="flex justify-center gap-2 sm:gap-3 lg:gap-4">
                <div className="flex flex-col items-center">
                  <div className="relative">
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[#18181b] shadow-lg sm:h-16 sm:w-16 lg:h-20 lg:w-20">
                      <span className="text-xl font-bold text-white sm:text-2xl lg:text-3xl">
                        {formatNumber(timeLeft.days)}
                      </span>
                    </div>
                  </div>
                  <span className="mt-1 text-[10px] text-gray-400 sm:mt-2 sm:text-xs lg:text-sm">
                    {timeLeft.days === 1 ? "Día" : "Días"}
                  </span>
                </div>
                <div className="flex flex-col items-center">
                  <div className="relative">
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[#18181b] shadow-lg sm:h-16 sm:w-16 lg:h-20 lg:w-20">
                      <span className="text-xl font-bold text-white sm:text-2xl lg:text-3xl">
                        {formatNumber(timeLeft.hours)}
                      </span>
                    </div>
                  </div>
                  <span className="mt-1 text-[10px] text-gray-400 sm:mt-2 sm:text-xs lg:text-sm">
                    {timeLeft.hours === 1 ? "Hora" : "Horas"}
                  </span>
                </div>
                <div className="flex flex-col items-center">
                  <div className="relative">
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[#18181b] shadow-lg sm:h-16 sm:w-16 lg:h-20 lg:w-20">
                      <span className="text-xl font-bold text-white sm:text-2xl lg:text-3xl">
                        {formatNumber(timeLeft.minutes)}
                      </span>
                    </div>
                  </div>
                  <span className="mt-1 text-[10px] text-gray-400 sm:mt-2 sm:text-xs lg:text-sm">
                    {timeLeft.minutes === 1 ? "Minuto" : "Minutos"}
                  </span>
                </div>
                <div className="flex flex-col items-center">
                  <div className="relative">
                    <div className="flex h-12 w-12 animate-pulse items-center justify-center rounded-lg bg-[#18181b] shadow-lg sm:h-16 sm:w-16 lg:h-20 lg:w-20">
                      <span className="text-xl font-bold text-white sm:text-2xl lg:text-3xl">
                        {formatNumber(timeLeft.seconds)}
                      </span>
                    </div>
                  </div>
                  <span className="mt-1 text-[10px] text-gray-400 sm:mt-2 sm:text-xs lg:text-sm">
                    {timeLeft.seconds === 1 ? "Segundo" : "Segundos"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Ticket Number - Only on desktop */}
        <span
          className={classNames(
            "ticket-dash-border hidden h-full items-center justify-center px-4 py-0 text-center font-mono text-3xl font-bold leading-none text-white [writing-mode:vertical-lr] sm:flex"
          )}
        >
          #0001
        </span>

        {/* Main Content */}
        <div className="relative flex h-full w-full flex-col items-center justify-center gap-4 px-4 py-8 text-left sm:px-5 sm:py-0">
          {/* Desktop only - Header info */}
          <div className="hidden sm:absolute sm:left-5 sm:top-6 sm:block">
            <span className="spacing text-sm tracking-wider text-gray-300 lg:text-lg">#LaMeetup</span>
          </div>

          {/* Logo - centered on mobile, left-aligned and vertically centered on desktop */}
          <div className="flex flex-col items-center justify-center sm:absolute sm:left-5 sm:top-1/2 sm:mt-2.5 sm:-translate-y-1/2">
            <img alt="OWU Uruguay" className="max-w-[150px] object-cover lg:max-w-[190px]" src="/ticket_logo.webp" />
          </div>

          {/* Click text - mobile centered, desktop bottom right */}
          <p className="text-center text-sm font-medium leading-relaxed text-gray-400 sm:absolute sm:bottom-6 sm:right-5 sm:text-left sm:text-xs">
            {isReleased && ticketUrl ? "¡Haz clic para obtener tu entrada!" : "¡Haz clic para ver más información!"}
          </p>

          {/* Desktop only - Date and location at top right */}
          <p className="hidden text-xs font-semibold text-yellow-400 sm:absolute sm:right-5 sm:top-6 sm:block">
            01.11.2025
          </p>
          <p className="text-gray-400/150 hidden text-xs text-gray-400 sm:absolute sm:right-5 sm:top-11 sm:block">
            SINERGIA FARO
          </p>

          {/* Desktop only - Sponsors at bottom left */}
          <div className="hidden h-[35px] flex-row items-center justify-start gap-2 sm:absolute sm:bottom-6 sm:left-5 sm:flex">
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
