"use client";

import { useState, type ReactNode } from "react";
import { useMutation, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { CalendarClock, History, Info, Pencil, RotateCcw, Send, X } from "lucide-react";

import { SwitchRow } from "components/Admin/panel";
import { Panel, PanelHead } from "components/Admin/ui/page";
import { PersonAvatar } from "components/Admin/ui/person";
import { EmptyState, ErrorState } from "components/Admin/ui/states";
import { SwipeRow, type SwipeAction } from "components/Admin/ui/swipe";
import { RelativeTime } from "components/Admin/ui/time";
import { Badge } from "components/shared/ui/badge";
import { Button } from "components/shared/ui/button";
import { Skeleton } from "components/shared/ui/skeleton";
import { toast } from "components/shared/ui/toast-utils";
import { orpc } from "lib/orpc";
import { CADENCE_STEPS, formatWhen } from "lib/orpc/comms/cadence";
import { MESSAGE_MAX, type Channels, type OutboundMessage } from "lib/orpc/comms/schemas";

import { CHANNELS, STATUS, fromLocalInput, toLocalInput } from "./labels";
import type { EditorRequest } from "./MessageEditor";
import {
  BodyField,
  ChannelPicker,
  MessagePreview,
  UnconfiguredNotice,
  WhenField,
  type OwyChannel,
} from "./MessageFields";
import { owyChannelOf, stepOf, useCancelMessage } from "./useCancelMessage";

export const STEP_LABELS: Record<(typeof CADENCE_STEPS)[number], string> = {
  "t-7": "T-7",
  "t-1": "T-1",
  morning: "Día",
  "t+1": "T+1",
};

/** The next round hour at least 30 minutes away: a sane default for "Programar". */
const nextSlot = () => {
  const at = new Date(Date.now() + 90 * 60_000);
  at.setMinutes(0, 0, 0);
  return at;
};

function Composer({
  eventId,
  channels,
  timeZone,
}: {
  eventId: string;
  channels: Channels | undefined;
  timeZone: string;
}) {
  const queryClient = useQueryClient();
  const [channel, setChannel] = useState<OwyChannel>("telegram");
  const [body, setBody] = useState("");
  const [later, setLater] = useState(false);
  const [when, setWhen] = useState(() => toLocalInput(nextSlot(), timeZone));

  const done = (title: string) => {
    toast.success(title, `Por ${CHANNELS[channel].label}`);
    setBody("");
    void queryClient.invalidateQueries({ queryKey: orpc.comms.list.key({ input: { eventId } }) });
  };
  const failed = (error: Error) => {
    toast.error("No salió", error.message);
    void queryClient.invalidateQueries({ queryKey: orpc.comms.list.key({ input: { eventId } }) });
  };
  const send = useMutation(orpc.comms.send.mutationOptions({ onSuccess: () => done("Enviado"), onError: failed }));
  const schedule = useMutation(
    orpc.comms.schedule.mutationOptions({ onSuccess: () => done("Programado"), onError: failed })
  );

  const text = body.trim();
  const pending = send.isPending || schedule.isPending;
  // A cleared (or half-typed) date reads as "": nothing to schedule yet, not a time in the past.
  const blocked =
    !text || body.length > MESSAGE_MAX || (later && !when) || (!later && channels !== undefined && !channels[channel]);
  const submit = () => {
    if (blocked || pending) return;
    if (later) schedule.mutate({ eventId, channel, body: text, scheduledAt: fromLocalInput(when, timeZone) });
    else send.mutate({ eventId, channel, body: text });
  };

  return (
    <Panel>
      <PanelHead icon={Send} meta="Telegram o Slack" title="Mensaje de Owy" />
      <div className="space-y-4 p-3.5">
        <ChannelPicker channels={channels} name="composer-channel" value={channel} onChange={setChannel} />
        <BodyField id="composer-body" value={body} onChange={setBody} />
        <MessagePreview body={body} channel={channel} />
        <SwitchRow
          checked={later}
          hint={later ? "Elegí el día y la hora." : "Sale en cuanto lo mandes."}
          icon={CalendarClock}
          id="composer-later"
          label="Programar"
          onCheckedChange={setLater}
        />
        {later ? <WhenField id="composer-when" timeZone={timeZone} value={when} onChange={setWhen} /> : null}
        <UnconfiguredNotice channel={channel} channels={channels} sendNow={!later} />
        <Button className="w-full" disabled={blocked || pending} onClick={submit}>
          {later ? <CalendarClock /> : <Send />}
          {pending ? "Un momento…" : later ? "Programar" : "Enviar ahora"}
        </Button>
        <p className="flex items-start gap-1.5 text-meta text-muted-foreground">
          <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          Los programados salen mientras haya un admin abierto.
        </p>
      </div>
    </Panel>
  );
}

function MessageRow({
  message,
  timeZone,
  actions,
  swipeLeft,
}: {
  message: OutboundMessage;
  timeZone: string;
  actions?: ReactNode;
  /** On a touchscreen, what sliding the row left does (a shortcut for one of its buttons). */
  swipeLeft?: SwipeAction;
}) {
  const { label, icon: Icon } = CHANNELS[message.channel];
  const step = stepOf(message);
  const at = message.status === "scheduled" ? message.scheduledAt : (message.sentAt ?? message.createdAt);

  const row = (
    // Opaque, so what a swipe uncovers doesn't show through the row.
    <div className="flex gap-3 bg-card px-3.5 py-3">
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md border border-input bg-raised shadow-edge">
        <Icon aria-hidden className="size-3.5 text-subtle" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-ui font-medium text-foreground">
            {label}
            {message.channel === "staff_dm"
              ? ` · ${message.recipients} ${message.recipients === 1 ? "persona" : "personas"}`
              : null}
          </span>
          <Badge variant={STATUS[message.status].variant}>{STATUS[message.status].label}</Badge>
          {step ? <Badge variant="outline">{STEP_LABELS[step]}</Badge> : null}
          {at ? (
            <span className="ml-auto flex items-center gap-2">
              <span className="font-terminal text-meta text-subtle tabular-nums">{formatWhen(at, timeZone)}</span>
              <RelativeTime date={at} />
            </span>
          ) : null}
        </div>
        <p className="mt-1 line-clamp-3 text-ui break-words whitespace-pre-line text-subtle">{message.body}</p>
        {message.error ? <p className="mt-1 text-meta text-live-foreground">{message.error}</p> : null}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {message.createdBy ? (
            <span className="flex items-center gap-1.5 text-meta text-muted-foreground">
              <PersonAvatar image={message.createdBy.image} name={message.createdBy.name} size={16} />
              {message.createdBy.name}
            </span>
          ) : null}
          {actions ? <span className="ml-auto flex flex-wrap gap-1.5">{actions}</span> : null}
        </div>
      </div>
    </div>
  );

  return (
    <li>
      {swipeLeft ? (
        <SwipeRow className="rounded-none" left={swipeLeft}>
          {row}
        </SwipeRow>
      ) : (
        row
      )}
    </li>
  );
}

function ListState({ query, empty }: { query: UseQueryResult<OutboundMessage[]>; empty: ReactNode }) {
  if (query.isPending) {
    return (
      <div className="space-y-3 p-3.5">
        {Array.from({ length: 2 }, (_, index) => (
          <Skeleton key={index} className="h-16" />
        ))}
      </div>
    );
  }
  if (query.isError) {
    return (
      <div className="p-3.5">
        <ErrorState compact onRetry={() => void query.refetch()} retrying={query.isFetching} />
      </div>
    );
  }
  return empty;
}

/** Owy's messages to attendees: write one now or for later, and the log of what went out. */
export function OwyMessages({
  eventId,
  messages,
  channels,
  timeZone,
  onEdit,
}: {
  eventId: string;
  messages: UseQueryResult<OutboundMessage[]>;
  channels: Channels | undefined;
  timeZone: string;
  onEdit: (request: EditorRequest) => void;
}) {
  const all = messages.data ?? [];
  const scheduled = all
    .filter((message) => message.status === "scheduled")
    .toSorted((a, b) => (a.scheduledAt ?? "").localeCompare(b.scheduledAt ?? ""));
  const history = all
    .filter((message) => message.status !== "scheduled")
    .toSorted((a, b) => (b.sentAt ?? b.createdAt).localeCompare(a.sentAt ?? a.createdAt));

  const cancel = useCancelMessage(eventId, timeZone);

  const request = (message: OutboundMessage, mode: EditorRequest["mode"]): EditorRequest => ({
    mode,
    channel: owyChannelOf(message),
    body: message.body,
    at: message.scheduledAt ?? undefined,
    step: stepOf(message),
    messageId: mode === "edit" || mode === "send-scheduled" ? message.id : undefined,
  });

  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
      <Composer channels={channels} eventId={eventId} timeZone={timeZone} />
      <div className="min-w-0 space-y-4">
        <Panel>
          <PanelHead
            icon={CalendarClock}
            meta={messages.isSuccess ? `${scheduled.length} por salir` : undefined}
            title="Programados"
          />
          {messages.isSuccess && scheduled.length > 0 ? (
            <ul className="divide-y divide-border">
              {scheduled.map((message) => (
                <MessageRow
                  key={message.id}
                  actions={
                    <>
                      <Button size="xs" variant="outline" onClick={() => onEdit(request(message, "edit"))}>
                        <Pencil />
                        Editar
                      </Button>
                      <Button size="xs" variant="outline" onClick={() => onEdit(request(message, "send-scheduled"))}>
                        <Send />
                        Enviar ahora
                      </Button>
                      <Button
                        disabled={cancel.isPending}
                        size="xs"
                        variant="ghost"
                        onClick={() => cancel.mutate({ eventId, messageId: message.id })}
                      >
                        <X />
                        Cancelar
                      </Button>
                    </>
                  }
                  message={message}
                  swipeLeft={{
                    label: "Cancelar",
                    icon: X,
                    tone: "live",
                    run: () => cancel.mutate({ eventId, messageId: message.id }),
                  }}
                  timeZone={timeZone}
                />
              ))}
            </ul>
          ) : (
            <ListState
              empty={
                <EmptyState
                  compact
                  description="Programá un mensaje acá o desde la cadencia."
                  icon={CalendarClock}
                  title="Nada programado"
                />
              }
              query={messages}
            />
          )}
        </Panel>
        <Panel>
          <PanelHead icon={History} meta={messages.isSuccess ? `${history.length}` : undefined} title="Historial" />
          {messages.isSuccess && history.length > 0 ? (
            <ul className="max-h-[36rem] scrollbar-thin divide-y divide-border overflow-y-auto">
              {history.map((message) => (
                <MessageRow
                  key={message.id}
                  actions={
                    message.status === "failed" && message.channel !== "staff_dm" ? (
                      <Button size="xs" variant="outline" onClick={() => onEdit(request(message, "send"))}>
                        <RotateCcw />
                        Reintentar
                      </Button>
                    ) : undefined
                  }
                  message={message}
                  timeZone={timeZone}
                />
              ))}
            </ul>
          ) : (
            <ListState
              empty={
                <EmptyState
                  compact
                  description="Lo que mande Owy, y lo que falle con su error, queda acá."
                  icon={History}
                  title="Owy no mandó nada todavía"
                />
              }
              query={messages}
            />
          )}
        </Panel>
      </div>
    </div>
  );
}
