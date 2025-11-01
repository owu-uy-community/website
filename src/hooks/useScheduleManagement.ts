import { useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { orpc, client } from "../lib/orpc";
import type { Schedule } from "../lib/orpc";
import type { StickyNote } from "./useOpenSpaceNotesORPC";
import { toast } from "../components/shared/ui/toast-utils";
import { DEFAULT_OPENSPACE_ID } from "../components/Meetups/OpenSpace/utils/constants";
import { revalidateOpenSpace } from "../lib/revalidation";

interface UseScheduleManagementProps {
  schedulesData: Schedule[];
  notes: StickyNote[];
  broadcastScheduleChange: (event: string, payload: any) => Promise<void>;
}

/**
 * Custom hook to manage schedule operations with optimistic updates
 * Handles: create, update, delete, highlight toggle, and bulk track updates
 */
export function useScheduleManagement({ schedulesData, notes, broadcastScheduleChange }: UseScheduleManagementProps) {
  const queryClient = useQueryClient();

  // ============ Mutations ============
  const updateScheduleMutation = useMutation(
    orpc.schedules.update.mutationOptions({
      onMutate: async ({ id, data }) => {
        // Cancel any outgoing refetches
        await queryClient.cancelQueries({ queryKey: orpc.schedules.getByOpenSpace.key() });

        // Snapshot the previous value
        const queryKey = orpc.schedules.getByOpenSpace.queryOptions({
          input: { openSpaceId: DEFAULT_OPENSPACE_ID },
        }).queryKey;
        const previousSchedules = queryClient.getQueryData(queryKey);

        // Optimistically update the schedule
        if (data.highlightInKiosk !== undefined) {
          queryClient.setQueryData(queryKey, (old: any) => {
            if (!old) return old;
            return old.map((schedule: any) => {
              if (schedule.id === id) {
                return { ...schedule, highlightInKiosk: data.highlightInKiosk };
              }
              return schedule;
            });
          });
        }

        return { previousSchedules, queryKey };
      },
      onError: (error, variables, context) => {
        // Rollback on error
        if (context?.previousSchedules && context?.queryKey) {
          queryClient.setQueryData(context.queryKey, context.previousSchedules);
        }
      },
      onSuccess: async () => {
        // Invalidate to ensure we're in sync with the server
        queryClient.invalidateQueries({ queryKey: orpc.schedules.getByOpenSpace.key() });
        // Trigger ISR revalidation for future visitors
        revalidateOpenSpace().catch(console.error);
      },
    })
  );

  const createScheduleMutation = useMutation(
    orpc.schedules.create.mutationOptions({
      onSuccess: async () => {
        queryClient.invalidateQueries({ queryKey: orpc.schedules.getByOpenSpace.key() });
        // Trigger ISR revalidation for future visitors
        revalidateOpenSpace().catch(console.error);
      },
    })
  );

  const deleteScheduleMutation = useMutation(
    orpc.schedules.delete.mutationOptions({
      onSuccess: async () => {
        queryClient.invalidateQueries({ queryKey: orpc.schedules.getByOpenSpace.key() });
        // Trigger ISR revalidation for future visitors
        revalidateOpenSpace().catch(console.error);
      },
    })
  );

  // ============ Handlers ============

  /**
   * Toggle schedule highlight for kiosk map (entire row)
   * Only one row can be highlighted at a time
   * Uses optimistic updates for instant UI feedback
   */
  const handleToggleScheduleHighlight = useCallback(
    async (timeIndex: number, timeSlots: string[]) => {
      const schedule = schedulesData[timeIndex];
      if (!schedule) return;

      const willBeHighlighted = !schedule.highlightInKiosk;

      // Get the query key for schedule data
      const queryKey = orpc.schedules.getByOpenSpace.queryOptions({
        input: { openSpaceId: DEFAULT_OPENSPACE_ID },
      }).queryKey;

      try {
        // Optimistically update all schedules at once
        await queryClient.cancelQueries({ queryKey: orpc.schedules.getByOpenSpace.key() });

        // Snapshot the previous value for rollback
        const previousSchedules = queryClient.getQueryData(queryKey);

        // Optimistically update the UI immediately
        queryClient.setQueryData(queryKey, (old: any) => {
          if (!old) return old;
          return old.map((s: any) => {
            if (s.id === schedule.id) {
              return { ...s, highlightInKiosk: willBeHighlighted };
            }
            // If we're highlighting the clicked schedule, un-highlight all others
            if (willBeHighlighted && s.highlightInKiosk) {
              return { ...s, highlightInKiosk: false };
            }
            return s;
          });
        });

        // Show success toast immediately (optimistic)
        toast.success(
          willBeHighlighted ? "Agregado al bucle de open space" : "Removido del bucle de open space",
          willBeHighlighted
            ? `Solo el horario "${timeSlots[timeIndex]}" se mostrará en el mapa de open space.`
            : `Horario "${timeSlots[timeIndex]}" removido del mapa de open space.`
        );

        // Now perform the actual server updates in the background
        if (willBeHighlighted) {
          const currentlyHighlighted = schedulesData.filter((s) => s.highlightInKiosk && s.id !== schedule.id);

          // Un-highlight all other schedules first
          for (const otherSchedule of currentlyHighlighted) {
            await updateScheduleMutation.mutateAsync({
              id: otherSchedule.id,
              data: {
                highlightInKiosk: false,
              },
            });
          }
        }

        // Now update the clicked schedule
        await updateScheduleMutation.mutateAsync({
          id: schedule.id,
          data: {
            highlightInKiosk: willBeHighlighted,
          },
        });

        // Broadcast the change to all connected clients
        await broadcastScheduleChange("highlight_changed", {
          scheduleId: schedule.id,
          highlightInKiosk: willBeHighlighted,
          openSpaceId: DEFAULT_OPENSPACE_ID,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        console.error("Failed to update schedule highlight:", error);

        // Rollback on error
        const previousSchedules = queryClient.getQueryData(queryKey);
        if (previousSchedules) {
          queryClient.setQueryData(queryKey, previousSchedules);
        }

        toast.error("Error", "No se pudo actualizar el estado de resaltado del kiosco.");
      }
    },
    [schedulesData, updateScheduleMutation, queryClient, broadcastScheduleChange]
  );

  /**
   * Create or update schedule with optimistic updates
   * Handles track updates when schedule time changes
   */
  const handleSaveSchedule = useCallback(
    async (data: { startTime: string; endTime: string; scheduleId?: string }) => {
      const isEdit = !!data.scheduleId;

      // Get the query key for schedule data
      const queryKey = orpc.schedules.getByOpenSpace.queryOptions({
        input: { openSpaceId: DEFAULT_OPENSPACE_ID },
      }).queryKey;

      try {
        // Optimistically update the UI immediately
        await queryClient.cancelQueries({ queryKey: orpc.schedules.getByOpenSpace.key() });

        const previousSchedules = queryClient.getQueryData(queryKey);

        if (isEdit && data.scheduleId) {
          // Find the original schedule to get the old time slot
          const originalSchedule = schedulesData.find((s) => s.id === data.scheduleId);
          const oldTimeSlot = originalSchedule ? `${originalSchedule.startTime} - ${originalSchedule.endTime}` : null;
          const newTimeSlot = `${data.startTime} - ${data.endTime}`;

          // Update existing schedule
          queryClient.setQueryData(queryKey, (old: any) => {
            if (!old) return old;
            return old.map((s: any) => {
              if (s.id === data.scheduleId) {
                return { ...s, startTime: data.startTime, endTime: data.endTime };
              }
              return s;
            });
          });

          // Show success toast immediately (optimistic)
          toast.success("Horario actualizado", `Horario cambiado a ${data.startTime} - ${data.endTime}`);

          // Update all tracks that have the old time slot (optimistic UI)
          let previousTracks: any = null;
          if (oldTimeSlot && oldTimeSlot !== newTimeSlot && data.scheduleId) {
            const tracksToUpdate = notes.filter((note) => note.timeSlot === oldTimeSlot);

            if (tracksToUpdate.length > 0) {
              console.log(
                `🔄 [Optimistic] Updating ${tracksToUpdate.length} tracks from "${oldTimeSlot}" to "${newTimeSlot}"`
              );

              // Cancel any outgoing refetches for tracks
              await queryClient.cancelQueries({ queryKey: orpc.tracks.list.queryKey() });

              // Snapshot the previous tracks for rollback
              previousTracks = queryClient.getQueryData(orpc.tracks.list.queryKey());

              // We already have the scheduleId from the schedule we just updated
              const updatedScheduleId = data.scheduleId;

              // Optimistically update tracks in the cache
              queryClient.setQueryData(orpc.tracks.list.queryKey(), (old: any) => {
                if (!old) return old;
                return old.map((track: any) => {
                  // If this track has the old time slot, update it to the new one
                  if (track.timeSlot === oldTimeSlot) {
                    return {
                      ...track,
                      timeSlot: newTimeSlot,
                      scheduleId: updatedScheduleId,
                    };
                  }
                  return track;
                });
              });

              // Show success toast immediately (optimistic)
              toast.info(
                "Charlas actualizadas",
                `${tracksToUpdate.length} charla${tracksToUpdate.length > 1 ? "s" : ""} actualizada${tracksToUpdate.length > 1 ? "s" : ""} al nuevo horario`
              );
            }
          }

          // 🚀 Fire-and-forget: Perform both backend updates in the background (don't await)
          // This allows the modal to close immediately while the backend updates happen
          updateScheduleMutation
            .mutateAsync({
              id: data.scheduleId,
              data: {
                startTime: data.startTime,
                endTime: data.endTime,
              },
            })
            .then(() => {
              console.log("✅ Schedule updated successfully in backend");

              // Chain track update if needed
              if (oldTimeSlot && oldTimeSlot !== newTimeSlot && data.scheduleId) {
                const tracksToUpdate = notes.filter((note) => note.timeSlot === oldTimeSlot);
                if (tracksToUpdate.length > 0) {
                  return client.tracks.bulkUpdateBySchedule({
                    scheduleId: data.scheduleId,
                    newTimeSlot: newTimeSlot,
                  });
                }
              }
            })
            .then((trackResult) => {
              if (trackResult) {
                console.log("✅ Successfully bulk updated tracks in database transaction");
              }
            })
            .catch((error) => {
              console.error("❌ Failed to update schedule or tracks:", error);

              // Rollback both schedule and tracks on error
              if (previousSchedules) {
                queryClient.setQueryData(queryKey, previousSchedules);
              }
              if (previousTracks) {
                queryClient.setQueryData(orpc.tracks.list.queryKey(), previousTracks);
              }

              toast.error("Error", "No se pudo actualizar el horario. Recargando...");
              // Invalidate to refetch and show actual state
              queryClient.invalidateQueries({ queryKey: orpc.schedules.getByOpenSpace.key() });
              queryClient.invalidateQueries({ queryKey: orpc.tracks.list.queryKey() });
            });
        } else {
          // Create new schedule
          const now = new Date();
          const currentDate = now.toISOString().split("T")[0];

          const newScheduleData = {
            name: `Time Slot ${schedulesData.length + 1}`,
            startTime: data.startTime,
            endTime: data.endTime,
            date: `${currentDate}T00:00:00.000Z`,
            isActive: true,
            highlightInKiosk: false,
            openSpaceId: DEFAULT_OPENSPACE_ID,
          };

          // Create optimistic schedule with temporary ID
          const optimisticSchedule = {
            id: `temp-${Date.now()}`,
            name: newScheduleData.name,
            startTime: newScheduleData.startTime,
            endTime: newScheduleData.endTime,
            date: newScheduleData.date,
            isActive: newScheduleData.isActive,
            highlightInKiosk: newScheduleData.highlightInKiosk,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };

          queryClient.setQueryData(queryKey, (old: any) => {
            if (!old) return [optimisticSchedule];
            return [...old, optimisticSchedule];
          });

          // Show success toast immediately (optimistic)
          toast.success("Horario agregado", `Nuevo horario ${data.startTime} - ${data.endTime} creado.`);

          // Now perform the actual server create in the background
          await createScheduleMutation.mutateAsync(newScheduleData);
        }

        // Broadcast the change to all connected clients
        await broadcastScheduleChange("highlight_changed", {
          openSpaceId: DEFAULT_OPENSPACE_ID,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        console.error(`Failed to ${isEdit ? "update" : "create"} schedule:`, error);

        // Rollback on error
        const previousSchedules = queryClient.getQueryData(queryKey);
        if (previousSchedules) {
          queryClient.setQueryData(queryKey, previousSchedules);
        }

        toast.error("Error", `No se pudo ${isEdit ? "actualizar" : "crear"} el horario.`);
        throw error; // Re-throw so the modal knows
      }
    },
    [schedulesData, createScheduleMutation, updateScheduleMutation, queryClient, broadcastScheduleChange, notes]
  );

  /**
   * Delete schedule with optimistic updates
   */
  const handleDeleteSchedule = useCallback(
    async (scheduleId: string, timeSlot: string) => {
      // Get the query key for schedule data
      const queryKey = orpc.schedules.getByOpenSpace.queryOptions({
        input: { openSpaceId: DEFAULT_OPENSPACE_ID },
      }).queryKey;

      try {
        // Optimistically update the UI immediately
        await queryClient.cancelQueries({ queryKey: orpc.schedules.getByOpenSpace.key() });

        const previousSchedules = queryClient.getQueryData(queryKey);

        queryClient.setQueryData(queryKey, (old: any) => {
          if (!old) return old;
          return old.filter((s: any) => s.id !== scheduleId);
        });

        // Show success toast immediately (optimistic)
        toast.success("Horario eliminado", `El horario "${timeSlot}" ha sido eliminado.`);

        // Now perform the actual server delete in the background
        await deleteScheduleMutation.mutateAsync({ id: scheduleId });

        // Broadcast the change to all connected clients
        await broadcastScheduleChange("highlight_changed", {
          scheduleId: scheduleId,
          openSpaceId: DEFAULT_OPENSPACE_ID,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        console.error("Failed to delete schedule:", error);

        // Rollback on error
        const previousSchedules = queryClient.getQueryData(queryKey);
        if (previousSchedules) {
          queryClient.setQueryData(queryKey, previousSchedules);
        }

        toast.error("Error", "No se pudo eliminar el horario.");
        throw error; // Re-throw so the modal knows
      }
    },
    [deleteScheduleMutation, queryClient, broadcastScheduleChange]
  );

  return {
    // Mutations
    updateScheduleMutation,
    createScheduleMutation,
    deleteScheduleMutation,

    // Handlers
    handleToggleScheduleHighlight,
    handleSaveSchedule,
    handleDeleteSchedule,
  };
}
