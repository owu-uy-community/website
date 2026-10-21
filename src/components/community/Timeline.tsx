"use client";

import { motion, type Variants } from "motion/react";
import type { ReactNode } from "react";

import { cn } from "app/lib/utils";

import { EASE_OUT } from "./motion";
import { SmartLink } from "./ui";

export type Milestone = { when: string; title: string; body?: ReactNode; href?: string; now?: boolean; icon?: ReactNode };

// Seconds from one milestone to the next: its icon lands, then the line draws down to the next one
const STEP = 0.32;

const node: Variants = {
  hidden: { scale: 0.4, opacity: 0 },
  show: (i: number) => ({ scale: 1, opacity: 1, transition: { type: "spring", stiffness: 420, damping: 22, delay: i * STEP } }),
};
const text: Variants = {
  hidden: { opacity: 0, x: -10 },
  show: (i: number) => ({ opacity: 1, x: 0, transition: { duration: 0.5, ease: EASE_OUT, delay: i * STEP + 0.06 } }),
};
const line: Variants = {
  hidden: { scaleY: 0 },
  show: (i: number) => ({ scaleY: 1, transition: { duration: STEP, ease: "easeInOut", delay: i * STEP + 0.12 } }),
};

/**
 * Vertical timeline. On first view it writes itself: each milestone's icon lands on the
 * rail, the line draws down to the next, the text slides in; the upcoming one glows yellow.
 */
export default function Timeline({ items }: { items: Milestone[] }) {
  return (
    <motion.ol initial="hidden" viewport={{ once: true, amount: 0.35 }} whileInView="show">
      {items.map(({ when, title, body, href, now, icon }, i) => (
        <li key={`${when}-${title}`} className="group relative grid grid-cols-[2rem_1fr] gap-x-4 pb-8 last:pb-0">
          {i < items.length - 1 ? (
            <motion.span
              aria-hidden
              className="absolute top-9 bottom-1 left-[calc(1rem-0.5px)] w-px origin-top bg-white/[0.12]"
              custom={i}
              variants={line}
            />
          ) : null}

          <motion.span
            aria-hidden
            className={cn(
              "relative flex size-8 items-center justify-center rounded-full border transition-colors duration-300 [&_svg]:size-4",
              now
                ? "border-yellow-300 bg-yellow-400 text-zinc-950"
                : "border-white/10 bg-zinc-900 text-zinc-400 group-hover:border-yellow-400/40 group-hover:text-yellow-400"
            )}
            custom={i}
            variants={node}
          >
            {/* Same markup on server and client; the CSS stops the pulse under reduced motion */}
            {now ? <span className="owu-pulse absolute inset-0 rounded-full bg-yellow-400" /> : null}
            <span className="relative">{icon}</span>
          </motion.span>

          <motion.div className="min-w-0 pt-0.5" custom={i} variants={text}>
            <p className={cn("text-xs font-semibold tracking-[0.14em] uppercase", now ? "text-yellow-400" : "text-zinc-500")}>
              {when}
              {now ? <span className="ml-2 tracking-normal normal-case">· Se viene</span> : null}
            </p>
            <p className="mt-1 font-title text-base font-semibold text-white">
              {href ? (
                <SmartLink
                  className="underline decoration-white/15 underline-offset-4 transition-colors hover:decoration-yellow-400"
                  href={href}
                  utm="historia"
                >
                  {title}
                </SmartLink>
              ) : (
                title
              )}
            </p>
            {body ? <div className="mt-1 text-sm leading-relaxed text-zinc-400">{body}</div> : null}
          </motion.div>
        </li>
      ))}
    </motion.ol>
  );
}
