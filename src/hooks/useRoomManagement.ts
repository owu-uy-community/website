import { useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { toast } from "../components/shared/ui/toast-utils";
import { orpc, type Room } from "../lib/orpc";
import type { StickyNote } from "./useOpenSpaceNotesORPC";

const reason = (error: unknown) => (error instanceof Error && error.message ? error.message : "Error inesperado");

/**
 * Room operations the board offers besides the editor: delete (talks go with
 * the room), reorder the columns, switch a room on/off. Each one writes the
 * cache first and rolls back if the server says no; the server's
 * `structure_change` then brings every other screen along.
 */
export function useRoomManagement(openSpaceId: string) {
  const queryClient = useQueryClient();
  const roomsKey = orpc.rooms.getByOpenSpace.queryKey({ input: { openSpaceId } });
  const tracksKey = orpc.tracks.list.queryKey({ input: { openSpaceId } });

  const snapshot = useCallback(() => {
    void queryClient.cancelQueries({ queryKey: orpc.rooms.getByOpenSpace.key({ input: { openSpaceId } }) });

    return {
      rooms: queryClient.getQueryData<Room[]>(roomsKey),
      tracks: queryClient.getQueryData<StickyNote[]>(tracksKey),
    };
  }, [queryClient, openSpaceId, roomsKey, tracksKey]);

  const rollback = useCallback(
    (previous?: { rooms?: Room[]; tracks?: StickyNote[] }) => {
      if (previous?.rooms) queryClient.setQueryData(roomsKey, previous.rooms);
      if (previous?.tracks) queryClient.setQueryData(tracksKey, previous.tracks);
    },
    [queryClient, roomsKey, tracksKey]
  );

  const deleteMutation = useMutation(
    orpc.rooms.delete.mutationOptions({
      onMutate: ({ id }) => {
        const previous = snapshot();
        queryClient.setQueryData<Room[]>(roomsKey, (old = []) => old.filter((room) => room.id !== id));
        queryClient.setQueryData<StickyNote[]>(tracksKey, (old = []) => old.filter((note) => note.roomId !== id));

        return previous;
      },
      onSuccess: (room) => toast.success("Sala eliminada", `"${room.name}" salió de la grilla.`),
      onError: (error, _input, previous) => {
        rollback(previous);
        toast.error("No se pudo eliminar la sala", reason(error));
      },
    })
  );

  const reorderMutation = useMutation(
    orpc.rooms.reorder.mutationOptions({
      onError: (error) => {
        void queryClient.invalidateQueries({ queryKey: orpc.rooms.getByOpenSpace.key({ input: { openSpaceId } }) });
        toast.error("No se pudo reordenar", reason(error));
      },
    })
  );

  const activeMutation = useMutation(
    orpc.rooms.update.mutationOptions({
      onMutate: ({ id, data }) => {
        const previous = snapshot();
        queryClient.setQueryData<Room[]>(roomsKey, (old = []) =>
          old.map((room) => (room.id === id ? { ...room, ...data } : room))
        );

        return previous;
      },
      onError: (error, _input, previous) => {
        rollback(previous);
        toast.error("No se pudo guardar", reason(error));
      },
    })
  );

  const deleteRoom = useCallback((room: Room) => deleteMutation.mutateAsync({ id: room.id }), [deleteMutation]);

  /** New column order, left to right. */
  const reorderRooms = useCallback(
    (ordered: Room[]) => {
      void queryClient.cancelQueries({ queryKey: orpc.rooms.getByOpenSpace.key({ input: { openSpaceId } }) });
      queryClient.setQueryData<Room[]>(
        roomsKey,
        ordered.map((room, index) => ({ ...room, sortOrder: index }))
      );
      reorderMutation.mutate({ openSpaceId, orderedIds: ordered.map((room) => room.id) });
    },
    [queryClient, openSpaceId, roomsKey, reorderMutation]
  );

  const setRoomActive = useCallback(
    (room: Room, isActive: boolean) => activeMutation.mutate({ id: room.id, data: { isActive } }),
    [activeMutation]
  );

  return {
    deleteRoom,
    reorderRooms,
    setRoomActive,
    isDeletingRoom: deleteMutation.isPending,
  };
}
