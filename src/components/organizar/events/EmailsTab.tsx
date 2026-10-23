"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Eye, FlaskConical, History, Mail, Send, Users } from "lucide-react";

import { cn } from "app/lib/utils";
import { Notice } from "components/Admin/panel";
import { DateTimeInput } from "components/Admin/settings/event-fields";
import { MicroLabel, Panel, PanelHead } from "components/Admin/ui/page";
import { EmptyState, ErrorState } from "components/Admin/ui/states";
import { useNow } from "components/Admin/ui/time";
import { Badge, type BadgeProps } from "components/shared/ui/badge";
import { Button } from "components/shared/ui/button";
import { Input } from "components/shared/ui/input";
import { Skeleton } from "components/shared/ui/skeleton";
import { Switch } from "components/shared/ui/switch";
import { Textarea } from "components/shared/ui/textarea";
import { toast } from "components/shared/ui/toast-utils";
import { dayKey, montevideoIso, shortWhen } from "lib/community/time";
import { appUrl, eventMessageEmail } from "lib/email/templates";
import { FEEDBACK_TIMING } from "lib/organizar/rules";
import { headcount, plural } from "lib/organizar/words";
import type { Audience, EditableEvent, EventStats } from "lib/orpc/events/schemas";
import { orpc } from "lib/orpc/client";

import { usePanel } from "../shell/context";
import { NotifyDialog } from "./NotifyDialog";
import { StaleNotice, useEventSave, type EventInput } from "./save";

const HOUR_MS = 3_600_000;

const AUDIENCE_LABEL: Record<Audience, string> = {
  attending: "Anotados",
  waiting: "En espera",
  pending: "Por aprobar",
  came: "Vinieron",
  missed: "No vinieron",
  "waitlist-left": "Lista de espera que no entró",
};

/**
 * Who the composer can write to, with how many each reaches: before the event by where people
 * stand; after it, also by whether they came (only when the door was used).
 */
function audiencesFor(event: EditableEvent, stats: EventStats | undefined, over: boolean) {
  const waiting = (stats?.waitlisted ?? 0) + (stats?.offered ?? 0);
  const doorUsed = (stats?.checkedIn ?? 0) > 0;
  const list: { key: Audience; count: number | undefined }[] = over
    ? [
        ...(doorUsed
          ? [
              { key: "came" as const, count: stats?.checkedIn },
              { key: "missed" as const, count: stats?.missed },
            ]
          : []),
        { key: "attending", count: stats?.attending },
        { key: "waitlist-left", count: waiting },
      ]
    : [
        { key: "attending", count: stats?.attending },
        { key: "waiting", count: waiting },
        ...(event.approval || (stats?.pending ?? 0) > 0 ? [{ key: "pending" as const, count: stats?.pending }] : []),
      ];

  return list;
}

/** In an hour, on the hour: where "Programar" starts */
const inAnHour = (now: number) => {
  const at = new Date(Math.ceil((now + HOUR_MS) / HOUR_MS) * HOUR_MS);

  return { day: dayKey(at), time: shortWhen(at).split(" · ")[1] ?? "10:00" };
};

/**
 * Writing to the event's people: one audience (or a selection from Inscriptos), the mail as it
 * will look, a test to yourself, now or at a set time. Sending now asks once, with the count.
 */
