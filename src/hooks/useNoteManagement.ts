import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { StickyNote } from "./useOpenSpaceNotesORPC";
import { orpc } from "../lib/orpc";

interface UseNoteManagementProps {
  notes: StickyNote[];
  roomsData: any[];
  findIdsForPosition: (room: string, timeSlot: string) => { roomId: string; scheduleId: string } | null;
  updateNote: (id: string, updates: any) => Promise<any>;
  swapNotes: (noteId1: string, noteId2: string) => Promise<any>;
  createNote: (data: any) => Promise<any>;
  deleteNote: (id: string) => Promise<any>;
}

/**
 * Custom hook to manage note operations with resource validation
 * Handles: CRUD operations, drag-and-drop validation, resource checks
 */
export function useNoteManagement({
  notes,
  roomsData,
  findIdsForPosition,
  updateNote,
  swapNotes,
  createNote,
  deleteNote,
}: UseNoteManagementProps) {
  const queryClient = useQueryClient();

  /**
   * Handle drag-and-drop note changes with optimistic updates and resource validation
   * Detects swaps and single moves, validates resources, shows confirmation modal if needed
   */
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

      return {
        resourceIssues,
        confirmAction,
        revertAction,
      };
    },
    [notes, updateNote, swapNotes, findIdsForPosition, roomsData, queryClient]
  );

  /**
   * Save note (create or update)
   */
  const handleSaveNote = useCallback(
    async (
      noteData: Partial<StickyNote>,
      editingNote: StickyNote | null,
      rooms: string[],
      timeSlots: string[],
      openSpaceId: string
    ) => {
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
          openSpaceId: openSpaceId,
          scheduleId: ids.scheduleId,
          roomId: ids.roomId,
        });
      }
    },
    [createNote, updateNote, findIdsForPosition]
  );

  /**
   * Delete note
   */
  const handleDeleteNote = useCallback(
    async (noteId: string) => {
      await deleteNote(noteId);
    },
    [deleteNote]
  );

  return {
    handleNotesChange,
    handleSaveNote,
    handleDeleteNote,
  };
}
