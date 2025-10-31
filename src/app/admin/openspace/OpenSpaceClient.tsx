"use client";

import * as React from "react";
import { useState, useRef, useCallback, useMemo, useEffect } from "react";

import { TimeGrid } from "components/Meetups/OpenSpace/organisms/TimeGrid";
import { DragPreview } from "components/Meetups/OpenSpace/organisms/DragPreview";
import { TalkFormModal } from "components/Meetups/OpenSpace/organisms/TalkFormModal";
import { SearchInput } from "components/Meetups/OpenSpace/atoms/SearchInput";
import { AddButton } from "components/Meetups/OpenSpace/atoms/AddButton";
import { RealtimeIndicator } from "components/Meetups/OpenSpace/atoms/RealtimeIndicator";
import { OpenSpaceSkeleton } from "components/Meetups/OpenSpace/organisms/OpenSpaceSkeleton";
import { CountdownControls } from "components/Meetups/OpenSpace/organisms/CountdownControls";
import { Button } from "components/shared/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "components/shared/ui/dialog";
import { Tv, Clock, Bot } from "lucide-react";
import { supabase } from "../../lib/supabase";

import type { CellCoordinates } from "components/Meetups/OpenSpace/types";
import { useDragAndDrop, useLayoutCache, useCardStyles } from "components/Meetups/OpenSpace/hooks";
import { NOTE_COLORS, DEFAULT_OPENSPACE_ID } from "components/Meetups/OpenSpace/utils/constants";
import { filterNotes } from "components/Meetups/OpenSpace/utils/calculations";
import { useOpenSpaceNotesORPC, type StickyNote } from "../../../hooks/useOpenSpaceNotesORPC";
import { useOpenSpaceSetup } from "../../../hooks/useOpenSpaceSetup";
import { toast } from "../../../components/shared/ui/toast-utils";
import { orpc, client } from "../../../lib/orpc";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { useRealtimeBroadcastWithInvalidation } from "../../../hooks/useRealtimeBroadcast";

