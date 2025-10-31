"use client";

import * as React from "react";
import { useState, useRef, useCallback, useMemo, useEffect } from "react";

import { TimeGrid } from "components/Meetups/OpenSpace/organisms/TimeGrid";
import { DragPreview } from "components/Meetups/OpenSpace/organisms/DragPreview";
import { TalkFormModal } from "components/Meetups/OpenSpace/organisms/TalkFormModal";
import { ScheduleFormModal } from "components/Meetups/OpenSpace/organisms/ScheduleFormModal";
import { SearchInput } from "components/Meetups/OpenSpace/atoms/SearchInput";
import { AddButton } from "components/Meetups/OpenSpace/atoms/AddButton";
import { RealtimeIndicator } from "components/Meetups/OpenSpace/atoms/RealtimeIndicator";
import { OpenSpaceSkeleton } from "components/Meetups/OpenSpace/organisms/OpenSpaceSkeleton";
import { CountdownControls } from "components/Meetups/OpenSpace/organisms/CountdownControls";
import { Button } from "components/shared/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "components/shared/ui/dialog";
import { Bot, Clock } from "lucide-react";
import { supabase } from "../../lib/supabase";
import type { Schedule } from "../../../lib/orpc";

import type { CellCoordinates } from "components/Meetups/OpenSpace/types";
import { useDragAndDrop, useLayoutCache, useCardStyles } from "components/Meetups/OpenSpace/hooks";
import { NOTE_COLORS, DEFAULT_OPENSPACE_ID } from "components/Meetups/OpenSpace/utils/constants";
import { filterNotes } from "components/Meetups/OpenSpace/utils/calculations";
import { useOpenSpaceNotesORPC, type StickyNote } from "../../../hooks/useOpenSpaceNotesORPC";
import { useOpenSpaceSetup } from "../../../hooks/useOpenSpaceSetup";
import { toast } from "../../../components/shared/ui/toast-utils";
import { orpc } from "../../../lib/orpc";
import { useQueryClient } from "@tanstack/react-query";
import { useRealtimeBroadcastWithInvalidation } from "../../../hooks/useRealtimeBroadcast";
import { useScheduleManagement } from "../../../hooks/useScheduleManagement";
import { useNoteManagement } from "../../../hooks/useNoteManagement";
import { useAutoHighlight } from "../../../hooks/useAutoHighlight";

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

  // Schedule form modal state
  const [isScheduleFormOpen, setIsScheduleFormOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null);

  // ============ Custom Hooks ============

  // Schedule management
  const {
    updateScheduleMutation,
    createScheduleMutation,
    deleteScheduleMutation,
    handleToggleScheduleHighlight,
    handleSaveSchedule,
    handleDeleteSchedule,
  } = useScheduleManagement({
    schedulesData,
    notes,
    broadcastScheduleChange,
  });

  // Auto-highlight management (needs updateScheduleMutation from schedule hook)
  const { autoHighlightEnabled, openSpaceLoading, handleToggleAutoHighlight, updateOpenSpaceMutation } =
    useAutoHighlight({
      openSpaceId: DEFAULT_OPENSPACE_ID,
      schedulesData,
      timeSlots,
      updateScheduleMutation,
      broadcastScheduleChange,
    });

  // Note management
  const {
    handleNotesChange: handleNotesChangeBase,
    handleSaveNote: handleSaveNoteBase,
    handleDeleteNote,
  } = useNoteManagement({
    notes,
    roomsData,
    findIdsForPosition,
    updateNote,
    swapNotes,
    createNote,
    deleteNote,
  });

  const boardRef = useRef<HTMLDivElement>(null);
  const { layoutCache, boardRectRef, updateBoardRect, getCachedElement, clearElementCache } = useLayoutCache();

  // Handle drag and drop updates with resource validation UI
  const handleNotesChange = useCallback(
    async (updatedNotes: StickyNote[]) => {
      const result = await handleNotesChangeBase(updatedNotes);

      // If there are resource issues, show confirmation modal
      if (result.resourceIssues.length > 0) {
        setResourceWarningModal({
          show: true,
          message: `⚠️ ${result.resourceIssues.join("\n")}.\n\n¿Deseas continuar de todos modos?`,
          confirmMove: result.confirmAction,
          revertMove: result.revertAction,
        });
        return;
      }

      // No resource issues, proceed with backend update immediately
      await result.confirmAction();
    },
    [handleNotesChangeBase]
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

  // Note CRUD handlers (with UI state management)
  const handleSaveNote = useCallback(
    async (noteData: Partial<StickyNote>) => {
      await handleSaveNoteBase(noteData, editingNote, rooms, timeSlots, DEFAULT_OPENSPACE_ID);
      setEditingNote(null);
      setIsFormOpen(false);
    },
    [handleSaveNoteBase, editingNote, rooms, timeSlots]
  );

  const handleDeleteNoteWrapper = useCallback(
    async (noteId: string) => {
      await handleDeleteNote(noteId);
      setEditingNote(null);
      setIsFormOpen(false);
    },
    [handleDeleteNote]
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

  // Schedule handlers with UI state management
  const handleTimeDoubleClick = useCallback(
    (timeIndex: number) => {
      const schedule = schedulesData[timeIndex];
      if (!schedule) return;
      setEditingSchedule(schedule);
      setIsScheduleFormOpen(true);
    },
    [schedulesData]
  );

  const handleAddScheduleClick = useCallback(() => {
    setEditingSchedule(null);
    setIsScheduleFormOpen(true);
  }, []);

  const handleDeleteScheduleFromModal = useCallback(async () => {
    if (!editingSchedule) return;
    const timeSlot = `${editingSchedule.startTime} - ${editingSchedule.endTime}`;
    await handleDeleteSchedule(editingSchedule.id, timeSlot);
  }, [editingSchedule, handleDeleteSchedule]);

  const handleDeleteScheduleFromButton = useCallback(
    async (timeIndex: number) => {
      const schedule = schedulesData[timeIndex];
      if (!schedule) return;
      const timeSlot = `${schedule.startTime} - ${schedule.endTime}`;
      const hasTracksInSlot = notes.some((note) => note.timeSlot === timeSlot);

      // Confirm before deleting
      if (hasTracksInSlot) {
        if (
          !confirm(
            `⚠️ Este horario tiene charlas asignadas. ¿Estás seguro de eliminarlo?\n\nEsta acción no se puede deshacer y las charlas se perderán.`
          )
        ) {
          return;
        }
      } else {
        if (!confirm(`¿Estás seguro de eliminar el horario "${timeSlot}"?\n\nEsta acción no se puede deshacer.`)) {
          return;
        }
      }

      await handleDeleteSchedule(schedule.id, timeSlot);
    },
    [schedulesData, notes, handleDeleteSchedule]
  );

  const handleToggleScheduleHighlightWrapper = useCallback(
    async (timeIndex: number) => {
      await handleToggleScheduleHighlight(timeIndex, timeSlots);
    },
    [handleToggleScheduleHighlight, timeSlots]
  );

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
            <AddButton variant="outline" onClick={handleAddScheduleClick}>
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
            editingTimeIndex={null}
            editingTimeValue=""
            hoveredEmptyCell={hoveredEmptyCell}
            noteColors={NOTE_COLORS}
            getNotesForCell={getNotesForCell}
            onRoomMouseDown={handleRoomMouseDown}
            onToggleScheduleHighlight={handleToggleScheduleHighlightWrapper}
            onTimeDoubleClick={handleTimeDoubleClick}
            onTimeEditChange={() => {}}
            onTimeEdit={() => {}}
            onTimeEditBlur={() => {}}
            onTimeEditSave={async () => {}}
            onTimeDelete={handleDeleteScheduleFromButton}
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
        onDelete={editingNote?.id ? () => handleDeleteNoteWrapper(editingNote.id) : undefined}
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

      {/* Schedule Form Modal */}
      <ScheduleFormModal
        open={isScheduleFormOpen}
        onOpenChange={setIsScheduleFormOpen}
        schedule={editingSchedule}
        schedules={schedulesData}
        onSave={handleSaveSchedule}
        onDelete={editingSchedule ? handleDeleteScheduleFromModal : undefined}
        isSaving={createScheduleMutation.isPending || updateScheduleMutation.isPending}
        isDeleting={deleteScheduleMutation.isPending}
        hasTracksInSlot={
          editingSchedule
            ? notes.some((note) => note.timeSlot === `${editingSchedule.startTime} - ${editingSchedule.endTime}`)
            : false
        }
      />
    </div>
  );
}
