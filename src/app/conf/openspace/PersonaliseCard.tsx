"use client";

import classNames from "classnames";
import { ChevronRight, Sparkles } from "lucide-react";

/**
 * What stands in for «Para vos» until there's something to rank: one row instead of the form, so
 * on a phone the grid stays the first thing on screen. It can be answered before the day, and the
 * answers wait on this device for the first cards.
 */
export default function PersonaliseCard({
  onOpen,
  answered = false,
  className,
}: {
  onOpen: () => void;
  /** Topics already picked, with no cards to match yet. */
  answered?: boolean;
  className?: string;
}) {
  return (
    <button
      className={classNames(
        "flex w-full items-center gap-3 border border-[#FBF5E7]/12 bg-[#FBF5E7]/[0.02] px-5 py-4 text-left transition-colors hover:border-[#F5BB03]/40 hover:bg-[#F5BB03]/[0.05] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F5BB03]",
        className
      )}
      type="button"
      onClick={onOpen}
    >
      <Sparkles aria-hidden="true" className="h-4 w-4 shrink-0 text-[#F5BB03]" strokeWidth={2.2} />
      <span className="min-w-0 flex-1">
        <span className="block font-display text-xs leading-none font-semibold tracking-[0.18em] text-[#FBF5E7]/85 uppercase">
          {answered ? "Tus temas están guardados" : "Recomendaciones para vos"}
        </span>
        <span className="mt-1.5 block text-sm leading-snug text-[#FBF5E7]/70">
          {answered
            ? "Cuando haya charlas en la grilla, te marcamos las que van con lo tuyo."
            : "Contanos qué temas te interesan y te marcamos las charlas que van con lo tuyo."}
        </span>
      </span>
      <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-[#FBF5E7]/60" strokeWidth={2} />
    </button>
  );
}
