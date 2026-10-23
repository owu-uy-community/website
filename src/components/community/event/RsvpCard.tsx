"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, CircleSlash, Clock, Hourglass, Ticket } from "lucide-react";

import { authClient, signIn, useSession } from "app/lib/auth-client";
import { cn } from "app/lib/utils";
import { EmailCodeForm } from "components/shared/Auth/EmailCodeForm";
import { buttonClassName } from "components/community/ui";
import { orpc } from "lib/orpc/client";
import type { PublicEvent } from "lib/orpc/events/schemas";
import { offerDeadline, rsvpState, type RsvpState } from "lib/organizar/rsvp-state";

const updateUser = (data: { name: string }) => authClient.updateUser(data);

const fieldClassName =
  "h-11 w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 text-[15px] text-white outline-none transition-colors placeholder:text-zinc-500 focus-visible:border-yellow-400/60 focus-visible:ring-2 focus-visible:ring-yellow-400/20";

/** Where the viewer stands: their own place (once we know who's looking) over the event's state. */
export function useRsvp(event: PublicEvent) {
  const session = useSession();
  const signedIn = Boolean(session.data);
  const mine = useQuery({ ...orpc.rsvps.mine.queryOptions({ input: { eventId: event.id } }), enabled: signedIn });
  const now = Date.now();

  return {
    session,
    signedIn,
    mine,
    now,
    state: rsvpState(event, mine.data ?? null, now),
    loading: session.isPending || (signedIn && mine.isPending),
  };
}

/** States with nothing to press: a line of what's going on (the card is only for OWU's own sign-up) */
const NOTE: Partial<Record<RsvpState["kind"], string>> = {
  lleno: "No quedan lugares.",
  cerrado: "La inscripción ya cerró.",
  "en-curso": "Está pasando ahora.",
  pasado: "Este evento ya pasó.",
  "evento-cancelado": "Este evento se canceló.",
};

/**
 * Signing up on the event page: sign in right here (Slack or a code by email), answer the
 * organizers' questions, and from then on see where you stand (a seat, the waitlist, an offer).
 */
