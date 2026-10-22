"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { FlaskConical, Mail, Send } from "lucide-react";

import { cn } from "app/lib/utils";
import { ConfirmDialog, Notice } from "components/Admin/panel";
import { MicroLabel, Panel, PanelHead } from "components/Admin/ui/page";
import { Badge, type BadgeProps } from "components/shared/ui/badge";
import { Button } from "components/shared/ui/button";
import { Input } from "components/shared/ui/input";
import { Textarea } from "components/shared/ui/textarea";
import { toast } from "components/shared/ui/toast-utils";
import { shortWhen } from "lib/community/time";
import type { EditableEvent, EventStats } from "lib/orpc/events/schemas";
import { orpc } from "lib/orpc/client";

import { StaleNotice, useEventSave, type EventInput } from "./save";

const HOUR_MS = 3_600_000;

const AUDIENCES = [
  { key: "attending", title: "Anotados" },
  { key: "waiting", title: "En espera" },
  { key: "pending", title: "Por aprobar" },
] as const;
type Audience = (typeof AUDIENCES)[number]["key"];

/**
 * "Escribir a inscriptos": subject and text to people by where they stand, or to a selection
 * (`ids`, from Inscriptos). Each address gets it once, and whoever turned these off doesn't.
 */
export function Composer({
  input,
  counts,
  ids,
  onSent,
}: {
  input: EventInput;
  /** People per audience, for the picker */
  counts?: Record<Audience, number>;
  /** Write to exactly these people instead */
  ids?: string[];
  onSent?: () => void;
}) {
  const [to, setTo] = useState<Audience[]>(["attending"]);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [confirming, setConfirming] = useState(false);
  const count = ids ? ids.length : to.reduce((sum, key) => sum + (counts?.[key] ?? 0), 0);
  const people = `${count} ${count === 1 ? "persona" : "personas"}`;
  const send = useMutation(
    orpc.events.message.mutationOptions({
      onSuccess: (result) => {
        toast.success(
          `Mandado a ${result.sent} ${result.sent === 1 ? "persona" : "personas"}`,
          result.sent < count ? "Quienes pidieron no recibir mails no lo reciben." : undefined
        );
        setConfirming(false);
        setSubject("");
        setBody("");
        onSent?.();
      },
      onError: (error) => {
        setConfirming(false);
        toast.error("No se pudo mandar", error.message);
      },
    })
  );

  return (
    <>
      <form
        className="flex flex-col gap-4 p-4"
        onSubmit={(event) => {
          event.preventDefault();
          setConfirming(true);
        }}
      >
        {ids ? null : (
          <fieldset className="flex flex-wrap gap-1.5">
            <legend className="mb-2">
              <MicroLabel>A quiénes</MicroLabel>
            </legend>
            {AUDIENCES.map((audience) => {
              const on = to.includes(audience.key);

              return (
                <button
                  key={audience.key}
                  aria-pressed={on}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-meta transition-colors",
                    on ? "border-primary/60 bg-primary-surface text-foreground" : "border-input text-muted-foreground"
                  )}
                  type="button"
                  onClick={() => setTo(on ? to.filter((key) => key !== audience.key) : [...to, audience.key])}
                >
                  {audience.title}
                  <span className="font-terminal tabular-nums">{counts?.[audience.key] ?? "–"}</span>
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
        <Button className="self-end" disabled={count === 0} type="submit">
          <Send />
          Mandar a {people}
        </Button>
      </form>
      <ConfirmDialog
        confirmLabel={`Mandar a ${count}`}
        description="Le llega un mail a cada una, con la opción de no recibir más. No se puede deshacer."
        open={confirming}
        pending={send.isPending}
        pendingLabel="Mandando…"
        title={`¿Mandar «${subject}»?`}
        onConfirm={() =>
          send.mutate({ ...input, to: ids ? ["attending", "waiting", "pending"] : to, ids, subject, body })
        }
        onOpenChange={setConfirming}
      />
    </>
  );
}

type Step = {
  key: keyof EventStats["emails"];
  label: string;
  title: string;
  /** When it goes out; null: as each person signs up */
  at: Date | null;
};

/** A step's badge from what the outbox says, or what's coming. */
function stateOf(
  step: Step,
  counts: { sent: number; queued: number } | undefined,
  surveyOpen: boolean
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
  if (step.key === "feedback" && !surveyOpen)
    return { label: "sin encuesta abierta", variant: "outline", dot: "bg-faint" };
  if (step.at && step.at.getTime() > Date.now()) {
    return { label: "programado", variant: "info", dot: "border border-info-foreground bg-background" };
  }

  return { label: "pendiente", variant: "secondary", dot: "border border-input bg-background" };
}

/**
 * The emails OWU sends on its own (Confirmación · Reconfirmación 48 h · Logística 2 h ·
 * Feedback) with where each one stands, the note the reminders carry, and a test to yourself.
 */
function Cadence({ input, event, stats }: { input: EventInput; event: EditableEvent; stats: EventStats | undefined }) {
  const survey = useQuery(orpc.surveys.get.queryOptions({ input: { eventId: event.id }, staleTime: 30_000 }));
  const surveyOpen = survey.data?.isOpen ?? false;
  const start = new Date(event.startDate).getTime();
  const steps: Step[] = [
    { key: "confirmed", label: "Confirmación", title: "Con la invitación al calendario y el QR", at: null },
    {
      key: "reminder_48h",
      label: "Reconfirmación · 48 h",
      title: "¿Seguís yendo? Con «No puedo ir» para liberar el lugar",
      at: new Date(start - 48 * HOUR_MS),
    },
    {
      key: "reminder_2h",
      label: "Logística · 2 h",
      title: "Cómo llegar, tu nota y la entrada para la puerta",
      at: new Date(start - 2 * HOUR_MS),
    },
    {
      key: "feedback",
      label: "Feedback",
      title: "La encuesta, entre 2 y 26 h después de que termina",
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
          const state = stateOf(step, stats?.emails[step.key], surveyOpen);

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

/** Emails: writing to the event's people, and the cadence that goes out on its own. */
export function EmailsTab({
  input,
  event,
  stats,
}: {
  input: EventInput;
  event: EditableEvent;
  stats: EventStats | undefined;
}) {
  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
      <Panel>
        <PanelHead icon={Mail} title="Escribir a inscriptos" />
        <Composer counts={stats} input={input} />
      </Panel>
      {event.registration === "owu" ? (
        <Cadence event={event} input={input} stats={stats} />
      ) : (
        <Notice tone="info">
          Los mails automáticos (confirmación, recordatorios, encuesta) salen cuando la gente se anota en OWU. Este
          evento se anota {event.registration === "eventbrite" ? "en Eventbrite" : "en otro lado o es libre"}.
        </Notice>
      )}
    </div>
  );
}
