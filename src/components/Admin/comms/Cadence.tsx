"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useMutation, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import {
  CalendarClock,
  Check,
  Clapperboard,
  Copy,
  Info,
  Link2,
  MailCheck,
  Pencil,
  Radio,
  Route,
  Send,
  X,
} from "lucide-react";

import { cn } from "app/lib/utils";
import { Notice } from "components/Admin/panel";
import { Meter, MicroLabel, Panel, PanelHead } from "components/Admin/ui/page";
import { ErrorState } from "components/Admin/ui/states";
import { RelativeTime, useNow } from "components/Admin/ui/time";
import { Badge, type BadgeProps } from "components/shared/ui/badge";
import { Button } from "components/shared/ui/button";
import { Input } from "components/shared/ui/input";
import { Skeleton } from "components/shared/ui/skeleton";
import { toast } from "components/shared/ui/toast-utils";
import { orpc } from "lib/orpc";
import { formatWhen } from "lib/orpc/comms/cadence";
import type { Cadence as CadenceData, CadenceStep, Channels } from "lib/orpc/comms/schemas";
import { wallClock } from "lib/slot-day";

import { CHANNELS, STATUS } from "./labels";
import type { EditorRequest } from "./MessageEditor";
import { STEP_LABELS } from "./OwyMessages";
import { owyChannelOf, useCancelMessage } from "./useCancelMessage";

const copy = (text: string, what: string) =>
  navigator.clipboard.writeText(text).then(
    () => toast.success("Copiado", what),
    () => toast.error("No se pudo copiar", "Seleccioná el texto y copialo a mano.")
  );

/** A step's badge: what happened, or what's missing (late once its time passed). */
function stepBadge(
  step: CadenceStep,
  overdue: boolean
): { label: string; variant: NonNullable<BadgeProps["variant"]> } {
  if (step.status !== "missing") return STATUS[step.status];
  return overdue ? { label: "atrasado", variant: "warning" } : { label: "falta", variant: "secondary" };
}

const DOT: Record<CadenceStep["status"] | "overdue", string> = {
  sent: "bg-success",
  scheduled: "bg-info-foreground",
  sending: "bg-info-foreground",
  failed: "bg-live",
  overdue: "bg-warning",
  missing: "border border-input bg-background",
};

/** One stop on the timeline: when, what, its copy and what you can do about it. */
function Stop({
  label,
  when,
  title,
  description,
  badge,
  dot,
  highlight,
  children,
}: {
  label: string;
  when: ReactNode;
  title: string;
  description: string;
  badge?: { label: string; variant: NonNullable<BadgeProps["variant"]> };
  dot: string;
  highlight?: boolean;
  children: ReactNode;
}) {
  return (
    <li className="relative flex gap-4 pb-7 last:pb-0">
      <div aria-hidden className="flex flex-col items-center">
        <span
          className={cn(
            "mt-1 size-2.5 shrink-0 rounded-full",
            dot,
            highlight && "shadow-[0_0_0_4px_hsl(var(--primary)/0.16)] ring-1 ring-primary"
          )}
        />
        <span className="mt-1.5 w-px flex-1 bg-input" />
      </div>
      <div className="-mt-0.5 min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <MicroLabel className={highlight ? "text-primary" : undefined}>{label}</MicroLabel>
          <span className="font-terminal text-meta text-subtle tabular-nums">{when}</span>
          {badge ? <Badge variant={badge.variant}>{badge.label}</Badge> : null}
        </div>
        <h3 className="mt-1 text-ui font-semibold text-foreground">{title}</h3>
        <p className="text-meta text-muted-foreground">{description}</p>
        <div className="mt-3 space-y-3">{children}</div>
      </div>
    </li>
  );
}

/** The copy, clamped until you ask for all of it. */
function CopyBox({ subject, body }: { subject?: string | null; body: string }) {
  const [full, setFull] = useState(false);

  return (
    <div className="rounded-md border border-border bg-background">
      {subject ? (
        <p className="border-b border-border px-3 py-2 text-meta text-muted-foreground">
          Asunto: <span className="text-foreground">{subject}</span>
        </p>
      ) : null}
      {/* The padding sits outside the clamp: clamped text clips at the padding box, and the next line would peek. */}
      <div className="px-3 py-2">
        <p className={cn("text-meta break-words whitespace-pre-line text-subtle", !full && "line-clamp-4")}>{body}</p>
      </div>
      {body.split("\n").length > 4 || body.length > 280 ? (
        <button
          className="w-full border-t border-border px-3 py-1.5 text-left text-2xs text-muted-foreground transition-colors hover:text-foreground pointer-coarse:py-3.5"
          type="button"
          onClick={() => setFull((value) => !value)}
        >
          {full ? "Ver menos" : "Ver todo"}
        </button>
      ) : null}
    </div>
  );
}

