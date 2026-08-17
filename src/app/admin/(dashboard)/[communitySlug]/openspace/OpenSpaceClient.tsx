"use client";

import * as React from "react";
import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type DropAnimation,
} from "@dnd-kit/core";
import { ArrowUpRight, CalendarX2, Plus, SearchX, Tv } from "lucide-react";

import { TimeGrid } from "components/Meetups/OpenSpace/organisms/TimeGrid";
import { StickyNoteGhost } from "components/Meetups/OpenSpace/molecules/StickyNoteCard";
import { TalkFormModal } from "components/Meetups/OpenSpace/organisms/TalkFormModal";
import { ScheduleFormModal } from "components/Meetups/OpenSpace/organisms/ScheduleFormModal";
import { ResourceWarningDialog } from "components/Meetups/OpenSpace/organisms/ResourceWarningDialog";
import { SearchInput } from "components/Meetups/OpenSpace/atoms/SearchInput";
import { RealtimeIndicator } from "components/Meetups/OpenSpace/atoms/RealtimeIndicator";
import { OpenSpaceSkeleton } from "components/Meetups/OpenSpace/organisms/OpenSpaceSkeleton";
import { CountdownControls } from "components/Meetups/OpenSpace/organisms/CountdownControls";
import { RoomFormModal } from "components/Admin/rooms/RoomFormModal";
import { Button } from "components/shared/ui/button";
import { Empty } from "components/shared/ui/empty";
import { Label } from "components/shared/ui/label";
import { Switch } from "components/shared/ui/switch";
import type { Room, Schedule } from "lib/orpc";
import { client } from "lib/orpc";

import { BOARD_EASE } from "components/Meetups/OpenSpace/utils/constants";
import { eventChannel } from "lib/realtime/channels";
import { filterNotes, findNoteInCell } from "components/Meetups/OpenSpace/utils/calculations";
import { useOpenSpaceNotesORPC, type StickyNote } from "hooks/useOpenSpaceNotesORPC";
import { useOpenSpaceSetup } from "hooks/useOpenSpaceSetup";
import { toast } from "components/shared/ui/toast-utils";
import { orpc } from "lib/orpc";
import { useRealtimeBroadcastWithInvalidation } from "hooks/useRealtimeBroadcast";
import { useScheduleManagement } from "hooks/useScheduleManagement";
import { useNoteManagement } from "hooks/useNoteManagement";
import { useAutoHighlight } from "hooks/useAutoHighlight";

const DROP_ANIMATION: DropAnimation = {
  duration: 200,
  easing: `cubic-bezier(${BOARD_EASE.join(", ")})`,
  // The real card hides itself (isActive/isSettling → opacity-0) until
  // `settlingId` clears in sync with this duration, so the ghost is the only
  // visible copy while it glides into place.
};

