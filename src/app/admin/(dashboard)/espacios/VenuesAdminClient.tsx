"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  Check,
  Hourglass,
  LifeBuoy,
  MailX,
  Pause,
  PencilLine,
  Play,
  UserCheck,
  UserX,
  Warehouse,
} from "lucide-react";

import { MicroLabel, PageContainer, PageHeader, Panel, PanelHead } from "components/Admin/ui/page";
import { EmptyState, ErrorState } from "components/Admin/ui/states";
import { RelativeTime } from "components/Admin/ui/time";
import { VenueFactsFields } from "components/organizar/venues/VenueFactsFields";
import { Badge } from "components/shared/ui/badge";
import { Button } from "components/shared/ui/button";
import { Input } from "components/shared/ui/input";
import { Skeleton } from "components/shared/ui/skeleton";
import { toast } from "components/shared/ui/toast-utils";
import type { VenueFactsInput } from "lib/organizar/venue-facts";
import { orpc } from "lib/orpc/client";
import type { ManagedVenue } from "lib/orpc/venues/schemas";

const ORDER = { pending: 0, active: 1, archived: 2 } as const;
const STATUS = {
  pending: { label: "Por revisar", variant: "warning" },
  active: { label: "Activo", variant: "success" },
  archived: { label: "Archivado", variant: "secondary" },
} as const;

type Contact = ManagedVenue["contacts"][number];

/**
 * Site staff: review offered spaces, decide which take requests, keep their contacts true (the ones
 * to re-verify, and requests nobody answered come first), archive the gone. Contacts live only here.
 */
