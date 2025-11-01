import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { toast } from "../components/shared/ui/toast-utils";
import { orpc, type StickyNote } from "../lib/orpc";
import { useSupabaseSync } from "./useSupabaseSync";
import { revalidateOpenSpace } from "../lib/revalidation";
import { DEFAULT_OPENSPACE_ID } from "../components/Meetups/OpenSpace/utils/constants";

interface UseOpenSpaceNotesOptions {
  openSpaceId?: string;
  enableRealtime?: boolean;
  initialData?: StickyNote[];
}

/**
 * Hook for managing OpenSpace sticky notes with official oRPC + Tanstack Query integration
 * Provides CRUD operations with optimistic updates, type-safe error handling, and built-in key management
 * Now with Supabase realtime sync for multi-device collaboration
 */
export const useOpenSpaceNotesORPC = ({
  openSpaceId = DEFAULT_OPENSPACE_ID,
  enableRealtime = true,
  initialData,
}: UseOpenSpaceNotesOptions = {}) => {
  const queryClient = useQueryClient();

  // Supabase realtime sync
  const { broadcastCardUpdate, broadcastCardSwap, broadcastCardCreate, broadcastCardDelete } = useSupabaseSync({
    openSpaceId,
    enabled: enableRealtime,
  });

  // Query for fetching all sticky notes using official oRPC integration
  const {
    data: notes = [],
    isLoading: queryLoading,
    error,
    isError,
  } = useQuery(
    orpc.tracks.list.queryOptions({
      staleTime: 30 * 1000, // Consider data fresh for 30 seconds
      gcTime: 5 * 60 * 1000, // Keep in cache for 5 minutes
      // Use server-side data as initial data for instant first render
      initialData: initialData,
    })
  );

  // When we have initial data, we should never show loading state on first render
  const hasInitialData = Boolean(initialData);
  const loading = queryLoading && !hasInitialData;

  // Helper function for showing error toasts with type-safe error handling
  const showErrorToast = useCallback((title: string, error: unknown) => {
    let description = "Ocurrió un error inesperado.";

    // Check if error has a message property
    if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
      description = error.message;
    }

    toast.error(title, description);
  }, []);

  // Helper function for showing success toasts
  const showSuccessToast = useCallback((title: string, description: string) => {
    toast.success(title, description);
  }, []);

  // Create mutation with optimistic updates using official oRPC integration
  const createNoteMutation = useMutation(
    orpc.tracks.create.mutationOptions({
      onMutate: async (newNote) => {
        // Cancel outgoing refetches using oRPC key management
        await queryClient.cancelQueries({ queryKey: orpc.tracks.list.key() });

        // Snapshot the previous value
        const previousNotes = queryClient.getQueryData<StickyNote[]>(orpc.tracks.list.queryKey());

        // Optimistically update to the new value
        const optimisticNote: StickyNote = {
          ...newNote,
          id: `temp-${Date.now()}`, // Temporary ID
          speaker: newNote.speaker || undefined,
          description: newNote.description || undefined,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          room: newNote.room || "",
          timeSlot: newNote.timeSlot || "",
          needsTV: newNote.needsTV || false,
          needsWhiteboard: newNote.needsWhiteboard || false,
        };

        queryClient.setQueryData<StickyNote[]>(orpc.tracks.list.queryKey(), (oldNotes = []) => [
          ...oldNotes,
          optimisticNote,
        ]);

        return { previousNotes };
      },
      onError: (error, newNote, context) => {
        console.log("Create mutation error:", error);
        console.log("Error type:", typeof error);
        console.log("Error structure:", JSON.stringify(error, null, 2));

        // Rollback on error
        if (context?.previousNotes) {
          queryClient.setQueryData(orpc.tracks.list.queryKey(), context.previousNotes);
        }
        // Don't show toast here - let the caller handle it
        // showErrorToast("Failed to create session", error)
      },
      onSuccess: async (createdNote) => {
        showSuccessToast("Sesión creada", `"${createdNote.title}" ha sido creada exitosamente.`);
        // Broadcast to other devices
        await broadcastCardCreate(createdNote);
        // Trigger ISR revalidation for future visitors using Server Action
        console.log("🔄 [Tracks] Triggering revalidation after note creation");
        const result = await revalidateOpenSpace();
        if (result.success) {
          console.log("✅ [Tracks] Revalidation triggered successfully after note creation");
        } else {
          console.error("❌ [Tracks] Revalidation failed after note creation:", result.error);
        }
      },
      onSettled: () => {
        // Always refetch after error or success using oRPC key management
        queryClient.invalidateQueries({ queryKey: orpc.tracks.list.key() });
      },
    })
  );

  // Update mutation with optimistic updates using official oRPC integration
  const updateNoteMutation = useMutation(
    orpc.tracks.update.mutationOptions({
      onMutate: async ({ id, data: updates }) => {
        await queryClient.cancelQueries({ queryKey: orpc.tracks.list.key() });

        const previousNotes = queryClient.getQueryData<StickyNote[]>(orpc.tracks.list.queryKey());

        // Optimistically update
        queryClient.setQueryData<StickyNote[]>(orpc.tracks.list.queryKey(), (oldNotes = []) =>
          oldNotes.map((note) => (note.id === id ? { ...note, ...updates, updatedAt: new Date().toISOString() } : note))
        );

        return { previousNotes };
      },
      onError: (error, variables, context) => {
        if (context?.previousNotes) {
          queryClient.setQueryData(orpc.tracks.list.queryKey(), context.previousNotes);
        }
        showErrorToast("Error al actualizar sesión", error);
      },
      onSuccess: async (updatedNote) => {
        showSuccessToast("Sesión actualizada", `"${updatedNote.title}" ha sido actualizada exitosamente.`);
        // Broadcast to other devices
        await broadcastCardUpdate(updatedNote);
        // Trigger ISR revalidation for future visitors using Server Action
        console.log("🔄 [Tracks] Triggering revalidation after note update");
        const result = await revalidateOpenSpace();
        if (result.success) {
          console.log("✅ [Tracks] Revalidation triggered successfully after note update");
        } else {
          console.error("❌ [Tracks] Revalidation failed after note update:", result.error);
        }
      },
      onSettled: () => {
        queryClient.invalidateQueries({ queryKey: orpc.tracks.list.key() });
      },
    })
  );

  // Delete mutation with optimistic updates using official oRPC integration
  const deleteNoteMutation = useMutation(
    orpc.tracks.delete.mutationOptions({
      onMutate: async (input) => {
        const noteId = typeof input === "string" ? input : input.id;
        await queryClient.cancelQueries({ queryKey: orpc.tracks.list.key() });

        const previousNotes = queryClient.getQueryData<StickyNote[]>(orpc.tracks.list.queryKey());

        // Optimistically remove the note
        queryClient.setQueryData<StickyNote[]>(orpc.tracks.list.queryKey(), (oldNotes = []) =>
          oldNotes.filter((note) => note.id !== noteId)
        );

        return { previousNotes };
      },
      onError: (error, input, context) => {
        if (context?.previousNotes) {
          queryClient.setQueryData(orpc.tracks.list.queryKey(), context.previousNotes);
        }
        showErrorToast("Error al eliminar sesión", error);
      },
      onSuccess: async (deletedNote) => {
        showSuccessToast("Sesión eliminada", `"${deletedNote.title}" ha sido eliminada exitosamente.`);
        // Broadcast to other devices
        await broadcastCardDelete(deletedNote.id);
        // Trigger ISR revalidation for future visitors using Server Action
        console.log("🔄 [Tracks] Triggering revalidation after note deletion");
        const result = await revalidateOpenSpace();
        if (result.success) {
          console.log("✅ [Tracks] Revalidation triggered successfully after note deletion");
        } else {
          console.error("❌ [Tracks] Revalidation failed after note deletion:", result.error);
        }
      },
      onSettled: () => {
        queryClient.invalidateQueries({ queryKey: orpc.tracks.list.key() });
      },
    })
  );

  // Swap mutation with optimistic updates using official oRPC integration
  const swapNotesMutation = useMutation(
    orpc.tracks.swap.mutationOptions({
      onMutate: async ({ trackAId, trackBId }) => {
        await queryClient.cancelQueries({ queryKey: orpc.tracks.list.key() });

        const previousNotes = queryClient.getQueryData<StickyNote[]>(orpc.tracks.list.queryKey());

        // Optimistically swap the notes
        queryClient.setQueryData<StickyNote[]>(orpc.tracks.list.queryKey(), (oldNotes = []) => {
          const noteA = oldNotes.find((n) => n.id === trackAId);
          const noteB = oldNotes.find((n) => n.id === trackBId);

          if (!noteA || !noteB) return oldNotes;

          return oldNotes.map((note) => {
            if (note.id === trackAId) {
              return { ...note, room: noteB.room, timeSlot: noteB.timeSlot };
            } else if (note.id === trackBId) {
              return { ...note, room: noteA.room, timeSlot: noteA.timeSlot };
            }
            return note;
          });
        });

        return { previousNotes };
      },
      onError: (error, variables, context) => {
        if (context?.previousNotes) {
          queryClient.setQueryData(orpc.tracks.list.queryKey(), context.previousNotes);
        }
        showErrorToast("Error al intercambiar sesiones", error);
      },
      onSuccess: async (swappedNotes, variables) => {
        // Broadcast to other devices - this is the most important one for multi-device sync!
        await broadcastCardSwap(variables.trackAId, variables.trackBId);
        // Trigger ISR revalidation for future visitors using Server Action
        console.log("🔄 [Tracks] Triggering revalidation after note swap");
        const result = await revalidateOpenSpace();
        if (result.success) {
          console.log("✅ [Tracks] Revalidation triggered successfully after note swap");
        } else {
          console.error("❌ [Tracks] Revalidation failed after note swap:", result.error);
        }
      },
      onSettled: () => {
        queryClient.invalidateQueries({ queryKey: orpc.tracks.list.key() });
      },
    })
  );

  /**
   * Create a new sticky note
   */
  const createNote = useCallback(
    (noteData: Omit<StickyNote, "id" | "createdAt" | "updatedAt">) => createNoteMutation.mutateAsync(noteData),
    [createNoteMutation]
  );

  /**
   * Update an existing sticky note using oRPC format
   */
  const updateNote = useCallback(
    (id: string, noteData: Partial<StickyNote>) => updateNoteMutation.mutateAsync({ id, data: noteData }),
    [updateNoteMutation]
  );

  /**
   * Delete a sticky note
   */
  const deleteNote = useCallback((id: string) => deleteNoteMutation.mutateAsync({ id }), [deleteNoteMutation]);

  /**
   * Swap positions of two sticky notes
   */
  const swapNotes = useCallback(
    (trackAId: string, trackBId: string) => swapNotesMutation.mutateAsync({ trackAId, trackBId }),
    [swapNotesMutation]
  );

  /**
   * Manually refresh sticky notes data using oRPC key management
   */
  const refreshNotes = useCallback(
    () => queryClient.invalidateQueries({ queryKey: orpc.tracks.list.key() }),
    [queryClient]
  );

  return {
    // Data and loading states
    notes,
    loading,
    error: error?.message || null,
    isError,

    // CRUD operations
    createNote,
    updateNote,
    deleteNote,
    swapNotes,
    refreshNotes,

    // Mutation states for UI feedback
    isCreating: createNoteMutation.isPending,
    isUpdating: updateNoteMutation.isPending,
    isDeleting: deleteNoteMutation.isPending,
    isSwapping: swapNotesMutation.isPending,
  };
};

export { type StickyNote };
