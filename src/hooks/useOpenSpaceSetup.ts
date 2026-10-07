import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useCallback } from "react";
import { orpc } from "../lib/orpc/client";
import { eventChannel } from "../lib/realtime/channels";
import { roomColorFor } from "../lib/rooms/palette";
import { toast } from "../components/shared/ui/toast-utils";
import { useRealtimeChannel } from "./useRealtimeChannel";

/**
 * Hook to fetch and manage rooms/schedules data with ID lookup utilities.
 * Re-reads rooms, slots and talks whenever the server says the grid's
 * structure changed (a room or slot created, edited, deleted or reordered on
 * any screen) — talks too, since their room and slot labels come from it.
 */
export const useOpenSpaceSetup = (
  openSpaceId: string,
  options?: {
    initialRooms?: any[];
    initialSchedules?: any[];
    /** For always-on screens that never refire window focus (kiosks). */
    refetchInterval?: number;
    /** Public screens leave out rooms switched off; the admin board shows them dimmed. */
    hideInactiveRooms?: boolean;
  }
) => {
  const queryClient = useQueryClient();
  useRealtimeChannel(eventChannel(openSpaceId, "sync"), (event) => {
    if (event !== "structure_change") return;
    void queryClient.invalidateQueries({ queryKey: orpc.rooms.getByOpenSpace.key({ input: { openSpaceId } }) });
    void queryClient.invalidateQueries({ queryKey: orpc.schedules.getByOpenSpace.key({ input: { openSpaceId } }) });
    void queryClient.invalidateQueries({ queryKey: orpc.tracks.list.key({ input: { openSpaceId } }) });
  });

  // Fetch rooms and schedules
  const { data: allRooms = [], isLoading: roomsLoading } = useQuery(
    orpc.rooms.getByOpenSpace.queryOptions({
      input: { openSpaceId },
      // Use server-side data as initial data for instant first render
      initialData: options?.initialRooms,
      staleTime: 30 * 1000,
      refetchOnWindowFocus: true, // Refetch when user returns to tab
      refetchInterval: options?.refetchInterval,
    })
  );

  const hideInactiveRooms = options?.hideInactiveRooms ?? false;
  const roomsData = useMemo(
    () => (hideInactiveRooms ? allRooms.filter((room) => room.isActive) : allRooms),
    [allRooms, hideInactiveRooms]
  );

  const { data: schedulesData = [], isLoading: schedulesLoading } = useQuery(
    orpc.schedules.getByOpenSpace.queryOptions({
      input: { openSpaceId },
      // Use server-side data as initial data for instant first render
      initialData: options?.initialSchedules,
      staleTime: 30 * 1000,
      refetchOnWindowFocus: true, // Refetch when user returns to tab
      refetchInterval: options?.refetchInterval,
    })
  );

  // When we have initial data, we should never show loading state on first render
  const hasInitialRooms = Boolean(options?.initialRooms);
  const hasInitialSchedules = Boolean(options?.initialSchedules);
  const shouldShowLoading = (roomsLoading && !hasInitialRooms) || (schedulesLoading && !hasInitialSchedules);

  // Build display arrays
  const rooms = useMemo(() => roomsData.map((r) => r.name), [roomsData]);
  const timeSlots = useMemo(() => schedulesData.map((s) => `${s.startTime} - ${s.endTime}`), [schedulesData]);

  // Resolved color per room name (explicit rooms.color or stable palette fallback)
  const roomColors = useMemo(() => {
    const map: Record<string, string> = {};
    for (const room of roomsData) {
      map[room.name] = roomColorFor(room.id, room.color);
    }

    return map;
  }, [roomsData]);

  // Picked shape key per room name; rooms without one render no icon.
  const roomIcons = useMemo(() => {
    const map: Record<string, string | null> = {};
    for (const room of roomsData) {
      map[room.name] = room.icon ?? null;
    }

    return map;
  }, [roomsData]);

  // Helper to find IDs from display strings
  const findIdsForPosition = useCallback(
    (room: string, timeSlot: string): { roomId: string; scheduleId: string } | null => {
      const roomRecord = roomsData.find((r) => r.name === room);
      const scheduleRecord = schedulesData.find((s) => `${s.startTime} - ${s.endTime}` === timeSlot);

      if (!roomRecord) {
        toast.error(
          "Sala no encontrada",
          `"${room}" no existe. Disponibles: ${roomsData.map((r) => r.name).join(", ")}`
        );
        return null;
      }

      if (!scheduleRecord) {
        toast.error("Horario no encontrado", `"${timeSlot}" no existe en la base de datos.`);
        return null;
      }

      return { roomId: roomRecord.id, scheduleId: scheduleRecord.id };
    },
    [roomsData, schedulesData]
  );

  return {
    rooms,
    timeSlots,
    roomColors,
    roomIcons,
    roomsData,
    schedulesData,
    isLoading: shouldShowLoading,
    findIdsForPosition,
  };
};
