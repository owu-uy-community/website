"use client";

import { motion } from "motion/react";
import Link from "next/link";

import { addUtmParams } from "app/lib/utils";

type CommunitiesProps = {
  title?: string;
  subtitle?: string;
  communities?: {
    name: string;
    picture: {
      url: string;
    };
    website?: string;
  }[];
};

export default function Communities({ title, subtitle, communities = [] }: CommunitiesProps) {
  const logos = [...communities, ...communities];

  return (
    <div className="flex w-full max-w-[1200px] flex-col items-center gap-5">
      <span>
        <h2 className="text-center text-5xl font-bold text-yellow-400">{title}</h2>
        <p className="mt-2 text-center text-lg font-[400] text-white">{subtitle}</p>
      </span>
      <div className="relative h-full w-full max-w-[1200px] overflow-hidden py-8 [mask-image:_linear-gradient(to_right,transparent_0,_black_128px,_black_calc(100%-200px),transparent_100%)]">
        <motion.div
          animate={{
            x: ["0%", "-100%"],
            transition: {
              ease: "linear",
              duration: 60,
              repeat: Infinity,
            },
          }}
          className="relative flex items-center"
        >
          {logos.map(({ name, picture, website }) => (
            <Link
              key={website ?? "#"}
              className="z-50 mx-2 flex w-2/6 flex-shrink-0 hover:scale-105 md:w-1/6"
              href={addUtmParams(website ?? "#")}
              target="_blank"
            >
              <img alt={name} className="w-full max-w-[150px]" src={picture.url} />
            </Link>
          ))}
        </motion.div>
      </div>
    </div>
  );
}
