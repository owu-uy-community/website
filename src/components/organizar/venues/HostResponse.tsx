"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { CalendarCheck, CalendarX, Clock, Hourglass, Users } from "lucide-react";

import { cn } from "app/lib/utils";
import { MicroLabel, Panel, PanelHead } from "components/Admin/ui/page";
import { Button } from "components/shared/ui/button";
import { Checkbox } from "components/shared/ui/checkbox";
import { Textarea } from "components/shared/ui/textarea";
import { toast } from "components/shared/ui/toast-utils";
import { shortWhen } from "lib/community/time";
import { orpc } from "lib/orpc/client";
import type { z } from "zod";
import type { HostViewSchema } from "lib/orpc/venues/schemas";

type HostView = z.infer<typeof HostViewSchema>;

const hours = (option: { start: string; end: string }) => {
  const minutes = Math.round((Date.parse(option.end) - Date.parse(option.start)) / 60_000);

  return minutes % 60 === 0 ? `${minutes / 60} h` : `${Math.floor(minutes / 60)} h ${minutes % 60}`;
};

const CLOSED = {
  accepted: { icon: CalendarCheck, title: "Los recibís", tone: "text-success" },
  declined: { icon: CalendarX, title: "Esta vez no", tone: "text-muted-foreground" },
  expired: { icon: Hourglass, title: "El pedido venció", tone: "text-muted-foreground" },
  cancelled: { icon: CalendarX, title: "La comunidad canceló el pedido", tone: "text-muted-foreground" },
} as const;

/** The host's answer: take one of the dates (with access notes), propose another, or not this time. */
export function HostResponse({ token, view }: { token: string; view: HostView }) {
  const router = useRouter();
  const [option, setOption] = useState(0);
  const [note, setNote] = useState("");
  const [share, setShare] = useState(true);
  const [publicAddress, setPublicAddress] = useState(view.addressVisibility === "public");
  const [mode, setMode] = useState<"accept" | "propose" | "decline">("accept");

  const respond = useMutation(
    orpc.venues.respond.mutationOptions({
      onSuccess: () => router.refresh(),
      onError: (error) => toast.error("No se pudo enviar la respuesta", error.message),
    })
  );
  const who = view.organizerName ? `${view.organizerName}, de ${view.communityName}` : view.communityName;

  return (
    <Panel>
      <PanelHead title={`${view.communityName} quiere hacer su meetup en ${view.venueName}`} />
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
          {view.status === "pending" ? (
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

        {view.status !== "pending" ? (
          <Closed view={view} />
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
              } else {
                respond.mutate({ token, decision: "decline", hostMessage: note });
              }
            }}
          >
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2">
                <MicroLabel>Fechas, en orden de preferencia</MicroLabel>
              </legend>
              {view.options.map((item, index) => (
                <label
                  key={item.start}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-lg border border-input bg-raised/50 px-3 py-2.5 transition-colors hover:border-subtle/40",
                    mode === "accept" && option === index && "border-primary/60 bg-primary-surface"
                  )}
                >
                  <input
                    checked={mode === "accept" && option === index}
                    className="accent-[hsl(var(--primary))]"
                    name="option"
                    type="radio"
                    onChange={() => {
                      setMode("accept");
                      setOption(index);
                    }}
                  />
                  <span className="font-terminal text-meta text-muted-foreground tabular-nums">{index + 1}</span>
                  <span className="flex-1 font-terminal text-ui text-foreground tabular-nums">
                    {shortWhen(item.start)}
                  </span>
                  <span className="font-terminal text-meta text-muted-foreground tabular-nums">{hours(item)}</span>
                </label>
              ))}
            </fieldset>

            <label className="flex flex-col gap-1.5">
              <MicroLabel>
                {mode === "accept"
                  ? "Para la comunidad: cómo entrar, a quién preguntar (opcional)"
                  : mode === "propose"
                    ? "¿Qué fechas les sirven?"
                    : "¿Querés contarles algo? (opcional)"}
              </MicroLabel>
              <Textarea
                maxLength={1000}
                required={mode === "propose"}
                rows={3}
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
            </label>

            {mode === "accept" ? (
              <label className="flex items-start gap-2.5 text-ui text-foreground">
                <Checkbox checked={share} className="mt-0.5" onCheckedChange={(value) => setShare(value === true)} />
                <span>
                  Compartir mi contacto con quien organiza
                  <span className="block text-meta text-muted-foreground">
                    Si no, coordinan por la dirección y las notas que dejes.
                  </span>
                </span>
              </label>
            ) : null}
            {mode === "accept" ? (
              <label className="flex items-start gap-2.5 text-ui text-foreground">
                <Checkbox
                  checked={publicAddress}
                  className="mt-0.5"
                  onCheckedChange={(value) => setPublicAddress(value === true)}
                />
                <span>
                  Mostrar la dirección en la página del evento
                  <span className="block text-meta text-muted-foreground">
                    Si no, la ven solo quienes se anotan. Vale también para las próximas meetups acá.
                  </span>
                </span>
              </label>
            ) : null}

            <div className="flex flex-col gap-2">
              {mode === "accept" ? (
                <Button className="h-11 w-full" disabled={respond.isPending} type="submit">
                  <CalendarCheck />
                  Sí, los recibimos el {shortWhen(view.options[option]?.start ?? view.options[0].start)}
                </Button>
              ) : (
                <Button className="h-11 w-full" disabled={respond.isPending} type="submit" variant="outline">
                  {mode === "propose" ? "Enviar otra propuesta" : "Avisar que esta vez no"}
                </Button>
              )}
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={mode === "propose" ? "default" : "outline"}
                  onClick={() => setMode(mode === "propose" ? "accept" : "propose")}
                >
                  Proponer otra fecha
                </Button>
                <Button
                  type="button"
                  variant={mode === "decline" ? "default" : "ghost"}
                  onClick={() => setMode(mode === "decline" ? "accept" : "decline")}
                >
                  Esta vez no
                </Button>
              </div>
            </div>
            <p className="text-meta text-muted-foreground">
              Si aceptás, {view.organizerName || "quien organiza"} recibe tu respuesta y vos su mail para coordinar.
            </p>
          </form>
        )}
      </div>
    </Panel>
  );
}

function Closed({ view }: { view: HostView }) {
  const state = CLOSED[view.status as keyof typeof CLOSED];
  const chosen = view.chosenOption === null ? null : view.options[view.chosenOption];

  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-raised px-3.5 py-3">
      <state.icon aria-hidden className={cn("mt-0.5 size-5 shrink-0", state.tone)} />
      <div>
        <p className="text-ui font-medium text-foreground">
          {state.title}
          {chosen ? <span className="font-terminal tabular-nums"> el {shortWhen(chosen.start)}</span> : null}
        </p>
        <p className="text-meta text-muted-foreground">
          {view.status === "accepted"
            ? "Te mandamos el contacto de quien organiza por mail. ¡Gracias por recibir a la comunidad!"
            : view.status === "declined"
              ? "Le avisamos a la comunidad. ¡Gracias por responder!"
              : "No hace falta que hagas nada."}
        </p>
      </div>
    </div>
  );
}