/** "Durante": the wall, through the stage's message scene. Nothing is stored here. */
function WallMessage({ eventId }: { eventId: string }) {
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const onAir = useMutation(
    orpc.owyStage.setScene.mutationOptions({
      onSuccess: () => {
        toast.success("Al aire en el wall", title.trim());
        setTitle("");
        setSubtitle("");
      },
      onError: (error) => toast.error("No salió al aire", error.message),
    })
  );

  return (
    <form
      className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
      onSubmit={(event) => {
        event.preventDefault();
        if (!title.trim()) return;
        onAir.mutate({ scene: "message", eventId, params: { title: title.trim(), subtitle: subtitle.trim() } });
      }}
    >
      <label className="sr-only" htmlFor="wall-title">
        Aviso en grande
      </label>
      <Input
        id="wall-title"
        maxLength={80}
        placeholder="Aviso en grande: «Charlas en Centro»"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
      />
      <label className="sr-only" htmlFor="wall-subtitle">
        Debajo, más chico
      </label>
      <Input
        id="wall-subtitle"
        maxLength={140}
        placeholder="Debajo, más chico (opcional)"
        value={subtitle}
        onChange={(event) => setSubtitle(event.target.value)}
      />
      <Button disabled={!title.trim() || onAir.isPending} type="submit" variant="outline">
        <Radio className="text-live-foreground" />
        {onAir.isPending ? "Poniendo…" : "Poner al aire"}
      </Button>
    </form>
  );
}

