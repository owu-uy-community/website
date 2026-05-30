/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unnecessary-condition */
"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { FaChevronDown } from "react-icons/fa";

import { SectionKey } from "components/shared/Navbar/navSections";
import { useNavigationContext } from "components/shared/Navbar/navigationProvider";
import UnpluggedTicket from "components/Landing/UnpluggedTicket";
import { addUtmParams } from "app/lib/utils";

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
      className="relative mx-auto flex min-h-[calc(100dvh-56px)] w-full flex-col items-center justify-center px-4 pb-24 pt-12 text-primary sm:pt-16 lg:pb-28"
      id={SectionKey.Hero}
    >
      <div className="z-10 flex w-full max-w-3xl flex-col items-center text-center">
        <div className="flex flex-col items-center">
          <p className="font-title text-[2.5rem] font-extrabold leading-[1.05] tracking-tight sm:text-6xl md:text-7xl xl:text-8xl">
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
          {subtitle ? (
            <span className="font-title text-[2.5rem] font-extrabold leading-[1.05] tracking-tight text-white sm:text-6xl md:text-7xl xl:text-8xl">
              {subtitle}
            </span>
          ) : null}
          <p className="mx-auto mt-5 max-w-[600px] text-balance text-base font-medium leading-relaxed text-zinc-300 sm:text-lg md:text-xl">
            {description}
          </p>
        </div>
        <Link
          className="mt-10"
          href={addUtmParams(slackButtonUrl ?? "#")}
          rel="noreferrer"
          target="_blank"
        >
          <button
            className="inline-flex min-w-[220px] items-center justify-center rounded-lg bg-white px-8 py-3 text-base font-semibold text-black shadow-lg shadow-black/30 transition-all duration-200 hover:-translate-y-0.5 hover:bg-yellow-400 hover:shadow-yellow-400/20 active:translate-y-0"
            type="button"
          >
            {slackButtonText}
          </button>
        </Link>
        <div className="mt-10 flex w-full justify-center">
          <UnpluggedTicket />
        </div>
      </div>
      <Link
        className="group absolute inset-x-0 bottom-6 mx-auto flex flex-col items-center justify-center gap-2 px-4 text-center text-xs font-semibold text-white/80 transition-colors hover:text-white sm:text-sm md:text-base"
        href={ctaButtonUrl ?? "#"}
      >
        <span className="whitespace-nowrap">{ctaButtonText}</span>
        <FaChevronDown className="animate-bounce" width="16px" />
      </Link>
    </div>
  );
}

export default Hero;
