"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock, DoorOpen, LayoutGrid, Plus } from "lucide-react";

import { ConfirmDialog } from "components/Admin/panel";
import { RoomFormModal } from "components/Admin/rooms/RoomFormModal";
import { SettingsCard, SettingsRowsSkeleton, SettingsSection } from "components/Admin/settings/settings";
import { EmptyState, ErrorState } from "components/Admin/ui/states";
import { ScheduleFormModal } from "components/Meetups/OpenSpace/organisms/ScheduleFormModal";
import { StructurePanel } from "components/Meetups/OpenSpace/organisms/StructurePanel";
import { Badge } from "components/shared/ui/badge";
import { Button } from "components/shared/ui/button";
import { useRealtimeChannel } from "hooks/useRealtimeChannel";
import { useRoomManagement } from "hooks/useRoomManagement";
import { useScheduleManagement } from "hooks/useScheduleManagement";
import { orpc, type Room, type Schedule } from "lib/orpc";
import { eventChannel } from "lib/realtime/channels";
import { getRealtimeClient } from "lib/realtime/client";
import { roomIconFor } from "lib/rooms/icons";
import { roomColorFor } from "lib/rooms/palette";

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
const slotLabel = (schedule: Schedule) => `${schedule.startTime} - ${schedule.endTime}`;

type PendingDelete = { kind: "room"; room: Room; talks: number } | { kind: "slot"; schedule: Schedule; talks: number };

/**
 * The event's rooms and slots at a glance. Reordering and editing happen in the board's own
 * "Salas y horarios" panel, so there is one way to do it, wired here the way the board does.
 */
