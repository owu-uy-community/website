"use client";

import { useState, useSyncExternalStore } from "react";
import Image from "next/image";
import Link from "next/link";
import { ORPCError } from "@orpc/client";
import { useMutation } from "@tanstack/react-query";
import { Star } from "lucide-react";

import { cn } from "app/lib/utils";
import { orpc } from "lib/orpc";
import { TEXT_ANSWER_MAX, type PublicSurvey, type SurveyQuestion } from "lib/orpc/surveys/schemas";

type Answers = Record<string, string | number>;

const RESPONDENT_KEY = "owu-survey:respondent";
const answeredKey = (surveyId: string, roomId: string | null) => `owu-survey:${surveyId}:${roomId ?? "general"}`;

/** The phone's own random id: the server keeps one answer per phone and room. */
function respondentId() {
  const kept = window.localStorage.getItem(RESPONDENT_KEY);
  if (kept) return kept;
  const id = Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, "0")).join(
    ""
  );
  window.localStorage.setItem(RESPONDENT_KEY, id);
  return id;
}

const subscribeStorage = (listener: () => void) => {
  window.addEventListener("storage", listener);
  return () => window.removeEventListener("storage", listener);
};

const choiceClass =
  "flex items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] font-semibold transition-colors peer-checked:border-yellow-400 peer-focus-visible:ring-2 peer-focus-visible:ring-yellow-400/70 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-[#18181b] hover:border-white/25";

function Scale({
  question,
  value,
  onChange,
  from,
  to,
  low,
  high,
}: {
  question: SurveyQuestion;
  value: number | undefined;
  onChange: (value: number) => void;
  from: number;
  to: number;
  low: string;
  high: string;
}) {
  const values = Array.from({ length: to - from + 1 }, (_, index) => from + index);
  const stars = question.kind === "rating";

  return (
    <>
      <div className={cn("mt-4 grid gap-2", stars ? "grid-cols-5" : "grid-cols-6 sm:grid-cols-11")}>
        {values.map((option) => (
          <label key={option} className="relative">
            <input
              checked={value === option}
              className="peer sr-only"
              name={question.id}
              type="radio"
              value={option}
              onChange={() => onChange(option)}
            />
            {stars ? (
              <span className={cn(choiceClass, "h-14 peer-checked:bg-yellow-400/10")}>
                <Star
                  aria-hidden
                  className={cn(
                    "size-7",
                    value !== undefined && option <= value ? "fill-yellow-400 text-yellow-400" : "text-zinc-500"
                  )}
                />
                <span className="sr-only">
                  {option} de {to}
                </span>
              </span>
            ) : (
              <span
                className={cn(
                  choiceClass,
                  "h-12 text-base tabular-nums peer-checked:bg-yellow-400 peer-checked:text-black"
                )}
              >
                {option}
              </span>
            )}
          </label>
        ))}
      </div>
      <div aria-hidden className="mt-2 flex justify-between text-xs text-zinc-400">
        <span>{low}</span>
        <span>{high}</span>
      </div>
    </>
  );
}

function Question({
  question,
  number,
  value,
  onChange,
}: {
  question: SurveyQuestion;
  number: number;
  value: string | number | undefined;
  onChange: (value: string | number) => void;
}) {
  return (
    <fieldset className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
      <legend className="sr-only">{question.label}</legend>
      <p aria-hidden className="text-[17px] leading-snug font-semibold">
        <span className="mr-2 text-sm font-medium text-zinc-500 tabular-nums">{number}.</span>
        {question.label}
      </p>
      {question.kind === "nps" ? (
        <Scale
          from={0}
          high="Muy probable"
          low="Nada probable"
          question={question}
          to={10}
          value={typeof value === "number" ? value : undefined}
          onChange={onChange}
        />
      ) : null}
      {question.kind === "rating" ? (
        <Scale
          from={1}
          high="Excelente"
          low="Flojo"
          question={question}
          to={5}
          value={typeof value === "number" ? value : undefined}
          onChange={onChange}
        />
      ) : null}
      {question.kind === "choice" ? (
        <div className="mt-4 grid gap-2">
          {(question.options ?? []).map((option) => (
            <label key={option} className="relative">
              <input
                checked={value === option}
                className="peer sr-only"
                name={question.id}
                type="radio"
                value={option}
                onChange={() => onChange(option)}
              />
              <span className={cn(choiceClass, "h-12 px-4 peer-checked:bg-yellow-400 peer-checked:text-black")}>
                {option}
              </span>
            </label>
          ))}
        </div>
      ) : null}
      {question.kind === "text" ? (
        <>
          <label className="sr-only" htmlFor={`answer-${question.id}`}>
            {question.label}
          </label>
          <textarea
            className="mt-4 block min-h-28 w-full rounded-xl border border-white/10 bg-black/20 px-3.5 py-3 text-base text-white placeholder:text-zinc-500 focus:border-yellow-400/70 focus:ring-2 focus:ring-yellow-400/20 focus:outline-none"
            id={`answer-${question.id}`}
            maxLength={TEXT_ANSWER_MAX}
            placeholder="Contanos (opcional)"
            value={typeof value === "string" ? value : ""}
            onChange={(event) => onChange(event.target.value)}
          />
        </>
      ) : null}
    </fieldset>
  );
}

