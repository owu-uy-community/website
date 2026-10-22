"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { ConfirmDialog } from "components/Admin/panel";
import { toast } from "components/shared/ui/toast-utils";
import { orpc } from "lib/orpc";
import type { OutboundMessage } from "lib/orpc/comms/schemas";

import { CHANNELS } from "./labels";

/** What deleting this message reaches, in the operator's words. */
function reach(message: OutboundMessage) {
  if (message.remote === 0) {
    if (message.status === "failed") return "No salió: sale del historial.";
    return `Salió antes de que el sitio guardara dónde quedó: sale de esta lista, pero en ${CHANNELS[message.channel].label} queda. Borralo a mano ahí.`;
  }
  if (message.channel === "staff_dm") {
    return `Se borra de ${message.remote === 1 ? "el mensaje directo" : `los ${message.remote} mensajes directos`} que mandó Owy por Slack.`;
  }

  return message.channel === "telegram"
    ? "Se borra también del grupo de Telegram, para todos. Telegram solo deja borrar lo de las últimas 48 horas."
    : "Se borra también del canal de Slack, para todos.";
}

/**
 * «Borrar» on a message that went out (or failed): also where it landed. If Telegram or Slack
 * says no, the toast offers to take it off this list alone.
 */
export function useRemoveMessage(eventId: string) {
  const queryClient = useQueryClient();
  const [asking, setAsking] = useState<OutboundMessage | null>(null);
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: orpc.comms.list.key({ input: { eventId } }) });
    void queryClient.invalidateQueries({ queryKey: orpc.comms.cadence.key({ input: { eventId } }) });
  };
  const remove = useMutation(
    orpc.comms.remove.mutationOptions({
      onSuccess: (_message, input) => {
        setAsking(null);
        toast.success(input.onlyHere ? "Quitado de la lista" : "Mensaje borrado");
        refresh();
      },
      onError: (error, input) => {
        setAsking(null);
        if (input.onlyHere) {
          toast.error("No se pudo quitar", error.message);
          return;
        }
        toast.error({
          title: "No se pudo borrar ahí",
          description: `${error.message}. Podés quitarlo solo de esta lista.`,
          duration: 12_000,
          action: { label: "Quitar de la lista", onClick: () => remove.mutate({ ...input, onlyHere: true }) },
        });
      },
    })
  );

  const dialog = (
    <ConfirmDialog
      confirmLabel="Borrar mensaje"
      description={asking ? reach(asking) : ""}
      open={asking !== null}
      pending={remove.isPending}
      pendingLabel="Borrando…"
      title="¿Borrar el mensaje?"
      onConfirm={() => asking && remove.mutate({ eventId, messageId: asking.id })}
      onOpenChange={(open) => !open && setAsking(null)}
    />
  );

  return { ask: setAsking, dialog };
}
