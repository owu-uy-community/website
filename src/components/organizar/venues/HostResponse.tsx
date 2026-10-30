"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { CalendarCheck, CalendarClock, CalendarX, Clock, Handshake, Hourglass, Plus, Users, X } from "lucide-react";

import { cn } from "app/lib/utils";
import { MicroLabel, Panel } from "components/Admin/ui/page";
import { Button } from "components/shared/ui/button";
import { Checkbox } from "components/shared/ui/checkbox";
import { Input } from "components/shared/ui/input";
import { Textarea } from "components/shared/ui/textarea";
import { toast } from "components/shared/ui/toast-utils";
import { addDays } from "lib/calendar/holidays";
import { clockTime, dayKey, shortWhen } from "lib/community/time";
import { orpc } from "lib/orpc/client";
import type { HostView } from "lib/orpc/venues/schemas";

const durationLabel = (minutes: number) =>
  minutes % 60 === 0 ? `${minutes / 60} h` : `${Math.floor(minutes / 60)} h ${minutes % 60}`;
const hours = (option: { start: string; end: string }) =>
  durationLabel(Math.round((Date.parse(option.end) - Date.parse(option.start)) / 60_000));

type Closed = { icon: typeof CalendarCheck; title: string; tone: string; text: string };

/** Why the request isn't open anymore, in words: answered, proposed, lapsed, withdrawn or taken by another space. */
function closedState(view: HostView): Closed {
  if (view.taken) {
    return {
      icon: Handshake,
      title: "Ya se resolvió, ¡gracias!",
      tone: "text-success",
      text: "La comunidad le preguntó a varios espacios y otro respondió primero. No hace falta que hagas nada.",
    };
  }
  const states: Record<HostView["status"], Closed> = {
    accepted: {
      icon: CalendarCheck,
      title: "Los recibís",
      tone: "text-success",
      text: "Te mandamos el contacto de quien organiza por mail. ¡Gracias por recibir a la comunidad!",
    },
    proposed: {
      icon: CalendarClock,
      title: "Propusiste otras fechas",
      tone: "text-info",
      text: "Le avisamos a la comunidad. Si alguna le sirve, te llega un mail con la confirmación.",
    },
    declined: {
      icon: CalendarX,
      title: "Esta vez no",
      tone: "text-muted-foreground",
      text: "Le avisamos a la comunidad. ¡Gracias por responder!",
    },
    expired: {
      icon: Hourglass,
      title: "El pedido venció",
      tone: "text-muted-foreground",
      text: "Pasaron los 3 días para responder y la comunidad siguió buscando. No hace falta que hagas nada.",
    },
    cancelled: {
      icon: CalendarX,
      title: "La comunidad canceló el pedido",
      tone: "text-muted-foreground",
      text: "Ya no necesitan el lugar. No hace falta que hagas nada.",
    },
    pending: { icon: Clock, title: "", tone: "", text: "" },
  };

  return states[view.status];
}

type DateDraft = { day: string; startTime: string };