export function Composer({
  input,
  event,
  stats,
  ids,
  onSent,
}: {
  input: EventInput;
  event: EditableEvent;
  stats?: EventStats;
  /** Write to exactly these people instead (a selection in Inscriptos) */
  ids?: string[];
  onSent?: () => void;
}) {
  const queryClient = useQueryClient();
  const { current } = usePanel();
  const now = useNow(60_000);
  const over = now > 0 && Date.parse(event.endDate) <= now;
  const audiences = audiencesFor(event, stats, over);
  const [chosen, setChosen] = useState<Audience | null>(null);
  const to = chosen ?? audiences[0]?.key ?? "attending";
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [preview, setPreview] = useState(false);
  const [later, setLater] = useState<{ day: string; time: string } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const count = ids ? ids.length : (audiences.find((item) => item.key === to)?.count ?? 0);
  const reset = () => {
    setConfirming(false);
    setSubject("");
    setBody("");
    setLater(null);
    void queryClient.invalidateQueries({ queryKey: orpc.events.messages.key() });
    onSent?.();
  };
  const send = useMutation(
    orpc.events.message.mutationOptions({
      onSuccess: (result) => {
        toast.success(
          `Mandado a ${plural(result.sent, "persona", "personas")}`,
          result.sent < count ? "Quienes pidieron no recibir mails no lo reciben." : undefined
        );
        reset();
      },
      onError: (error) => {
        setConfirming(false);
        toast.error("No se pudo mandar", error.message);
      },
    })
  );
  const cancel = useMutation(orpc.events.cancelMessage.mutationOptions());
  const schedule = useMutation(
    orpc.events.scheduleMessage.mutationOptions({
      onSuccess: (message) => {
        reset();
        // Reversible until it goes out: undo calls it off
        toast.undo(`Programado para el ${shortWhen(message.sendAt)}`, () =>
          cancel.mutate(
            { ...input, messageId: message.id },
            { onSettled: () => void queryClient.invalidateQueries({ queryKey: orpc.events.messages.key() }) }
          )
        );
      },
      onError: (error) => toast.error("No se pudo programar", error.message),
    })
  );
  const test = useMutation(
    orpc.events.messageTest.mutationOptions({
      onSuccess: (result) => toast.success("Prueba en camino", `A ${result.to}, marcada [Prueba].`),
      onError: (error) => toast.error("No se pudo mandar la prueba", error.message),
    })
  );
  const ready = subject.trim().length >= 3 && body.trim().length >= 10;
  const sendAt = later ? new Date(montevideoIso(`${later.day}T${later.time}`)).toISOString() : null;
  const html = preview
    ? eventMessageEmail({
        community: current?.name ?? "",
        event: event.name,
        subject: subject || "Asunto",
        body: body || "Tu mensaje",
        pageUrl: appUrl(`/comunidad/${event.communitySlug}/events/${event.slug}`),
        unsubscribeUrl: appUrl("/email/baja"),
      }).html
    : "";

  return (
    <>
      <form
        className="flex flex-col gap-4 p-4"
        onSubmit={(submit) => {
          submit.preventDefault();
          if (!ready) return;
          if (later && sendAt) schedule.mutate({ ...input, to, subject, body, sendAt });
          else setConfirming(true);
        }}
      >
        {ids ? null : (
          <fieldset className="flex flex-wrap gap-1.5">
            <legend className="mb-2">
              <MicroLabel>A quiénes</MicroLabel>
            </legend>
            {audiences.map((audience) => {
              const on = to === audience.key;

              return (
                <button
                  key={audience.key}
                  aria-pressed={on}
                  className={cn(
                    "flex min-h-7 items-center gap-1.5 rounded-md border px-2.5 py-1 text-meta transition-colors",
                    on ? "border-primary/60 bg-primary-surface text-foreground" : "border-input text-muted-foreground"
                  )}
                  type="button"
                  onClick={() => setChosen(audience.key)}
                >
                  {AUDIENCE_LABEL[audience.key]}
                  <span className="font-terminal tabular-nums">{audience.count ?? "–"}</span>
                </button>
              );
            })}
          </fieldset>
        )}
        <label className="flex flex-col gap-1.5">
          <MicroLabel>Asunto</MicroLabel>
          <Input
            maxLength={120}
            minLength={3}
            required
            value={subject}
            onChange={(change) => setSubject(change.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="flex items-baseline justify-between">
            <MicroLabel>Mensaje</MicroLabel>
            <span className="font-terminal text-2xs text-muted-foreground tabular-nums">{body.length}/5000</span>
          </span>
          <Textarea
            maxLength={5000}
            minLength={10}
            required
            rows={7}
            value={body}
            onChange={(change) => setBody(change.target.value)}
          />
        </label>
        {preview ? (
          <iframe
            className="h-80 w-full rounded-md border border-border bg-white"
            sandbox=""
            srcDoc={html}
            title="Vista previa del mail"
          />
        ) : null}
        {ids ? null : (
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 text-ui text-foreground">
              <Switch
                aria-label="Programar el envío"
                checked={later !== null}
                onCheckedChange={(on) => setLater(on ? inAnHour(now || Date.now()) : null)}
              />
              Programar el envío
            </label>
            {later ? (
              <DateTimeInput
                day={later.day}
                id="message-at"
                time={later.time}
                timeLabel="Hora del envío"
                onClockChange={(time) => time && setLater({ ...later, time })}
                onDayChange={(day) => setLater({ ...later, day })}
              />
            ) : null}
          </div>
        )}
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          <Button size="sm" type="button" variant="ghost" onClick={() => setPreview(!preview)}>
            <Eye />
            {preview ? "Ocultar la vista previa" : "Vista previa"}
          </Button>
          <Button
            disabled={!ready || test.isPending}
            size="sm"
            type="button"
            variant="outline"
            onClick={() => test.mutate({ ...input, subject, body })}
          >
            <FlaskConical />
            Mandarme una prueba
          </Button>
          <Button disabled={count === 0 || !ready || schedule.isPending} type="submit">
            {later ? <CalendarClock /> : <Send />}
            {later && sendAt
              ? `Programar para el ${shortWhen(sendAt)}`
              : `Mandar a ${plural(count, "persona", "personas")}`}
          </Button>
        </div>
      </form>
      <NotifyDialog
        confirmLabel={`Mandar a ${plural(count, "persona", "personas")}`}
        description="Le llega un mail a cada una, con la opción de no recibir más. No se puede deshacer."
        open={confirming}
        pending={send.isPending}
        pendingLabel="Mandando…"
        title={`Mandar «${subject}»`}
        onConfirm={() =>
          send.mutate({
            ...input,
            to: ids ? ["attending", "waiting", "pending"] : [to],
            ids,
            subject,
            body,
          })
        }
        onOpenChange={setConfirming}
      />
    </>
  );
}

const STATUS: Record<string, { label: string; variant: NonNullable<BadgeProps["variant"]> }> = {
  sent: { label: "Enviado", variant: "success" },
  sending: { label: "Saliendo", variant: "info" },
  scheduled: { label: "Programado", variant: "info" },
  cancelled: { label: "Cancelado", variant: "outline" },
};

/** What the team wrote to the event's people: sent, waiting for its time (cancelable), called off. */
function MessagesLog({ input }: { input: EventInput }) {
  const queryClient = useQueryClient();
  const messages = useQuery(orpc.events.messages.queryOptions({ input }));
  const cancel = useMutation(
    orpc.events.cancelMessage.mutationOptions({
      onSuccess: () => {
        toast.success("Envío cancelado", "No le llega a nadie.");
        void queryClient.invalidateQueries({ queryKey: orpc.events.messages.key() });
      },
      onError: (error) => toast.error("No se pudo cancelar", error.message),
    })
  );

  return (
    <Panel>
      <PanelHead icon={History} title="Mensajes" />
      {messages.isError ? (
        <ErrorState compact onRetry={() => void messages.refetch()} title="No pudimos traer los mensajes" />
      ) : !messages.data ? (
        <Skeleton className="m-3 h-16" />
      ) : messages.data.length === 0 ? (
        <EmptyState
          compact
          description="Lo que escribas o programes queda acá."
          icon={Mail}
          title="Sin mensajes todavía"
        />
      ) : (
        <ul aria-label="Mensajes del evento" className="divide-y divide-border">
          {messages.data.map((message) => {
            const status = STATUS[message.status] ?? STATUS.sent;

            return (
              <li key={message.id} className="flex items-start gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-ui text-foreground">{message.subject}</p>
                  <p className="text-meta text-muted-foreground">
                    {AUDIENCE_LABEL[message.audience as Audience] ?? message.audience} ·{" "}
                    {message.status === "sent"
                      ? `a ${plural(message.recipients, "persona", "personas")}, ${shortWhen(message.sentAt ?? message.sendAt)}`
                      : shortWhen(message.sendAt)}
                    {message.by ? ` · ${message.by}` : ""}
                  </p>
                </div>
                <Badge variant={status.variant}>{status.label}</Badge>
                {message.status === "scheduled" ? (
                  <Button
                    disabled={cancel.isPending}
                    size="xs"
                    variant="ghost"
                    onClick={() => cancel.mutate({ ...input, messageId: message.id })}
                  >
                    Cancelar envío
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

type CadenceKey = keyof EventStats["emails"];
type Step = {
  key: CadenceKey;
  label: string;
  title: string;
  /** When it goes out; null: as each person signs up */
  at: Date | null;
};

/** A step's badge from what the outbox says, or what's coming. */
function stateOf(
  step: Step,
  counts: { sent: number; queued: number } | undefined,
  surveyOpen: boolean,
  off: boolean
): { label: string; variant: NonNullable<BadgeProps["variant"]>; dot: string } {
  if (counts && counts.sent > 0) {
    return {
      label: `enviado a ${counts.sent}${counts.queued ? ` · ${counts.queued} en cola` : ""}`,
      variant: "success",
      dot: "bg-success",
    };
  }
  if (counts && counts.queued > 0)
    return { label: `${counts.queued} en cola`, variant: "info", dot: "bg-info-foreground" };
  if (off) return { label: "apagado", variant: "outline", dot: "bg-faint" };
  if (step.key === "feedback" && !surveyOpen)
    return { label: "sin encuesta abierta", variant: "outline", dot: "bg-faint" };
  if (step.at && step.at.getTime() > Date.now()) {
    return { label: "programado", variant: "info", dot: "border border-info-foreground bg-background" };
  }

  return { label: "pendiente", variant: "secondary", dot: "border border-input bg-background" };
}

/**
 * The emails OWU sends on its own (Confirmación · Reconfirmación 48 h · Segundo aviso 24 h ·
 * Logística 2 h · Encuesta) with where each one stands, the note the reminders carry, and a test.
 */
function Cadence({ input, event, stats }: { input: EventInput; event: EditableEvent; stats: EventStats | undefined }) {
  const survey = useQuery(orpc.surveys.get.queryOptions({ input: { eventId: event.id }, staleTime: 30_000 }));
  const surveyOpen = survey.data?.isOpen ?? false;
  const start = new Date(event.startDate).getTime();
  // The second ask only makes sense when a freed seat goes to someone
  const pingApplies = event.waitlist || event.capacity !== null;
  const steps: Step[] = [
    { key: "confirmed", label: "Confirmación", title: "Con la invitación al calendario y el QR", at: null },
    {
      key: "reminder_48h",
      label: "Reconfirmación · 48 h",
      title: "¿Seguís yendo? Con «Voy ✅» y «No puedo ir» para liberar el lugar",
      at: new Date(start - 48 * HOUR_MS),
    },
    {
      key: "confirm_ping",
      label: "Segundo aviso · 24 h",
      title: "Solo a quienes no confirmaron, cuando hay cupo o lista de espera",
      at: new Date(start - 24 * HOUR_MS),
    },
    {
      key: "reminder_2h",
      label: "Logística · 2 h",
      title: "Cómo llegar, tu nota y la entrada para la puerta",
      at: new Date(start - 2 * HOUR_MS),
    },
    {
      key: "feedback",
      label: "Encuesta",
      title: FEEDBACK_TIMING,
      at: new Date(new Date(event.endDate).getTime() + 2 * HOUR_MS),
    },
  ];
  const { save, saving, stale, reload } = useEventSave(input);
  const [note, setNote] = useState<string | null>(null);
  const shown = note ?? event.reminderNote ?? "";
  const test = useMutation(
    orpc.rsvps.sendTest.mutationOptions({
      onSuccess: (result) => toast.success(`Van ${result.sent} mails de prueba`, `A ${result.to}, en un minuto.`),
      onError: (error) => toast.error("No se pudo mandar la prueba", error.message),
    })
  );

  return (
    <Panel>
      <PanelHead
        actions={
          <Button disabled={test.isPending} size="sm" variant="outline" onClick={() => test.mutate(input)}>
            <FlaskConical />
            Mandarme una prueba
          </Button>
        }
        title="Lo que mandamos solos"
      />
      <ol className="px-4 pt-5">
        {steps.map((step) => {
          const off = step.key === "confirm_ping" && (!event.confirmPing || !pingApplies);
          const state = stateOf(step, stats?.emails[step.key], surveyOpen, off);

          return (
            <li key={step.key} className="relative flex gap-3 pb-5 last:pb-4">
              <div aria-hidden className="flex flex-col items-center">
                <span className={cn("mt-1 size-2.5 shrink-0 rounded-full", state.dot)} />
                <span className="mt-1.5 w-px flex-1 bg-input" />
              </div>
              <div className="-mt-0.5 min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <MicroLabel>{step.label}</MicroLabel>
                  <span className="font-terminal text-meta text-subtle tabular-nums">
                    {step.at ? shortWhen(step.at) : "al anotarse"}
                  </span>
                </div>
                <p className="mt-0.5 text-ui text-foreground">{step.title}</p>
                <Badge className="mt-1.5" variant={state.variant}>
                  {state.label}
                </Badge>
                {step.key === "confirm_ping" ? (
                  <label className="mt-2 flex items-center gap-2 text-meta text-muted-foreground">
                    <Switch
                      aria-label="Segundo aviso 24 h antes a quienes no confirmaron"
                      checked={event.confirmPing}
                      disabled={saving || !pingApplies}
                      onCheckedChange={(confirmPing) =>
                        void save({ confirmPing }).then(
                          (ok) => ok && toast.success(confirmPing ? "Segundo aviso prendido" : "Segundo aviso apagado")
                        )
                      }
                    />
                    {pingApplies
                      ? "Segundo aviso 24 h antes a quienes no confirmaron"
                      : "Sale cuando el evento tiene cupo o lista de espera"}
                  </label>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
      <form
        className="flex flex-col gap-2 border-t border-border p-4"
        onSubmit={(submit) => {
          submit.preventDefault();
          void save({ reminderNote: shown.trim() || null }).then((ok) => {
            if (!ok) return;
            setNote(null);
            toast.success("Nota guardada", "La llevan los próximos recordatorios.");
          });
        }}
      >
        <StaleNotice
          show={stale}
          onReload={() => {
            setNote(null);
            void reload();
          }}
        />
        <label className="flex flex-col gap-1.5">
          <span className="flex items-baseline justify-between">
            <MicroLabel>Nota en los recordatorios</MicroLabel>
            <span className="font-terminal text-2xs text-muted-foreground tabular-nums">{shown.length}/500</span>
          </span>
          <Textarea
            maxLength={500}
            placeholder="Entrada por la puerta lateral. Traé tu cédula para el edificio."
            rows={3}
            value={shown}
            onChange={(change) => setNote(change.target.value)}
          />
        </label>
        <p className="text-meta text-muted-foreground">Va en la reconfirmación y en el mail de logística.</p>
        <Button
          className="self-end"
          disabled={saving || note === null || shown.trim() === (event.reminderNote ?? "")}
          size="sm"
          type="submit"
          variant="outline"
        >
          {saving ? "Guardando…" : "Guardar nota"}
        </Button>
      </form>
    </Panel>
  );
}

/** The community's own setting, here because it's an email: off unless the team turns it on. */
function NoShowNudge({ input, event }: { input: EventInput; event: EditableEvent }) {
  const queryClient = useQueryClient();
  const { can } = usePanel();
  const update = useMutation(
    orpc.communities.update.mutationOptions({
      onSuccess: (_, variables) => {
        void queryClient.invalidateQueries({ queryKey: orpc.events.get.key() });
        toast.success(
          variables.data.noShowNudge ? "Aviso prendido para la comunidad" : "Aviso apagado para la comunidad"
        );
      },
      onError: (error) => toast.error("No se pudo cambiar", error.message),
    })
  );

  return (
    <Panel>
      <PanelHead icon={Users} meta="Para toda la comunidad" title="Después de dos faltas" />
      <label className="flex items-start gap-3 p-4 text-ui text-foreground">
        <Switch
          aria-label="Un aviso amable a quien faltó dos veces sin avisar"
          checked={event.noShowNudge}
          disabled={update.isPending || !can("organization:update")}
          onCheckedChange={(noShowNudge) => update.mutate({ communityId: input.communityId, data: { noShowNudge } })}
        />
        <span className="flex flex-col gap-1">
          Un aviso amable a quien faltó dos veces sin avisar
          <span className="text-meta text-muted-foreground">
            Una sola vez por persona: «La próxima, si no podés, liberá tu lugar». Sin sanciones.
            {can("organization:update") ? "" : " Lo cambia quien administra la comunidad."}
          </span>
        </span>
      </label>
    </Panel>
  );
}

/** Emails: writing to the event's people, what was sent, and the cadence that goes out on its own. */
export function EmailsTab({
  input,
  event,
  stats,
}: {
  input: EventInput;
  event: EditableEvent;
  stats: EventStats | undefined;
}) {
  const count = stats ? headcount(stats, event.capacity) : null;

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="flex min-w-0 flex-col gap-4">
        <Panel>
          <PanelHead
            icon={Mail}
            meta={count ? `${count.attendingLabel} · ${count.waitlistLabel}` : undefined}
            title="Escribir a inscriptos"
          />
          <Composer event={event} input={input} stats={stats} />
        </Panel>
        <MessagesLog input={input} />
      </div>
      <div className="flex min-w-0 flex-col gap-4">
        {event.registration === "owu" ? (
          <>
            <Cadence event={event} input={input} stats={stats} />
            <NoShowNudge event={event} input={input} />
          </>
        ) : (
          <Notice tone="info">
            Los mails automáticos (confirmación, recordatorios, encuesta) salen cuando la gente se anota en OWU. Este
            evento se anota {event.registration === "eventbrite" ? "en Eventbrite" : "en otro lado o es libre"}.
          </Notice>
        )}
      </div>
    </div>
  );
}
