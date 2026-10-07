import { useEffect, useCallback } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { orpc, client } from "../lib/orpc";
import type { Schedule } from "../lib/orpc";
import { toast } from "../components/shared/ui/toast-utils";
import { slotIsOn } from "../lib/slot-day";

interface UseAutoHighlightProps {
  openSpaceId: string;
  schedulesData: Schedule[];
  timeSlots: string[];
  updateScheduleMutation: any;
  broadcastScheduleChange: (event: string, payload: any) => Promise<void>;
}

/**
 * Custom hook to manage auto-highlight functionality
 * Automatically highlights the current time slot based on schedule times
 */
export function useAutoHighlight({
  openSpaceId,
  schedulesData,
  timeSlots,
  updateScheduleMutation,
  broadcastScheduleChange,
}: UseAutoHighlightProps) {
  const queryClient = useQueryClient();

  // Fetch OpenSpace to get auto-highlight state
  const { data: openSpaceData, isLoading: openSpaceLoading } = useQuery({
    queryKey: ["openSpace", openSpaceId],
    queryFn: async () => {
      return await client.openSpaces.get({ id: openSpaceId });
    },
    staleTime: 10000,
    refetchOnWindowFocus: true,
  });

  // Mutation to update OpenSpace settings
  const updateOpenSpaceMutation = useMutation(
    orpc.openSpaces.update.mutationOptions({
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: ["openSpace", openSpaceId] });
      },
    })
  );

  // Get auto-highlight state from OpenSpace data
  const autoHighlightEnabled = openSpaceData?.autoHighlightEnabled ?? false;

  /**
   * Toggle auto-highlight state and persist to database
   */
  const handleToggleAutoHighlight = useCallback(async () => {
    const newState = !autoHighlightEnabled;

    try {
      // Update in database
      await updateOpenSpaceMutation.mutateAsync({
        id: openSpaceId,
        data: {
          autoHighlightEnabled: newState,
        },
      });

      // Invalidate query
      await queryClient.invalidateQueries({ queryKey: ["openSpace", openSpaceId] });

      // Broadcast the change to all clients
      await broadcastScheduleChange("auto_highlight_changed", {
        openSpaceId: openSpaceId,
        autoHighlightEnabled: newState,
        timestamp: new Date().toISOString(),
      });

      toast.info(
        newState ? "Auto-resaltado activado" : "Auto-resaltado desactivado",
        newState
          ? "Los horarios se resaltarán automáticamente según la hora actual"
          : "El auto-resaltado ha sido desactivado"
      );
    } catch (error) {
      console.error("Failed to toggle auto-highlight:", error);
      toast.error("Error", "No se pudo actualizar la configuración de auto-resaltado");
    }
  }, [autoHighlightEnabled, updateOpenSpaceMutation, queryClient, openSpaceId, broadcastScheduleChange]);

  /**
   * Find current time slot based on schedule times
   */
  const findCurrentScheduleIndex = useCallback(() => {
    if (!schedulesData || schedulesData.length === 0) return -1;

    const now = new Date();

    return schedulesData.findIndex((schedule) => slotIsOn(schedule, now));
  }, [schedulesData]);

  /**
   * Auto-highlight effect: Check every minute and update highlight
   */
  useEffect(() => {
    if (!autoHighlightEnabled) {
      return;
    }

    const checkAndUpdateHighlight = async () => {
      const currentIndex = findCurrentScheduleIndex();

      if (currentIndex === -1) {
        return;
      }

      const currentSchedule = schedulesData[currentIndex];

      // Only update if the current schedule is not already highlighted
      if (!currentSchedule.highlightInKiosk) {
        try {
          // Un-highlight all other schedules first
          const currentlyHighlighted = schedulesData.filter((s) => s.highlightInKiosk && s.id !== currentSchedule.id);

          for (const otherSchedule of currentlyHighlighted) {
            await updateScheduleMutation.mutateAsync({
              id: otherSchedule.id,
              data: {
                highlightInKiosk: false,
              },
            });
          }

          // Highlight the current schedule
          await updateScheduleMutation.mutateAsync({
            id: currentSchedule.id,
            data: {
              highlightInKiosk: true,
            },
          });

          // Wait for query invalidation to complete
          await queryClient.invalidateQueries({ queryKey: orpc.schedules.getByOpenSpace.key() });

          // Broadcast the change
          await broadcastScheduleChange("highlight_changed", {
            scheduleId: currentSchedule.id,
            highlightInKiosk: true,
            openSpaceId: openSpaceId,
            timestamp: new Date().toISOString(),
            auto: true,
          });

          toast.info("Auto-resaltado", `El horario "${timeSlots[currentIndex]}" ahora se muestra en el kiosco`);
        } catch (error) {
          console.error("Failed to auto-highlight schedule:", error);
          toast.error("Error", "No se pudo actualizar el auto-resaltado");
        }
      }
    };

    // Check immediately, then every minute
    checkAndUpdateHighlight();
    const interval = setInterval(checkAndUpdateHighlight, 60000);

    return () => {
      clearInterval(interval);
    };
  }, [
    autoHighlightEnabled,
    findCurrentScheduleIndex,
    schedulesData,
    timeSlots,
    updateScheduleMutation,
    queryClient,
    broadcastScheduleChange,
    openSpaceId,
  ]);

  return {
    autoHighlightEnabled,
    openSpaceLoading,
    handleToggleAutoHighlight,
    updateOpenSpaceMutation,
  };
}
