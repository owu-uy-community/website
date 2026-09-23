"use client";

import classNames from "classnames";
import { useState } from "react";
import { Sparkles, X } from "lucide-react";

import { GOALS, TOPICS, type GoalId, type TopicId } from "lib/openspace/topics";

import type { Interests } from "./use-interests";

type InterestSurveyProps = {
  onSave: (interests: Interests) => void;
  onDismiss: () => void;
};

/**
 * Two taps and you are done. Inline rather than a modal: people open this page
 * standing in a corridor between sessions, and a dialog that has to be
 * dismissed before the grid is readable would be worse than no feature.
 */
export default function InterestSurvey({ onSave, onDismiss }: InterestSurveyProps) {
  const [topics, setTopics] = useState<TopicId[]>([]);
  const [goal, setGoal] = useState<GoalId>("todo");

  const toggle = (id: TopicId) =>
    setTopics((current) => (current.includes(id) ? current.filter((t) => t !== id) : [...current, id]));

  return (
    <section
      aria-labelledby="survey-title"
      className="border border-[#F5BB03]/30 bg-[#F5BB03]/[0.06] p-5 sm:p-6"
    >
      <div className="flex items-start gap-3">
        <Sparkles aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-[#F5BB03]" strokeWidth={2} />
        <div className="min-w-0 flex-1">
          <h2
            className="font-display text-base font-extrabold uppercase leading-tight tracking-[-0.01em] text-[#FBF5E7]"
            id="survey-title"
          >
            ¿Te armamos una ruta?
          </h2>
          <p className="mt-1.5 text-sm leading-relaxed text-[#FBF5E7]/75">
            Decinos qué te interesa y te ordenamos la grilla por lo que más tiene que ver con vos. Queda solo en este
            teléfono.
          </p>
        </div>
        <button
          aria-label="Ahora no"
          className="-m-2 shrink-0 p-2 text-[#FBF5E7]/50 transition-colors hover:text-[#FBF5E7] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F5BB03]"
          type="button"
          onClick={onDismiss}
        >
          <X aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>

      <fieldset className="mt-5">
        <legend className="font-display text-[11px] font-bold uppercase leading-none tracking-[0.14em] text-[#FBF5E7]/60">
          ¿Con qué andás? (elegí las que quieras)
        </legend>
        <div className="mt-3 flex flex-wrap gap-2">
          {TOPICS.map((topic) => {
            const on = topics.includes(topic.id);

            return (
              <button
                key={topic.id}
                aria-pressed={on}
                className={classNames(
                  // 44px min target: this is tapped with a thumb, one-handed.
                  "min-h-11 rounded-full border px-4 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F5BB03]",
                  on
                    ? "border-[#F5BB03] bg-[#F5BB03] font-semibold text-black"
                    : "border-[#FBF5E7]/25 text-[#FBF5E7]/80 hover:border-[#FBF5E7]/50 hover:text-[#FBF5E7]"
                )}
                type="button"
                onClick={() => toggle(topic.id)}
              >
                {topic.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="mt-5">
        <legend className="font-display text-[11px] font-bold uppercase leading-none tracking-[0.14em] text-[#FBF5E7]/60">
          ¿Qué buscás hoy?
        </legend>
        <div className="mt-3 flex flex-wrap gap-2">
          {GOALS.map((entry) => {
            const on = goal === entry.id;

            return (
              <button
                key={entry.id}
                aria-pressed={on}
                className={classNames(
                  "min-h-11 rounded-full border px-4 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F5BB03]",
                  on
                    ? "border-[#FBF5E7] bg-[#FBF5E7] font-semibold text-black"
                    : "border-[#FBF5E7]/25 text-[#FBF5E7]/80 hover:border-[#FBF5E7]/50 hover:text-[#FBF5E7]"
                )}
                type="button"
                onClick={() => setGoal(entry.id)}
              >
                {entry.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      <button
        className="mt-6 inline-flex min-h-11 w-full items-center justify-center gap-2 bg-[#FBF5E7] px-6 font-display text-sm font-bold uppercase leading-none text-black transition-colors hover:bg-[#F5BB03] disabled:cursor-not-allowed disabled:bg-[#FBF5E7]/25 disabled:text-black/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#F5BB03] sm:w-auto"
        disabled={topics.length === 0}
        type="button"
        onClick={() => onSave({ topics, goal })}
      >
        {topics.length === 0 ? "Elegí al menos un tema" : "Ver mis sugerencias"}
      </button>
    </section>
  );
}
