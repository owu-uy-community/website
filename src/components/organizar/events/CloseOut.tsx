"use client";

import type * as React from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { CircleCheck, Repeat, UserCheck } from "lucide-react";

import { cn } from "app/lib/utils";
import { Panel, PanelHead } from "components/Admin/ui/page";
import { ErrorState } from "components/Admin/ui/states";
import { Button } from "components/shared/ui/button";
import { Skeleton } from "components/shared/ui/skeleton";
import { Switch } from "components/shared/ui/switch";
import { toast } from "components/shared/ui/toast-utils";
import { shortWhen } from "lib/community/time";
import { LEVEL_LABEL } from "lib/organizar/repeat";
import { shortDay } from "lib/organizar/times";
import { plural } from "lib/organizar/words";
import { client, orpc } from "lib/orpc/client";
import type { Attendee } from "lib/orpc/attendees/schemas";
import type { EditableEvent, EventStats } from "lib/orpc/events/schemas";

import { usePanel } from "../shell/context";
import { HostRecapDialog } from "../venues/HostRecapDialog";
import type { Tab } from "./EventDashboard";
import { NotifyDialog } from "./NotifyDialog";
import type { EventInput } from "./save";

const SHOWN = 50;

function Step({ n, title, done, children }: { n: number; title: string; done?: boolean; children: React.ReactNode }) {
  return (
    <Panel>
      <PanelHead
        actions={
          done ? (
            <span className="flex items-center gap-1 text-meta text-success-foreground">
              <CircleCheck aria-hidden className="size-4" />
              Listo
            </span>
          ) : undefined
        }
        title={`${n} · ${title}`}
      />
      <div className="flex flex-col gap-3 p-4">{children}</div>
    </Panel>
  );
}

