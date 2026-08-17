import { useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { orpc, client } from "../lib/orpc";
import type { Schedule } from "../lib/orpc";
import type { StickyNote } from "./useOpenSpaceNotesORPC";
import { toast } from "../components/shared/ui/toast-utils";

interface UseScheduleManagementProps {
  /** Event the board is scoped to — every cache key and payload uses it. */
  openSpaceId: string;
  schedulesData: Schedule[];
  notes: StickyNote[];
  broadcastScheduleChange: (event: string, payload: any) => Promise<void>;
}

/**
 * Custom hook to manage schedule operations with optimistic updates
 * Handles: create, update, delete, highlight toggle, and bulk track updates
 *
 * Historical note: this used to key every optimistic write to the legacy
 * DEFAULT_OPENSPACE_ID while the board read by eventId — so stars and slot
 * edits had no optimistic UI at all and rollbacks patched a phantom cache.
 */
export function useScheduleManagement({
  openSpaceId,
  schedulesData,
  notes,
  broadcastScheduleChange,
}: UseScheduleManagementProps) {
  const queryClient = useQueryClient();

  const schedulesKey = orpc.schedules.getByOpenSpace.queryOptions({ input: { openSpaceId } }).queryKey;
  const tracksKey = orpc.tracks.list.queryKey({ input: { openSpaceId } });

  // ============ Mutations ============
  const updateScheduleMutation = useMutation(
    orpc.schedules.update.mutationOptions({
      onMutate: async ({ id, data }) => {
        await queryClient.cancelQueries({ queryKey: orpc.schedules.getByOpenSpace.key({ input: { openSpaceId } }) });

        const previousSchedules = queryClient.getQueryData(schedulesKey);

        // Optimistically update the schedule
        if (data.highlightInKiosk !== undefined) {
          queryClient.setQueryData(schedulesKey, (old: any) => {
            if (!old) return old;
            return old.map((schedule: any) => {
              if (schedule.id === id) {
                return { ...schedule, highlightInKiosk: data.highlightInKiosk };
              }
              return schedule;
            });
          });
        }

        return { previousSchedules, queryKey: schedulesKey };
      },
      onError: (_error, _variables, context) => {
        if (context?.previousSchedules && context?.queryKey) {
          queryClient.setQueryData(context.queryKey, context.previousSchedules);
        }
      },
      onSuccess: () => {
        // Resync with the server (covers renames of derived fields).
        void queryClient.invalidateQueries({
          queryKey: orpc.schedules.getByOpenSpace.key({ input: { openSpaceId } }),
        });
      },
    })
  );

  const createScheduleMutation = useMutation(
    orpc.schedules.create.mutationOptions({
      onSuccess: () => {
        void queryClient.invalidateQueries({
          queryKey: orpc.schedules.getByOpenSpace.key({ input: { openSpaceId } }),
        });
      },
    })
  );

  const deleteScheduleMutation = useMutation(
    orpc.schedules.delete.mutationOptions({
      onSuccess: () => {
        void queryClient.invalidateQueries({
          queryKey: orpc.schedules.getByOpenSpace.key({ input: { openSpaceId } }),
        });
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

      // Snapshot BEFORE the optimistic write, and keep it in the closure —
      // re-reading inside catch would "roll back" to the broken state.
      const previousSchedules = queryClient.getQueryData(schedulesKey);

      try {
        await queryClient.cancelQueries({ queryKey: orpc.schedules.getByOpenSpace.key({ input: { openSpaceId } }) });

        // Optimistically update the UI immediately
        queryClient.setQueryData(schedulesKey, (old: any) => {
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

        // Server updates in the background
        if (willBeHighlighted) {
          const currentlyHighlighted = schedulesData.filter((s) => s.highlightInKiosk && s.id !== schedule.id);

          // Un-highlight all other schedules first
          for (const otherSchedule of currentlyHighlighted) {
            await updateScheduleMutation.mutateAsync({
              id: otherSchedule.id,
              data: { highlightInKiosk: false },
            });
          }
        }

        await updateScheduleMutation.mutateAsync({
          id: schedule.id,
          data: { highlightInKiosk: willBeHighlighted },
        });

        // Broadcast the change to all connected clients
        await broadcastScheduleChange("highlight_changed", {
          scheduleId: schedule.id,
          highlightInKiosk: willBeHighlighted,
          openSpaceId,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        console.error("Failed to update schedule highlight:", error);

        if (previousSchedules) {
          queryClient.setQueryData(schedulesKey, previousSchedules);
        }

        toast.error("Error", `No se pudo resaltar el horario "${timeSlots[timeIndex]}".`);
      }
    },
    [schedulesData, updateScheduleMutation, queryClient, broadcastScheduleChange, openSpaceId, schedulesKey]
  );

  /**
   * Create or update schedule with optimistic updates
   * Handles track updates when schedule time changes
   */
  const handleSaveSchedule = useCallback(
    async (data: { startTime: string; endTime: string; scheduleId?: string }) => {
      const isEdit = !!data.scheduleId;

      const previousSchedules = queryClient.getQueryData(schedulesKey);

      try {
        await queryClient.cancelQueries({ queryKey: orpc.schedules.getByOpenSpace.key({ input: { openSpaceId } }) });

        if (isEdit && data.scheduleId) {
          // Find the original schedule to get the old time slot
          const originalSchedule = schedulesData.find((s) => s.id === data.scheduleId);
          const oldTimeSlot = originalSchedule ? `${originalSchedule.startTime} - ${originalSchedule.endTime}` : null;
          const newTimeSlot = `${data.startTime} - ${data.endTime}`;

          // Update existing schedule
          queryClient.setQueryData(schedulesKey, (old: any) => {
            if (!old) return old;
            return old.map((s: any) => {
              if (s.id === data.scheduleId) {
                return { ...s, startTime: data.startTime, endTime: data.endTime };
              }
              return s;
            });
          });

          toast.success("Horario actualizado", `El bloque ahora es ${data.startTime} - ${data.endTime}.`);

          // Update all tracks that have the old time slot (optimistic UI)
          let previousTracks: any = null;
          if (oldTimeSlot && oldTimeSlot !== newTimeSlot && data.scheduleId) {
            const tracksToUpdate = notes.filter((note) => note.timeSlot === oldTimeSlot);

            if (tracksToUpdate.length > 0) {
              await queryClient.cancelQueries({ queryKey: orpc.tracks.list.key({ input: { openSpaceId } }) });

              previousTracks = queryClient.getQueryData(tracksKey);

              const updatedScheduleId = data.scheduleId;

              queryClient.setQueryData(tracksKey, (old: any) => {
                if (!old) return old;
                return old.map((track: any) => {
                  if (track.timeSlot === oldTimeSlot) {
                    return { ...track, timeSlot: newTimeSlot, scheduleId: updatedScheduleId };
                  }
                  return track;
                });
              });

              toast.info(
                "Charlas actualizadas",
                `${tracksToUpdate.length} charla${tracksToUpdate.length > 1 ? "s" : ""} movida${tracksToUpdate.length > 1 ? "s" : ""} al nuevo horario.`
              );
            }
          }

          // Fire-and-forget: the modal closes immediately while the backend
          // updates happen; errors roll back both caches below.
          updateScheduleMutation
            .mutateAsync({
              id: data.scheduleId,
              data: { startTime: data.startTime, endTime: data.endTime },
            })
            .then(() => {
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
            .catch((error) => {
              console.error("Failed to update schedule or tracks:", error);

              if (previousSchedules) {
                queryClient.setQueryData(schedulesKey, previousSchedules);
              }
              if (previousTracks) {
                queryClient.setQueryData(tracksKey, previousTracks);
              }

              toast.error("Error", "No se pudo actualizar el horario.");
              void queryClient.invalidateQueries({
                queryKey: orpc.schedules.getByOpenSpace.key({ input: { openSpaceId } }),
              });
              void queryClient.invalidateQueries({ queryKey: orpc.tracks.list.key({ input: { openSpaceId } }) });
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
            openSpaceId,
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

          queryClient.setQueryData(schedulesKey, (old: any) => {
            if (!old) return [optimisticSchedule];
            return [...old, optimisticSchedule];
          });

          toast.success("Horario agregado", `Nuevo bloque ${data.startTime} - ${data.endTime}.`);

          await createScheduleMutation.mutateAsync(newScheduleData);
        }

        // Broadcast the change to all connected clients
        await broadcastScheduleChange("highlight_changed", {
          openSpaceId,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        console.error(`Failed to ${isEdit ? "update" : "create"} schedule:`, error);

        if (previousSchedules) {
          queryClient.setQueryData(schedulesKey, previousSchedules);
        }

        toast.error("Error", `No se pudo ${isEdit ? "actualizar" : "crear"} el horario.`);
        throw error; // Re-throw so the modal knows
      }
    },
    [
      schedulesData,
      createScheduleMutation,
      updateScheduleMutation,
      queryClient,
      broadcastScheduleChange,
      notes,
      openSpaceId,
      schedulesKey,
      tracksKey,
    ]
  );

  /**
   * Delete schedule with optimistic updates
   */
  const handleDeleteSchedule = useCallback(
    async (scheduleId: string, timeSlot: string) => {
      const previousSchedules = queryClient.getQueryData(schedulesKey);

      try {
        await queryClient.cancelQueries({ queryKey: orpc.schedules.getByOpenSpace.key({ input: { openSpaceId } }) });

        queryClient.setQueryData(schedulesKey, (old: any) => {
          if (!old) return old;
          return old.filter((s: any) => s.id !== scheduleId);
        });

        toast.success("Horario eliminado", `El bloque "${timeSlot}" fue eliminado.`);

        await deleteScheduleMutation.mutateAsync({ id: scheduleId });

        // Broadcast the change to all connected clients
        await broadcastScheduleChange("highlight_changed", {
          scheduleId: scheduleId,
          openSpaceId,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        console.error("Failed to delete schedule:", error);

        if (previousSchedules) {
          queryClient.setQueryData(schedulesKey, previousSchedules);
        }

        toast.error("Error", "No se pudo eliminar el horario.");
        throw error; // Re-throw so the modal knows
      }
    },
    [deleteScheduleMutation, queryClient, broadcastScheduleChange, openSpaceId, schedulesKey]
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
