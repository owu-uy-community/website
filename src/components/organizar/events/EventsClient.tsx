"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bookmark, ExternalLink, FilePen, Plus, Ticket, Trash2 } from "lucide-react";

import { PageContainer, PageHeader, Panel, PanelHead } from "components/Admin/ui/page";
import { EmptyState, ErrorState } from "components/Admin/ui/states";
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
import { Badge } from "components/shared/ui/badge";
import { Button } from "components/shared/ui/button";
import { Skeleton } from "components/shared/ui/skeleton";
import { toast } from "components/shared/ui/toast-utils";
import { shortWhen } from "lib/community/time";
import { headcount, type Headcount } from "lib/organizar/words";
import { orpc } from "lib/orpc/client";
import type { OrganizerEvent } from "lib/orpc/events/schemas";

import type { CalendarCommunity } from "../calendar/CalendarClient";
import { openNewEvent } from "./NewEventDialog";

const REGISTRATION = {
  none: "Entrada libre",
  owu: "Inscripción en OWU",
  external: "Inscripción externa",
  eventbrite: "Inscripción en Eventbrite",
} as const;

const NOBODY: Headcount = { attending: 0, guests: 0, offered: 0, waitlisted: 0, pending: 0 };

const liveHold = (event: OrganizerEvent) =>
  event.status === "draft" && event.heldUntil !== null && Date.parse(event.heldUntil) > Date.now();

/** "36 personas anotadas · 39 de 60 lugares · 6 en espera": who signed up, with the words every surface uses. */
function peopleLine(event: OrganizerEvent, counts: Headcount) {
  const count = headcount(counts, event.capacity);

  return [
    count.attendingLabel,
    event.capacity ? count.seatsLabel : null,
    count.waitlisted > 0 ? count.waitlistLabel : null,
    count.pending > 0 ? `${count.pending} por aprobar` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** The community's events: drafts to finish, what's coming, what happened. And a new one. */
export function EventsClient({ community }: { community: CalendarCommunity }) {
  const queryClient = useQueryClient();
  const base = `/organizar/panel/${community.slug}`;
  const [removing, setRemoving] = useState<OrganizerEvent | null>(null);
  const input = { communityId: community.id };

  const events = useQuery(orpc.events.list.queryOptions({ input }));
  const counts = useQuery(orpc.panel.headcounts.queryOptions({ input }));
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

  return (
    <PageContainer>
      <PageHeader
        description="Armá el evento paso a paso: se guarda solo y lo publicás cuando esté listo."
        title="Eventos"
      />

      {events.isError ? (
        <ErrorState
          retrying={events.isFetching}
          title="No pudimos traer los eventos"
          onRetry={() => void events.refetch()}
        />
      ) : events.isPending ? (
        <Skeleton className="h-48 rounded-lg" />
      ) : groups.length === 0 ? (
        <Panel>
          <EmptyState
            owy
            action={
              <Button onClick={openNewEvent}>
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
          {counts.isError ? (
            <ErrorState
              compact
              description="Los eventos están; falta cuánta gente se anotó a cada uno."
              retrying={counts.isFetching}
              title="No pudimos contar a los anotados"
              onRetry={() => void counts.refetch()}
            />
          ) : null}
          {groups.map((group) => (
            <Panel key={group.key}>
              <PanelHead icon={group.icon} meta={group.rows.length} title={group.title} />
              <ul className="divide-y divide-border">
                {group.rows.map((event) => (
                  <EventRow
                    key={event.id}
                    base={base}
                    community={community}
                    counts={counts.data ? (counts.data[event.id] ?? NOBODY) : null}
                    event={event}
                    now={now}
                    onRemove={() => setRemoving(event)}
                  />
                ))}
              </ul>
            </Panel>
          ))}
        </div>
      )}

      <AlertDialog open={removing !== null} onOpenChange={(open) => !open && !remove.isPending && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar «{removing?.name ?? ""}»</AlertDialogTitle>
            <AlertDialogDescription>
              {removing && liveHold(removing)
                ? `Se borra el borrador con todo lo que tenía y la fecha reservada (${shortWhen(removing.startDate)}) queda libre para otras comunidades. No se puede deshacer.`
                : "Se borra el borrador con todo lo que tenía. No se puede deshacer."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>Volver</AlertDialogCancel>
            <AlertDialogAction
              disabled={remove.isPending}
              variant="destructive"
              onClick={(event) => {
                event.preventDefault();
                if (removing) remove.mutate({ communityId: community.id, eventId: removing.id });
              }}
            >
              {remove.isPending ? "Eliminando…" : "Eliminar borrador"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  );
}

function EventRow({
  event,
  counts,
  base,
  community,
  now,
  onRemove,
}: {
  event: OrganizerEvent;
  /** Null while the counts load (or failed): the row shows without them */
  counts: Headcount | null;
  base: string;
  community: CalendarCommunity;
  now: number;
  onRemove: () => void;
}) {
  const draft = event.status === "draft";
  const href = draft ? `${base}/eventos/${event.id}/editar` : `${base}/eventos/${event.id}`;
  const counted = event.status === "published" && (event.registration === "owu" || event.registration === "eventbrite");

  return (
    <li className="flex flex-wrap items-center gap-3 px-3.5 py-3">
      <div className="min-w-0 flex-1">
        {/* Whole names on phones: two meetups can share the first 30 characters */}
        <Link className="block text-ui font-medium break-words text-foreground hover:underline sm:truncate" href={href}>
          {event.name}
        </Link>
        <p className="font-terminal text-meta text-muted-foreground tabular-nums">
          {event.dateChosen ? shortWhen(event.startDate) : "Sin fecha"}
          {!draft && !counted ? ` · ${REGISTRATION[event.registration]}` : ""}
        </p>
        {counted && counts ? <p className="text-meta text-muted-foreground">{peopleLine(event, counts)}</p> : null}
      </div>
      {draft ? (
        liveHold(event) ? (
          <Badge className="border-dashed" variant="info">
            <Bookmark aria-hidden />
            Reservado
          </Badge>
        ) : (
          <Badge variant="secondary">Borrador</Badge>
        )
      ) : event.status === "cancelled" ? (
        <Badge variant="destructive">Cancelado</Badge>
      ) : Date.parse(event.endDate) <= now ? (
        <Badge variant="secondary">Pasó</Badge>
      ) : (
        <Badge variant="success">Publicado</Badge>
      )}
      <div className="flex gap-1">
        <Button asChild size="sm" variant="outline">
          <Link aria-label={`${draft ? "Continuar" : "Abrir"} «${event.name}»`} href={href}>
            {draft ? "Continuar" : "Abrir"}
          </Link>
        </Button>
        {draft ? (
          <Button aria-label={`Eliminar el borrador «${event.name}»`} size="icon-sm" variant="ghost" onClick={onRemove}>
            <Trash2 />
          </Button>
        ) : (
          <Button asChild size="icon-sm" variant="ghost">
            <a
              aria-label={`Ver la página de «${event.name}»`}
              href={`/comunidad/${community.slug}/events/${event.slug}`}
              rel="noreferrer"
              target="_blank"
            >
              <ExternalLink />
            </a>
          </Button>
        )}
      </div>
    </li>
  );
}
