"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, Check, LifeBuoy, Pause, Play, Warehouse } from "lucide-react";

import { PageContainer, PageHeader, Panel, PanelHead } from "components/Admin/ui/page";
import { EmptyState, ErrorState } from "components/Admin/ui/states";
import { RelativeTime } from "components/Admin/ui/time";
import { Badge } from "components/shared/ui/badge";
import { Button } from "components/shared/ui/button";
import { Skeleton } from "components/shared/ui/skeleton";
import { toast } from "components/shared/ui/toast-utils";
import { orpc } from "lib/orpc/client";
import type { ManagedVenue } from "lib/orpc/venues/schemas";

const ORDER = { pending: 0, active: 1, archived: 2 } as const;
const STATUS = {
  pending: { label: "Por revisar", variant: "warning" },
  active: { label: "Activo", variant: "success" },
  archived: { label: "Archivado", variant: "secondary" },
} as const;

/** Site staff: review offered spaces, decide which take requests, archive the gone. Contacts live only here. */
export function VenuesAdminClient() {
  const queryClient = useQueryClient();
  const venues = useQuery(orpc.venues.manage.list.queryOptions());
  const update = useMutation(
    orpc.venues.manage.update.mutationOptions({
      onSuccess: () => void queryClient.invalidateQueries({ queryKey: orpc.venues.key() }),
      onError: (error) => toast.error("No se pudo actualizar", error.message),
    })
  );
  const change = (
    venue: ManagedVenue,
    data: { status?: ManagedVenue["status"]; requestable?: boolean; fallback?: boolean },
    done: string
  ) => update.mutate({ venueId: venue.id, data }, { onSuccess: () => toast.success(done, venue.name) });

  const rows = (venues.data ?? []).toSorted(
    (a, b) => ORDER[a.status] - ORDER[b.status] || a.name.localeCompare(b.name, "es")
  );
  const waiting = rows.filter((venue) => venue.status === "pending").length;

  return (
    <PageContainer>
      <PageHeader
        description="Los espacios que reciben meetups. Los que tienen contacto reciben pedidos de las comunidades; el resto los coordina el staff."
        meta={waiting > 0 ? <Badge variant="warning">{waiting} por revisar</Badge> : undefined}
        title="Espacios"
      />
      {venues.isError ? (
        <ErrorState onRetry={() => void venues.refetch()} title="No pudimos traer los espacios" />
      ) : venues.isPending ? (
        <Skeleton className="h-64 rounded-lg" />
      ) : rows.length === 0 ? (
        <Panel>
          <EmptyState
            description="Se suman desde owu.uy/empresas/espacio, o con pnpm db:seed-venues."
            icon={Warehouse}
            title="Todavía no hay espacios"
          />
        </Panel>
      ) : (
        <Panel>
          <PanelHead icon={Warehouse} meta={rows.length} title="Todos" />
          <ul className="divide-y divide-border">
            {rows.map((venue) => (
              <li key={venue.id} className="flex flex-wrap items-start gap-3 px-3.5 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-ui">
                    <span className="font-medium text-foreground">{venue.name}</span>
                    <Badge variant={STATUS[venue.status].variant}>{STATUS[venue.status].label}</Badge>
                    {venue.status === "active" ? (
                      <Badge variant={venue.requestable ? "info" : "secondary"}>
                        {venue.requestable ? "Recibe pedidos" : "Lo coordina OWU"}
                      </Badge>
                    ) : null}
                    {venue.fallback ? <Badge variant="warning">Plan B</Badge> : null}
                  </div>
                  <p className="text-meta text-muted-foreground">
                    {[venue.neighbourhood, venue.city].filter(Boolean).join(", ")}
                    {venue.capacity ? ` · hasta ${venue.capacity}` : ""}
                    {venue.address ? ` · ${venue.address}` : ""}
                    {" · "}
                    <RelativeTime className="text-meta" date={venue.createdAt} />
                  </p>
                  {venue.contacts.length > 0 ? (
                    <ul className="mt-1 text-meta text-subtle">
                      {venue.contacts.map((contact) => (
                        <li key={contact.id}>
                          {contact.name} · {contact.email}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1 text-meta text-muted-foreground">Sin contacto: no puede recibir pedidos</p>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {venue.status === "pending" ? (
                    <Button
                      disabled={update.isPending}
                      size="sm"
                      onClick={() =>
                        change(venue, { status: "active", requestable: venue.contacts.length > 0 }, "Espacio aprobado")
                      }
                    >
                      <Check />
                      Aprobar
                    </Button>
                  ) : null}
                  {venue.status === "active" && venue.contacts.length > 0 ? (
                    <Button
                      disabled={update.isPending}
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        change(
                          venue,
                          { requestable: !venue.requestable },
                          venue.requestable ? "Pedidos pausados" : "Recibe pedidos"
                        )
                      }
                    >
                      {venue.requestable ? <Pause /> : <Play />}
                      {venue.requestable ? "Pausar pedidos" : "Recibir pedidos"}
                    </Button>
                  ) : null}
                  {venue.status === "active" ? (
                    <Button
                      disabled={update.isPending}
                      size="sm"
                      title="El Plan B se ofrece siempre, al final de la lista"
                      variant="ghost"
                      onClick={() =>
                        change(
                          venue,
                          { fallback: !venue.fallback },
                          venue.fallback ? "Ya no es el Plan B" : "Ahora es el Plan B"
                        )
                      }
                    >
                      <LifeBuoy />
                      {venue.fallback ? "Quitar Plan B" : "Plan B"}
                    </Button>
                  ) : null}
                  {venue.status !== "archived" ? (
                    <Button
                      disabled={update.isPending}
                      size="sm"
                      variant="ghost"
                      onClick={() => change(venue, { status: "archived", requestable: false }, "Espacio archivado")}
                    >
                      <Archive />
                      Archivar
                    </Button>
                  ) : (
                    <Button
                      disabled={update.isPending}
                      size="sm"
                      variant="ghost"
                      onClick={() => change(venue, { status: "active" }, "Espacio activo de nuevo")}
                    >
                      Reactivar
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </PageContainer>
  );
}