/** The host's answer: take one of the dates (with access notes), propose others, or not this time. */
export function HostResponse({ token, view }: { token: string; view: HostView }) {
  const router = useRouter();
  const ids = useId();
  const [option, setOption] = useState(0);
  const [note, setNote] = useState("");
  // Consent is an affirmative act (Ley 18.331, art. 9): never pre-checked
  const [share, setShare] = useState(false);
  const [publicAddress, setPublicAddress] = useState(view.addressVisibility === "public");
  const [mode, setMode] = useState<"accept" | "propose" | "decline">("accept");
  const first = view.options[0];
  const durationMin = first ? Math.round((Date.parse(first.end) - Date.parse(first.start)) / 60_000) : 120;
  const [dates, setDates] = useState<DateDraft[]>(() => [
    { day: addDays(dayKey(first?.start ?? new Date()), 7), startTime: clockTime(first?.start ?? new Date()) },
  ]);

  const respond = useMutation(
    orpc.venues.respond.mutationOptions({
      onSuccess: () => router.refresh(),
      onError: (error) => {
        toast.error("No se pudo enviar la respuesta", error.message);
        // Someone else answered or it lapsed meanwhile: show how it stands
        router.refresh();
      },
    })
  );
  const who = view.organizerName ? `${view.organizerName}, de ${view.communityName}` : view.communityName;
  const update = (index: number, change: Partial<DateDraft>) =>
    setDates(dates.map((row, at) => (at === index ? { ...row, ...change } : row)));

  return (
    <Panel>
      <h1 className="border-b border-border px-4 py-3 text-ui font-semibold text-pretty text-foreground">
        {view.communityName} quiere hacer su meetup en {view.venueName}
      </h1>
      <div className="flex flex-col gap-5 p-4">
        <dl className="grid grid-cols-2 gap-3 text-ui">
          <div>
            <dt>
              <MicroLabel>Quién pide</MicroLabel>
            </dt>
            <dd className="mt-1 text-foreground">{who}</dd>
          </div>
          <div>
            <dt>
              <MicroLabel>Cuántas personas</MicroLabel>
            </dt>
            <dd className="mt-1 flex items-center gap-1.5 font-terminal text-foreground tabular-nums">
              <Users aria-hidden className="size-3.5 text-muted-foreground" />
              {view.expectedAttendees}
            </dd>
          </div>
          {view.status === "pending" && !view.taken ? (
            <div className="col-span-2">
              <dt>
                <MicroLabel>Respondé antes del</MicroLabel>
              </dt>
              <dd className="mt-1 flex items-center gap-1.5 font-terminal text-warning-foreground tabular-nums">
                <Clock aria-hidden className="size-3.5" />
                {shortWhen(view.expiresAt)}
              </dd>
            </div>
          ) : null}
          {view.eventName ? (
            <div className="col-span-2">
              <dt>
                <MicroLabel>Evento</MicroLabel>
              </dt>
              <dd className="mt-1 text-foreground">{view.eventName}</dd>
            </div>
          ) : null}
        </dl>
        {view.message ? (
          <blockquote className="rounded-lg border border-border bg-raised px-3 py-2.5 text-ui text-foreground">
            «{view.message}»
          </blockquote>
        ) : null}

        {view.status !== "pending" || view.taken ? (
          <ClosedNote view={view} />
        ) : (
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (mode === "accept") {
                respond.mutate({
                  token,
                  decision: "accept",
                  option,
                  hostMessage: note,
                  shareContact: share,
                  addressVisibility: publicAddress ? "public" : "attendees",
                });
              } else if (mode === "propose") {
                respond.mutate({
                  token,
                  decision: "propose",
                  options: dates.map((date) => ({ ...date, durationMin })),
                  hostMessage: note,
                  shareContact: share,
                });
              } else {
                respond.mutate({ token, decision: "decline", hostMessage: note });
              }
            }}
          >
            <div
              className="grid grid-cols-3 gap-1 rounded-lg border border-input p-1"
              role="radiogroup"
              aria-label="Tu respuesta"
            >
              {(
                [
                  { value: "accept", label: "Sí, puedo" },
                  { value: "propose", label: "Otra fecha" },
                  { value: "decline", label: "Esta vez no" },
                ] as const
              ).map((choice) => (
                <button
                  key={choice.value}
                  aria-checked={mode === choice.value}
                  className={cn(
                    "min-h-11 rounded-md px-2 text-ui font-medium text-muted-foreground transition-colors hover:text-foreground",
                    mode === choice.value && "bg-raised text-foreground shadow-edge"
                  )}
                  role="radio"
                  type="button"
                  onClick={() => setMode(choice.value)}
                >
                  {choice.label}
                </button>
              ))}
            </div>

            {mode === "accept" ? (
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-2">
                  <MicroLabel>Elegí una fecha (están en orden de preferencia)</MicroLabel>
                </legend>
                {view.options.map((item, index) => (
                  <label
                    key={item.start}
                    className={cn(
                      "flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-input bg-raised/50 px-3 py-2.5 transition-colors hover:border-subtle/40",
                      option === index && "border-primary/60 bg-primary-surface"
                    )}
                  >
                    <input
                      checked={option === index}
                      className="size-4 accent-[hsl(var(--primary))]"
                      name="option"
                      type="radio"
                      onChange={() => setOption(index)}
                    />
                    <span className="font-terminal text-meta text-muted-foreground tabular-nums">{index + 1}</span>
                    <span className="flex-1 font-terminal text-ui text-foreground tabular-nums">
                      {shortWhen(item.start)}
                    </span>
                    <span className="font-terminal text-meta text-muted-foreground tabular-nums">{hours(item)}</span>
                  </label>
                ))}
              </fieldset>
            ) : null}

            {mode === "propose" ? (
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-2">
                  <MicroLabel>Hasta tres fechas que les sirvan, la mejor primero</MicroLabel>
                </legend>
                {dates.map((row, index) => (
                  // oxlint-disable-next-line react/no-array-index-key -- the rows are positions in a ranking
                  <div key={index} className="flex items-center gap-1.5">
                    <span className="w-4 font-terminal text-meta text-muted-foreground tabular-nums">{index + 1}</span>
                    <Input
                      aria-label={`Fecha ${index + 1}`}
                      className="h-11 flex-1 font-terminal tabular-nums"
                      min={dayKey(new Date())}
                      required
                      type="date"
                      value={row.day}
                      onChange={(event) => update(index, { day: event.target.value })}
                    />
                    <Input
                      aria-label={`Hora ${index + 1}`}
                      className="h-11 w-28 font-terminal tabular-nums"
                      required
                      step={900}
                      type="time"
                      value={row.startTime}
                      onChange={(event) => update(index, { startTime: event.target.value })}
                    />
                    {dates.length > 1 ? (
                      <Button
                        aria-label={`Quitar la fecha ${index + 1}`}
                        className="size-11"
                        size="icon"
                        type="button"
                        variant="ghost"
                        onClick={() => setDates(dates.filter((_, at) => at !== index))}
                      >
                        <X />
                      </Button>
                    ) : null}
                  </div>
                ))}
                {dates.length < 3 ? (
                  <Button
                    className="self-start"
                    size="sm"
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      const last = dates[dates.length - 1];
                      setDates([
                        ...dates,
                        { day: addDays(last?.day ?? dayKey(new Date()), 7), startTime: last?.startTime ?? "19:00" },
                      ]);
                    }}
                  >
                    <Plus />
                    Otra fecha
                  </Button>
                ) : null}
                <p className="text-meta text-muted-foreground">
                  Duran lo mismo que pidieron ({durationLabel(durationMin)}).
                </p>
              </fieldset>
            ) : null}

            <label className="flex flex-col gap-1.5">
              <MicroLabel>
                {mode === "accept"
                  ? "Para la comunidad: cómo entrar, a quién preguntar (opcional)"
                  : mode === "propose"
                    ? "¿Algo que quieras contarles? (opcional)"
                    : "¿Querés contarles por qué? (opcional)"}
              </MicroLabel>
              <Textarea maxLength={1000} rows={3} value={note} onChange={(event) => setNote(event.target.value)} />
            </label>

            {mode !== "decline" ? (
              <div className="flex items-start gap-2.5 text-ui text-foreground">
                <Checkbox
                  aria-describedby={`${ids}-share-hint`}
                  aria-labelledby={`${ids}-share`}
                  checked={share}
                  className="mt-0.5 size-5"
                  id={`${ids}-share-box`}
                  onCheckedChange={(value) => setShare(value === true)}
                />
                <label className="cursor-pointer" htmlFor={`${ids}-share-box`}>
                  <span id={`${ids}-share`}>Compartir mi contacto con quien organiza</span>
                  <span className="block text-meta text-muted-foreground" id={`${ids}-share-hint`}>
                    Le llega tu nombre y tu mail si confirman la fecha. Si no, coordinan por la dirección y las notas
                    que dejes.
                  </span>
                </label>
              </div>
            ) : null}
            {mode === "accept" ? (
              <div className="flex items-start gap-2.5 text-ui text-foreground">
                <Checkbox
                  aria-describedby={`${ids}-address-hint`}
                  aria-labelledby={`${ids}-address`}
                  checked={publicAddress}
                  className="mt-0.5 size-5"
                  id={`${ids}-address-box`}
                  onCheckedChange={(value) => setPublicAddress(value === true)}
                />
                <label className="cursor-pointer" htmlFor={`${ids}-address-box`}>
                  <span id={`${ids}-address`}>Mostrar la dirección en la página del evento</span>
                  <span className="block text-meta text-muted-foreground" id={`${ids}-address-hint`}>
                    Si no, la ven solo quienes se anotan. Vale también para las próximas meetups acá.
                  </span>
                </label>
              </div>
            ) : null}

            <Button className="h-11 w-full" disabled={respond.isPending} type="submit">
              {mode === "accept" ? (
                <>
                  <CalendarCheck />
                  Sí, los recibimos el {shortWhen(view.options[option]?.start ?? first?.start ?? "")}
                </>
              ) : mode === "propose" ? (
                <>
                  <CalendarClock />
                  Proponer {dates.length === 1 ? "esta fecha" : `estas ${dates.length} fechas`}
                </>
              ) : (
                "Avisar que esta vez no"
              )}
            </Button>
            <p className="text-meta text-muted-foreground">
              {mode === "decline"
                ? "Le avisamos a la comunidad para que siga buscando. ¡Gracias por responder!"
                : `Si se confirma, ${view.organizerName || "quien organiza"} recibe tu respuesta y vos su mail para coordinar.`}
            </p>
          </form>
        )}
      </div>
    </Panel>
  );
}

function ClosedNote({ view }: { view: HostView }) {
  const state = closedState(view);
  const chosen = view.chosenOption === null ? null : view.options[view.chosenOption];

  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-raised px-3.5 py-3" role="status">
      <state.icon aria-hidden className={cn("mt-0.5 size-5 shrink-0", state.tone)} />
      <div>
        <p className="text-ui font-medium text-foreground">
          {state.title}
          {chosen && view.status === "accepted" ? (
            <span className="font-terminal tabular-nums"> el {shortWhen(chosen.start)}</span>
          ) : null}
        </p>
        <p className="text-meta text-muted-foreground">{state.text}</p>
        {view.status === "proposed" && view.counterOptions.length > 0 ? (
          <ul className="mt-1.5 font-terminal text-meta text-foreground tabular-nums">
            {view.counterOptions.map((item) => (
              <li key={item.start}>{shortWhen(item.start)}</li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
