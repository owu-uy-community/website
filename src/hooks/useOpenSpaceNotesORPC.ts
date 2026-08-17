import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef } from "react";
import { toast } from "../components/shared/ui/toast-utils";
import { orpc, type StickyNote } from "../lib/orpc";
import { useSupabaseSync } from "./useSupabaseSync";

interface UseOpenSpaceNotesOptions {
  /** Required: notes are always scoped to one event. */
  openSpaceId: string;
  enableRealtime?: boolean;
  initialData?: StickyNote[];
  /** For always-on screens that never refire window focus (kiosks). */
  refetchInterval?: number;
}

/**
 * Hook for managing OpenSpace sticky notes with oRPC + Tanstack Query.
 *
 * Every mutation writes the cache optimistically and SYNCHRONOUSLY inside
 * onMutate (cancelQueries is fired without awaiting it) — the board's drop
 * animation measures the card's final cell on the very next frame, so any
 * microtask between mutate() and setQueryData shows up as a visible flash
 * of the card back in its source cell.
 *
 * Successful mutations do NOT invalidate: the optimistic write is already
 * the server state and realtime covers remote changes. Errors roll back and
 * then invalidate to resync with the server.
 */
export const useOpenSpaceNotesORPC = ({
  openSpaceId,
  enableRealtime = true,
  initialData,
  refetchInterval,
}: UseOpenSpaceNotesOptions) => {
  const queryClient = useQueryClient();

  // Realtime sync (multi-device) over the WebSocket transport
  const {
    broadcastCardUpdate,
    broadcastCardSwap,
    broadcastCardCreate,
    broadcastCardDelete,
    isConnected,
    recentlyUpdatedIds,
  } = useSupabaseSync({
    openSpaceId,
    enabled: enableRealtime,
  });

  // Query for fetching all sticky notes
  const {
    data: notes = [],
    isLoading: queryLoading,
    error,
    isError,
  } = useQuery(
    orpc.tracks.list.queryOptions({
      input: { openSpaceId },
      // Realtime keeps this fresh; a small staleTime stops the triple refetch
      // storm every time the admin tabs back in.
      staleTime: 30 * 1000,
      gcTime: 5 * 60 * 1000,
      refetchOnWindowFocus: true,
      refetchInterval,
      // Use server-side data as initial data for instant first render
      initialData: initialData,
    })
  );

  // When we have initial data, we should never show loading state on first render
  const hasInitialData = Boolean(initialData);
  const loading = queryLoading && !hasInitialData;

  const listKey = useCallback(() => orpc.tracks.list.queryKey({ input: { openSpaceId } }), [openSpaceId]);

  // Helper function for showing error toasts with type-safe error handling
  const showErrorToast = useCallback((title: string, error: unknown) => {
    let description = "Ocurrió un error inesperado.";

    if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
      description = error.message;
    }

    toast.error(title, description);
  }, []);

  /** Rollback to the snapshot, then resync with the server. */
  const rollbackAndResync = useCallback(
    (previousNotes: StickyNote[] | undefined) => {
      if (previousNotes) {
        queryClient.setQueryData(listKey(), previousNotes);
      }
      void queryClient.invalidateQueries({ queryKey: orpc.tracks.list.key({ input: { openSpaceId } }) });
    },
    [queryClient, listKey, openSpaceId]
  );

  // Create mutation with optimistic updates
  const createNoteMutation = useMutation(
    orpc.tracks.create.mutationOptions({
      onMutate: (newNote) => {
        void queryClient.cancelQueries({ queryKey: orpc.tracks.list.key({ input: { openSpaceId } }) });

        const previousNotes = queryClient.getQueryData<StickyNote[]>(listKey());

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

        queryClient.setQueryData<StickyNote[]>(listKey(), (oldNotes = []) => [...oldNotes, optimisticNote]);

        return { previousNotes, optimisticId: optimisticNote.id };
      },
      onError: (_error, _newNote, context) => {
        rollbackAndResync(context?.previousNotes);
        // No toast here: the talk form surfaces create errors inline.
      },
      onSuccess: async (createdNote, _variables, context) => {
        // Swap the temp id for the real row so the card doesn't remount.
        queryClient.setQueryData<StickyNote[]>(listKey(), (oldNotes = []) =>
          oldNotes.map((note) => (note.id === context?.optimisticId ? createdNote : note))
        );
        toast.success("Charla creada", `"${createdNote.title}" ya está en la grilla.`);
        await broadcastCardCreate(createdNote);
      },
    })
  );

  // Update mutation with optimistic updates
  const updateNoteMutation = useMutation(
    orpc.tracks.update.mutationOptions({
      onMutate: ({ id, data: updates }) => {
        void queryClient.cancelQueries({ queryKey: orpc.tracks.list.key({ input: { openSpaceId } }) });

        const previousNotes = queryClient.getQueryData<StickyNote[]>(listKey());

        queryClient.setQueryData<StickyNote[]>(listKey(), (oldNotes = []) =>
          oldNotes.map((note) => (note.id === id ? { ...note, ...updates, updatedAt: new Date().toISOString() } : note))
        );

        return { previousNotes };
      },
      onError: (error, _variables, context) => {
        rollbackAndResync(context?.previousNotes);
        showErrorToast("No se pudo actualizar la charla", error);
      },
      onSuccess: async (updatedNote) => {
        // Deliberately no toast: drag moves route through here and a toast
        // per drop is noise while re-planning the grid.
        await broadcastCardUpdate(updatedNote);
      },
    })
  );

  // Delete mutation with optimistic updates
  const deleteNoteMutation = useMutation(
    orpc.tracks.delete.mutationOptions({
      onMutate: (input) => {
        const noteId = typeof input === "string" ? input : input.id;
        void queryClient.cancelQueries({ queryKey: orpc.tracks.list.key({ input: { openSpaceId } }) });

        const previousNotes = queryClient.getQueryData<StickyNote[]>(listKey());

        queryClient.setQueryData<StickyNote[]>(listKey(), (oldNotes = []) =>
          oldNotes.filter((note) => note.id !== noteId)
        );

        return { previousNotes };
      },
      onError: (error, _input, context) => {
        rollbackAndResync(context?.previousNotes);
        showErrorToast("No se pudo eliminar la charla", error);
      },
      onSuccess: async (deletedNote) => {
        toast.success("Charla eliminada", `"${deletedNote.title}" fue eliminada.`);
        await broadcastCardDelete(deletedNote.id);
      },
    })
  );

  // A cache swap is an involution, NOT idempotent: when the board already
  // applied it synchronously at drop time (to win the drop-animation race),
  // running it again here would swap the cards straight back.
  const skipNextSwapOptimisticRef = useRef(false);

  // Swap mutation with optimistic updates
  const swapNotesMutation = useMutation(
    orpc.tracks.swap.mutationOptions({
      onMutate: ({ trackAId, trackBId }) => {
        void queryClient.cancelQueries({ queryKey: orpc.tracks.list.key({ input: { openSpaceId } }) });

        const previousNotes = queryClient.getQueryData<StickyNote[]>(listKey());

        if (!skipNextSwapOptimisticRef.current) {
          queryClient.setQueryData<StickyNote[]>(listKey(), (oldNotes = []) => {
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
        }
        skipNextSwapOptimisticRef.current = false;

        return { previousNotes };
      },
      onError: (error, _variables, context) => {
        rollbackAndResync(context?.previousNotes);
        showErrorToast("No se pudo intercambiar las charlas", error);
      },
      onSuccess: async (_swappedNotes, variables) => {
        await broadcastCardSwap(variables.trackAId, variables.trackBId);
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
   * Swap positions of two sticky notes.
   * `alreadyApplied` = the caller wrote the swap to the cache synchronously
   * (drag drop); skip the optimistic write so it isn't undone.
   */
  const swapNotes = useCallback(
    (trackAId: string, trackBId: string, options?: { alreadyApplied?: boolean }) => {
      if (options?.alreadyApplied) skipNextSwapOptimisticRef.current = true;
      return swapNotesMutation.mutateAsync({ trackAId, trackBId });
    },
    [swapNotesMutation]
  );

  /**
   * Manually refresh sticky notes data
   */
  const refreshNotes = useCallback(
    () => queryClient.invalidateQueries({ queryKey: orpc.tracks.list.key({ input: { openSpaceId } }) }),
    [queryClient, openSpaceId]
  );

  return {
    // Data and loading states
    notes,
    loading,
    error: error?.message || null,
    isError,

    // Realtime state
    isConnected,
    recentlyUpdatedIds,

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