/** Who had a seat and didn't come in: let them in after all, or mark that they told the team. */
function NotIn({ eventId }: { eventId: string }) {
  const queryClient = useQueryClient();
  const { can } = usePanel();
  const list = useQuery(orpc.attendees.list.queryOptions({ input: { eventId, status: "out", pageSize: SHOWN } }));
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: orpc.attendees.key() });
    void queryClient.invalidateQueries({ queryKey: orpc.events.stats.key() });
  };
  const excuse = useMutation(
    orpc.attendees.excuse.mutationOptions({
      onSuccess: refresh,
      onError: (error) => toast.error("No se pudo anotar", error.message),
    })
  );
  const admit = useMutation({
    mutationFn: (person: Attendee) =>
      client.attendees.scan({
        eventId,
        code: person.barcode ?? person.eventbriteId ?? "",
        nonce: crypto.randomUUID(),
        device: "Cierre (panel)",
      }),
    onSuccess: (_, person) => {
      refresh();
      toast.undo(
        `${person.name} entró`,
        () =>
          void client.attendees
            .undoCheckin({ eventId, attendeeId: person.id })
            .then(refresh, (error: Error) => toast.error("No se pudo deshacer", error.message))
      );
    },
    onError: (error) => toast.error("No se pudo marcar", error.message),
  });

  if (list.isError)
    return <ErrorState compact title="No pudimos traer quién no entró" onRetry={() => void list.refetch()} />;
  if (!list.data) return <Skeleton className="h-20" />;
  const rows = list.data.rows;
  if (rows.length === 0) return <p className="text-ui text-muted-foreground">Entraron todos los que tenían lugar.</p>;

  return (
    <>
      <p className="text-meta text-muted-foreground">
        No entraron por la puerta. Si alguien vino igual, marcalo; si avisó que no venía, no cuenta como que faltó.
      </p>
      <ul aria-label="No entraron" className="divide-y divide-border rounded-md border border-border">
        {rows.map((person) => (
          <li key={person.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2">
            <span className="min-w-0 flex-1 text-ui text-foreground">{person.name}</span>
            {can("attendee:undo") ? (
              <label className="flex items-center gap-2 text-meta text-muted-foreground">
                <Switch
                  aria-label={`${person.name} avisó que no venía`}
                  checked={person.excused ?? false}
                  disabled={excuse.isPending}
                  onCheckedChange={(excused) => excuse.mutate({ eventId, attendeeId: person.id, excused })}
                />
                Avisó que no venía
              </label>
            ) : null}
            {can("attendee:checkin") && !person.excused ? (
              <Button
                aria-label={`${person.name} vino`}
                disabled={admit.isPending}
                size="sm"
                variant="ghost"
                onClick={() => admit.mutate(person)}
              >
                <UserCheck />
                Vino
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      {list.data.totals.out > rows.length ? (
        <p className="text-meta text-muted-foreground">
          Y {plural(list.data.totals.out - rows.length, "persona más", "personas más")}: buscalas en Personas.
        </p>
      ) : null}
    </>
  );
}

type Go = (tab: Tab, anchor?: string) => void;

/** A link to Después on this same page: it opens in place, at the part it names */
function InPage({
  anchor,
  onGo,
  className,
  children,
}: {
  anchor: string;
  onGo: Go;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      className={cn("min-h-6 text-foreground underline underline-offset-4", className)}
      type="button"
      onClick={() => onGo("despues", anchor)}
    >
      {children}
    </button>
  );
}

/** The survey: open or closed in one tap, and how many answered so far. */
function SurveyStep({ eventId, onGo }: { eventId: string; onGo: Go }) {
  const queryClient = useQueryClient();
  const survey = useQuery(orpc.surveys.get.queryOptions({ input: { eventId } }));
  const toggle = useMutation(
    orpc.surveys.upsert.mutationOptions({
      onSuccess: (saved) => {
        queryClient.setQueryData(orpc.surveys.get.queryKey({ input: { eventId } }), saved);
        toast.success(saved.isOpen ? "Encuesta abierta" : "Encuesta cerrada");
      },
      onError: (error) => toast.error("No se pudo cambiar la encuesta", error.message),
    })
  );

  if (survey.isError)
    return <ErrorState compact title="No pudimos traer la encuesta" onRetry={() => void survey.refetch()} />;
  if (survey.isPending) return <Skeleton className="h-10" />;
  if (!survey.data) {
    return (
      <p className="text-ui text-muted-foreground">
        Sin encuesta.{" "}
        <InPage anchor="encuesta" onGo={onGo}>
          Armala en Después
        </InPage>{" "}
        y les llega a quienes vinieron.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <label className="flex items-center gap-2 text-ui text-foreground">
        <Switch
          aria-label="Encuesta abierta"
          checked={survey.data.isOpen}
          disabled={toggle.isPending}
          onCheckedChange={(isOpen) => toggle.mutate({ eventId, isOpen })}
        />
        {survey.data.isOpen ? "Abierta" : "Cerrada"}
      </label>
      <span className="text-ui text-muted-foreground">{plural(survey.data.responses, "respuesta", "respuestas")}</span>
      <InPage anchor="encuesta" className="ml-auto text-meta" onGo={onGo}>
        Ver las respuestas
      </InPage>
    </div>
  );
}

/** Thanks to the volunteers who came: one email each, asked once with the count. */
function ThankVolunteers({ input }: { input: EventInput }) {
  const [asking, setAsking] = useState(false);
  const volunteers = useQuery(orpc.events.volunteers.queryOptions({ input }));
  const thank = useMutation(
    orpc.events.thankVolunteers.mutationOptions({
      onSuccess: (result) => {
        setAsking(false);
        toast.success(`Gracias en camino a ${plural(result.sent, "persona", "personas")}`);
      },
      onError: (error) => {
        setAsking(false);
        toast.error("No se pudo mandar", error.message);
      },
    })
  );
  const helped = (volunteers.data ?? []).filter((person) => person.assigned);
  const came = helped.some((person) => person.checkedIn) ? helped.filter((person) => person.checkedIn) : helped;
  if (came.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <p className="min-w-0 flex-1 text-ui text-foreground">
        {plural(came.length, "persona dio", "personas dieron")} una mano: {came.map((person) => person.name).join(", ")}
        .
      </p>
      <Button size="sm" variant="outline" onClick={() => setAsking(true)}>
        Agradecerles
      </Button>
      <NotifyDialog
        confirmLabel={`Mandar a ${plural(came.length, "persona", "personas")}`}
        description="Un mail de gracias a cada una, una sola vez."
        open={asking}
        pending={thank.isPending}
        pendingLabel="Mandando…"
        title="Agradecer a quienes dieron una mano"
        onConfirm={() => thank.mutate(input)}
        onOpenChange={setAsking}
      />
    </div>
  );
}

/** "Repetir el mes que viene": the same weekday and time about four weeks on, scored by the calendar. */
export function RepeatButton({
  input,
  communitySlug,
  variant = "outline",
}: {
  input: EventInput;
  communitySlug: string;
  variant?: "outline" | "default";
}) {
  const router = useRouter();
  const next = useQuery(orpc.events.nextDate.queryOptions({ input }));
  const repeat = useMutation(
    orpc.events.createDraft.mutationOptions({
      onSuccess: (draft) => {
        toast.success(
          draft.dateChosen ? `Reservamos el ${shortWhen(draft.startDate)}` : "Quedó sin fecha",
          draft.dateChosen
            ? "Revisá lo que viene del evento anterior."
            : "Ya tenían 8 fechas reservadas: elegí una en Fecha."
        );
        router.push(`/organizar/panel/${communitySlug}/eventos/${draft.id}/editar`);
      },
      onError: (error) => toast.error("No se pudo repetir", error.message),
    })
  );

  return (
    <div className="flex flex-wrap items-center gap-3">
      <p className="min-w-0 flex-1 text-ui text-muted-foreground">
        {next.data
          ? `Mismo día y hora: ${shortDay(next.data.day)} · ${next.data.startTime} · ${LEVEL_LABEL[next.data.level]}.`
          : next.isError
            ? "No pudimos ver el calendario: igual lo podés repetir."
            : "Buscando la fecha…"}
      </p>
      <Button
        disabled={repeat.isPending}
        size="sm"
        variant={variant}
        onClick={() => repeat.mutate({ communityId: input.communityId, copyFrom: input.eventId })}
      >
        <Repeat />
        Repetir el mes que viene
      </Button>
    </div>
  );
}

/**
 * After the event, in about two minutes: who came (fix the door, mark who told the team), the
 * survey, the materials, the thanks (the space, the volunteers), and the next one. Finishing it
 * takes it off Inicio.
 */
export function CloseOut({
  input,
  event,
  stats,
  onGo,
}: {
  input: EventInput;
  event: EditableEvent;
  stats: UseQueryResult<EventStats>;
  onGo: Go;
}) {
  const queryClient = useQueryClient();
  const { can } = usePanel();
  const [recap, setRecap] = useState(false);
  const data = stats.data;
  const doorUsed = (data?.checkedIn ?? 0) > 0;
  const close = useMutation(
    orpc.events.closeOut.mutationOptions({
      onSuccess: (saved) => {
        queryClient.setQueryData(orpc.events.get.queryKey({ input }), saved);
        void queryClient.invalidateQueries({ queryKey: orpc.panel.key() });
      },
      onError: (error) => toast.error("No se pudo", error.message),
    })
  );
  const finish = () =>
    close.mutate(
      { ...input, done: true },
      { onSuccess: () => toast.undo(`Cerraste «${event.name}»`, () => close.mutate({ ...input, done: false })) }
    );

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      {event.closedOutAt ? (
        <Panel className="flex flex-wrap items-center gap-3 p-4">
          <CircleCheck aria-hidden className="size-5 text-success" />
          <p className="flex-1 text-ui text-foreground">Cerrado el {shortWhen(event.closedOutAt)}.</p>
          {can("event:update") ? (
            <Button size="sm" variant="ghost" onClick={() => close.mutate({ ...input, done: false })}>
              Volver a abrir
            </Button>
          ) : null}
        </Panel>
      ) : (
        <p className="text-ui text-muted-foreground">
          El cierre lleva un par de minutos. Cuando termines, Inicio deja de pedirlo.
        </p>
      )}

      <Step done={doorUsed} n={1} title="Quién vino">
        <p className="text-ui text-foreground">
          {data
            ? doorUsed
              ? `Entraron ${data.checkedIn} de ${plural(data.attending, "persona con lugar", "personas con lugar")}.`
              : "No se usó la puerta: no sabemos quién vino."
            : "–"}
        </p>
        {can("attendee:read") && (doorUsed || event.registration === "owu") ? (
          <NotIn eventId={event.id} />
        ) : !can("attendee:read") ? (
          <p className="text-meta text-muted-foreground">
            Los nombres los ven solo las personas admin de la comunidad.
          </p>
        ) : null}
      </Step>

      <Step n={2} title="Encuesta">
        <SurveyStep eventId={event.id} onGo={onGo} />
      </Step>

      <Step done={event.materials.length > 0} n={3} title="Materiales">
        <p className="text-ui text-foreground">
          {event.materials.length > 0
            ? `${plural(event.materials.length, "material", "materiales")} en la página: ${event.materials.map((item) => item.title).join(", ")}.`
            : "Todavía ninguno. Las slides que mandan quienes hablaron se suman solas."}
        </p>
        <InPage anchor="materiales" className="self-start text-meta" onGo={onGo}>
          Sumar slides o la grabación
        </InPage>
      </Step>

      <Step done={Boolean(event.hostRecapSentAt)} n={4} title="Agradecer">
        {event.venue ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="min-w-0 flex-1 text-ui text-foreground">
              {event.hostRecapSentAt
                ? `Le mandaste el resumen a ${event.venue.name} el ${shortWhen(event.hostRecapSentAt)}.`
                : `${event.venue.name} los recibió: mandale cómo salió, con números y sin nombres.`}
            </p>
            {can("venue:request") && !event.hostRecapSentAt ? (
              <Button size="sm" variant="outline" onClick={() => setRecap(true)}>
                Mandar el resumen al espacio
              </Button>
            ) : null}
            <HostRecapDialog
              communityId={input.communityId}
              eventId={event.id}
              open={recap}
              onOpenChange={(open) => {
                setRecap(open);
                if (!open) void queryClient.invalidateQueries({ queryKey: orpc.events.get.key() });
              }}
            />
          </div>
        ) : (
          <p className="text-ui text-muted-foreground">Sin espacio de la red esta vez: no hay resumen para mandar.</p>
        )}
        {can("event:message") && can("attendee:read") ? <ThankVolunteers input={input} /> : null}
      </Step>

      {can("event:create") ? (
        <Step n={5} title="Repetir el mes que viene">
          <RepeatButton communitySlug={event.communitySlug} input={input} />
        </Step>
      ) : null}

      {can("event:update") && !event.closedOutAt ? (
        <Button className="h-11 self-start px-5" disabled={close.isPending} onClick={finish}>
          <CircleCheck />
          Terminar el cierre
        </Button>
      ) : null}
    </div>
  );
}