function LinkRow({ label, href }: { label: string; href: string | null }) {
  return (
    <li className="flex items-center gap-2 px-3.5 py-2.5 pointer-coarse:min-h-11 pointer-coarse:py-0">
      <span className="w-16 shrink-0 text-meta text-muted-foreground">{label}</span>
      {href ? (
        <>
          <a
            className="min-w-0 flex-1 truncate font-terminal text-2xs text-subtle hover:text-foreground pointer-coarse:py-3.5"
            href={href}
            rel="noopener noreferrer"
            target="_blank"
          >
            {href.replace(/^https?:\/\//, "")}
          </a>
          <Button
            aria-label={`Copiar el link de ${label.toLowerCase()}`}
            size="icon-xs"
            variant="ghost"
            onClick={() => void copy(href, label)}
          >
            <Copy />
          </Button>
        </>
      ) : (
        <span className="min-w-0 flex-1 text-2xs text-muted-foreground">Sin configurar</span>
      )}
    </li>
  );
}

/** The conf's communication as a timeline: T-7, T-1, the morning, the day itself and T+1. */
export function Cadence({
  eventId,
  cadence,
  channels,
  onEdit,
  onOpenSurvey,
}: {
  eventId: string;
  cadence: UseQueryResult<CadenceData>;
  channels: Channels | undefined;
  onEdit: (request: EditorRequest) => void;
  onOpenSurvey: () => void;
}) {
  const now = useNow(60_000);
  const queryClient = useQueryClient();
  const timeZone = cadence.data?.timezone ?? "America/Montevideo";
  const cancel = useCancelMessage(eventId, timeZone);
  const markSent = useMutation(
    orpc.comms.markSent.mutationOptions({
      onSuccess: () => {
        toast.success("Marcado como enviado", "Queda registrado en la cadencia.");
        void queryClient.invalidateQueries({ queryKey: orpc.comms.cadence.key({ input: { eventId } }) });
        void queryClient.invalidateQueries({ queryKey: orpc.comms.list.key({ input: { eventId } }) });
      },
      onError: (error) => toast.error("No se pudo marcar", error.message),
    })
  );

  if (cadence.isPending) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-28 rounded-lg" />
        ))}
      </div>
    );
  }
  if (cadence.isError) return <ErrorState onRetry={() => void cadence.refetch()} retrying={cadence.isFetching} />;

  const data = cadence.data;
  const ready = data.steps.filter((step) => step.status !== "missing" && step.status !== "failed").length;
  const overdue = (step: CadenceStep) => step.status === "missing" && now > 0 && Date.parse(step.at) < now;
  // One primary per view: the first step still waiting for someone.
  const next = data.steps.find((step) => step.status === "missing" || step.status === "failed")?.key;
  const titled = (step: CadenceStep) => `${STEP_LABELS[step.key]} · ${step.title}`;
  // When it went out, or will; the suggestion only while nothing is planned.
  const whenOf = (step: CadenceStep) =>
    (step.status === "sent" ? step.message?.sentAt : step.message?.scheduledAt) ?? step.at;
  const dayIsOn = now > 0 && Date.parse(data.eventStart) <= now && now <= Date.parse(data.eventEnd);

  const owyActions = (step: CadenceStep) => {
    const message = step.message;
    if (message && step.status === "scheduled") {
      const base = {
        channel: owyChannelOf(message),
        body: message.body,
        step: step.key,
        messageId: message.id,
        title: titled(step),
      };
      return (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => onEdit({ ...base, mode: "edit", at: message.scheduledAt ?? undefined })}
          >
            <Pencil />
            Editar
          </Button>
          <Button size="sm" variant="outline" onClick={() => onEdit({ ...base, mode: "send-scheduled" })}>
            <Send />
            Enviar ahora
          </Button>
          <Button
            disabled={cancel.isPending}
            size="sm"
            variant="ghost"
            onClick={() => cancel.mutate({ eventId, messageId: message.id })}
          >
            <X />
            Cancelar
          </Button>
        </div>
      );
    }
    if (message && (step.status === "sent" || step.status === "sending")) {
      return (
        <p className="flex items-center gap-1.5 text-meta text-muted-foreground">
          <Check aria-hidden className="size-3.5 text-success-foreground" />
          {step.status === "sent" ? "Salió" : "Saliendo"} por {CHANNELS[message.channel].label}
          {message.sentAt ? <> · {formatWhen(message.sentAt, timeZone)}</> : null}
          {message.createdBy ? <> · {message.createdBy.name}</> : null}
        </p>
      );
    }
    // Missing, or failed: start again from the copy (a failed one keeps its text).
    const body = message?.body ?? step.body;
    const future = Date.parse(step.at) > Date.now();
    return (
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={next === step.key ? "default" : "outline"}
          onClick={() =>
            onEdit({
              mode: "schedule",
              channel: "telegram",
              body,
              at: future ? step.at : undefined,
              step: step.key,
              title: titled(step),
            })
          }
        >
          <CalendarClock />
          Programar
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => onEdit({ mode: "send", channel: "telegram", body, step: step.key, title: titled(step) })}
        >
          <Send />
          Enviar ahora
        </Button>
      </div>
    );
  };

  const emailActions = (step: CadenceStep) => {
    const message = step.message;
    if (message && message.channel !== "email" && step.status !== "failed") return owyActions(step);
    if (message && step.status === "sent") {
      return (
        <div className="flex flex-wrap items-center gap-2">
          <p className="flex items-start gap-1.5 text-meta text-muted-foreground">
            <MailCheck aria-hidden className="mt-0.5 size-3.5 shrink-0 text-success-foreground" />
            {/* One run of text, so a narrow screen wraps it as a sentence instead of splitting it into columns. */}
            <span>
              Marcado como enviado{message.createdBy ? ` por ${message.createdBy.name}` : ""}
              {message.sentAt ? (
                <>
                  {" · "}
                  <RelativeTime date={message.sentAt} />
                </>
              ) : null}
            </span>
          </p>
          <Button
            disabled={cancel.isPending}
            size="xs"
            variant="ghost"
            onClick={() => cancel.mutate({ eventId, messageId: message.id })}
          >
            Desmarcar
          </Button>
        </div>
      );
    }
    return (
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => void copy(`${step.subject ?? ""}\n\n${step.body}`.trim(), "Asunto y texto del email")}
        >
          <Copy />
          Copiar texto
        </Button>
        <Button
          disabled={markSent.isPending}
          size="sm"
          variant={next === step.key ? "default" : "outline"}
          onClick={() => markSent.mutate({ eventId, step: step.key, body: step.body })}
        >
          <MailCheck />
          Marcar como enviado
        </Button>
      </div>
    );
  };

  const stops = data.steps.flatMap((step) => {
    const late = overdue(step);
    const stop = (
      <Stop
        key={step.key}
        badge={stepBadge(step, late)}
        description={step.description}
        dot={DOT[late ? "overdue" : step.status]}
        highlight={next === step.key}
        label={STEP_LABELS[step.key]}
        title={step.title}
        when={
          <>
            {formatWhen(whenOf(step), timeZone)}
            <span className="ml-2 text-muted-foreground">
              <RelativeTime date={whenOf(step)} />
            </span>
          </>
        }
      >
        <CopyBox body={step.message?.body ?? step.body} subject={step.channel === "email" ? step.subject : null} />
        {step.key === "t+1" && !data.surveyOpen ? (
          <Notice tone="warning">
            La encuesta está cerrada: abrila antes de que salga este mensaje, o el link no va a funcionar.{" "}
            <button
              className="relative font-medium text-foreground underline underline-offset-2 pointer-coarse:after:absolute pointer-coarse:after:-inset-3"
              type="button"
              onClick={onOpenSurvey}
            >
              Ir a la encuesta
            </button>
          </Notice>
        ) : null}
        {step.message?.status === "failed" && step.message.error ? (
          <p className="text-meta text-live-foreground">{step.message.error}</p>
        ) : null}
        {step.channel === "email" ? emailActions(step) : owyActions(step)}
      </Stop>
    );
    if (step.key !== "t+1") return [stop];

    // The day itself sits between the morning message and the thanks.
    return [
      <Stop
        key="durante"
        description="Avisos en el wall con la escena «Mensaje». No se guardan: salen al aire en el momento."
        dot={dayIsOn ? "bg-live shadow-[0_0_0_4px_hsl(var(--live)/0.18)]" : DOT.missing}
        badge={dayIsOn ? { label: "en vivo", variant: "destructive" } : undefined}
        label="Durante"
        title="Pantallas del venue"
        when={`${formatWhen(data.eventStart, timeZone)}–${wallClock(new Date(data.eventEnd), timeZone).slice(11)}`}
      >
        <WallMessage eventId={eventId} />
        <Button asChild size="sm" variant="ghost">
          <Link href="/admin/owy/scenes">
            <Clapperboard />
            Abrir Escenas
          </Link>
        </Button>
      </Stop>,
      stop,
    ];
  });

  return (
    <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      <Panel>
        <PanelHead
          actions={
            <Meter
              className="w-28 max-sm:hidden"
              label="Pasos listos"
              max={4}
              tone={ready === 4 ? "success" : "info"}
              value={ready}
            />
          }
          icon={Route}
          meta={`${ready} de 4 listos`}
          title="Cadencia del evento"
        />
        <ol className="px-4 py-5 sm:px-5">{stops}</ol>
      </Panel>
      <div className="space-y-4">
        <Panel>
          <PanelHead icon={Link2} title="Links para los mensajes" />
          <ul className="divide-y divide-border">
            <LinkRow href={data.links.agenda} label="Agenda" />
            <LinkRow href={data.links.survey} label="Encuesta" />
            <LinkRow href={data.links.map} label="Mapa" />
            <LinkRow href={data.links.owy} label="Owy" />
          </ul>
        </Panel>
        <Panel>
          <PanelHead icon={Info} title="Cómo sale cada paso" />
          <ul className="space-y-2.5 px-3.5 py-3 text-meta text-muted-foreground">
            <li>
              <span className="text-subtle">T-7</span> sale desde Eventbrite: copiás el texto, lo mandás a los
              inscriptos y lo marcás acá.
            </li>
            <li>
              <span className="text-subtle">T-1, el día y T+1</span> los manda Owy por Telegram a la hora programada.
              Los programados salen mientras haya un admin abierto.
            </li>
            <li>
              <span className="text-subtle">Durante</span>, los avisos van al wall desde acá o desde Escenas.
            </li>
            {channels && !channels.telegram ? (
              <li className="text-warning-foreground">
                Telegram todavía no está configurado: lo programado va a fallar.
              </li>
            ) : null}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
