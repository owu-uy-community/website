"use client";

import classNames from "classnames";
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

import { GOALS, TOPICS, type GoalId, type TopicId } from "lib/openspace/topics";

import type { Interests } from "./use-interests";

type InterestSurveyProps = {
  open: boolean;
  /** Current answers, when reopening to adjust them. */
  initial?: Interests | null;
  onSave: (interests: Interests) => void;
  onClose: () => void;
};

/** Rendered only while open, so reopening always starts from the saved answers. */
function SurveyForm({
  initial,
  onSave,
  onClose,
}: {
  initial?: Interests | null;
  onSave: (interests: Interests) => void;
  onClose: () => void;
}) {
  const [topics, setTopics] = useState<TopicId[]>(initial?.topics ?? []);
  const [goal, setGoal] = useState<GoalId>(initial?.goal ?? "todo");

  const toggle = (id: TopicId) =>
    setTopics((current) => (current.includes(id) ? current.filter((topic) => topic !== id) : [...current, id]));

  return (
    <>
      <div className="flex items-start justify-between gap-4 border-b border-[#FBF5E7]/12 px-5 py-4 sm:px-6">
        <div className="min-w-0">
          <h2
            className="font-display text-lg font-extrabold uppercase leading-tight tracking-[-0.01em] text-[#FBF5E7]"
            id="survey-title"
          >
            Personalizá tu grilla
          </h2>
          <p className="mt-1.5 text-sm leading-relaxed text-[#FBF5E7]/70">
            Ordenamos las sesiones según los temas que elijas. Las respuestas quedan guardadas solo en este
            dispositivo.
          </p>
        </div>
        <button
          aria-label="Cerrar"
          className="-m-2 flex h-11 w-11 shrink-0 items-center justify-center text-[#FBF5E7]/50 transition-colors hover:text-[#FBF5E7] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F5BB03]"
          type="button"
          onClick={onClose}
        >
          <X aria-hidden="true" className="h-5 w-5" />
        </button>
      </div>

      <div className="overflow-y-auto px-5 py-5 sm:px-6">
        <fieldset>
          <legend className="font-display text-[11px] font-bold uppercase leading-none tracking-[0.14em] text-[#FBF5E7]/60">
            Temas de interés
          </legend>
          <p className="mt-1.5 text-xs text-[#FBF5E7]/50">Elegí uno o más.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {TOPICS.map((topic) => {
              const on = topics.includes(topic.id);

              return (
                <button
                  key={topic.id}
                  aria-pressed={on}
                  // 44px min target: tapped with a thumb, one-handed, in a hallway.
                  className={classNames(
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

        <fieldset className="mt-6">
          <legend className="font-display text-[11px] font-bold uppercase leading-none tracking-[0.14em] text-[#FBF5E7]/60">
            Qué buscás en una sesión
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
      </div>

      <div className="border-t border-[#FBF5E7]/12 px-5 py-4 sm:px-6">
        <button
          className="inline-flex min-h-11 w-full items-center justify-center bg-[#FBF5E7] px-6 font-display text-sm font-bold uppercase leading-none text-black transition-colors hover:bg-[#F5BB03] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#F5BB03] disabled:cursor-not-allowed disabled:bg-[#FBF5E7]/20 disabled:text-[#FBF5E7]/40"
          disabled={topics.length === 0}
          type="button"
          onClick={() => onSave({ topics, goal })}
        >
          {topics.length === 0 ? "Elegí al menos un tema" : "Ver recomendaciones"}
        </button>
      </div>
    </>
  );
}

/**
 * The survey, in a native <dialog>.
 *
 * `showModal()` rather than a hand-rolled overlay: it traps focus inside the
 * form, closes on Escape, makes the page behind inert and returns focus to
 * whatever opened it — all of which a form with fifteen controls needs and
 * none of which is worth reimplementing.
 */
export default function InterestSurvey({ open, initial, onSave, onClose }: InterestSurveyProps) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;

    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;

    // showModal blocks interaction but not scrolling behind the dialog.
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <dialog
      ref={dialog}
      aria-labelledby="survey-title"
      className="m-auto w-[min(34rem,calc(100vw-2rem))] max-w-none bg-transparent p-0 backdrop:bg-black/80 backdrop:backdrop-blur-sm"
      // Escape fires `close` without going through our button.
      onClose={onClose}
      onClick={(event) => {
        // Clicks on the backdrop land on the dialog element itself.
        if (event.target === dialog.current) onClose();
      }}
    >
      {/* Focus lands on the panel, not on the close button — showModal() would
          otherwise highlight "dismiss" as the first thing you see. */}
      <div
        autoFocus
        className="flex max-h-[85dvh] flex-col border border-[#FBF5E7]/15 bg-[#0B0B0B] text-left focus:outline-none"
        tabIndex={-1}
      >
        {open ? <SurveyForm initial={initial} onClose={onClose} onSave={onSave} /> : null}
      </div>
    </dialog>
  );
}
