"use client";

import classNames from "classnames";
import { ChevronRight, Sparkles } from "lucide-react";

/**
 * What stands in for "Para vos" before anyone has answered the survey.
 *
 * One row instead of the form itself: on a phone the grid is the reason people
 * opened this page, and an unanswered questionnaire pushing it below the fold
 * costs more than the feature is worth. The form lives in a dialog behind this.
 */
export default function PersonaliseCard({ onOpen, className }: { onOpen: () => void; className?: string }) {
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
        <span className="block font-display text-xs font-semibold uppercase leading-none tracking-[0.18em] text-[#FBF5E7]/80">
          Recomendaciones para vos
        </span>
        <span className="mt-1.5 block text-sm leading-snug text-[#FBF5E7]/60">
          Ordená la grilla según tus temas de interés.
        </span>
      </span>
      <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-[#FBF5E7]/40" strokeWidth={2} />
    </button>
  );
}