function Thanks({ again, room, agendaHref }: { again: boolean; room: string | null; agendaHref: string }) {
  return (
    <section aria-live="polite" className="flex flex-col items-center pt-14 text-center">
      <Image alt="" className="size-28 object-contain" height={224} src="/images/logos/carpincho.png" width={224} />
      <h1 className="mt-6 text-4xl font-extrabold tracking-tight">¡Gracias!</h1>
      <p className="mt-3 max-w-sm text-zinc-400">
        {again
          ? "Ya habías respondido desde este teléfono."
          : "Tus respuestas nos ayudan a armar la próxima. Las leemos todas."}
      </p>
      {room ? (
        <p className="mt-2 max-w-sm text-zinc-400">¿Pasaste por otras salas? Cada una tiene su QR en la puerta.</p>
      ) : null}
      <Link
        className="mt-8 inline-flex h-12 items-center rounded-xl bg-white/10 px-5 font-semibold transition-colors hover:bg-white/15"
        href={agendaHref}
      >
        Ver la agenda
      </Link>
    </section>
  );
}

const answeredAlready = (error: Error) =>
  error instanceof ORPCError && (error.data as { reason?: string } | undefined)?.reason === "already_answered";

/** What to tell someone whose answer didn't land. */
const failureText = (error: Error) => {
  if (error instanceof ORPCError && error.code === "TOO_MANY_REQUESTS")
    return "Muchos intentos seguidos: probá de nuevo en un minuto.";
  if (error instanceof ORPCError && (error.code === "BAD_REQUEST" || error.code === "CONFLICT")) return error.message;
  return "No pudimos guardar tus respuestas. Revisá la conexión y probá de nuevo.";
};

export function SurveyForm({
  survey,
  room,
  agendaHref,
}: {
  survey: PublicSurvey;
  room: { id: string; name: string } | null;
  agendaHref: string;
}) {
  const key = answeredKey(survey.id, room?.id ?? null);
  const answeredBefore = useSyncExternalStore(
    subscribeStorage,
    () => window.localStorage.getItem(key) !== null,
    () => false
  );
  const [answers, setAnswers] = useState<Answers>({});
  const [done, setDone] = useState<"sent" | "again" | null>(null);

  const finish = (how: "sent" | "again") => {
    window.localStorage.setItem(key, how);
    setDone(how);
    window.scrollTo({ top: 0 });
  };
  const respond = useMutation(
    orpc.surveys.respond.mutationOptions({
      onSuccess: () => finish("sent"),
      // This phone already answered (another tab, cleared storage): that's a thank-you, not an error.
      onError: (error) => {
        if (answeredAlready(error)) finish("again");
      },
    })
  );

  if (done || answeredBefore)
    return <Thanks agendaHref={agendaHref} again={done !== "sent"} room={room?.name ?? null} />;

  // Spaces alone aren't an answer: the server would only say so after the tap.
  const filled = Object.entries(answers).filter(([, value]) =>
    typeof value === "string" ? value.trim() !== "" : true
  );

  return (
    <form
      className="mt-6"
      onSubmit={(event) => {
        event.preventDefault();
        if (filled.length === 0 || respond.isPending) return;
        respond.mutate({
          surveyId: survey.id,
          roomId: room?.id,
          respondent: respondentId(),
          answers: Object.fromEntries(
            filled.map(([id, value]) => [id, typeof value === "string" ? value.trim() : value])
          ),
        });
      }}
    >
      <h1 className="text-3xl leading-tight font-extrabold tracking-tight sm:text-4xl">{survey.title}</h1>
      <p className="mt-3 flex flex-wrap items-center gap-2 text-zinc-400">
        {room ? (
          <span className="rounded-full bg-yellow-400/10 px-3 py-1 text-sm font-medium text-yellow-300">
            Sala {room.name}
          </span>
        ) : null}
        <span>{survey.eventName} · son dos minutos y es anónima.</span>
      </p>
      <div className="mt-8 space-y-4">
        {survey.questions.map((question, index) => (
          <Question
            key={question.id}
            number={index + 1}
            question={question}
            value={answers[question.id]}
            onChange={(value) => setAnswers((current) => ({ ...current, [question.id]: value }))}
          />
        ))}
      </div>
      {respond.isError && !answeredAlready(respond.error) ? (
        <p
          className="mt-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200"
          role="alert"
        >
          {failureText(respond.error)}
        </p>
      ) : null}
      <button
        className="mt-6 h-14 w-full rounded-xl bg-yellow-400 text-lg font-bold text-black transition-colors hover:bg-yellow-300 focus-visible:ring-2 focus-visible:ring-yellow-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#18181b] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40"
        disabled={filled.length === 0 || respond.isPending}
        type="submit"
      >
        {respond.isPending ? "Enviando…" : "Enviar respuestas"}
      </button>
      <p className="mt-3 text-center text-xs text-zinc-400">
        Respondé lo que quieras: ninguna pregunta es obligatoria.
      </p>
    </form>
  );
}
