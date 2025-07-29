/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unnecessary-condition */
"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { FaChevronDown } from "react-icons/fa";

import { SectionKey } from "components/shared/Navbar/navSections";
import { useNavigationContext } from "components/shared/Navbar/navigationProvider";
import TicketHome from "components/Meetups/2024/TicketHome";
import { addUtmParams } from "app/lib/utils";
import { INTERNAL_ROUTES } from "app/lib/constants";

function useCounter(initialValue: number, max: number, seconds: number) {
  const [counter, setCounter] = useState(initialValue);

  useEffect(() => {
    if (max === 0) {
      return;
    }

    const interval = setInterval(() => {
      setCounter((counter) => {
        const nextCounter = counter + 1;

        if (nextCounter === max) {
          return 0;
        }

        return nextCounter;
      });
    }, seconds * 1000);

    return () => clearInterval(interval);
  }, [max, seconds]);

  return counter;
}

type HeroProps = {
  heroWords?: readonly string[];
  subtitle?: string;
  description?: string;
  slackButtonText?: string;
  slackButtonUrl?: string;
  ctaButtonText?: string;
  ctaButtonUrl?: string;
  sponsors?: any[];
};

function Hero({
  heroWords,
  subtitle,
  description,
  slackButtonText,
  slackButtonUrl,
  ctaButtonText,
  ctaButtonUrl,
}: HeroProps) {
  const [isInitialWord, setIsInitialWord] = useState(true);
  const { sectionsRefs } = useNavigationContext();

  const counter = useCounter(0, heroWords ? heroWords.length : 0, 3);
  const title = heroWords ? (typeof heroWords === "string" ? heroWords : heroWords[counter]) : "";

  useEffect(() => {
    // This is to prevent the initial word from animating so user can see the first word
    // as soon as the page loads without waiting for the animation.
    setIsInitialWord(false);
    // This empty dependency array to run only once when the component mounts.
  }, []);

  return (
    <div
      ref={sectionsRefs[SectionKey.Hero]}
      className="relative mx-auto min-h-[calc(100dvh-56px)] pt-32"
      id={SectionKey.Hero}
    >
      <div className="flex h-full items-center justify-center bg-cover bg-center text-primary md:justify-around">
        <div className="z-10 w-auto text-center">
          <div className="flex flex-col items-center">
            <div className="mb-12">
              <p className="font-title text-5xl font-extrabold sm:text-5xl md:text-7xl xl:text-8xl">
                <motion.span
                  key={title}
                  animate={{ opacity: 1, y: 0 }}
                  className="inline-block text-yellow-400"
                  initial={!isInitialWord ? { opacity: 0, y: 20 } : undefined}
                  transition={{
                    duration: 1,
                    type: "spring",
                    velocity: 2,
                  }}
                >
                  {title}
                </motion.span>
              </p>
              <span
                className="font-title text-5xl font-extrabold text-white sm:text-5xl md:text-7xl xl:text-8xl"
                style={{ width: "min-content" }}
              >
                {subtitle}
              </span>
              <p className="mx-auto mt-4 max-w-[640px] text-lg font-medium text-gray-300 md:text-[22px]">
                {description}
              </p>
            </div>
            <Link href={addUtmParams(slackButtonUrl ?? "#")} rel="noreferrer" target="_blank">
              <button
                className="text-md m-auto flex min-w-[220px] items-center justify-center rounded-md bg-white py-2 font-semibold text-black hover:bg-yellow-400 md:px-8 md:py-3"
                type="button"
              >
                {slackButtonText}
              </button>
            </Link>
            <Link className="mt-5 hidden lg:block" href={INTERNAL_ROUTES.meetups.current}>
              <TicketHome />
            </Link>
            <Link
              className="absolute bottom-2 flex flex-col items-center justify-center gap-2.5 self-center text-sm font-semibold text-white md:text-lg"
              href={ctaButtonUrl ?? "#"}
            >
              {ctaButtonText}
              <FaChevronDown className="ml-3 animate-bounce" width="16px" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Hero;