export function RoomsSection({ eventId, boardHref }: { eventId: string; boardHref: string }) {
  const queryClient = useQueryClient();
  const input = { openSpaceId: eventId };
  const roomsQuery = useQuery(orpc.rooms.getByOpenSpace.queryOptions({ input }));
  const schedulesQuery = useQuery(orpc.schedules.getByOpenSpace.queryOptions({ input }));
  const notesQuery = useQuery(orpc.tracks.list.queryOptions({ input }));
  const rooms = roomsQuery.data ?? [];
  const schedules = schedulesQuery.data ?? [];
  const notes = notesQuery.data ?? [];

  // Another screen changed the grid (the board, a phone): read it again.
  useRealtimeChannel(eventChannel(eventId, "sync"), (event) => {
    if (event !== "structure_change") return;
    for (const key of [
      orpc.rooms.getByOpenSpace.key({ input }),
      orpc.schedules.getByOpenSpace.key({ input }),
      orpc.tracks.list.key({ input }),
    ]) {
      void queryClient.invalidateQueries({ queryKey: key });
    }
  });

  const { deleteRoom, reorderRooms, setRoomActive, isDeletingRoom } = useRoomManagement(eventId);
  const slots = useScheduleManagement({
    openSpaceId: eventId,
    schedulesData: schedules,
    notes,
    // The kiosk follows its highlighted row on this channel.
    broadcastScheduleChange: async (event, payload) =>
      getRealtimeClient().publish(eventChannel(eventId, "highlights"), event, payload),
  });

  const [structureOpen, setStructureOpen] = useState(false);
  const [roomEditor, setRoomEditor] = useState<{ open: boolean; room: Room | null }>({ open: false, room: null });
  const [slotEditor, setSlotEditor] = useState<{ open: boolean; schedule: Schedule | null }>({
    open: false,
    schedule: null,
  });
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);

  const talksIn = (key: "roomId" | "scheduleId", id: string) => notes.filter((note) => note[key] === id).length;

  // An empty room or slot goes at once; one holding talks asks first, naming how many go with it.
  const requestDeleteRoom = (room: Room) => {
    setRoomEditor((editor) => ({ ...editor, open: false }));
    const talks = talksIn("roomId", room.id);
    if (talks > 0) setPendingDelete({ kind: "room", room, talks });
    else void deleteRoom(room).catch(() => undefined);
  };
  const requestDeleteSlot = (schedule: Schedule) => {
    setSlotEditor((editor) => ({ ...editor, open: false }));
    const talks = talksIn("scheduleId", schedule.id);
    if (talks > 0) setPendingDelete({ kind: "slot", schedule, talks });
    else void slots.handleDeleteSchedule(schedule.id, slotLabel(schedule)).catch(() => undefined);
  };
  const confirmDelete = async () => {
    if (!pendingDelete) return;
    try {
      if (pendingDelete.kind === "room") await deleteRoom(pendingDelete.room);
      else await slots.handleDeleteSchedule(pendingDelete.schedule.id, slotLabel(pendingDelete.schedule));
    } catch {
      // Rolled back and toasted by the mutation.
    } finally {
      setPendingDelete(null);
    }
  };

  /** Times through the usual save; the kiosk star (one row at a time) through its own toggle. */
  const saveSlot = async (data: {
    startTime: string;
    endTime: string;
    scheduleId?: string;
    highlightInKiosk: boolean;
  }) => {
    const current = data.scheduleId ? schedules.find((schedule) => schedule.id === data.scheduleId) : null;
    if (!current || current.startTime !== data.startTime || current.endTime !== data.endTime) {
      await slots.handleSaveSchedule(data);
    }
    if (current && current.highlightInKiosk !== data.highlightInKiosk) {
      await slots.handleToggleScheduleHighlight(current.id);
    }
  };

  const loading = roomsQuery.isPending || schedulesQuery.isPending;
  const failed = roomsQuery.isError || schedulesQuery.isError;
  const first = schedules[0];
  const last = schedules.at(-1);

  return (
    <SettingsSection
      actions={
        <>
          <Button asChild className="max-sm:hidden" size="sm" variant="ghost">
            <Link href={boardHref}>Abrir agenda</Link>
          </Button>
          <Button disabled={loading || failed} size="sm" variant="outline" onClick={() => setStructureOpen(true)}>
            <LayoutGrid />
            Ordenar y editar
          </Button>
        </>
      }
      id="salas"
      title="Salas y horarios"
    >
      {failed ? (
        <ErrorState
          retrying={roomsQuery.isFetching || schedulesQuery.isFetching}
          title="No se pudieron cargar las salas"
          onRetry={() => {
            void roomsQuery.refetch();
            void schedulesQuery.refetch();
          }}
        />
      ) : loading ? (
        <SettingsCard>
          <SettingsRowsSkeleton rows={3} />
        </SettingsCard>
      ) : rooms.length === 0 ? (
        <EmptyState
          action={
            <Button size="sm" variant="outline" onClick={() => setRoomEditor({ open: true, room: null })}>
              <Plus />
              Nueva sala
            </Button>
          }
          description="Las salas son las columnas de la agenda. Creá la primera para empezar a armarla."
          icon={DoorOpen}
          title="Todavía no hay salas"
        />
      ) : (
        <SettingsCard className="px-0 md:px-0">
          <ul className="divide-y divide-border">
            {rooms.map((room) => {
              const color = roomColorFor(room.id, room.color);
              const Shape = roomIconFor(room.icon);
              const talks = talksIn("roomId", room.id);

              return (
                <li key={room.id}>
                  <button
                    aria-label={`Editar ${room.name}`}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-white/[0.02] focus-visible:bg-raised focus-visible:outline-hidden md:px-5"
                    type="button"
                    onClick={() => setRoomEditor({ open: true, room })}
                  >
                    <span aria-hidden className="h-7 w-1 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 text-ui font-medium text-foreground">
                        {Shape ? (
                          <Shape aria-hidden className="size-3.5 shrink-0" style={{ color, fill: color }} />
                        ) : null}
                        <span className="truncate">{room.name}</span>
                        {room.isActive ? null : <Badge variant="secondary">Inactiva</Badge>}
                      </span>
                      <span className="block truncate text-meta text-muted-foreground">
                        {[room.hasTV ? "TV" : null, room.hasWhiteboard ? "Pizarra" : null]
                          .filter(Boolean)
                          .join(" · ") || "Sin equipamiento"}
                      </span>
                    </span>
                    <span className="shrink-0 text-right font-terminal text-meta text-muted-foreground tabular-nums">
                      {room.capacity ? `${room.capacity} pers. · ` : ""}
                      {plural(talks, "charla", "charlas")}
                    </span>
                  </button>
                </li>
              );
            })}
            <li className="flex items-center gap-3 px-4 py-2.5 md:px-5">
              <Clock aria-hidden className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 text-ui text-subtle">
                {schedules.length > 0 ? plural(schedules.length, "bloque", "bloques") : "Todavía no hay horarios"}
              </span>
              {first && last ? (
                <span className="font-terminal text-meta text-muted-foreground tabular-nums">
                  {first.startTime} – {last.endTime}
                </span>
              ) : null}
            </li>
          </ul>
        </SettingsCard>
      )}

      <StructurePanel
        notes={notes}
        open={structureOpen}
        rooms={rooms}
        schedules={schedules}
        onAddRoom={() => setRoomEditor({ open: true, room: null })}
        onAddSlot={() => setSlotEditor({ open: true, schedule: null })}
        onDeleteRoom={requestDeleteRoom}
        onDeleteSlot={requestDeleteSlot}
        onEditRoom={(room) => setRoomEditor({ open: true, room })}
        onEditSlot={(schedule) => setSlotEditor({ open: true, schedule })}
        onOpenChange={setStructureOpen}
        onReorderRooms={reorderRooms}
        onSetRoomActive={setRoomActive}
        onToggleSlotHighlight={(schedule) => void slots.handleToggleScheduleHighlight(schedule.id)}
      />

      <RoomFormModal
        open={roomEditor.open}
        openSpaceId={eventId}
        room={roomEditor.room}
        onDelete={requestDeleteRoom}
        onOpenChange={(open) => setRoomEditor((editor) => ({ ...editor, open }))}
      />

      <ScheduleFormModal
        isSaving={slots.createScheduleMutation.isPending || slots.updateScheduleMutation.isPending}
        open={slotEditor.open}
        schedule={slotEditor.schedule}
        schedules={schedules}
        talksInSlot={slotEditor.schedule ? talksIn("scheduleId", slotEditor.schedule.id) : 0}
        onDelete={slotEditor.schedule ? () => slotEditor.schedule && requestDeleteSlot(slotEditor.schedule) : undefined}
        onOpenChange={(open) => setSlotEditor((editor) => ({ ...editor, open }))}
        onSave={saveSlot}
      />

      <ConfirmDialog
        confirmLabel={pendingDelete?.kind === "slot" ? "Eliminar horario" : "Eliminar sala"}
        description={
          pendingDelete
            ? `${pendingDelete.talks === 1 ? "La charla" : `Las ${plural(pendingDelete.talks, "charla", "charlas")}`} de ${
                pendingDelete.kind === "room" ? "esta sala" : "este bloque"
              } también se ${pendingDelete.talks === 1 ? "elimina" : "eliminan"}. Esta acción no se puede deshacer.`
            : ""
        }
        open={pendingDelete !== null}
        pending={isDeletingRoom || slots.deleteScheduleMutation.isPending}
        title={
          pendingDelete?.kind === "room"
            ? `¿Eliminar la sala “${pendingDelete.room.name}”?`
            : pendingDelete?.kind === "slot"
              ? `¿Eliminar el horario ${slotLabel(pendingDelete.schedule)}?`
              : ""
        }
        onConfirm={() => void confirmDelete()}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      />
    </SettingsSection>
  );
}
