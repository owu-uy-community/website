"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, ChevronDown, ChevronUp, Pencil, Plus, Trash2 } from "lucide-react";

import { orpc, type Room } from "lib/orpc";
import { roomIconFor } from "lib/rooms/icons";
import { roomColorFor } from "lib/rooms/palette";
import { RoomFormModal } from "components/Admin/rooms/RoomFormModal";
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "components/shared/ui/card";
import { Empty } from "components/shared/ui/empty";
import { DatePicker } from "components/shared/ui/date-picker";
import { Input } from "components/shared/ui/input";
import { Label } from "components/shared/ui/label";
import { Skeleton } from "components/shared/ui/skeleton";
import { Switch } from "components/shared/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "components/shared/ui/tabs";
import { toast } from "components/shared/ui/toast-utils";

export default function EventDetailClient({ communitySlug, eventSlug }: { communitySlug: string; eventSlug: string }) {
  const queryClient = useQueryClient();

  const communityQuery = useQuery(orpc.communities.getBySlug.queryOptions({ input: { communitySlug } }));
  const community = communityQuery.data ?? null;

  const eventsQuery = useQuery(
    orpc.openSpaces.listByCommunity.queryOptions({
      input: { communityId: community?.id ?? "" },
      enabled: Boolean(community),
    })
  );
  const event = useMemo(
    () => eventsQuery.data?.find((candidate) => candidate.slug === eventSlug) ?? null,
    [eventsQuery.data, eventSlug]
  );

  const roomsInput = { openSpaceId: event?.id ?? "" };
  const roomsQuery = useQuery(orpc.rooms.getByOpenSpace.queryOptions({ input: roomsInput, enabled: Boolean(event) }));
  const rooms = useMemo(() => roomsQuery.data ?? [], [roomsQuery.data]);

  const tracksQuery = useQuery(
    orpc.tracks.list.queryOptions({ input: { openSpaceId: event?.id ?? "" }, enabled: Boolean(event) })
  );
  const talksByRoom = useMemo(() => {
    const map = new Map<string, number>();
    for (const track of tracksQuery.data ?? []) {
      map.set(track.roomId, (map.get(track.roomId) ?? 0) + 1);
    }

    return map;
  }, [tracksQuery.data]);

  async function invalidateRooms() {
    if (!event) return;
    await queryClient.invalidateQueries({
      queryKey: orpc.rooms.getByOpenSpace.key({ input: { openSpaceId: event.id } }),
    });
  }

  // ---- Room dialogs state ----
  const [roomDialog, setRoomDialog] = useState<{ open: boolean; editing: Room | null }>({ open: false, editing: null });
  const [deleteTarget, setDeleteTarget] = useState<Room | null>(null);

  function openCreateRoom() {
    setRoomDialog({ open: true, editing: null });
  }

  function openEditRoom(room: Room) {
    setRoomDialog({ open: true, editing: room });
  }

  const deleteRoomMutation = useMutation(
    orpc.rooms.delete.mutationOptions({
      onSuccess: async () => {
        toast.success("Sala eliminada", "");
        setDeleteTarget(null);
        await invalidateRooms();
      },
      onError: (error) =>
        toast.error("No se pudo eliminar", error instanceof Error ? error.message : "Error inesperado"),
    })
  );

  const reorderMutation = useMutation(
    orpc.rooms.reorder.mutationOptions({
      onSuccess: invalidateRooms,
      onError: (error) =>
        toast.error("No se pudo reordenar", error instanceof Error ? error.message : "Error inesperado"),
    })
  );

  function moveRoom(index: number, direction: -1 | 1) {
    if (!event) return;
    const target = index + direction;
    if (target < 0 || target >= rooms.length) return;

    const reordered = [...rooms];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(target, 0, moved);

    // Optimistic order in cache, then persist
    queryClient.setQueryData(orpc.rooms.getByOpenSpace.queryKey({ input: { openSpaceId: event.id } }), reordered);
    reorderMutation.mutate({ openSpaceId: event.id, orderedIds: reordered.map((room) => room.id) });
  }

  // ---- Event settings form ----
  const [settings, setSettings] = useState({
    name: "",
    startDate: "",
    endDate: "",
    timezone: "",
    eventbriteEventId: "",
    venueMapUrl: "",
    isActive: true,
    autoHighlightEnabled: false,
  });

  useEffect(() => {
    if (event) {
      setSettings({
        name: event.name,
        startDate: event.startDate.slice(0, 10),
        endDate: event.endDate.slice(0, 10),
        timezone: event.timezone ?? "America/Montevideo",
        eventbriteEventId: event.eventbriteEventId ?? "",
        venueMapUrl: event.venueMapUrl ?? "",
        isActive: event.isActive,
        autoHighlightEnabled: event.autoHighlightEnabled,
      });
    }
  }, [event]);

  const updateEventMutation = useMutation(
    orpc.openSpaces.update.mutationOptions({
      onSuccess: async () => {
        toast.success("Evento actualizado", "Los cambios fueron guardados.");
        if (community) {
          await queryClient.invalidateQueries({
            queryKey: orpc.openSpaces.listByCommunity.key({ input: { communityId: community.id } }),
          });
        }
      },
      onError: (error) =>
        toast.error("No se pudo guardar", error instanceof Error ? error.message : "Error inesperado"),
    })
  );

  if (communityQuery.isLoading || eventsQuery.isLoading) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-4 p-4 md:p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!community || !event) {
    return (
      <div className="mx-auto w-full max-w-5xl p-4 md:p-6">
        <Empty description={`No existe el evento "${eventSlug}" en "${communitySlug}".`} title="Evento no encontrado" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs text-muted-foreground">
            <Link className="hover:text-foreground" href={`/admin/communities/${communitySlug}`}>
              {community.name}
            </Link>
          </p>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">{event.name}</h1>
          <p className="font-terminal text-xs text-muted-foreground">
            /comunidad/{communitySlug}/events/{event.slug}
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href={`/admin/${communitySlug}/openspace?event=${event.slug}`}>
            Abrir grilla
            <ArrowUpRight />
          </Link>
        </Button>
      </div>

      <Tabs defaultValue="rooms">
        <TabsList>
          <TabsTrigger value="rooms">Salas</TabsTrigger>
          <TabsTrigger value="settings">Ajustes</TabsTrigger>
        </TabsList>

        <TabsContent value="rooms">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="text-base">Salas del evento</CardTitle>
                <CardDescription>El orden define las columnas de la grilla</CardDescription>
              </div>
              <Button onClick={openCreateRoom}>
                <Plus />
                Nueva sala
              </Button>
            </CardHeader>
            <CardContent>
              {roomsQuery.isLoading ? (
                <Skeleton className="h-40 w-full" />
              ) : rooms.length === 0 ? (
                <Empty description="Agregá la primera sala para armar la grilla." title="Sin salas" />
              ) : (
                <ul className="divide-y divide-border rounded-lg border border-border">
                  {rooms.map((room, index) => {
                    const color = roomColorFor(room.id, room.color);
                    const talkCount = talksByRoom.get(room.id) ?? 0;

                    return (
                      <li key={room.id} className="flex items-center gap-3 px-3 py-2.5">
                        <div className="flex flex-col">
                          <Button
                            aria-label={`Subir ${room.name}`}
                            className="h-6 w-6 text-muted-foreground disabled:opacity-30"
                            disabled={index === 0 || reorderMutation.isPending}
                            size="icon"
                            variant="ghost"
                            onClick={() => moveRoom(index, -1)}
                          >
                            <ChevronUp className="h-4 w-4" />
                          </Button>
                          <Button
                            aria-label={`Bajar ${room.name}`}
                            className="h-6 w-6 text-muted-foreground disabled:opacity-30"
                            disabled={index === rooms.length - 1 || reorderMutation.isPending}
                            size="icon"
                            variant="ghost"
                            onClick={() => moveRoom(index, 1)}
                          >
                            <ChevronDown className="h-4 w-4" />
                          </Button>
                        </div>
                        <span
                          aria-hidden
                          className="h-8 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: color }}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                            {(() => {
                              const Shape = roomIconFor(room.icon);

                              return Shape ? (
                                <Shape aria-hidden className="h-3.5 w-3.5 shrink-0" style={{ color, fill: color }} />
                              ) : null;
                            })()}
                            <span className="capitalize">{room.name}</span>
                            {!room.isActive ? (
                              <Badge className="font-normal text-muted-foreground" variant="outline">
                                Inactiva
                              </Badge>
                            ) : null}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {[
                              room.capacity ? `${room.capacity} personas` : null,
                              room.hasTV ? "TV" : null,
                              room.hasWhiteboard ? "Pizarra" : null,
                              `${talkCount} charla${talkCount === 1 ? "" : "s"}`,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        </div>
                        <Button
                          aria-label={`Editar ${room.name}`}
                          size="icon"
                          variant="ghost"
                          onClick={() => openEditRoom(room)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          aria-label={`Eliminar ${room.name}`}
                          className="text-muted-foreground hover:text-destructive"
                          size="icon"
                          variant="ghost"
                          onClick={() => setDeleteTarget(room)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Ajustes del evento</CardTitle>
              <CardDescription>Fechas, integración con Eventbrite y visibilidad</CardDescription>
            </CardHeader>
            <CardContent className="max-w-xl space-y-4">
              <div className="space-y-2">
                <Label htmlFor="event-name">Nombre</Label>
                <Input
                  id="event-name"
                  value={settings.name}
                  onChange={(event_) => setSettings((previous) => ({ ...previous, name: event_.target.value }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="event-start">Inicio</Label>
                  <DatePicker
                    id="event-start"
                    value={settings.startDate}
                    onChange={(startDate) => setSettings((previous) => ({ ...previous, startDate }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="event-end">Fin</Label>
                  <DatePicker
                    id="event-end"
                    value={settings.endDate}
                    onChange={(endDate) => setSettings((previous) => ({ ...previous, endDate }))}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="event-tz">Zona horaria</Label>
                <Input
                  id="event-tz"
                  placeholder="America/Montevideo"
                  value={settings.timezone}
                  onChange={(event_) => setSettings((previous) => ({ ...previous, timezone: event_.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="event-eventbrite">Eventbrite Event ID (opcional)</Label>
                <Input
                  className="font-terminal"
                  id="event-eventbrite"
                  placeholder="1234567890"
                  value={settings.eventbriteEventId}
                  onChange={(event_) =>
                    setSettings((previous) => ({ ...previous, eventbriteEventId: event_.target.value.trim() }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="event-map">URL del mapa del venue (opcional)</Label>
                <Input
                  id="event-map"
                  placeholder="https://…/plano.png"
                  value={settings.venueMapUrl}
                  onChange={(event_) =>
                    setSettings((previous) => ({ ...previous, venueMapUrl: event_.target.value.trim() }))
                  }
                />
              </div>
              <div className="flex items-center justify-between rounded-md border border-border px-3 py-2.5">
                <div>
                  <p className="text-sm font-medium text-foreground">Evento activo</p>
                  <p className="text-xs text-muted-foreground">Visible en las páginas públicas de la comunidad.</p>
                </div>
                <Switch
                  checked={settings.isActive}
                  onCheckedChange={(isActive) => setSettings((previous) => ({ ...previous, isActive }))}
                />
              </div>
              <div className="flex items-center justify-between rounded-md border border-border px-3 py-2.5">
                <div>
                  <p className="text-sm font-medium text-foreground">Auto-highlight en kiosk</p>
                  <p className="text-xs text-muted-foreground">Resalta el bloque actual automáticamente.</p>
                </div>
                <Switch
                  checked={settings.autoHighlightEnabled}
                  onCheckedChange={(autoHighlightEnabled) =>
                    setSettings((previous) => ({ ...previous, autoHighlightEnabled }))
                  }
                />
              </div>
              <Button
                disabled={updateEventMutation.isPending || !settings.name.trim()}
                onClick={() =>
                  updateEventMutation.mutate({
                    id: event.id,
                    data: {
                      name: settings.name.trim(),
                      startDate: new Date(`${settings.startDate}T09:00:00`).toISOString(),
                      endDate: new Date(`${settings.endDate}T19:00:00`).toISOString(),
                      timezone: settings.timezone.trim() || undefined,
                      eventbriteEventId: settings.eventbriteEventId || null,
                      venueMapUrl: settings.venueMapUrl || null,
                      isActive: settings.isActive,
                      autoHighlightEnabled: settings.autoHighlightEnabled,
                    },
                  })
                }
              >
                {updateEventMutation.isPending ? "Guardando…" : "Guardar cambios"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <RoomFormModal
        open={roomDialog.open}
        openSpaceId={event.id}
        room={roomDialog.editing}
        onOpenChange={(open) => setRoomDialog((previous) => ({ ...previous, open }))}
      />

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar la sala &quot;{deleteTarget?.name}&quot;?</AlertDialogTitle>
            <AlertDialogDescription>
              {(talksByRoom.get(deleteTarget?.id ?? "") ?? 0) > 0
                ? `También se van a eliminar ${talksByRoom.get(deleteTarget?.id ?? "")} charla(s) asignadas a esta sala. `
                : ""}
              Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => deleteTarget && deleteRoomMutation.mutate({ id: deleteTarget.id })}
            >
              Eliminar sala
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
