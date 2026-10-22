"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bookmark, CalendarPlus, Copy, ExternalLink, FilePen, Plus, Ticket, Trash2 } from "lucide-react";

import { ConfirmDialog } from "components/Admin/panel";
import { KeyHint, useShortcuts } from "components/Admin/shell/shortcuts";
import { MicroLabel, PageContainer, PageHeader, Panel, PanelHead } from "components/Admin/ui/page";
import { EmptyState, ErrorState } from "components/Admin/ui/states";
import { Badge } from "components/shared/ui/badge";
import { Button } from "components/shared/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "components/shared/ui/dialog";
import { Skeleton } from "components/shared/ui/skeleton";
import { toast } from "components/shared/ui/toast-utils";
import { shortWhen } from "lib/community/time";
import { orpc } from "lib/orpc/client";
import type { OrganizerEvent } from "lib/orpc/events/schemas";

import type { CalendarCommunity } from "../calendar/CalendarClient";

const REGISTRATION = { none: "Entrada libre", owu: "Inscripción en OWU", external: "Inscripción externa" } as const;

/** The community's events: drafts to finish, what's coming, what happened. And a new one. */
export function EventsClient({ community }: { community: CalendarCommunity }) {
  const router = useRouter();
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const base = `/organizar/panel/${community.slug}`;
  const [creating, setCreating] = useState(params.get("nuevo") === "1");
  const [removing, setRemoving] = useState<OrganizerEvent | null>(null);

  // ?nuevo=1 (the phone's + button) opens the dialog once, then leaves the URL clean
  useEffect(() => {
    if (params.get("nuevo") === "1") window.history.replaceState(null, "", `${base}/eventos`);
  }, [params, base]);

  const events = useQuery(orpc.events.list.queryOptions({ input: { communityId: community.id } }));
  const create = useMutation(
    orpc.events.createDraft.mutationOptions({
      onSuccess: (event) => router.push(`${base}/eventos/${event.id}/editar`),
      onError: (error) => toast.error("No se pudo crear el evento", error.message),
    })
  );
  const remove = useMutation(
    orpc.events.remove.mutationOptions({
      onSuccess: () => {
        toast.success("Borrador eliminado");
        setRemoving(null);
        void queryClient.invalidateQueries({ queryKey: orpc.events.list.key() });
      },
      onError: (error) => toast.error("No se pudo eliminar", error.message),
    })
  );

  useShortcuts([
    { id: "events.new", keys: "c", label: "Nuevo evento", group: "Eventos", run: () => setCreating(true) },
  ]);

  const now = Date.now();
  const all = events.data ?? [];
  const groups = [
    { key: "drafts", title: "Borradores", icon: FilePen, rows: all.filter((event) => event.status === "draft") },
    {
      key: "next",
      title: "Próximos",
      icon: Ticket,
      rows: all
        .filter((event) => event.status === "published" && Date.parse(event.endDate) > now)
        .toSorted((a, b) => a.startDate.localeCompare(b.startDate)),
    },
    {
      key: "past",
      title: "Pasados y cancelados",
      icon: Bookmark,
      rows: all.filter(
        (event) => event.status === "cancelled" || (event.status === "published" && Date.parse(event.endDate) <= now)
      ),
    },
  ].filter((group) => group.rows.length > 0);
  const previous = all.filter((event) => event.status === "published").slice(0, 6);

  return (
    <PageContainer>
      <PageHeader
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus />
            Nuevo evento
            <KeyHint keys="c" />
          </Button>
        }
        description="Armá el evento paso a paso: se guarda solo y lo publicás cuando esté listo."
        title="Eventos"
      />

      {events.isError ? (
        <ErrorState onRetry={() => void events.refetch()} title="No pudimos traer los eventos" />
      ) : events.isPending ? (
        <Skeleton className="h-48 rounded-lg" />
      ) : groups.length === 0 ? (
        <Panel>
          <EmptyState
            owy
            action={
              <Button onClick={() => setCreating(true)}>
                <Plus />
                Crear el primero
              </Button>
            }
            description="Elegí fecha sin choques, conseguí lugar y abrí la inscripción, todo desde acá."
            title="Todavía no armaste ningún evento"
          />
        </Panel>
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map((group) => (
            <Panel key={group.key}>
              <PanelHead icon={group.icon} meta={group.rows.length} title={group.title} />
              <ul className="divide-y divide-border">
                {group.rows.map((event) => (
                  <EventRow
                    key={event.id}
                    base={base}
                    community={community}
                    event={event}
                    onRemove={() => setRemoving(event)}
                  />
                ))}
              </ul>
            </Panel>
          ))}
        </div>
      )}

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nuevo evento</DialogTitle>
            <DialogDescription>
              Empezá de cero o usá uno anterior como base: copia los textos y la inscripción.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <Button disabled={create.isPending} onClick={() => create.mutate({ communityId: community.id })}>
              <CalendarPlus />
              Empezar de cero
            </Button>
            {previous.length > 0 ? (
              <div className="flex flex-col gap-1.5">
                <MicroLabel>O a partir de</MicroLabel>
                <ul className="flex flex-col rounded-lg border border-border">
                  {previous.map((event) => (
                    <li key={event.id} className="border-b border-border last:border-0">
                      <button
                        className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-raised disabled:opacity-50"
                        disabled={create.isPending}
                        type="button"
                        onClick={() => create.mutate({ communityId: community.id, copyFrom: event.id })}
                      >
                        <Copy aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1 truncate text-ui text-foreground">{event.name}</span>
                        <span className="font-terminal text-meta text-muted-foreground tabular-nums">
                          {shortWhen(event.startDate).split(" · ")[0]}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        confirmLabel="Eliminar borrador"
        description="Se borra con todo lo que tenía. La fecha reservada se libera."
        open={removing !== null}
        pending={remove.isPending}
        title={`¿Eliminar «${removing?.name ?? ""}»?`}
        onConfirm={() => removing && remove.mutate({ communityId: community.id, eventId: removing.id })}
        onOpenChange={(open) => !open && setRemoving(null)}
      />
    </PageContainer>
  );
}

function EventRow({
  event,
  base,
  community,
  onRemove,
}: {
  event: OrganizerEvent;
  base: string;
  community: CalendarCommunity;
  onRemove: () => void;
}) {
  const held = event.status === "draft" && event.heldUntil && Date.parse(event.heldUntil) > Date.now();

  return (
    <li className="flex flex-wrap items-center gap-3 px-3.5 py-3">
      <div className="min-w-0 flex-1">
        <Link
          className="block truncate text-ui font-medium text-foreground hover:underline"
          href={`${base}/eventos/${event.id}/editar`}
        >
          {event.name}
        </Link>
        <p className="font-terminal text-meta text-muted-foreground tabular-nums">
          {event.dateChosen ? shortWhen(event.startDate) : "Sin fecha"}
          {event.status !== "draft" ? ` · ${REGISTRATION[event.registration]}` : ""}
        </p>
      </div>
      {event.status === "draft" ? (
        held ? (
          <Badge className="border-dashed" variant="info">
            <Bookmark aria-hidden />
            Reservado
          </Badge>
        ) : (
          <Badge variant="secondary">Borrador</Badge>
        )
      ) : event.status === "cancelled" ? (
        <Badge variant="destructive">Cancelado</Badge>
      ) : (
        <Badge variant="success">Publicado</Badge>
      )}
      <div className="flex gap-1">
        <Button asChild size="sm" variant="outline">
          <Link href={`${base}/eventos/${event.id}/editar`}>{event.status === "draft" ? "Seguir" : "Editar"}</Link>
        </Button>
        {event.status !== "draft" ? (
          <Button asChild size="icon-sm" variant="ghost">
            <a
              aria-label="Ver la página del evento"
              href={`/comunidad/${community.slug}/events/${event.slug}`}
              rel="noreferrer"
              target="_blank"
            >
              <ExternalLink />
            </a>
          </Button>
        ) : (
          <Button aria-label="Eliminar el borrador" size="icon-sm" variant="ghost" onClick={onRemove}>
            <Trash2 />
          </Button>
        )}
      </div>
    </li>
  );
}