export default function OpenSpaceClient({
  eventId,
  eventName,
  eventHref,
  kioskHref,
}: {
  eventId: string;
  eventName: string;
  /** Admin detail page of the event (for the empty-state CTA). */
  eventHref?: string;
  /** Public kiosk grid of the event, for the venue screen. */
  kioskHref?: string;
}) {
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
    isConnected,
    recentlyUpdatedIds,
  } = useOpenSpaceNotesORPC({ openSpaceId: eventId, enableRealtime: true });

  const {
    rooms,
    roomColors,
    roomIcons,
    roomsData,
    timeSlots,
    schedulesData,
    isLoading: setupLoading,
    findIdsForPosition,
  } = useOpenSpaceSetup(eventId);

  // Real-time broadcast management for OpenSpace updates
  const { broadcast: broadcastScheduleChange } = useRealtimeBroadcastWithInvalidation({
    channelName: eventChannel(eventId, "highlights"),
    eventHandlers: [
      {
        event: "highlight_changed",
        queryKey: orpc.schedules.getByOpenSpace.key(),
      },
      {
        event: "auto_highlight_changed",
        queryKey: ["openSpace", eventId],
      },
    ],
    receiveSelf: false,
  });

  // UI state
  const [searchTerm, setSearchTerm] = useState("");
  const [editingNote, setEditingNote] = useState<StickyNote | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [highlightedNoteId, setHighlightedNoteId] = useState<string | null>(null);

  // Drag state (dnd-kit owns the gesture; this is only what the UI needs)
  const [activeNote, setActiveNote] = useState<StickyNote | null>(null);
  const [settlingId, setSettlingId] = useState<string | null>(null);
  // Cell currently hovered during a drag — drives the live "temporary swap"
  // preview so the board always shows how it will end up.
  const [dragOverCell, setDragOverCell] = useState<{ room: string; timeSlot: string } | null>(null);
  // Cell box measured once at drag start; the swap preview slides by whole
  // cells, so one measurement gives exact pixel offsets for the whole drag.
  const cellSizeRef = useRef<{ w: number; h: number }>({ w: 0, h: 0 });
  const lastDragEndAt = useRef(0);
  // Screen positions captured at drop time: when a swap partner remounts in
  // its new cell it FLIPs from here, continuing a mid-flight slide instead of
  // cutting to the final spot.
  const flipRects = useRef(new Map<string, { left: number; top: number }>());

  // Restore the persisted cast state so the toggle reflects reality after reloads
  useEffect(() => {
    client.cast
      .getState({})
      .then((state) => setHighlightedNoteId(state.trackId))
      .catch(() => undefined);
  }, []);

  // Resource warning for drag-and-drop (the move is NOT applied until confirmed)
  const [resourceWarning, setResourceWarning] = useState<{
    issues: string[];
    confirm: () => Promise<void>;
  } | null>(null);
  const [resourceConfirming, setResourceConfirming] = useState(false);

  // Schedule form modal state
  const [isScheduleFormOpen, setIsScheduleFormOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null);
  const [isRoomFormOpen, setIsRoomFormOpen] = useState(false);
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);

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
    openSpaceId: eventId,
    schedulesData,
    notes,
    broadcastScheduleChange,
  });

  // Auto-highlight management (needs updateScheduleMutation from schedule hook)
  const { autoHighlightEnabled, openSpaceLoading, handleToggleAutoHighlight, updateOpenSpaceMutation } =
    useAutoHighlight({
      openSpaceId: eventId,
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
    openSpaceId: eventId,
    notes,
    roomsData,
    findIdsForPosition,
    updateNote,
    swapNotes,
    createNote,
    deleteNote,
  });

  // Show DB error toast
  useEffect(() => {
    if (dbError) {
      toast.error("Error de base de datos", dbError);
    }
  }, [dbError]);

  // ============ Drag and drop (dnd-kit) ============

  const sensors = useSensors(
    // 6px of travel before a drag starts — a plain click opens the editor.
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } })
  );

  const handleDragStart = useCallback(({ active }: DragStartEvent) => {
    const cell = document.querySelector("[data-board-cell]");
    if (cell) {
      const rect = cell.getBoundingClientRect();
      cellSizeRef.current = { w: rect.width, h: rect.height };
    }
    setActiveNote((active.data.current?.note as StickyNote | undefined) ?? null);
    setDragOverCell(null);
  }, []);

  const handleDragOver = useCallback(
    ({ over }: DragOverEvent) => {
      const target = over?.data.current as { room: string; timeSlot: string } | undefined;
      setDragOverCell((prev) => {
        const next =
          target && !(activeNote && target.room === activeNote.room && target.timeSlot === activeNote.timeSlot)
            ? target
            : null;
        if (prev?.room === next?.room && prev?.timeSlot === next?.timeSlot) return prev;
        return next;
      });
    },
    [activeNote]
  );

  const handleDragCancel = useCallback(() => {
    setActiveNote(null);
    setDragOverCell(null);
  }, []);

  const handleDragEnd = useCallback(
    ({ active, over }: DragEndEvent) => {
      lastDragEndAt.current = Date.now();
      const note = active.data.current?.note as StickyNote | undefined;
      const target = over?.data.current as { room: string; timeSlot: string } | undefined;

      if (!note || !target || (note.room === target.room && note.timeSlot === target.timeSlot)) {
        // No move: clearing the preview slides the swap partner back home.
        setActiveNote(null);
        setDragOverCell(null);
        return;
      }

      const occupant = findNoteInCell(notes, target.room, target.timeSlot, note.id);
      const updatedNotes = notes.map((n) => {
        if (n.id === note.id) return { ...n, room: target.room, timeSlot: target.timeSlot };
        if (occupant && n.id === occupant.id) return { ...n, room: note.room, timeSlot: note.timeSlot };
        return n;
      });

      const result = handleNotesChangeBase(updatedNotes);

      if (result.resourceIssues.length > 0) {
        // Nothing was applied — the ghost animates back to the source cell
        // and the swap partner slides home; ask before committing the move.
        setActiveNote(null);
        setDragOverCell(null);
        setResourceWarning({ issues: result.resourceIssues, confirm: result.confirmAction });
        return;
      }

      // The swap partner is mid-slide via CSS transform; capture where it IS
      // on screen so its remounted element can FLIP from there and finish the
      // journey instead of cutting to the final spot.
      if (occupant) {
        const el = document.querySelector(`[data-note-id="${occupant.id}"]`);
        if (el) {
          const rect = el.getBoundingClientRect();
          flipRects.current.set(occupant.id, { left: rect.left, top: rect.top });
        }
      }

      // Everything below lands in ONE batch → one paint. The synchronous
      // cache write is what lets dnd-kit's drop animation measure the dragged
      // card already in its target cell (async writes lose that race and the
      // ghost glides back to the origin before snapping forward). The
      // mutation's own onMutate re-writes the same values — idempotent.
      queryClient.setQueryData<StickyNote[]>(
        orpc.tracks.list.queryKey({ input: { openSpaceId: eventId } }),
        (old = []) =>
          old.map((n) => {
            if (n.id === note.id) return { ...n, room: target.room, timeSlot: target.timeSlot };
            if (occupant && n.id === occupant.id) return { ...n, room: note.room, timeSlot: note.timeSlot };
            return n;
          })
      );
      setSettlingId(note.id);
      setActiveNote(null);
      setDragOverCell(null);
      window.setTimeout(() => setSettlingId((current) => (current === note.id ? null : current)), 200);
      void result.confirmAction({ preApplied: true }).catch(() => {
        // onError already rolled back and toasted.
      });
    },
    [notes, handleNotesChangeBase, queryClient, eventId]
  );

  const confirmResourceMove = useCallback(async () => {
    if (!resourceWarning) return;
    setResourceConfirming(true);
    try {
      await resourceWarning.confirm();
      setResourceWarning(null);
    } catch {
      // onError already rolled back and toasted; keep the dialog closed.
      setResourceWarning(null);
    } finally {
      setResourceConfirming(false);
    }
  }, [resourceWarning]);

  // ============ Note CRUD handlers ============

  const handleSaveNote = useCallback(
    async (noteData: Partial<StickyNote>) => {
      await handleSaveNoteBase(noteData, editingNote, rooms, timeSlots, eventId);
      setEditingNote(null);
      setIsFormOpen(false);
    },
    [handleSaveNoteBase, editingNote, rooms, timeSlots, eventId]
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

  const openNote = useCallback((note: StickyNote) => {
    setEditingNote(note);
    setIsFormOpen(true);
  }, []);

  // Handle modal close - clear editing note state
  const handleFormOpenChange = useCallback((open: boolean) => {
    setIsFormOpen(open);
    if (!open) {
      setEditingNote(null);
    }
  }, []);

  // ============ Schedule handlers ============

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

  const handleAddRoomClick = useCallback(() => {
    setEditingRoom(null);
    setIsRoomFormOpen(true);
  }, []);

  // Room headers are the natural place to fix a room: click the column.
  const handleEditRoomClick = useCallback(
    (roomName: string) => {
      const room = roomsData.find((candidate) => candidate.name === roomName);
      if (!room) return;

      setEditingRoom(room);
      setIsRoomFormOpen(true);
    },
    [roomsData]
  );

  const handleDeleteScheduleFromModal = useCallback(async () => {
    if (!editingSchedule) return;
    const timeSlot = `${editingSchedule.startTime} - ${editingSchedule.endTime}`;
    await handleDeleteSchedule(editingSchedule.id, timeSlot);
  }, [editingSchedule, handleDeleteSchedule]);

  const handleToggleScheduleHighlightWrapper = useCallback(
    (timeIndex: number) => {
      void handleToggleScheduleHighlight(timeIndex, timeSlots);
    },
    [handleToggleScheduleHighlight, timeSlots]
  );

  // Cast to screen functionality (persisted server-side + broadcast over WebSockets)
  const handleCastToScreen = useCallback(
    async (note: StickyNote) => {
      try {
        // Toggle: if already highlighted, clear it
        if (highlightedNoteId === note.id) {
          await client.cast.setHighlightedNote({ trackId: null });
          setHighlightedNoteId(null);
          toast.info("Pantalla limpiada", "La pantalla de notas quedó libre.");
        } else {
          await client.cast.setHighlightedNote({ trackId: note.id });
          setHighlightedNoteId(note.id);
          toast.success("Enviado a pantalla", `"${note.title}" se está mostrando en la pantalla de notas.`);
        }
      } catch (error) {
        console.error("Failed to cast to screen:", error);
        toast.error("No se pudo enviar", "Probá nuevamente en unos segundos.");
      }
    },
    [highlightedNoteId]
  );

  const filteredNotes = useMemo(() => filterNotes(notes, searchTerm), [notes, searchTerm]);

  // Live "temporary swap": while hovering an occupied cell, its occupant
  // SLIDES (CSS transform — no re-parenting, no motion library) to the drag
  // origin so the board previews exactly how it will end up.
  const swapPreviewNote = useMemo(() => {
    if (!activeNote || !dragOverCell) return null;
    return findNoteInCell(notes, dragOverCell.room, dragOverCell.timeSlot, activeNote.id);
  }, [notes, activeNote, dragOverCell]);

  const swapPreviewOffset = useMemo(() => {
    if (!activeNote || !swapPreviewNote) return null;
    const colDelta = rooms.indexOf(activeNote.room) - rooms.indexOf(swapPreviewNote.room);
    const rowDelta = timeSlots.indexOf(activeNote.timeSlot) - timeSlots.indexOf(swapPreviewNote.timeSlot);
    return { x: colDelta * cellSizeRef.current.w, y: rowDelta * cellSizeRef.current.h };
  }, [activeNote, swapPreviewNote, rooms, timeSlots]);

  const getNotesForCell = useCallback(
    (room: string, timeSlot: string) =>
      filteredNotes.filter((note) => note.room === room && note.timeSlot === timeSlot),
    [filteredNotes]
  );

  const noResults = searchTerm.length > 0 && filteredNotes.length === 0;
  // A talk needs a cell to land in, so it stays disabled until both axes exist.
  const isGridReady = rooms.length > 0 && timeSlots.length > 0;

  // Loading state
  if (notesLoading || setupLoading) {
    return <OpenSpaceSkeleton />;
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">Open Space</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {eventName} — arrastrá las tarjetas para organizar la grilla
          </p>
        </div>
        <div className="flex items-center gap-3">
          {kioskHref ? (
            <Button asChild size="sm" variant="outline">
              <a href={kioskHref} rel="noreferrer" target="_blank">
                <Tv />
                Kiosco
                <ArrowUpRight className="text-muted-foreground" />
              </a>
            </Button>
          ) : null}
          <RealtimeIndicator isConnected={isConnected} />
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SearchInput value={searchTerm} onChange={setSearchTerm} />
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex h-9 items-center gap-2 rounded-md border border-border px-3">
            <Switch
              checked={autoHighlightEnabled}
              disabled={openSpaceLoading || updateOpenSpaceMutation.isPending}
              id="auto-highlight"
              onCheckedChange={() => handleToggleAutoHighlight()}
            />
            <Label className="cursor-pointer text-xs text-muted-foreground" htmlFor="auto-highlight">
              Resaltado automático
            </Label>
          </div>
          <CountdownControls eventId={eventId} />
          <Button size="sm" variant="outline" onClick={handleAddRoomClick}>
            <Plus />
            Sala
          </Button>
          <Button size="sm" variant="outline" onClick={handleAddScheduleClick}>
            <Plus />
            Slot
          </Button>
          <Button disabled={!isGridReady} size="sm" onClick={() => addNewNote()}>
            <Plus />
            Charla
          </Button>
        </div>
      </div>

      {/* Board. The grid renders as soon as there is one room — an event being
          set up shows its columns right away, and the missing piece is asked
          for inline instead of replacing the whole page with an empty state. */}
      {rooms.length === 0 ? (
        <Empty
          action={
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button size="sm" onClick={handleAddRoomClick}>
                <Plus />
                Crear la primera sala
              </Button>
              {eventHref ? (
                <Button asChild size="sm" variant="outline">
                  <Link href={eventHref}>Ajustes del evento</Link>
                </Button>
              ) : null}
            </div>
          }
          className="py-16"
          description="Las salas son las columnas de la grilla. Creá la primera para empezar a armarla."
          icon={CalendarX2}
          title="Todavía no hay salas"
        />
      ) : noResults ? (
        <Empty
          className="py-16"
          description="Probá con otro título u orador."
          icon={SearchX}
          title={`Sin resultados para “${searchTerm}”`}
        />
      ) : (
        <DndContext
          collisionDetection={pointerWithin}
          sensors={sensors}
          onDragCancel={handleDragCancel}
          onDragEnd={handleDragEnd}
          onDragOver={handleDragOver}
          onDragStart={handleDragStart}
        >
          <div className="openspace-surface max-h-[calc(100dvh-13.5rem)] overflow-auto rounded-lg border border-border bg-card">
            <TimeGrid
              activeNote={activeNote}
              getNotesForCell={getNotesForCell}
              highlightedNoteId={highlightedNoteId}
              flipRects={flipRects}
              lastDragEndAt={lastDragEndAt}
              recentlyUpdatedIds={recentlyUpdatedIds}
              roomColors={roomColors}
              roomIcons={roomIcons}
              rooms={rooms}
              schedulesData={schedulesData}
              settlingId={settlingId}
              swapPreviewId={swapPreviewNote?.id ?? null}
              swapPreviewOffset={swapPreviewOffset}
              timeSlots={timeSlots}
              onCastNote={handleCastToScreen}
              onEmptyCellClick={(room, timeSlot) => addNewNote({ room, timeSlot })}
              onOpenNote={openNote}
              onTimeDoubleClick={handleTimeDoubleClick}
              onEditRoom={handleEditRoomClick}
              onToggleScheduleHighlight={handleToggleScheduleHighlightWrapper}
            />

            {/* Rooms but no slots yet: the columns are already visible above,
                so ask for the missing rows right where they would appear. */}
            {timeSlots.length === 0 ? (
              <div className="flex flex-col items-center gap-3 border-t border-border/60 px-4 py-12 text-center">
                <p className="text-sm text-muted-foreground">
                  Falta el horario: los slots son las filas donde se ubican las charlas.
                </p>
                <Button size="sm" onClick={handleAddScheduleClick}>
                  <Plus />
                  Crear el primer slot
                </Button>
              </div>
            ) : null}
          </div>

          <DragOverlay dropAnimation={DROP_ANIMATION} zIndex={50}>
            {activeNote ? (
              <StickyNoteGhost color={roomColors?.[activeNote.room] ?? "#a1a1aa"} note={activeNote} />
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      {/* Talk form */}
      <TalkFormModal
        isDeleting={isDeleting}
        isSaving={editingNote?.id ? isUpdating : isCreating}
        note={editingNote}
        notes={notes}
        open={isFormOpen}
        openSpaceId={eventId}
        rooms={rooms}
        roomsData={roomsData}
        timeSlots={timeSlots}
        onDelete={editingNote?.id ? () => handleDeleteNoteWrapper(editingNote.id) : undefined}
        onOpenChange={handleFormOpenChange}
        onSave={handleSaveNote}
      />

      {/* Resource warning for drag and drop */}
      <ResourceWarningDialog
        confirmLabel="Mover igual"
        isPending={resourceConfirming}
        issues={resourceWarning?.issues ?? []}
        open={Boolean(resourceWarning)}
        onCancel={() => setResourceWarning(null)}
        onConfirm={() => void confirmResourceMove()}
      />

      {/* Schedule Form Modal */}
      <ScheduleFormModal
        hasTracksInSlot={
          editingSchedule
            ? notes.some((note) => note.timeSlot === `${editingSchedule.startTime} - ${editingSchedule.endTime}`)
            : false
        }
        isDeleting={deleteScheduleMutation.isPending}
        isSaving={createScheduleMutation.isPending || updateScheduleMutation.isPending}
        schedule={editingSchedule}
        schedules={schedulesData}
        talksInSlot={
          editingSchedule
            ? notes.filter((note) => note.timeSlot === `${editingSchedule.startTime} - ${editingSchedule.endTime}`)
                .length
            : 0
        }
        open={isScheduleFormOpen}
        onDelete={editingSchedule ? handleDeleteScheduleFromModal : undefined}
        onOpenChange={setIsScheduleFormOpen}
        onSave={handleSaveSchedule}
      />

      {/* Room Form Modal — same dialog the event settings page uses */}
      <RoomFormModal open={isRoomFormOpen} openSpaceId={eventId} room={editingRoom} onOpenChange={setIsRoomFormOpen} />
    </div>
  );
}
