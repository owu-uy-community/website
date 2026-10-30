"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { toast } from "components/shared/ui/toast-utils";
import { client, orpc } from "lib/orpc";
import { CADENCE_STEPS, formatWhen } from "lib/orpc/comms/cadence";
import type { OutboundMessage } from "lib/orpc/comms/schemas";

export const stepOf = (message: OutboundMessage) => CADENCE_STEPS.find((step) => step === message.step);
export const owyChannelOf = (message: OutboundMessage): "telegram" | "slack" =>
  message.channel === "slack" ? "slack" : "telegram";

/** Cancel a scheduled message (or unmark the T-7 email), with "Deshacer" in the toast instead of a confirm. */
export function useCancelMessage(eventId: string, timeZone: string) {
  const queryClient = useQueryClient();
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: orpc.comms.list.key({ input: { eventId } }) });
    void queryClient.invalidateQueries({ queryKey: orpc.comms.cadence.key({ input: { eventId } }) });
  };
  const undo = (message: OutboundMessage) => {
    const step = stepOf(message);
    const restore =
      message.channel === "email" && step
        ? client.comms.markSent({ eventId, step, body: message.body })
        : client.comms.schedule({
            eventId,
            channel: owyChannelOf(message),
            body: message.body,
            scheduledAt: message.scheduledAt ?? new Date().toISOString(),
            step,
          });
    void restore.then(refresh, (error: Error) => toast.error("No se pudo deshacer", error.message));
  };

  const listKey = orpc.comms.list.queryKey({ input: { eventId } });

  return useMutation(
    orpc.comms.cancel.mutationOptions({
      // Out of the list at once (a swipe expects it gone), back in if the server says no.
      onMutate: async ({ messageId }) => {
        await queryClient.cancelQueries({ queryKey: listKey });
        const before = queryClient.getQueryData<OutboundMessage[]>(listKey);
        queryClient.setQueryData<OutboundMessage[]>(listKey, (old) => old?.filter((item) => item.id !== messageId));
        return { before };
      },
      onSuccess: (message) => {
        refresh();
        toast.success({
          title: message.channel === "email" ? "Email desmarcado" : "Mensaje cancelado",
          description: message.scheduledAt ? `Iba a salir el ${formatWhen(message.scheduledAt, timeZone)}` : undefined,
          duration: 5000,
          action: { label: "Deshacer", onClick: () => undo(message) },
        });
      },
      onError: (error, _input, context) => {
        if (context?.before) queryClient.setQueryData(listKey, context.before);
        toast.error("No se pudo cancelar", error.message);
      },
    })
  );
}
