"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarPlus, ChevronRight } from "lucide-react";

import { FieldError } from "components/Admin/panel";
import { DateTimeInput, TimezoneSelect } from "components/Admin/settings/event-fields";
import { DEFAULT_TIME_ZONE, fromWallClock, toWallClock } from "components/Admin/settings/event-time";
import { SettingsSection } from "components/Admin/settings/settings";
import { EmptyState, ErrorState } from "components/Admin/ui/states";
import { Badge } from "components/shared/ui/badge";
import { Button } from "components/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "components/shared/ui/dialog";
import { Input } from "components/shared/ui/input";
import { Label } from "components/shared/ui/label";
import { Skeleton } from "components/shared/ui/skeleton";
import { toast } from "components/shared/ui/toast-utils";
import { orpc } from "lib/orpc";
import type { OpenSpace } from "lib/orpc/open-spaces/schemas";

const reason = (error: unknown) => (error instanceof Error && error.message ? error.message : "Error inesperado");

/** "sáb 7 nov 2026" on the event's own calendar. */
const dayLabel = (event: OpenSpace) =>
  new Intl.DateTimeFormat("es-UY", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: event.timezone,
  })
    .format(new Date(event.startDate))
    .replace(/\./g, "")
    .replace(",", "");

function NewEventDialog({
  communityId,
  communitySlug,
  timezone,
  open,
  onOpenChange,
}: {
  communityId: string;
  communitySlug: string;
  /** New events start on the zone of the community's latest one. */
  timezone: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [day, setDay] = useState("");
  const [start, setStart] = useState("14:00");
  const [end, setEnd] = useState("20:00");
  const [zone, setZone] = useState(timezone);
  const [error, setError] = useState<string>();

  const create = useMutation(
    orpc.openSpaces.create.mutationOptions({
      onSuccess: (event) => {
        toast.success("Evento creado", `«${event.name}» está listo para armar.`);
        void queryClient.invalidateQueries({ queryKey: orpc.openSpaces.listByCommunity.key() });
        void queryClient.invalidateQueries({ queryKey: orpc.openSpaces.listForAdmin.key() });
        void queryClient.invalidateQueries({ queryKey: orpc.communities.listForAdmin.key() });
        onOpenChange(false);
        router.push(`/admin/communities/${communitySlug}/events/${event.slug}`);
      },
      onError: (failure) => setError(reason(failure)),
    })
  );

  const submit = () => {
    if (!name.trim()) return setError("Poné un nombre");
    if (!day) return setError("Elegí el día");
    if (!start || !end || end <= start) return setError("Tiene que terminar después de empezar");
    setError(undefined);
    create.mutate({
      communityId,
      name: name.trim(),
      startDate: fromWallClock(day, start, zone).toISOString(),
      endDate: fromWallClock(day, end, zone).toISOString(),
      timezone: zone,
      isActive: true,
      autoHighlightEnabled: false,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !create.isPending && onOpenChange(next)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuevo evento</DialogTitle>
          <DialogDescription>Después armás sus salas, horarios y la agenda desde sus ajustes.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          id="new-event"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="new-event-name">Nombre</Label>
            <Input
              autoComplete="off"
              id="new-event-name"
              placeholder="OWU CONF 2027"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-event-day">Empieza</Label>
            <DateTimeInput
              day={day}
              id="new-event-day"
              time={start}
              timeLabel="Hora de inicio"
              onDayChange={setDay}
              onClockChange={setStart}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-[7rem_minmax(0,1fr)]">
            <div className="space-y-2">
              <Label htmlFor="new-event-end">Termina</Label>
              <Input
                className="font-terminal tabular-nums"
                id="new-event-end"
                step={60}
                type="time"
                value={end}
                onChange={(event) => setEnd(event.target.value)}
              />
            </div>
            <div className="min-w-0 space-y-2">
              <Label htmlFor="new-event-zone">Zona horaria</Label>
              <TimezoneSelect id="new-event-zone" value={zone} onChange={setZone} />
            </div>
          </div>
          <FieldError message={error} />
        </form>
        <DialogFooter>
          <Button disabled={create.isPending} variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button disabled={create.isPending} form="new-event" type="submit">
            {create.isPending ? "Creando…" : "Crear evento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** The community's events, newest first; each one opens its settings. */
export function EventsSection({ communityId, communitySlug }: { communityId: string; communitySlug: string }) {
  const events = useQuery(orpc.openSpaces.listByCommunity.queryOptions({ input: { communityId } }));
  const [creating, setCreating] = useState(false);
  const rows = events.data ?? [];

  return (
    <SettingsSection
      actions={
        <Button size="sm" variant="outline" onClick={() => setCreating(true)}>
          <CalendarPlus />
          Nuevo evento
        </Button>
      }
      id="eventos"
      title={rows.length ? `Eventos · ${rows.length}` : "Eventos"}
    >
      {events.isError ? (
        <ErrorState
          retrying={events.isFetching}
          title="No se pudieron cargar los eventos"
          onRetry={() => void events.refetch()}
        />
      ) : events.isPending ? (
        <div aria-hidden className="grid gap-2 sm:grid-cols-2">
          <Skeleton className="h-[68px] rounded-lg" />
          <Skeleton className="h-[68px] rounded-lg" />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          action={
            <Button size="sm" variant="outline" onClick={() => setCreating(true)}>
              <CalendarPlus />
              Crear el primero
            </Button>
          }
          description="Cada evento tiene su agenda, su staff y sus pantallas."
          icon={CalendarPlus}
          title="Todavía no hay eventos"
        />
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {rows.map((event) => {
            const start = toWallClock(event.startDate, event.timezone);
            const end = toWallClock(event.endDate, event.timezone);

            return (
              <li key={event.id}>
                <Link
                  className="group flex items-center gap-3 rounded-lg border border-border bg-card px-3.5 py-3 shadow-edge transition-colors hover:border-input hover:bg-raised focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:outline-hidden"
                  href={`/admin/communities/${communitySlug}/events/${event.slug}`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2">
                      <span className="truncate text-ui font-medium text-foreground">{event.name}</span>
                      {event.isActive ? null : <Badge variant="secondary">Oculto</Badge>}
                    </p>
                    <p className="mt-0.5 truncate text-meta text-muted-foreground">
                      {dayLabel(event)} ·{" "}
                      <span className="font-terminal tabular-nums">
                        {start.time}–{end.time}
                      </span>
                    </p>
                  </div>
                  <ChevronRight
                    aria-hidden
                    className="size-4 shrink-0 text-faint transition-colors group-hover:text-muted-foreground"
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {creating ? (
        <NewEventDialog
          communityId={communityId}
          communitySlug={communitySlug}
          open
          timezone={rows[0]?.timezone ?? DEFAULT_TIME_ZONE}
          onOpenChange={setCreating}
        />
      ) : null}
    </SettingsSection>
  );
}
