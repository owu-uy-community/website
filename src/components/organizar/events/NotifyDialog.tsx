"use client";

import type * as React from "react";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "components/shared/ui/alert-dialog";
import { Textarea } from "components/shared/ui/textarea";
import { toast } from "components/shared/ui/toast-utils";
import { plural } from "lib/organizar/words";
import { orpc } from "lib/orpc/client";
import type { EditableEvent } from "lib/orpc/events/schemas";

/**
 * The one confirmation Organizá asks for: before something that notifies people or can't be
 * undone. The action says the verb and the count ("Avisar a 43 personas"); the way out is "Volver".
 */
export function NotifyDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  pending,
  pendingLabel,
  destructive = false,
  disabled = false,
  onConfirm,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description: React.ReactNode;
  confirmLabel: string;
  pending: boolean;
  pendingLabel: string;
  destructive?: boolean;
  /** Something still missing (a reason): the action waits for it */
  disabled?: boolean;
  onConfirm: () => void;
  children?: React.ReactNode;
}) {
  return (
    <AlertDialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {children}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Volver</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending || disabled}
            variant={destructive ? "destructive" : "default"}
            onClick={(event) => {
              event.preventDefault();
              onConfirm();
            }}
          >
            {pending ? pendingLabel : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * Cancelling a published event: a reason is required (it goes in everyone's email and on the
 * public page), and the button says how many people hear about it.
 */
export function CancelEventDialog({
  open,
  onOpenChange,
  input,
  event,
  notified,
  onCancelled,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  input: { communityId: string; eventId: string };
  event: Pick<EditableEvent, "name">;
  /** Signed up now (with a seat, waiting or pending): everyone the cancellation emails */
  notified: number;
  onCancelled?: (event: EditableEvent) => void;
}) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");
  const cancel = useMutation(
    orpc.events.cancel.mutationOptions({
      onSuccess: (result) => {
        queryClient.setQueryData(orpc.events.get.queryKey({ input }), result);
        void queryClient.invalidateQueries({ queryKey: orpc.events.stats.key() });
        onOpenChange(false);
        setReason("");
        toast.success(
          "Evento cancelado",
          notified ? "Les avisamos por mail con tu motivo; sigue en la agenda como cancelado." : undefined
        );
        onCancelled?.(result);
      },
      onError: (error) => toast.error("No se pudo cancelar", error.message),
    })
  );
  const ready = reason.trim().length >= 3;

  return (
    <NotifyDialog
      destructive
      confirmLabel={notified ? `Cancelar y avisar a ${plural(notified, "persona", "personas")}` : "Cancelar el evento"}
      description={
        notified
          ? "Les llega un mail con el motivo, sale de sus calendarios y el evento queda en la agenda como cancelado. No se puede deshacer."
          : "Queda en la agenda como cancelado, con el motivo. No se puede deshacer."
      }
      disabled={!ready}
      open={open}
      pending={cancel.isPending}
      pendingLabel="Cancelando…"
      title={`Cancelar «${event.name}»`}
      onConfirm={() => cancel.mutate({ ...input, reason: reason.trim() })}
      onOpenChange={onOpenChange}
    >
      <label className="flex flex-col gap-1.5 text-ui text-foreground" htmlFor="cancel-reason">
        Por qué se cancela
        <Textarea
          id="cancel-reason"
          maxLength={500}
          placeholder="Se suspendió por el paro de transporte. Lo pasamos al jueves que viene."
          required
          rows={3}
          value={reason}
          onChange={(change) => setReason(change.target.value)}
        />
        <span className="text-meta text-muted-foreground">
          Lo leen en el mail y en la página del evento. Una línea alcanza.
        </span>
      </label>
    </NotifyDialog>
  );
}
