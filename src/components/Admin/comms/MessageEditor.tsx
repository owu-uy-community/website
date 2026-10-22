"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Send } from "lucide-react";

import { EditorPanel, Notice } from "components/Admin/panel";
import { Button } from "components/shared/ui/button";
import { toast } from "components/shared/ui/toast-utils";
import { client, orpc } from "lib/orpc";
import type { CadenceStepKey } from "lib/orpc/comms/cadence";
import { MESSAGE_MAX, type Channels } from "lib/orpc/comms/schemas";

import { CHANNELS, fromLocalInput, toLocalInput } from "./labels";
import {
  BodyField,
  ChannelPicker,
  MessagePreview,
  UnconfiguredNotice,
  WhenField,
  type OwyChannel,
} from "./MessageFields";

/** What the panel is asked to do, prefilled. */
export type EditorRequest = {
  mode: "schedule" | "send" | "edit" | "send-scheduled" | "edit-sent";
  channel: OwyChannel;
  body: string;
  /** ISO: when it goes out (schedule, edit). */
  at?: string;
  step?: CadenceStepKey;
  /** The scheduled message being edited or sent now, or the sent one being rewritten. */
  messageId?: string;
  /** "T-1 · Recordatorio de Owy" */
  title?: string;
};

const COPY: Record<EditorRequest["mode"], { title: string; description: string; action: string }> = {
  schedule: {
    title: "Programar mensaje",
    description: "Owy lo manda a esa hora, mientras haya un admin abierto.",
    action: "Programar",
  },
  edit: {
    title: "Editar mensaje programado",
    description: "Los cambios valen hasta que sale.",
    action: "Guardar cambios",
  },
  send: { title: "Mandar ahora", description: "Sale en cuanto confirmes.", action: "Enviar ahora" },
  "edit-sent": {
    title: "Editar mensaje enviado",
    description: "Cambia donde salió, para todos los que ya lo tienen.",
    action: "Guardar cambios",
  },
  "send-scheduled": {
    title: "Mandar ahora",
    description: "Sale ya, sin esperar la hora programada.",
    action: "Enviar ahora",
  },
};

/** Schedule, edit or send a message through Owy. Remount it (`key`) for each request. */
export function MessageEditor({
  request,
  open,
  onOpenChange,
  eventId,
  timeZone,
  channels,
}: {
  request: EditorRequest | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventId: string;
  timeZone: string;
  channels: Channels | undefined;
}) {
  const queryClient = useQueryClient();
  const mode = request?.mode ?? "schedule";
  const timed = mode === "schedule" || mode === "edit";
  const [channel, setChannel] = useState<OwyChannel>(request?.channel ?? "telegram");
  const [body, setBody] = useState(request?.body ?? "");
  const [when, setWhen] = useState(() => toLocalInput(request?.at ?? new Date(Date.now() + 3_600_000), timeZone));
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: async () => {
      const text = body.trim();
      if (mode === "schedule") {
        await client.comms.schedule({
          eventId,
          channel,
          body: text,
          scheduledAt: fromLocalInput(when, timeZone),
          step: request?.step,
        });
        return "Programado";
      }
      if (mode === "edit" && request?.messageId) {
        await client.comms.update({
          eventId,
          messageId: request.messageId,
          channel,
          body: text,
          scheduledAt: fromLocalInput(when, timeZone),
        });
        return "Cambios guardados";
      }
      if (mode === "edit-sent" && request?.messageId) {
        await client.comms.update({ eventId, messageId: request.messageId, body: text });
        return "Cambios guardados";
      }
      if (mode === "send-scheduled" && request?.messageId) {
        // Due now: the dispatcher sends it, so it still goes out only once.
        await client.comms.update({
          eventId,
          messageId: request.messageId,
          channel,
          body: text,
          scheduledAt: new Date().toISOString(),
        });
        const { failed } = await client.comms.dispatchDue({ eventId });
        if (failed > 0) throw new Error("No salió: el error quedó en el historial");
        return "Enviado";
      }
      await client.comms.send({ eventId, channel, body: text, step: request?.step });
      return "Enviado";
    },
    onSuccess: (title) => {
      toast.success(title, `Por ${CHANNELS[channel].label}`);
      onOpenChange(false);
    },
    onError: (failure) => setError(failure.message),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: orpc.comms.list.key({ input: { eventId } }) });
      void queryClient.invalidateQueries({ queryKey: orpc.comms.cadence.key({ input: { eventId } }) });
    },
  });

  const copy = COPY[mode];
  const sendingNow = !timed;
  const blocked =
    !body.trim() ||
    body.length > MESSAGE_MAX ||
    (timed && !when) ||
    (sendingNow && channels !== undefined && !channels[channel]);

  return (
    <EditorPanel
      actions={
        <>
          <Button disabled={save.isPending} variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button disabled={blocked || save.isPending} onClick={() => save.mutate()}>
            {timed ? <CalendarClock /> : <Send />}
            {save.isPending ? "Un momento…" : copy.action}
          </Button>
        </>
      }
      busy={save.isPending}
      description={copy.description}
      icon={timed ? CalendarClock : Send}
      open={open}
      title={request?.title ?? copy.title}
      onOpenChange={onOpenChange}
    >
      <div className="space-y-4">
        {/* A message that went out stays where it went: only its text changes. */}
        {mode === "edit-sent" ? null : (
          <ChannelPicker channels={channels} name="editor-channel" value={channel} onChange={setChannel} />
        )}
        <UnconfiguredNotice
          channel={channel}
          channels={channels}
          editingSent={mode === "edit-sent"}
          sendNow={sendingNow}
        />
        <BodyField id="editor-body" value={body} onChange={setBody} />
        {timed ? <WhenField id="editor-when" timeZone={timeZone} value={when} onChange={setWhen} /> : null}
        <MessagePreview body={body} channel={channel} />
        <Notice show={error !== null} tone="danger">
          {error}
        </Notice>
      </div>
    </EditorPanel>
  );
}