export function VenuesAdminClient() {
  const queryClient = useQueryClient();
  const venues = useQuery(orpc.venues.manage.list.queryOptions());
  const unanswered = useQuery(orpc.venues.manage.unanswered.queryOptions());
  const [editing, setEditing] = useState<{ id: string; facts: VenueFactsInput; logoUrl: string } | null>(null);
  const refresh = () => void queryClient.invalidateQueries({ queryKey: orpc.venues.key() });
  const update = useMutation(
    orpc.venues.manage.update.mutationOptions({
      onSuccess: refresh,
      onError: (error) => toast.error("No se pudo actualizar", error.message),
    })
  );
  const contact = useMutation(
    orpc.venues.manage.updateContact.mutationOptions({
      onSuccess: refresh,
      onError: (error) => toast.error("No se pudo actualizar el contacto", error.message),
    })
  );
  const change = (
    venue: ManagedVenue,
    data: { status?: ManagedVenue["status"]; requestable?: boolean; fallback?: boolean; facts?: VenueFactsInput },
    done: string
  ) => update.mutate({ venueId: venue.id, data }, { onSuccess: () => toast.success(done, venue.name) });
  const mark = (person: Contact, data: { bounced?: boolean; left?: boolean }, done: string, undo: typeof data) =>
    contact.mutate(
      { contactId: person.id, data },
      { onSuccess: () => toast.undo(done, () => contact.mutate({ contactId: person.id, data: undo })) }
    );

  const rows = (venues.data ?? []).toSorted(
    (a, b) => ORDER[a.status] - ORDER[b.status] || a.name.localeCompare(b.name, "es")
  );
  const waiting = rows.filter((venue) => venue.status === "pending").length;
  const stale = rows
    .filter((venue) => venue.status === "active")
    .flatMap((venue) => venue.contacts.filter((person) => person.stale).map((person) => ({ venue, person })));

  const contactActions = (person: Contact) => (
    <span className="flex flex-wrap gap-1">
      <Button
        disabled={contact.isPending}
        size="xs"
        variant="ghost"
        onClick={() =>
          person.bouncedAt
            ? mark(person, { bounced: false }, "Ya no figura como rebotado", { bounced: true })
            : mark(person, { bounced: true }, "Marcado: rebota el mail", { bounced: false })
        }
      >
        <MailX />
        {person.bouncedAt ? "No rebota" : "Rebota el mail"}
      </Button>
      <Button
        disabled={contact.isPending}
        size="xs"
        variant="ghost"
        onClick={() =>
          person.leftAt
            ? mark(person, { left: false }, "Sigue en la empresa", { left: true })
            : mark(person, { left: true }, "Marcado: ya no está", { left: false })
        }
      >
        {person.leftAt ? <UserCheck /> : <UserX />}
        {person.leftAt ? "Sigue ahí" : "Ya no está"}
      </Button>
    </span>
  );

  return (
    <PageContainer>
      <PageHeader
        description="Los espacios que reciben meetups. Los que tienen un contacto activo reciben pedidos de las comunidades; el resto los coordina el staff."
        meta={waiting > 0 ? <Badge variant="warning">{waiting} por revisar</Badge> : undefined}
        title="Espacios"
      />

      {stale.length > 0 ? (
        <Panel className="mb-5">
          <PanelHead icon={UserX} meta={stale.length} title="Contactos para reverificar" />
          <ul className="divide-y divide-border">
            {stale.map(({ venue, person }) => (
              <li key={person.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3.5 py-2.5 text-ui">
                <span className="min-w-0 flex-1">
                  <span className="font-medium text-foreground">{venue.name}</span>
                  <span className="block text-meta text-muted-foreground">
                    {person.name} · {person.email}
                    {person.role ? ` · ${person.role}` : ""}
                  </span>
                </span>
                <Badge variant={person.leftAt || person.bouncedAt ? "destructive" : "warning"}>{person.stale}</Badge>
                {contactActions(person)}
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      {unanswered.isError ? (
        <ErrorState
          className="mb-5"
          title="No pudimos traer los pedidos sin respuesta"
          onRetry={() => void unanswered.refetch()}
        />
      ) : unanswered.data && unanswered.data.length > 0 ? (
        <Panel className="mb-5">
          <PanelHead icon={Hourglass} meta={unanswered.data.length} title="Pedidos sin respuesta en 72 h" />
          <ul className="divide-y divide-border">
            {unanswered.data.map((request) => (
              <li key={request.id} className="flex flex-wrap items-center gap-2 px-3.5 py-2.5 text-ui">
                <span className="font-medium text-foreground">{request.venueName}</span>
                <span className="text-muted-foreground">le pidió {request.communityName}</span>
                {request.broadcast ? <Badge variant="info">A varios</Badge> : null}
                <Badge variant={request.status === "pending" ? "warning" : "secondary"}>
                  {request.status === "pending" ? "Esperando" : "Venció"}
                </Badge>
                <RelativeTime className="ml-auto text-meta" date={request.createdAt} />
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

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
              <li key={venue.id} className="flex flex-col gap-3 px-3.5 py-3">
                <div className="flex flex-wrap items-start gap-3">
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
                      <ul className="mt-1 flex flex-col gap-0.5 text-meta text-subtle">
                        {venue.contacts.map((person) => (
                          <li key={person.id} className="flex flex-wrap items-center gap-x-2">
                            <span className={person.leftAt ? "line-through opacity-70" : undefined}>
                              {person.name} · {person.email}
                              {person.role ? ` · ${person.role}` : ""}
                            </span>
                            {person.stale ? <Badge variant="secondary">{person.stale}</Badge> : null}
                            {contactActions(person)}
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
                          change(
                            venue,
                            {
                              status: "active",
                              requestable: venue.contacts.some((person) => !person.leftAt && !person.bouncedAt),
                            },
                            "Espacio aprobado"
                          )
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
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setEditing(
                          editing?.id === venue.id
                            ? null
                            : { id: venue.id, facts: venue.facts, logoUrl: venue.logoUrl ?? "" }
                        )
                      }
                    >
                      <PencilLine />
                      Cómo es el espacio
                    </Button>
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
                </div>
                {editing?.id === venue.id ? (
                  <div className="flex flex-col gap-3 rounded-lg border border-border bg-raised/40 p-3">
                    <label className="flex flex-col gap-1.5">
                      <MicroLabel>Logo (link a una imagen, sale en la página de sus eventos)</MicroLabel>
                      <Input
                        inputMode="url"
                        placeholder="https://…/logo.png"
                        value={editing.logoUrl}
                        onChange={(event) => setEditing({ ...editing, logoUrl: event.target.value })}
                      />
                    </label>
                    <VenueFactsFields value={editing.facts} onChange={(facts) => setEditing({ ...editing, facts })} />
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                        Volver
                      </Button>
                      <Button
                        disabled={update.isPending}
                        size="sm"
                        onClick={() =>
                          update.mutate(
                            {
                              venueId: venue.id,
                              data: { facts: editing.facts, logoUrl: editing.logoUrl.trim() || null },
                            },
                            {
                              onSuccess: () => {
                                setEditing(null);
                                toast.success("Guardamos cómo es el espacio", venue.name);
                              },
                            }
                          )
                        }
                      >
                        Guardar
                      </Button>
                    </div>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </PageContainer>
  );
}
