"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Copy, Plus, PlugZap, Ticket, Unplug } from "lucide-react";

import { ConfirmDialog, Notice } from "components/Admin/panel";
import { PageContainer, PageHeader, Panel, PanelHead } from "components/Admin/ui/page";
import { ErrorState } from "components/Admin/ui/states";
import { RelativeTime } from "components/Admin/ui/time";
import { Badge } from "components/shared/ui/badge";
import { Button } from "components/shared/ui/button";
import { Skeleton } from "components/shared/ui/skeleton";
import { toast } from "components/shared/ui/toast-utils";
import { shortWhen } from "lib/community/time";
import { orpc } from "lib/orpc/client";

import { openNewEvent } from "../events/NewEventDialog";

/** What came back from Eventbrite's OAuth, said once. */
const RETURNED: Record<string, () => void> = {
  conectado: () => toast.success("Eventbrite conectado", "Los eventos con inscripción ahí se publican solos."),
  cancelado: () => toast.info("No se conectó", "Cancelaste en Eventbrite."),
  error: () => toast.error("No se pudo conectar Eventbrite", "Probá de nuevo en un rato."),
  "sin-configurar": () => toast.error("Eventbrite no está configurado", "Falta la app de Eventbrite en este servidor."),
};

/** The community's accounts elsewhere: Eventbrite (connected with OAuth) and how Meetup works. */
export function IntegrationsClient({
  community,
  isAdmin,
}: {
  community: { id: string; slug: string; name: string };
  isAdmin: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const input = { communityId: community.id };
  const integrations = useQuery(orpc.integrations.list.queryOptions({ input }));
  const events = useQuery(orpc.events.list.queryOptions({ input }));
  const disconnect = useMutation(
    orpc.integrations.disconnect.mutationOptions({
      onSuccess: () => {
        setConfirming(false);
        toast.success("Eventbrite desconectado", "Borramos el token y lo que leímos de esa cuenta.");
        void queryClient.invalidateQueries({ queryKey: orpc.integrations.key() });
      },
      onError: (error) => toast.error("No se pudo desconectar", error.message),
    })
  );

  const returned = params.get("eventbrite");
  useEffect(() => {
    if (!returned) return;
    RETURNED[returned]?.();
    router.replace(pathname);
  }, [returned, pathname, router]);

  const connectHref = `/api/integrations/eventbrite/connect?community=${encodeURIComponent(community.id)}`;
  const data = integrations.data;
  const connection = data?.eventbrite ?? null;
  // What to copy to Meetup: the next published event, else the draft being prepared
  const now = Date.now();
  const nextEvent =
    (events.data ?? [])
      .filter((event) => event.status === "published" && Date.parse(event.endDate) > now)
      .toSorted((a, b) => a.startDate.localeCompare(b.startDate))[0] ??
    (events.data ?? []).find((event) => event.status === "draft");

  return (
    <PageContainer>
      <PageHeader
        description="Cuentas de la comunidad en otras plataformas: publicamos ahí lo que armás acá."
        title="Integraciones"
      />

      <div className="flex flex-col gap-4">
        <Panel>
          <PanelHead
            actions={
              connection ? (
                <Badge variant={connection.status === "active" ? "success" : "destructive"}>
                  {connection.status === "active" ? "Conectado" : "Hay que reconectar"}
                </Badge>
              ) : undefined
            }
            icon={Ticket}
            title="Eventbrite"
          />
          <div className="flex flex-col gap-3 p-4">
            {integrations.isError ? (
              <ErrorState compact onRetry={() => void integrations.refetch()} />
            ) : !data ? (
              <Skeleton className="h-16 rounded-lg" />
            ) : connection ? (
              <>
                <dl className="grid gap-x-6 gap-y-1.5 text-ui sm:grid-cols-[auto_1fr]">
                  <dt className="text-muted-foreground">Organización</dt>
                  <dd className="text-foreground">{connection.accountName || "—"}</dd>
                  <dt className="text-muted-foreground">Desde</dt>
                  <dd className="text-foreground">
                    <RelativeTime date={connection.connectedAt} />
                  </dd>
                  <dt className="text-muted-foreground">Avisos</dt>
                  <dd className="text-foreground">
                    {connection.webhook
                      ? "Al instante: Eventbrite nos avisa de cada inscripción"
                      : "Cada 30 segundos, mientras alguien mira la lista"}
                  </dd>
                </dl>
                <Notice show={connection.status === "error"} tone="danger">
                  {connection.error ?? "Eventbrite rechazó la conexión."} Lo que esté por publicarse espera a que
                  reconectes.
                </Notice>
                <p className="text-meta text-muted-foreground">
                  Elegí «En Eventbrite» en la inscripción de un evento: al publicarlo lo creamos ahí con entrada gratis,
                  y los cambios llegan solos en unos minutos.
                </p>
                {isAdmin ? (
                  <div className="flex flex-wrap gap-2">
                    {connection.status === "error" ? (
                      <Button asChild size="sm">
                        <a href={connectHref}>
                          <PlugZap aria-hidden />
                          Reconectar
                        </a>
                      </Button>
                    ) : null}
                    <Button size="sm" variant="outline" onClick={() => setConfirming(true)}>
                      <Unplug aria-hidden />
                      Desconectar
                    </Button>
                  </div>
                ) : null}
              </>
            ) : (
              <>
                <p className="text-ui text-subtle">
                  Conectá la cuenta de Eventbrite de {community.name} y los eventos que elijan inscribirse ahí se
                  publican solos: entrada gratis con el cupo de acá, la descripción y el lugar. Las inscripciones
                  vuelven a la lista de anotados y al escáner de la puerta.
                </p>
                {!data.configured ? (
                  <Notice tone="info">Eventbrite todavía no está habilitado en OWU.</Notice>
                ) : isAdmin ? (
                  <div>
                    <Button asChild size="sm">
                      <a href={connectHref}>
                        <PlugZap aria-hidden />
                        Conectar Eventbrite
                      </a>
                    </Button>
                  </div>
                ) : (
                  <p className="text-meta text-muted-foreground">Lo conecta alguien con rol admin de la comunidad.</p>
                )}
              </>
            )}
          </div>
        </Panel>

        <Panel>
          <PanelHead icon={Copy} title="Meetup" />
          <div className="flex flex-col gap-3 p-4">
            <p className="text-ui text-subtle">
              Meetup solo deja publicar por su API con Meetup Pro, así que no se sincroniza solo. En el paso «Difusión»
              de cada evento está «Copiar a Meetup»: copiás los textos, lo creás en tu grupo y pegás el link de vuelta,
              así la agenda de OWU no lo muestra dos veces.
            </p>
            {events.isError ? (
              <ErrorState
                compact
                retrying={events.isFetching}
                title="No pudimos traer tus eventos"
                onRetry={() => void events.refetch()}
              />
            ) : events.isPending ? (
              <Skeleton className="h-8 w-64 rounded-md" />
            ) : nextEvent ? (
              <div>
                <Button asChild size="sm" variant="outline">
                  <Link href={`/organizar/panel/${community.slug}/eventos/${nextEvent.id}/editar?paso=difusion`}>
                    Copiar a Meetup «{nextEvent.name}»
                    <ArrowRight aria-hidden />
                  </Link>
                </Button>
                {nextEvent.dateChosen ? (
                  <p className="mt-1.5 font-terminal text-meta text-muted-foreground tabular-nums">
                    {shortWhen(nextEvent.startDate)}
                  </p>
                ) : null}
              </div>
            ) : (
              <div>
                <Button size="sm" variant="outline" onClick={openNewEvent}>
                  <Plus aria-hidden />
                  Crear un evento para copiar
                </Button>
              </div>
            )}
          </div>
        </Panel>
      </div>

      <ConfirmDialog
        confirmLabel="Desconectar"
        description="Se borran el token, el aviso automático y las personas anotadas que leímos de Eventbrite (con quién entró y sus sorteos). Los eventos siguen publicados en Eventbrite: cerralos ahí si hace falta."
        open={confirming}
        pending={disconnect.isPending}
        pendingLabel="Desconectando…"
        title="¿Desconectar Eventbrite?"
        onConfirm={() => disconnect.mutate(input)}
        onOpenChange={setConfirming}
      />
    </PageContainer>
  );
}