export default function OpenSpaceClient() {
  const queryClient = useQueryClient();

  // Fetch data
  const {
    notes,
    loading: notesLoading,
    error: dbError,
    createNote,
    updateNote,
    deleteNote,
    swapNotes,
    isCreating,
    isUpdating,
    isDeleting,
  } = useOpenSpaceNotesORPC({ openSpaceId: DEFAULT_OPENSPACE_ID, enableRealtime: true });

  const {
    rooms,
    roomsData,
    timeSlots,
    schedulesData,
    isLoading: setupLoading,
    findIdsForPosition,
  } = useOpenSpaceSetup(DEFAULT_OPENSPACE_ID);

  // Fetch OpenSpace to get auto-highlight state
  const { data: openSpaceData, isLoading: openSpaceLoading } = useQuery({
    queryKey: ["openSpace", DEFAULT_OPENSPACE_ID],
    queryFn: async () => {
      return await client.openSpaces.get({ id: DEFAULT_OPENSPACE_ID });
    },
    staleTime: 10000,
    refetchOnWindowFocus: true,
  });

  // Mutation to update OpenSpace settings
  const updateOpenSpaceMutation = useMutation(
    orpc.openSpaces.update.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["openSpace", DEFAULT_OPENSPACE_ID] });
      },
    })
  );

  // Real-time broadcast management for OpenSpace updates
  const { broadcast: broadcastScheduleChange } = useRealtimeBroadcastWithInvalidation({
    channelName: "openspace-schedule-highlights",
    eventHandlers: [
      {
        event: "highlight_changed",
        queryKey: orpc.schedules.getByOpenSpace.key(),
      },
      {
        event: "auto_highlight_changed",
        queryKey: ["openSpace", DEFAULT_OPENSPACE_ID],
      },
    ],
    receiveSelf: false,
    debug: true,
  });

  // UI state
  const [hoveredEmptyCell, setHoveredEmptyCell] = useState<CellCoordinates | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [editingNote, setEditingNote] = useState<StickyNote | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [highlightedNoteId, setHighlightedNoteId] = useState<string | null>(null);

  // Resource warning modal state for drag-and-drop (optimistic)
  const [resourceWarningModal, setResourceWarningModal] = useState<{
    show: boolean;
    message: string;
    confirmMove: (() => Promise<void>) | null;
    revertMove: (() => void) | null;
  }>({ show: false, message: "", confirmMove: null, revertMove: null });

  // Time editing state
  const [editingTimeIndex, setEditingTimeIndex] = useState<number | null>(null);
  const [editingTimeValue, setEditingTimeValue] = useState("");

  // Get auto-highlight state from OpenSpace data
  const autoHighlightEnabled = openSpaceData?.autoHighlightEnabled ?? false;

  // Toggle auto-highlight state and persist to database
  const handleToggleAutoHighlight = useCallback(async () => {
    const newState = !autoHighlightEnabled;

    try {
      // Update in database
      await updateOpenSpaceMutation.mutateAsync({
        id: DEFAULT_OPENSPACE_ID,
        data: {
          autoHighlightEnabled: newState,
        },
      });

      // Invalidate query
      await queryClient.invalidateQueries({ queryKey: ["openSpace", DEFAULT_OPENSPACE_ID] });

      // Broadcast the change to all clients
      await broadcastScheduleChange("auto_highlight_changed", {
        openSpaceId: DEFAULT_OPENSPACE_ID,
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
  }, [autoHighlightEnabled, updateOpenSpaceMutation, queryClient]);

  const boardRef = useRef<HTMLDivElement>(null);
  const { layoutCache, boardRectRef, updateBoardRect, getCachedElement, clearElementCache } = useLayoutCache();

  // Handle drag and drop updates (optimistic with confirmation)
  const handleNotesChange = useCallback(
    async (updatedNotes: StickyNote[]) => {
      const changedNotes = updatedNotes.filter((updatedNote) => {
        const originalNote = notes.find((n) => n.id === updatedNote.id);
        return (
          originalNote && (originalNote.room !== updatedNote.room || originalNote.timeSlot !== updatedNote.timeSlot)
        );
      });

      // Store original positions for potential revert
      const originalPositions = changedNotes.map((changedNote) => {
        const original = notes.find((n) => n.id === changedNote.id);
        return {
          id: changedNote.id,
          room: original?.room,
          timeSlot: original?.timeSlot,
        };
      });

      // Check for resource mismatches
      const resourceIssues: string[] = [];
      for (const changedNote of changedNotes) {
        const originalNote = notes.find((n) => n.id === changedNote.id);
        if (!originalNote) continue;

        const targetRoomData = roomsData.find((r) => r.name === changedNote.room);
        if (!targetRoomData) continue;

        const missingResources: string[] = [];
        if (originalNote.needsTV && !targetRoomData.hasTV) {
          missingResources.push("TV");
        }
        if (originalNote.needsWhiteboard && !targetRoomData.hasWhiteboard) {
          missingResources.push("Pizarra");
        }

        if (missingResources.length > 0) {
          resourceIssues.push(
            `"${originalNote.title}" requiere ${missingResources.join(" y ")} pero la sala "${changedNote.room}" no lo tiene`
          );
        }
      }

      // Define the actual backend move
      const confirmAction = async () => {
        // Detect swaps (2 notes exchanging positions)
        if (changedNotes.length === 2) {
          const [noteA, noteB] = changedNotes;
          const originalA = originalPositions.find((p) => p.id === noteA.id);
          const originalB = originalPositions.find((p) => p.id === noteB.id);

          if (
            originalA &&
            originalB &&
            originalA.room === noteB.room &&
            originalA.timeSlot === noteB.timeSlot &&
            originalB.room === noteA.room &&
            originalB.timeSlot === noteA.timeSlot
          ) {
            await swapNotes(noteA.id, noteB.id);
            return;
          }
        }

        // Handle single moves
        for (const changedNote of changedNotes) {
          const ids = findIdsForPosition(changedNote.room, changedNote.timeSlot);
          if (ids) {
            await updateNote(changedNote.id, {
              roomId: ids.roomId,
              scheduleId: ids.scheduleId,
              room: changedNote.room,
              timeSlot: changedNote.timeSlot,
              skipResourceValidation: true,
            });
          }
        }
      };

      // Define revert action (reverts UI back to original positions)
      const revertAction = () => {
        const revertedNotes = notes.map((note) => {
          const original = originalPositions.find((p) => p.id === note.id);
          if (original && original.room && original.timeSlot) {
            return { ...note, room: original.room, timeSlot: original.timeSlot };
          }
          return note;
        });
        // Trigger a re-render with reverted positions by invalidating queries
        queryClient.setQueryData(orpc.tracks.list.queryKey(), revertedNotes);
      };

      // If there are resource issues, show confirmation modal AFTER optimistic move
      if (resourceIssues.length > 0) {
        setResourceWarningModal({
          show: true,
          message: `⚠️ ${resourceIssues.join("\n")}.\n\n¿Deseas continuar de todos modos?`,
          confirmMove: confirmAction,
          revertMove: revertAction,
        });
        return;
      }

      // No resource issues, proceed with backend update immediately
      await confirmAction();
    },
    [notes, updateNote, swapNotes, findIdsForPosition, roomsData, queryClient, orpc]
  );

  const { dragState, handleCardMouseDown, handleRoomMouseDown, handleDirectClick } = useDragAndDrop({
    notes,
    rooms,
    timeSlots,
    onNotesChange: handleNotesChange,
    onRoomsChange: () => {}, // Room reordering disabled
    onEditNote: (note) => {
      setEditingNote(note);
      setIsFormOpen(true);
    },
    boardRectRef,
    layoutCache,
    updateBoardRect: () => updateBoardRect(boardRef.current),
    clearElementCache,
  });

  const { getCardStyle, getCardClasses, getCardTransform } = useCardStyles({ dragState, getCachedElement });

  // Show DB error toast
  useEffect(() => {
    if (dbError) {
      toast.error("Error de Base de Datos", dbError);
    }
  }, [dbError]);

  // Note CRUD handlers
  const handleSaveNote = useCallback(
    async (noteData: Partial<StickyNote>) => {
      const room = noteData.room || rooms[0];
      const timeSlot = noteData.timeSlot || timeSlots[0];
      const ids = findIdsForPosition(room, timeSlot);

      if (!ids) {
        throw new Error(`Invalid position: ${room}, ${timeSlot}`);
      }

      if (editingNote?.id) {
        // Update existing
        await updateNote(editingNote.id, {
          ...noteData,
          roomId: ids.roomId,
          scheduleId: ids.scheduleId,
          room,
          timeSlot,
        });
      } else {
        // Create new
        await createNote({
          title: noteData.title || "New Session",
          speaker: noteData.speaker,
          description: noteData.description,
          needsTV: noteData.needsTV || false,
          needsWhiteboard: noteData.needsWhiteboard || false,
          room,
          timeSlot,
          openSpaceId: DEFAULT_OPENSPACE_ID,
          scheduleId: ids.scheduleId,
          roomId: ids.roomId,
        });
      }
      setEditingNote(null);
      setIsFormOpen(false);
    },
    [editingNote, createNote, updateNote, rooms, timeSlots, findIdsForPosition]
  );

  const handleDeleteNote = useCallback(
    async (noteId: string) => {
      await deleteNote(noteId);
      setEditingNote(null);
      setIsFormOpen(false);
    },
    [deleteNote]
  );

  const addNewNote = useCallback((prefilledData?: { room?: string; timeSlot?: string }) => {
    setEditingNote(prefilledData ? ({ id: "", title: "", speaker: "", ...prefilledData } as StickyNote) : null);
    setIsFormOpen(true);
  }, []);

  // Handle modal close - clear editing note state
  const handleFormOpenChange = useCallback((open: boolean) => {
    setIsFormOpen(open);
    if (!open) {
      // Clear editing note when modal is closed
      setEditingNote(null);
    }
  }, []);

  // Schedule mutations with optimistic updates for highlight toggle
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
      onSuccess: () => {
        // Invalidate to ensure we're in sync with the server
        queryClient.invalidateQueries({ queryKey: orpc.schedules.getByOpenSpace.key() });
      },
    })
  );

  const createScheduleMutation = useMutation(
    orpc.schedules.create.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.schedules.getByOpenSpace.key() });
      },
    })
  );

  const deleteScheduleMutation = useMutation(
    orpc.schedules.delete.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.schedules.getByOpenSpace.key() });
      },
    })
  );

  // Toggle schedule highlight for kiosk map (entire row)
  // Only one row can be highlighted at a time
  // Uses optimistic updates for instant UI feedback
  const handleToggleScheduleHighlight = useCallback(
    async (timeIndex: number) => {
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
    [schedulesData, timeSlots, updateScheduleMutation, queryClient, broadcastScheduleChange]
  );

  // Time editing handlers
  const handleTimeDoubleClick = useCallback(
    (timeIndex: number) => {
      const schedule = schedulesData[timeIndex];
      if (!schedule) return;

      setEditingTimeIndex(timeIndex);
      setEditingTimeValue(`${schedule.startTime} - ${schedule.endTime}`);
    },
    [schedulesData]
  );

  const handleTimeEditChange = useCallback((value: string) => {
    setEditingTimeValue(value);
  }, []);

  const handleTimeEditSave = useCallback(async () => {
    if (editingTimeIndex === null) return;

    const schedule = schedulesData[editingTimeIndex];
    if (!schedule) return;

    // Parse the time value (format: "HH:MM - HH:MM")
    const parts = editingTimeValue.split(" - ").map((s) => s.trim());
    if (parts.length !== 2) {
      toast.error("Formato inválido", "Usa el formato: HH:MM - HH:MM (ej: 09:00 - 10:00)");
      return;
    }

    const [startTime, endTime] = parts;

    // Validate time format (HH:MM)
    const timeRegex = /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/;
    if (!timeRegex.test(startTime) || !timeRegex.test(endTime)) {
      toast.error("Formato de hora inválido", "Usa el formato HH:MM (ej: 09:00)");
      return;
    }

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
        return old.map((s: any) => {
          if (s.id === schedule.id) {
            return { ...s, startTime, endTime };
          }
          return s;
        });
      });

      // Reset editing state immediately (optimistic)
      setEditingTimeIndex(null);
      setEditingTimeValue("");

      // Show success toast immediately (optimistic)
      toast.success("Horario actualizado", `Horario cambiado a ${startTime} - ${endTime}`);

      // Now perform the actual server update in the background
      await updateScheduleMutation.mutateAsync({
        id: schedule.id,
        data: {
          startTime,
          endTime,
        },
      });

      // Broadcast the change to all connected clients
      await broadcastScheduleChange("highlight_changed", {
        scheduleId: schedule.id,
        openSpaceId: DEFAULT_OPENSPACE_ID,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Failed to update schedule time:", error);

      // Rollback on error - restore editing state
      setEditingTimeIndex(editingTimeIndex);
      setEditingTimeValue(`${schedule.startTime} - ${schedule.endTime}`);

      toast.error("Error", "No se pudo actualizar el horario.");
    }
  }, [editingTimeIndex, editingTimeValue, schedulesData, updateScheduleMutation, queryClient, broadcastScheduleChange]);

  const handleTimeEditCancel = useCallback(() => {
    setEditingTimeIndex(null);
    setEditingTimeValue("");
  }, []);

  const handleTimeEditKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleTimeEditSave();
      } else if (e.key === "Escape") {
        e.preventDefault();
        handleTimeEditCancel();
      }
    },
    [handleTimeEditSave, handleTimeEditCancel]
  );

  // Delete schedule handler with optimistic updates
  const handleDeleteSchedule = useCallback(
    async (timeIndex: number) => {
      const schedule = schedulesData[timeIndex];
      if (!schedule) return;

      const timeSlot = timeSlots[timeIndex];

      // Confirm before deleting
      if (!confirm(`¿Estás seguro de eliminar el horario "${timeSlot}"?\n\nEsta acción no se puede deshacer.`)) {
        return;
      }

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
          return old.filter((s: any) => s.id !== schedule.id);
        });

        // Show success toast immediately (optimistic)
        toast.success("Horario eliminado", `El horario "${timeSlot}" ha sido eliminado.`);

        // Now perform the actual server delete in the background
        await deleteScheduleMutation.mutateAsync({ id: schedule.id });

        // Broadcast the change to all connected clients
        await broadcastScheduleChange("highlight_changed", {
          scheduleId: schedule.id,
          openSpaceId: DEFAULT_OPENSPACE_ID,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        console.error("Failed to delete schedule:", error);

        // Rollback on error
        const queryKey = orpc.schedules.getByOpenSpace.queryOptions({
          input: { openSpaceId: DEFAULT_OPENSPACE_ID },
        }).queryKey;
        const previousSchedules = queryClient.getQueryData(queryKey);
        if (previousSchedules) {
          queryClient.setQueryData(queryKey, previousSchedules);
        }

        toast.error("Error", "No se pudo eliminar el horario.");
      }
    },
    [schedulesData, timeSlots, deleteScheduleMutation, queryClient, broadcastScheduleChange]
  );

  // Create new schedule handler with optimistic updates
  const handleAddSchedule = useCallback(async () => {
    // Default values for new schedule
    const now = new Date();
    const currentDate = now.toISOString().split("T")[0];

    // Find the last schedule to suggest a time after it
    const lastSchedule = schedulesData[schedulesData.length - 1];
    let startTime = "09:00";
    let endTime = "10:00";

    if (lastSchedule) {
      // Parse the last schedule's end time and add 1 hour
      const [hours, minutes] = lastSchedule.endTime.split(":").map(Number);
      const nextStartHour = hours;
      const nextEndHour = hours + 1;
      startTime = `${String(nextStartHour).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
      endTime = `${String(nextEndHour).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
    }

    const newScheduleData = {
      name: `Time Slot ${schedulesData.length + 1}`,
      startTime,
      endTime,
      date: `${currentDate}T00:00:00.000Z`,
      isActive: true,
      highlightInKiosk: false,
      openSpaceId: DEFAULT_OPENSPACE_ID,
    };

    // Get the query key for schedule data
    const queryKey = orpc.schedules.getByOpenSpace.queryOptions({
      input: { openSpaceId: DEFAULT_OPENSPACE_ID },
    }).queryKey;

    try {
      // Optimistically update the UI immediately
      await queryClient.cancelQueries({ queryKey: orpc.schedules.getByOpenSpace.key() });

      const previousSchedules = queryClient.getQueryData(queryKey);

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
      toast.success("Horario agregado", `Nuevo horario ${startTime} - ${endTime} creado.`);

      // Now perform the actual server create in the background
      await createScheduleMutation.mutateAsync(newScheduleData);

      // Broadcast the change to all connected clients
      await broadcastScheduleChange("highlight_changed", {
        openSpaceId: DEFAULT_OPENSPACE_ID,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Failed to create schedule:", error);

      // Rollback on error
      const queryKey = orpc.schedules.getByOpenSpace.queryOptions({
        input: { openSpaceId: DEFAULT_OPENSPACE_ID },
      }).queryKey;
      const previousSchedules = queryClient.getQueryData(queryKey);
      if (previousSchedules) {
        queryClient.setQueryData(queryKey, previousSchedules);
      }

      toast.error("Error", "No se pudo crear el horario.");
    }
  }, [schedulesData, createScheduleMutation, queryClient, broadcastScheduleChange]);

  // Auto-highlight: Find current time slot based on schedule times
  const findCurrentScheduleIndex = useCallback(() => {
    if (!schedulesData || schedulesData.length === 0) return -1;

    const now = new Date();

    // Get local date components
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const currentDateLocal = `${year}-${month}-${day}`;

    // Get current time in HH:MM format (local time)
    const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

    console.log(`🔍 Auto-highlight checking: Current local date=${currentDateLocal}, time=${currentTime}`);

    // Find schedule that matches current date and time is between startTime and endTime
    for (let i = 0; i < schedulesData.length; i++) {
      const schedule = schedulesData[i];

      // Parse the schedule date to local date string (YYYY-MM-DD)
      const scheduleDate = new Date(schedule.date);
      const schedYear = scheduleDate.getFullYear();
      const schedMonth = String(scheduleDate.getMonth() + 1).padStart(2, "0");
      const schedDay = String(scheduleDate.getDate()).padStart(2, "0");
      const scheduleDateLocal = `${schedYear}-${schedMonth}-${schedDay}`;

      console.log(
        `  📅 Schedule ${i}: date=${scheduleDateLocal}, time=${schedule.startTime}-${schedule.endTime}, highlighted=${schedule.highlightInKiosk}`
      );

      // Check if schedule is today (using local dates)
      if (scheduleDateLocal === currentDateLocal) {
        // Check if current time is within the schedule time range
        if (currentTime >= schedule.startTime && currentTime < schedule.endTime) {
          console.log(`  ✅ Found matching schedule at index ${i}`);
          return i;
        }
      }
    }

    console.log(`  ❌ No matching schedule found for current time`);
    return -1; // No matching schedule found
  }, [schedulesData]);

  // Auto-highlight effect: Check every minute and update highlight
  useEffect(() => {
    if (!autoHighlightEnabled) {
      console.log("⏰ Auto-highlight is disabled");
      return;
    }

    console.log("⏰ Auto-highlight is enabled - starting check interval");

    const checkAndUpdateHighlight = async () => {
      console.log("🔄 Auto-highlight check triggered...");
      const currentIndex = findCurrentScheduleIndex();

      if (currentIndex === -1) {
        console.log("⏰ No schedule active at current time - waiting for next schedule");
        return;
      }

      const currentSchedule = schedulesData[currentIndex];
      console.log(
        `⏰ Current schedule found: ${timeSlots[currentIndex]}, already highlighted: ${currentSchedule.highlightInKiosk}`
      );

      // Only update if the current schedule is not already highlighted
      if (!currentSchedule.highlightInKiosk) {
        console.log("⏰ Auto-highlighting current time slot:", timeSlots[currentIndex]);
        try {
          // Un-highlight all other schedules first
          const currentlyHighlighted = schedulesData.filter((s) => s.highlightInKiosk && s.id !== currentSchedule.id);

          console.log(`  🔄 Un-highlighting ${currentlyHighlighted.length} other schedules...`);
          for (const otherSchedule of currentlyHighlighted) {
            await updateScheduleMutation.mutateAsync({
              id: otherSchedule.id,
              data: {
                highlightInKiosk: false,
              },
            });
          }

          // Highlight the current schedule
          console.log(`  ✅ Highlighting schedule ID: ${currentSchedule.id}`);
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
            openSpaceId: DEFAULT_OPENSPACE_ID,
            timestamp: new Date().toISOString(),
            auto: true,
          });

          toast.info("Auto-resaltado", `El horario "${timeSlots[currentIndex]}" ahora se muestra en el kiosco`);
          console.log("✅ Auto-highlight complete!");
        } catch (error) {
          console.error("❌ Failed to auto-highlight schedule:", error);
          toast.error("Error", "No se pudo actualizar el auto-resaltado");
        }
      } else {
        console.log("⏰ Current schedule is already highlighted - no action needed");
      }
    };

    // Check immediately
    console.log("⏰ Running initial auto-highlight check...");
    checkAndUpdateHighlight();

    // Then check every minute
    console.log("⏰ Setting up 60-second interval for auto-highlight checks");
    const interval = setInterval(checkAndUpdateHighlight, 60000); // 60 seconds

    return () => {
      console.log("⏰ Cleaning up auto-highlight interval");
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
  ]);

  // Cast to screen functionality
  const handleCastToScreen = useCallback(
    async (note: StickyNote) => {
      try {
        // Toggle: if already highlighted, clear it
        if (highlightedNoteId === note.id) {
          setHighlightedNoteId(null);
          // Broadcast clear
          await supabase.channel("highlighted-note").send({
            type: "broadcast",
            event: "note_highlighted",
            payload: { note: null },
          });

          toast.info("Pantalla Limpiada", "Pantalla de notas adhesivas limpiada");
        } else {
          setHighlightedNoteId(note.id);
          // Broadcast the note to the sticky note display
          await supabase.channel("highlighted-note").send({
            type: "broadcast",
            event: "note_highlighted",
            payload: { note },
          });

          toast.success(
            "¡Enviado a Pantalla! 📺",
            `"${note.title}" ahora se muestra en la pantalla de notas adhesivas`
          );
        }
      } catch (error) {
        console.error("Failed to cast to screen:", error);
        toast.error("Fallo al Enviar", "No se pudo enviar a la pantalla. Por favor intente nuevamente.");
      }
    },
    [highlightedNoteId]
  );

  // Empty cell handlers
  const handleEmptyCellMouseEnter = useCallback(
    (room: string, timeSlot: string) => {
      if (!dragState.isDragging) setHoveredEmptyCell({ room, timeSlot });
    },
    [dragState.isDragging]
  );

  const filteredNotes = useMemo(() => filterNotes(notes, searchTerm), [notes, searchTerm]);

  const getNotesForCell = useCallback(
    (room: string, timeSlot: string) =>
      filteredNotes.filter((note) => note.room === room && note.timeSlot === timeSlot),
    [filteredNotes]
  );

  // Loading state
  if (notesLoading || setupLoading) {
    return <OpenSpaceSkeleton />;
  }

  // Empty database state
  if (rooms.length === 0 || timeSlots.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-md rounded-lg border border-zinc-700 bg-zinc-800 p-8 text-center">
          <h2 className="mb-4 text-2xl font-bold text-white">Database Setup Required</h2>
          <p className="mb-4 text-zinc-400">
            {rooms.length === 0 && "No rooms found. "}
            {timeSlots.length === 0 && "No schedules found. "}
          </p>
          <p className="text-sm text-zinc-500">
            Run <code className="rounded bg-zinc-900 px-2 py-1">pnpm db:seed</code> to populate the database.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`openspace-board w-full p-6 ${dragState.isDragging ? "openspace-dragging" : ""}`}>
      {/* Header */}
      <div className="mb-6">
        <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="mb-2 text-3xl font-bold text-white">Gestión de OpenSpace</h1>
            <p className="text-zinc-400">Organiza las sesiones del evento arrastrando las tarjetas</p>
          </div>
          <RealtimeIndicator isConnected={true} />
        </div>

        {/* Controls */}
        <div className="flex flex-col items-stretch gap-3 border-t border-zinc-800 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <SearchInput value={searchTerm} onChange={setSearchTerm} />
          <div className="flex flex-wrap gap-2">
            <Button
              variant={autoHighlightEnabled ? "default" : "outline"}
              size="default"
              onClick={handleToggleAutoHighlight}
              disabled={openSpaceLoading || updateOpenSpaceMutation.isPending}
              className={`${
                autoHighlightEnabled
                  ? "bg-blue-600 text-white hover:bg-blue-700"
                  : "border-zinc-700 text-zinc-300 hover:bg-zinc-800"
              }`}
              title={
                autoHighlightEnabled
                  ? "Auto-highlight is ON - Click to disable"
                  : "Click to enable auto-highlight based on current time"
              }
            >
              {autoHighlightEnabled ? <Bot className="mr-2 h-4 w-4" /> : <Clock className="mr-2 h-4 w-4" />}
              {autoHighlightEnabled ? "Auto ON" : "Auto Highlight"}
            </Button>
            <CountdownControls />
            <AddButton variant="outline" onClick={handleAddSchedule}>
              Slot
            </AddButton>
            <AddButton variant="outline" onClick={() => addNewNote()}>
              Charla
            </AddButton>
          </div>
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-auto">
        <div ref={boardRef} className="relative overflow-hidden rounded-lg border-2 border-zinc-600 shadow-xl">
          <TimeGrid
            rooms={rooms}
            timeSlots={timeSlots}
            schedulesData={schedulesData}
            dragState={dragState}
            editingTimeIndex={editingTimeIndex}
            editingTimeValue={editingTimeValue}
            hoveredEmptyCell={hoveredEmptyCell}
            noteColors={NOTE_COLORS}
            getNotesForCell={getNotesForCell}
            onRoomMouseDown={handleRoomMouseDown}
            onToggleScheduleHighlight={handleToggleScheduleHighlight}
            onTimeDoubleClick={handleTimeDoubleClick}
            onTimeEditChange={handleTimeEditChange}
            onTimeEdit={handleTimeEditKeyDown}
            onTimeEditBlur={handleTimeEditCancel}
            onTimeEditSave={handleTimeEditSave}
            onTimeDelete={handleDeleteSchedule}
            onEmptyCellMouseEnter={handleEmptyCellMouseEnter}
            onEmptyCellMouseLeave={() => setHoveredEmptyCell(null)}
            onEmptyCellClick={(room, timeSlot) => addNewNote({ room, timeSlot })}
            onCardMouseDown={handleCardMouseDown}
            onCardDirectClick={handleDirectClick}
            onCardCast={handleCastToScreen}
            highlightedNoteId={highlightedNoteId}
            getCardStyle={getCardStyle}
            getCardClasses={getCardClasses}
            getCardTransform={getCardTransform}
          />

          {dragState.isDragging && dragState.draggedNote && (
            <DragPreview
              draggedNote={dragState.draggedNote}
              mousePosition={dragState.mousePosition}
              dragOffset={dragState.dragOffset}
              noteColors={NOTE_COLORS}
            />
          )}
        </div>
      </div>

      {/* Modal */}
      <TalkFormModal
        open={isFormOpen}
        onOpenChange={handleFormOpenChange}
        note={editingNote}
        notes={notes}
        rooms={rooms}
        roomsData={roomsData}
        timeSlots={timeSlots}
        onSave={handleSaveNote}
        onDelete={editingNote?.id ? () => handleDeleteNote(editingNote.id) : undefined}
        isSaving={editingNote?.id ? isUpdating : isCreating}
        isDeleting={isDeleting}
      />

      {/* Resource Warning Modal for Drag and Drop (Optimistic) */}
      <Dialog
        open={resourceWarningModal.show}
        onOpenChange={(open) => {
          if (!open && resourceWarningModal.revertMove) {
            // If user closes modal without confirming, revert the move
            resourceWarningModal.revertMove();
          }
          setResourceWarningModal({ show: false, message: "", confirmMove: null, revertMove: null });
        }}
      >
        <DialogContent className="border-orange-600/50 bg-zinc-900">
          <DialogHeader>
            <DialogTitle className="text-orange-300">Advertencia de Recursos</DialogTitle>
            <DialogDescription className="whitespace-pre-line text-zinc-300">
              {resourceWarningModal.message}
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 flex gap-3">
            <Button
              variant="outline"
              onClick={() => {
                // Close modal immediately (optimistic)
                setResourceWarningModal({ show: false, message: "", confirmMove: null, revertMove: null });

                // Show immediate feedback
                toast.success("Guardando...", "Confirmando el movimiento");

                // Execute backend update in background
                if (resourceWarningModal.confirmMove) {
                  resourceWarningModal.confirmMove().catch((error) => {
                    console.error("Failed to confirm move:", error);
                    toast.error("Error", "No se pudo guardar el movimiento");
                  });
                }
              }}
              className="flex-1 border-orange-600 bg-orange-500/20 text-orange-200 hover:bg-orange-500/30"
            >
              Sí, Continuar
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                if (resourceWarningModal.revertMove) {
                  resourceWarningModal.revertMove();
                }
                setResourceWarningModal({ show: false, message: "", confirmMove: null, revertMove: null });
              }}
              className="flex-1 text-zinc-400 hover:text-zinc-300"
            >
              No, Cancelar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
