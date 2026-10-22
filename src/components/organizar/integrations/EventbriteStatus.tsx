"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleCheck, ExternalLink, LoaderCircle, RotateCcw } from "lucide-react";

import { Notice } from "components/Admin/panel";
import { RelativeTime } from "components/Admin/ui/time";
import { Button } from "components/shared/ui/button";
import { toast } from "components/shared/ui/toast-utils";
import { orpc } from "lib/orpc/client";

/**
 * Where an event with its sign-up on Eventbrite stands there: waiting for a connection, about to
 * be created, published (with its link) or failed (with "Reintentar").
 */
export function EventbriteStatus({
  communityId,
  communitySlug,
  eventId,
  draft,
}: {
  communityId: string;
  communitySlug: string;
  eventId: string;
  /** Not published yet: say what publishing will do */
  draft: boolean;
}) {
  const queryClient = useQueryClient();
  const input = { communityId, eventId };
  const state = useQuery({
    ...orpc.integrations.publication.queryOptions({ input }),
    // While a push is on its way, check back
    refetchInterval: (query) => (query.state.data?.publication?.status === "pending" ? 5000 : false),
  });
  const retry = useMutation(
    orpc.integrations.retry.mutationOptions({
      onSuccess: () => void queryClient.invalidateQueries({ queryKey: orpc.integrations.publication.key() }),
      onError: (error) => toast.error("No se pudo reintentar", error.message),
    })
  );
  const data = state.data;
  if (!data) return null;
  const { publication } = data;

  if (!data.connected && publication?.status !== "published") {
    return (
      <Notice tone="warning">
        Para inscribir por Eventbrite, alguien con rol admin conecta la cuenta de la comunidad en{" "}
        <Link className="underline underline-offset-2" href={`/organizar/panel/${communitySlug}/integraciones`}>
          Integraciones
        </Link>
        .
      </Notice>
    );
  }
  if (!publication || draft) {
    return (
      <Notice tone="info">
        Al publicar lo creamos en Eventbrite con entrada gratis por el cupo, la descripción y el lugar. Los cambios
        llegan solos en unos minutos; la gente se anota ahí y aparece en tus inscriptos.
      </Notice>
    );
  }
  if (publication.status === "failed") {
    return (
      <Notice tone="danger">
        <span className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span>Eventbrite no lo aceptó: {publication.error ?? "error desconocido"}.</span>
          <Button disabled={retry.isPending} size="xs" variant="outline" onClick={() => retry.mutate(input)}>
            <RotateCcw aria-hidden />
            Reintentar
          </Button>
        </span>
      </Notice>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-border bg-card px-3 py-2.5 text-ui">
      {publication.status === "published" ? (
        <CircleCheck aria-hidden className="size-4 text-success" />
      ) : (
        <LoaderCircle aria-hidden className="size-4 animate-spin text-muted-foreground" />
      )}
      <span className="text-foreground">
        {publication.status === "published"
          ? "En Eventbrite"
          : publication.externalUrl
            ? "Actualizando Eventbrite…"
            : "Creándolo en Eventbrite…"}
      </span>
      <span className="text-meta text-muted-foreground">
        <RelativeTime date={publication.updatedAt} />
      </span>
      {publication.error && publication.status === "pending" ? (
        <span className="text-meta text-warning-foreground">Reintentando: {publication.error}</span>
      ) : null}
      {publication.externalUrl ? (
        <a
          className="ml-auto inline-flex items-center gap-1 text-meta text-info-foreground hover:underline"
          href={publication.externalUrl}
          rel="noreferrer"
          target="_blank"
        >
          Ver en Eventbrite
          <ExternalLink aria-hidden className="size-3" />
        </a>
      ) : null}
    </div>
  );
}
