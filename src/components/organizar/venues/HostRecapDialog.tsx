"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleCheck, Send } from "lucide-react";

import { MicroLabel } from "components/Admin/ui/page";
import { ErrorState } from "components/Admin/ui/states";
import { Button } from "components/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "components/shared/ui/dialog";
import { Skeleton } from "components/shared/ui/skeleton";
import { Textarea } from "components/shared/ui/textarea";
import { toast } from "components/shared/ui/toast-utils";
import { shortWhen } from "lib/community/time";
import { plural } from "lib/organizar/words";
import { orpc } from "lib/orpc/client";

const DEFAULT_NOTE = "¡Gracias por recibirnos! Así nos fue:";

/**
 * The recap for the space that hosted an event: the organizer reads what goes (numbers, never
 * names), adds a line, and sends it. Used from Espacios and from the event's close-out.
 */
export function HostRecapDialog({
  communityId,
  eventId,
  open,
  onOpenChange,
}: {
  communityId: string;
  eventId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [note, setNote] = useState(DEFAULT_NOTE);
  const recap = useQuery({
    ...orpc.venues.recapPreview.queryOptions({ input: { communityId, eventId } }),
    enabled: open,
    retry: false,
  });
  const send = useMutation(
    orpc.venues.sendRecap.mutationOptions({
      onSuccess: (sent) => {
        toast.success(`Le mandamos el resumen a ${sent.venueName}`);
        void queryClient.invalidateQueries({ queryKey: orpc.venues.key() });
        onOpenChange(false);
      },
      onError: (error) => toast.error("No se pudo mandar el resumen", error.message),
    })
  );
  const data = recap.data;

  return (
    <Dialog open={open} onOpenChange={(next) => !send.isPending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Resumen para {data?.venueName ?? "el espacio"}</DialogTitle>
          <DialogDescription>
            Lo que le llega al espacio que los recibió: números, nunca quién vino. Revisalo y mandalo.
          </DialogDescription>
        </DialogHeader>

        {recap.isError ? (
          <ErrorState
            description={recap.error.message}
            title="No pudimos armar el resumen"
            onRetry={() => void recap.refetch()}
          />
        ) : !data ? (
          <Skeleton className="h-40 rounded-lg" />
        ) : (
          <div className="flex flex-col gap-4">
            <dl className="grid grid-cols-3 gap-2 rounded-lg border border-border bg-raised p-3 text-center">
              <div>
                <dt className="text-meta text-muted-foreground">{data.fromDoor ? "Vinieron" : "Con lugar"}</dt>
                <dd className="font-terminal text-lg text-foreground tabular-nums">{data.came}</dd>
              </div>
              <div>
                <dt className="text-meta text-muted-foreground">Primera vez</dt>
                <dd className="font-terminal text-lg text-foreground tabular-nums">
                  {data.firstTimers === null ? "—" : `${Math.round(data.firstTimers * 100)} %`}
                </dd>
              </div>
              <div>
                <dt className="text-meta text-muted-foreground">Encuesta</dt>
                <dd className="font-terminal text-lg text-foreground tabular-nums">
                  {data.rating ? `${data.rating.average.toLocaleString("es-UY")} de 5` : "—"}
                </dd>
              </div>
            </dl>
            {data.rating ? (
              <p className="-mt-2 text-meta text-muted-foreground">
                La encuesta, con {plural(data.rating.answers, "respuesta", "respuestas")}.
              </p>
            ) : null}
            {data.comments.length > 0 ? (
              <div className="flex flex-col gap-1.5">
                <MicroLabel>Lo que dijeron del espacio</MicroLabel>
                {data.comments.map((comment) => (
                  <blockquote key={comment} className="rounded-md bg-raised px-2.5 py-1.5 text-meta text-foreground">
                    «{comment}»
                  </blockquote>
                ))}
              </div>
            ) : null}
            {data.materials.length > 0 ? (
              <p className="text-meta text-muted-foreground">
                Con {plural(data.materials.length, "link", "links")} a fotos y materiales.
              </p>
            ) : null}
            {data.sentAt ? (
              <p className="flex items-center gap-2 text-ui text-success-foreground" role="status">
                <CircleCheck aria-hidden className="size-4" />
                Se lo mandaste el {shortWhen(data.sentAt)}.
              </p>
            ) : (
              <label className="flex flex-col gap-1.5">
                <MicroLabel>Unas palabras tuyas</MicroLabel>
                <Textarea maxLength={1500} rows={3} value={note} onChange={(event) => setNote(event.target.value)} />
              </label>
            )}
          </div>
        )}

        <DialogFooter>
          <Button disabled={send.isPending} variant="ghost" onClick={() => onOpenChange(false)}>
            Volver
          </Button>
          {data && !data.sentAt ? (
            <Button
              disabled={send.isPending || data.recipients === 0}
              onClick={() => send.mutate({ communityId, eventId, note })}
            >
              <Send />
              {data.recipients === 0
                ? "El espacio no tiene contacto"
                : `Mandar a ${plural(data.recipients, "contacto", "contactos")} de ${data.venueName}`}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