export function RsvpCard({ event }: { event: PublicEvent }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { session, signedIn, mine, now, state } = useRsvp(event);
  const [step, setStep] = useState<"idle" | "auth" | "form">("idle");
  const [guests, setGuests] = useState(0);
  const [showName, setShowName] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [name, setName] = useState("");
  const input = { eventId: event.id };

  const done = () => {
    void queryClient.invalidateQueries({ queryKey: orpc.rsvps.mine.key() });
    router.refresh();
  };
  const join = useMutation(orpc.rsvps.join.mutationOptions({ onSuccess: done }));
  const leave = useMutation(orpc.rsvps.leave.mutationOptions({ onSuccess: done }));
  const confirm = useMutation(orpc.rsvps.confirmOffer.mutationOptions({ onSuccess: done }));
  const error = join.error ?? leave.error ?? confirm.error;

  const nameless = signedIn && !session.data?.user.name.trim();
  const rsvp = mine.data;
  const ticketPath = `/comunidad/${event.community.slug}/events/${event.slug}/entrada`;
  const cta = "cta" in state ? state.cta : null;

  // Until we know who's looking, a placeholder: a click must not land on the wrong state. Never
  // while signing in: the session refetch that follows the code would unmount the form mid-flow
  // and drop a new account back at the email step, before it names itself.
  if (step !== "auth" && (session.isPending || (signedIn && mine.isPending))) {
    return <div className="h-12 animate-pulse rounded-xl bg-white/[0.05]" />;
  }

  if (rsvp && ["anotado", "oferta", "espera", "pendiente"].includes(state.kind)) {
    return (
      <div className="flex flex-col gap-4">
        {state.kind === "anotado" ? (
          <>
            <p className="flex items-center gap-2 text-[15px] font-medium text-white">
              <span className="grid size-6 place-items-center rounded-full bg-yellow-400 text-zinc-950">
                <Check aria-hidden className="size-4" strokeWidth={3} />
              </span>
              Estás anotado
            </p>
            {rsvp.address ? <p className="text-[14px] text-zinc-400">Dirección: {rsvp.address}</p> : null}
            {rsvp.onlineUrl ? (
              <a
                className="text-[14px] break-all text-yellow-400 underline underline-offset-4"
                href={rsvp.onlineUrl}
                rel="noreferrer"
                target="_blank"
              >
                {rsvp.onlineUrl}
              </a>
            ) : null}
            <Link className={buttonClassName("primary", "lg", "w-full")} href={ticketPath}>
              <Ticket aria-hidden className="mr-2 size-4" />
              Ver mi entrada
            </Link>
          </>
        ) : state.kind === "oferta" ? (
          <>
            <p className="text-[15px] leading-relaxed text-white">
              Se liberó un lugar para vos. Confirmalo{" "}
              <span className="font-medium text-yellow-300">{offerDeadline(state.until, now)}</span>.
            </p>
            <button
              className={buttonClassName("primary", "lg", "w-full")}
              disabled={confirm.isPending}
              type="button"
              onClick={() => confirm.mutate(input)}
            >
              Confirmar mi lugar
            </button>
          </>
        ) : state.kind === "espera" ? (
          <p className="flex items-start gap-2 text-[15px] leading-relaxed text-zinc-200">
            <Hourglass aria-hidden className="mt-0.5 size-5 shrink-0 text-yellow-400" />
            <span>
              Estás en la lista de espera{state.position ? `, puesto ${state.position}` : ""}. Si se libera un lugar te
              escribimos.
            </span>
          </p>
        ) : (
          <p className="flex items-start gap-2 text-[15px] leading-relaxed text-zinc-200">
            <Clock aria-hidden className="mt-0.5 size-5 shrink-0 text-yellow-400" />
            <span>Tu inscripción espera la aprobación de {event.community.name}. Te avisamos por mail.</span>
          </p>
        )}
        <button
          className="text-left text-[14px] text-zinc-400 underline-offset-4 hover:text-white hover:underline disabled:opacity-50"
          disabled={leave.isPending}
          type="button"
          onClick={() => leave.mutate(input)}
        >
          {state.kind === "espera" ? "Salir de la lista" : "No puedo ir: liberar mi lugar"}
        </button>
        {error ? (
          <p className="text-sm text-red-300" role="alert">
            {error.message}
          </p>
        ) : null}
      </div>
    );
  }

  if (state.kind === "rechazado") {
    return (
      <p className="flex items-start gap-2 text-[15px] leading-relaxed text-zinc-300">
        <CircleSlash aria-hidden className="mt-0.5 size-5 shrink-0 text-zinc-500" />
        <span>
          Quienes organizan {event.community.name} no confirmaron tu inscripción. Si creés que es un error, escribiles.
        </span>
      </p>
    );
  }

  if (!cta) return <p className="text-[15px] leading-relaxed text-zinc-300">{NOTE[state.kind]}</p>;

  // Signing in stays on screen until it's done: a new account still names itself after the code
  if (!signedIn || step === "auth") {
    if (step !== "auth") {
      return (
        <button className={buttonClassName("primary", "lg", "w-full")} type="button" onClick={() => setStep("auth")}>
          {cta}
        </button>
      );
    }

    return (
      <div className="flex flex-col gap-3">
        <p className="text-[14px] text-zinc-400">Para anotarte, entrá con el Slack de OWU o con un código por email.</p>
        <button
          className={buttonClassName("secondary", "lg", "w-full")}
          type="button"
          onClick={() => void signIn.social({ provider: "slack", callbackURL: window.location.pathname })}
        >
          Entrar con Slack
        </button>
        <EmailCodeForm
          onSignedIn={() => {
            void session.refetch();
            setStep("form");
          }}
        />
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(submitEvent) => {
        submitEvent.preventDefault();
        const save = nameless ? updateUser({ name: name.trim() }).then(() => session.refetch()) : Promise.resolve();
        void save.then(() => join.mutate({ eventId: event.id, guests, answers, showName }));
      }}
    >
      {state.kind === "cancelado" ? (
        <p className="text-[15px] leading-relaxed text-zinc-300">
          Tu lugar se liberó. Si al final podés ir, anotate de nuevo.
        </p>
      ) : null}
      {nameless ? (
        <label className="flex flex-col gap-2 text-[14px] text-zinc-300">
          Tu nombre
          <input
            autoComplete="name"
            className={fieldClassName}
            maxLength={80}
            required
            value={name}
            onChange={(change) => setName(change.target.value)}
          />
        </label>
      ) : null}
      {event.guestsAllowed > 0 ? (
        <label className="flex flex-col gap-2 text-[14px] text-zinc-300">
          ¿Venís con alguien?
          <select
            className={cn(fieldClassName, "appearance-none")}
            value={guests}
            onChange={(change) => setGuests(Number(change.target.value))}
          >
            {Array.from({ length: event.guestsAllowed + 1 }, (_, count) => (
              <option key={count} className="bg-zinc-900" value={count}>
                {count === 0 ? "Voy solo/a" : `Con ${count} ${count === 1 ? "persona" : "personas"} más`}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {event.questions.map((question) => (
        <label key={question.id} className="flex flex-col gap-2 text-[14px] text-zinc-300">
          {question.label}
          {question.required ? "" : " (opcional)"}
          <input
            className={fieldClassName}
            maxLength={500}
            required={question.required}
            value={answers[question.id] ?? ""}
            onChange={(change) => setAnswers({ ...answers, [question.id]: change.target.value })}
          />
        </label>
      ))}
      <label className="flex items-center gap-3 text-[14px] text-zinc-300">
        <input
          checked={showName}
          className="size-4 accent-yellow-400"
          type="checkbox"
          onChange={(change) => setShowName(change.target.checked)}
        />
        Mostrarme en «quiénes van» (nombre e inicial)
      </label>
      <button className={buttonClassName("primary", "lg", "w-full")} disabled={join.isPending} type="submit">
        {join.isPending ? "Anotándote…" : cta}
      </button>
      <p className="text-[13px] leading-relaxed text-zinc-500">
        {event.community.name} y OWU ven tu nombre y tu email para este evento. Te mandamos la confirmación y un par de
        recordatorios.{" "}
        <Link className="underline decoration-white/20 underline-offset-4 hover:text-zinc-300" href="/privacidad">
          Privacidad
        </Link>
      </p>
      {step === "form" || error ? (
        <p className={cn("text-sm", error ? "text-red-300" : "text-zinc-400")} role={error ? "alert" : undefined}>
          {error ? error.message : `Entraste como ${session.data?.user.name ?? ""}.`}
        </p>
      ) : null}
    </form>
  );
}
