"use client";

import * as React from "react";
import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type DropAnimation,
} from "@dnd-kit/core";
import { ArrowLeftRight, LayoutGrid, Plus, Search, SearchX } from "lucide-react";

import { AgendaHeader, VIEW_OPTIONS } from "components/Admin/agenda/AgendaHeader";
import { AgendaInspector, type InspectorTab } from "components/Admin/agenda/AgendaInspector";
import { AgendaList } from "components/Admin/agenda/AgendaList";
import { slotPhase, useAgendaView, useInspectorFits, useWallClock } from "components/Admin/agenda/agenda-state";
import {
  boardAnnouncements,
  boardCollisions,
  boardInstructions,
  boardKeyboardCodes,
  cellKeyboardCoordinates,
} from "components/Admin/agenda/board-a11y";
import { ConfirmDialog } from "components/Admin/panel";
import { RoomFormModal } from "components/Admin/rooms/RoomFormModal";
import { useCommands } from "components/Admin/shell/commands";
import { usePresence, usePresenceFocus } from "components/Admin/shell/presence";
import { useShortcuts } from "components/Admin/shell/shortcuts";
import { useShell } from "components/Admin/shell/use-shell-status";
import { EmptyState, ErrorState } from "components/Admin/ui/states";
import { StickyNoteGhost } from "components/Meetups/OpenSpace/molecules/StickyNoteCard";
import { OpenSpaceSkeleton } from "components/Meetups/OpenSpace/organisms/OpenSpaceSkeleton";
import { ResourceWarningDialog } from "components/Meetups/OpenSpace/organisms/ResourceWarningDialog";
import { ScheduleFormModal } from "components/Meetups/OpenSpace/organisms/ScheduleFormModal";
import { StructurePanel } from "components/Meetups/OpenSpace/organisms/StructurePanel";
import { TalkFormModal } from "components/Meetups/OpenSpace/organisms/TalkFormModal";
import { TimeGrid } from "components/Meetups/OpenSpace/organisms/TimeGrid";
import type { TalkSave } from "components/Meetups/OpenSpace/organisms/talk-form/types";
import { useTalkForm } from "components/Meetups/OpenSpace/organisms/talk-form/use-talk-form";
import { filterNotes, findNoteInCell } from "components/Meetups/OpenSpace/utils/calculations";
import { BOARD_EASE } from "components/Meetups/OpenSpace/utils/constants";
import { Button } from "components/shared/ui/button";
import { toast } from "components/shared/ui/toast-utils";
import { useAutoHighlight } from "hooks/useAutoHighlight";
import { useNoteManagement } from "hooks/useNoteManagement";
import { useOpenSpaceNotesORPC, type StickyNote } from "hooks/useOpenSpaceNotesORPC";
import { useOpenSpaceSetup } from "hooks/useOpenSpaceSetup";
import { useRealtimeBroadcastWithInvalidation } from "hooks/useRealtimeBroadcast";
import { useRealtimeChannel } from "hooks/useRealtimeChannel";
import { useRoomManagement } from "hooks/useRoomManagement";
import { useScheduleManagement } from "hooks/useScheduleManagement";
import type { Room, Schedule } from "lib/orpc";
import { client, orpc } from "lib/orpc";
import { eventChannel } from "lib/realtime/channels";

const slotLabel = (schedule: Schedule) => `${schedule.startTime} - ${schedule.endTime}`;

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

const DROP_ANIMATION: DropAnimation = {
  duration: 200,
  easing: `cubic-bezier(${BOARD_EASE.join(", ")})`,
  // The real card hides itself (isActive/isSettling → opacity-0) until
  // `settlingId` clears in sync with this duration, so the ghost is the only
  // visible copy while it glides into place.
};

/**
 * Wait for the command palette to finish closing before taking focus: the dialog hands focus back
 * to whatever had it when it unmounts, which would undo ours.
 */
function focusAfterPalette(target: () => HTMLElement | null, attempt = 0) {
  if (document.querySelector("[cmdk-root]") && attempt < 20) {
    window.setTimeout(() => focusAfterPalette(target, attempt + 1), 50);
    return;
  }
  window.setTimeout(() => target()?.focus(), 0);
}

export default function OpenSpaceClient({
  eventId,
  eventHref,
  kioskHref,
}: {
  eventId: string;
  /** Admin detail page of the event (for the empty-state CTA). */
  eventHref?: string;
  /** Public kiosk grid of the event, for the venue screen. */
  kioskHref?: string;
}) {
  const queryClient = useQueryClient();
  const { status } = useShell();
  const { peers } = usePresence();
  const [view, setView] = useAgendaView();
  const inspectorFits = useInspectorFits();
  const wall = useWallClock(status?.event.timezone);

  // Fetch data
  const {
    notes,
    loading: notesLoading,
    error: dbError,
    isError: notesFailed,
    createNote,
    updateNote,
    deleteNote,
    swapNotes,
    refreshNotes,
    isCreating,
    isUpdating,
    recentlyUpdatedIds,
  } = useOpenSpaceNotesORPC({ openSpaceId: eventId, enableRealtime: true });

  const {
    rooms,
    roomColors,
    roomIcons,
    roomsByName,
    roomsData,
    timeSlots,
    schedulesData,
    isLoading: setupLoading,
    loadFailed: setupFailed,
    retry: retrySetup,
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
  const searchRef = useRef<HTMLInputElement>(null);
  const [editingNote, setEditingNote] = useState<StickyNote | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  /** The sheet was opened from "Sugerir con IA": it places the talk once it has a title. */
  const [formSuggest, setFormSuggest] = useState(false);
  const [highlightedNoteId, setHighlightedNoteId] = useState<string | null>(null);

  // The inspector (wide screens): which talk, which tab.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("charla");
  /** What to do once unsaved inspector changes are confirmed as discarded. */
  const [pendingLeave, setPendingLeave] = useState<(() => void) | null>(null);

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

  // Restore the persisted cast state so the toggle reflects reality after reloads,
  // then follow it: ⌘K or another screen can cast too.
  useEffect(() => {
    client.cast
      .getState({ eventId })
      .then((state) => setHighlightedNoteId(state.trackId))
      .catch(() => undefined);
  }, [eventId]);
  useRealtimeChannel(eventChannel(eventId, "cast"), (event, payload) => {
    if (event === "note_highlighted")
      setHighlightedNoteId((payload as { note: StickyNote | null } | null)?.note?.id ?? null);
  });

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
  const [isStructureOpen, setIsStructureOpen] = useState(false);
  // A room or slot that holds talks: deleting it waits for this confirmation.
  const [pendingDelete, setPendingDelete] = useState<
    { kind: "room"; room: Room; talks: number } | { kind: "slot"; schedule: Schedule; talks: number } | null
  >(null);

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

  const { deleteRoom, reorderRooms, setRoomActive, isDeletingRoom } = useRoomManagement(eventId);

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

  // ============ The inspector ============

  const showInspector = inspectorOpen && inspectorFits;
  const selectedNote = useMemo(
    () => (selectedId ? (notes.find((note) => note.id === selectedId) ?? null) : null),
    [notes, selectedId]
  );
  const selectedSchedule = selectedNote
    ? schedulesData.find((schedule) => schedule.id === selectedNote.scheduleId)
    : undefined;

  const saveSelected = useCallback(
    async (noteData: TalkSave) => {
      if (selectedNote) await handleSaveNoteBase(noteData, selectedNote, rooms, timeSlots, eventId);
    },
    [handleSaveNoteBase, selectedNote, rooms, timeSlots, eventId]
  );

  // Owned here, not by the inspector, so the header's "Sugerir con IA" can place the open talk.
  const inspectorForm = useTalkForm({
    open: showInspector && selectedNote != null,
    openSpaceId: eventId,
    note: selectedNote,
    notes,
    rooms,
    roomsData,
    timeSlots,
    onSave: saveSelected,
  });
  const inspectorDirty = showInspector && selectedNote != null && inspectorForm.isDirty;

  /** Leaving the open talk (another card, a new talk, closing): ask first if it has unsaved changes. */
  const leaveInspectorThen = useCallback(
    (next: () => void) => {
      if (inspectorDirty) setPendingLeave(() => next);
      else next();
    },
    [inspectorDirty]
  );

  const closeInspector = useCallback(
    () =>
      leaveInspectorThen(() => {
        setInspectorOpen(false);
        setSelectedId(null);
      }),
    [leaveInspectorThen]
  );

  // Others see who has which talk open; so do I.
  usePresenceFocus(
    showInspector && selectedNote ? selectedNote.id : isFormOpen && editingNote?.id ? editingNote.id : null
  );
  const editors = useMemo(
    () =>
      new Map(
        peers.flatMap((peer) => (peer.focus ? [[peer.focus, { name: peer.name, image: peer.image }] as const] : []))
      ),
    [peers]
  );

  // ============ Drag and drop (dnd-kit) ============

  const sensors = useSensors(
    // 6px of travel before a drag starts — a plain click opens the editor.
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    // Space picks a card up; the arrows carry it cell by cell.
    useSensor(KeyboardSensor, { coordinateGetter: cellKeyboardCoordinates, keyboardCodes: boardKeyboardCodes })
  );

  const notesRef = useRef(notes);
  useEffect(() => {
    notesRef.current = notes;
  }, [notes]);
  const announcements = useMemo(
    () =>
      boardAnnouncements(
        (cell, exceptId) => findNoteInCell(notesRef.current, cell.room, cell.timeSlot, exceptId)?.title ?? null
      ),
    []
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
    async (noteData: TalkSave) => {
      await handleSaveNoteBase(noteData, editingNote, rooms, timeSlots, eventId);
      setEditingNote(null);
      setIsFormOpen(false);
    },
    [handleSaveNoteBase, editingNote, rooms, timeSlots, eventId]
  );

  // Gone at once; the toast that follows offers "Deshacer" (errors roll back and toast in the hook).
  const handleDeleteNoteWrapper = useCallback(
    (noteId: string) => {
      setIsFormOpen(false);
      setEditingNote(null);
      if (noteId === selectedId) {
        setInspectorOpen(false);
        setSelectedId(null);
      }
      void handleDeleteNote(noteId).catch(() => undefined);
    },
    [handleDeleteNote, selectedId]
  );

  const addNewNote = useCallback(
    (prefilledData?: { room?: string; timeSlot?: string }, suggest = false) =>
      leaveInspectorThen(() => {
        // One talk form at a time: the inspector's fields share their ids with the sheet's.
        setInspectorOpen(false);
        setSelectedId(null);
        setEditingNote(prefilledData ? ({ id: "", title: "", speaker: "", ...prefilledData } as StickyNote) : null);
        setFormSuggest(suggest);
        setIsFormOpen(true);
      }),
    [leaveInspectorThen]
  );

  /** A card or a row: in the inspector on wide screens, in the sheet on narrow ones. */
  const openNote = useCallback(
    (note: StickyNote) => {
      if (!inspectorFits) {
        setEditingNote(note);
        setFormSuggest(false);
        setIsFormOpen(true);
        return;
      }
      if (note.id === selectedId && inspectorOpen) {
        setInspectorTab("charla");
        return;
      }
      leaveInspectorThen(() => {
        setSelectedId(note.id);
        setInspectorTab("charla");
        setInspectorOpen(true);
      });
    },
    [inspectorFits, selectedId, inspectorOpen, leaveInspectorThen]
  );

  // The sheet edits the talk as it is now, not as it was when it opened: an edit or a move from
  // another screen has to reach the form, or saving it would undo them.
  const sheetNote = editingNote?.id ? (notes.find((note) => note.id === editingNote.id) ?? editingNote) : editingNote;

  // Handle modal close - clear editing note state
  const handleFormOpenChange = useCallback((open: boolean) => {
    setIsFormOpen(open);
    if (!open) {
      setEditingNote(null);
    }
  }, []);

  // ============ Schedule handlers ============

  const openRoomEditor = useCallback((room: Room | null) => {
    setEditingRoom(room);
    setIsRoomFormOpen(true);
  }, []);

  const openSlotEditor = useCallback((schedule: Schedule | null) => {
    setEditingSchedule(schedule);
    setIsScheduleFormOpen(true);
  }, []);

  const handleEditSchedule = useCallback(
    (timeIndex: number) => {
      const schedule = schedulesData[timeIndex];
      if (schedule) openSlotEditor(schedule);
    },
    [schedulesData, openSlotEditor]
  );

  const handleAddScheduleClick = useCallback(() => openSlotEditor(null), [openSlotEditor]);

  const handleAddRoomClick = useCallback(() => openRoomEditor(null), [openRoomEditor]);

  // Room headers are the natural place to fix a room: click the column.
  const handleEditRoomClick = useCallback(
    (roomName: string) => {
      const room = roomsData.find((candidate) => candidate.name === roomName);
      if (room) openRoomEditor(room);
    },
    [roomsData, openRoomEditor]
  );

  const inactiveRooms = useMemo(
    () => new Set(roomsData.filter((room) => !room.isActive).map((room) => room.name)),
    [roomsData]
  );

  // ============ Deletes ============
  // An empty room or slot goes at once; one holding talks asks first, naming how many go with it.

  const requestDeleteRoom = useCallback(
    (room: Room) => {
      setIsRoomFormOpen(false);
      const talks = notes.filter((note) => note.roomId === room.id).length;
      if (talks > 0) setPendingDelete({ kind: "room", room, talks });
      else void deleteRoom(room).catch(() => undefined);
    },
    [notes, deleteRoom]
  );

  const requestDeleteSlot = useCallback(
    (schedule: Schedule) => {
      setIsScheduleFormOpen(false);
      const talks = notes.filter((note) => note.scheduleId === schedule.id).length;
      if (talks > 0) setPendingDelete({ kind: "slot", schedule, talks });
      else void handleDeleteSchedule(schedule.id, slotLabel(schedule)).catch(() => undefined);
    },
    [notes, handleDeleteSchedule]
  );

  const confirmPendingDelete = useCallback(async () => {
    if (!pendingDelete) return;
    try {
      if (pendingDelete.kind === "room") await deleteRoom(pendingDelete.room);
      else await handleDeleteSchedule(pendingDelete.schedule.id, slotLabel(pendingDelete.schedule));
    } catch {
      // Rolled back and toasted by the mutation.
    } finally {
      setPendingDelete(null);
    }
  }, [pendingDelete, deleteRoom, handleDeleteSchedule]);

  /** Times through the usual save; the kiosk star (one row at a time) through its own toggle. */
  const handleSaveScheduleForm = useCallback(
    async (data: { startTime: string; endTime: string; scheduleId?: string; highlightInKiosk: boolean }) => {
      const current = data.scheduleId ? schedulesData.find((schedule) => schedule.id === data.scheduleId) : null;
      if (!current || current.startTime !== data.startTime || current.endTime !== data.endTime) {
        await handleSaveSchedule(data);
      }
      if (current && current.highlightInKiosk !== data.highlightInKiosk) {
        await handleToggleScheduleHighlight(current.id);
      }
    },
    [schedulesData, handleSaveSchedule, handleToggleScheduleHighlight]
  );

  const handleToggleScheduleHighlightWrapper = useCallback(
    (timeIndex: number) => {
      const schedule = schedulesData[timeIndex];
      if (schedule) void handleToggleScheduleHighlight(schedule.id);
    },
    [handleToggleScheduleHighlight, schedulesData]
  );

  // Cast to screen functionality (persisted server-side + broadcast over WebSockets)
  const handleCastToScreen = useCallback(
    async (note: StickyNote) => {
      try {
        // Toggle: if already highlighted, clear it
        if (highlightedNoteId === note.id) {
          await client.cast.setHighlightedNote({ eventId, trackId: null });
          setHighlightedNoteId(null);
          toast.info("Pantalla limpiada", "La pantalla de notas quedó libre.");
        } else {
          await client.cast.setHighlightedNote({ eventId, trackId: note.id });
          setHighlightedNoteId(note.id);
          toast.success("Enviado a pantalla", `"${note.title}" se está mostrando en la pantalla de notas.`);
        }
      } catch (error) {
        console.error("Failed to cast to screen:", error);
        toast.error("No se pudo enviar", "Probá nuevamente en unos segundos.");
      }
    },
    [eventId, highlightedNoteId]
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
  const nowSlot = wall ? (schedulesData.find((schedule) => slotPhase(schedule, wall) === "now") ?? null) : null;
  const onBoard = useMemo(() => new Set(notes.map((note) => note.id)), [notes]);

  const places = rooms.length * timeSlots.length;
  const free = Math.max(0, places - notes.length);
  const summary =
    places === 0
      ? plural(notes.length, "charla", "charlas")
      : `${plural(notes.length, "charla", "charlas")} · ${
          free === 0 ? "sin lugares libres" : plural(free, "lugar libre", "lugares libres")
        }`;

  /** "Sugerir con IA": re-place the open talk, or start a new one the AI places once it has a title. */
  const suggestWithAi = useCallback(() => {
    if (showInspector && selectedNote) {
      setInspectorTab("charla");
      void inspectorForm.handleAiSuggest();
    } else {
      addNewNote(undefined, true);
    }
  }, [showInspector, selectedNote, inspectorForm, addNewNote]);

  const focusSearch = useCallback(() => focusAfterPalette(() => searchRef.current), []);

  // ============ Keyboard and ⌘K ============

  useShortcuts([
    {
      id: "agenda.new",
      keys: "n",
      label: "Nueva charla",
      group: "Agenda",
      run: () => {
        if (isGridReady) addNewNote();
      },
    },
    {
      id: "agenda.search",
      keys: "/",
      label: "Buscar charla",
      group: "Agenda",
      run: () => searchRef.current?.focus(),
    },
    {
      id: "agenda.cast",
      keys: "c",
      label: "Mandar la charla abierta a la pantalla",
      group: "Agenda",
      run: () => {
        if (showInspector && selectedNote) void handleCastToScreen(selectedNote);
      },
    },
    ...(showInspector
      ? [{ id: "agenda.close", keys: "escape", label: "Cerrar el panel", group: "Agenda", run: closeInspector }]
      : []),
    ...(inspectorDirty
      ? [
          {
            id: "agenda.save",
            keys: "mod+s",
            label: "Guardar la charla",
            group: "Agenda",
            allowInInputs: true,
            run: () => void inspectorForm.submitForm(),
          },
        ]
      : []),
  ]);

  useCommands(
    "agenda",
    "page",
    [
      {
        id: "agenda.new",
        title: "Nueva charla",
        icon: Plus,
        shortcut: "n",
        keywords: ["agregar", "crear", "talk"],
        perform: { type: "run", run: () => addNewNote() },
      },
      {
        id: "agenda.search",
        title: "Buscar charla",
        icon: Search,
        shortcut: "/",
        keywords: ["filtrar", "orador"],
        perform: { type: "run", run: focusSearch },
      },
      ...VIEW_OPTIONS.map(({ value, label, icon }) => ({
        id: `agenda.view.${value}`,
        title: `Ver como ${label}`,
        subtitle: view === value ? "la vista de ahora" : undefined,
        icon,
        keywords: ["vista", "grilla", "tabla"],
        perform: { type: "run" as const, run: () => setView(value) },
      })),
    ],
    "Agenda"
  );

  // Loading state
  if (notesLoading || setupLoading) {
    return <OpenSpaceSkeleton />;
  }

  // A failed load must not look like an empty board.
  if (setupFailed || (notesFailed && notes.length === 0)) {
    return (
      <div className="mx-auto w-full max-w-xl px-4 pt-10">
        <ErrorState
          description="Revisá la conexión y probá de nuevo: las charlas siguen guardadas."
          title="No se pudo cargar la agenda"
          onRetry={() => {
            retrySetup();
            void refreshNotes();
          }}
        />
      </div>
    );
  }

  const board = !isGridReady ? (
    <EmptyState
      action={
        <>
          <Button onClick={() => setIsStructureOpen(true)}>
            <LayoutGrid />
            Salas y horarios
          </Button>
          {eventHref ? (
            <Button asChild variant="outline">
              <Link href={eventHref}>Ajustes del evento</Link>
            </Button>
          ) : null}
        </>
      }
      className="m-4 md:m-6"
      description={
        rooms.length === 0
          ? "Las salas son las columnas de la grilla y los bloques sus filas. Empezá por las salas."
          : `Ya hay ${plural(rooms.length, "sala", "salas")}. Faltan los bloques: son las filas donde van las charlas.`
      }
      icon={LayoutGrid}
      title="La grilla todavía no está armada"
    />
  ) : noResults ? (
    <EmptyState
      action={
        <Button variant="outline" onClick={() => setSearchTerm("")}>
          Limpiar la búsqueda
        </Button>
      }
      className="m-4 md:m-6"
      description="Probá con otro título u orador."
      icon={SearchX}
      title={`Sin resultados para «${searchTerm}»`}
    />
  ) : view === "list" ? (
    notes.length === 0 ? (
      <EmptyState
        action={
          <Button onClick={() => addNewNote()}>
            <Plus />
            Charla
          </Button>
        }
        className="m-4 md:m-6"
        description="Las que agregue el staff, Owy o el lector de fotos aparecen acá."
        icon={LayoutGrid}
        title="Todavía no hay charlas"
      />
    ) : (
      <div
        aria-label="Lista de charlas"
        className="openspace-surface min-h-0 min-w-0 flex-1 overflow-auto"
        role="region"
        tabIndex={0}
      >
        <AgendaList
          notes={filteredNotes}
          roomColors={roomColors}
          rooms={roomsData}
          schedules={schedulesData}
          selectedId={showInspector ? selectedId : null}
          wall={wall}
          onOpen={openNote}
        />
      </div>
    )
  ) : (
    <DndContext
      accessibility={{ announcements, screenReaderInstructions: boardInstructions }}
      collisionDetection={boardCollisions}
      sensors={sensors}
      onDragCancel={handleDragCancel}
      onDragEnd={handleDragEnd}
      onDragOver={handleDragOver}
      onDragStart={handleDragStart}
    >
      {rooms.length > 1 && (
        <p
          className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-1.5 text-meta text-muted-foreground md:hidden"
          id="board-scroll-hint"
        >
          <ArrowLeftRight aria-hidden className="size-3.5 shrink-0" />
          Deslizá la grilla para ver todas las salas.
        </p>
      )}
      <div
        aria-describedby={rooms.length > 1 ? "board-scroll-hint" : undefined}
        aria-label="Grilla de charlas"
        className="openspace-surface min-h-0 min-w-0 flex-1 overflow-auto"
        role="region"
        tabIndex={0}
      >
        <TimeGrid
          activeNote={activeNote}
          editors={editors}
          flipRects={flipRects}
          getNotesForCell={getNotesForCell}
          highlightedNoteId={highlightedNoteId}
          inactiveRooms={inactiveRooms}
          lastDragEndAt={lastDragEndAt}
          nowSlot={nowSlot ? slotLabel(nowSlot) : null}
          recentlyUpdatedIds={recentlyUpdatedIds}
          roomColors={roomColors}
          roomIcons={roomIcons}
          rooms={rooms}
          roomsByName={roomsByName}
          schedulesData={schedulesData}
          selectedNoteId={showInspector ? selectedId : null}
          settlingId={settlingId}
          swapPreviewId={swapPreviewNote?.id ?? null}
          swapPreviewOffset={swapPreviewOffset}
          timeSlots={timeSlots}
          variant={view}
          onCastNote={handleCastToScreen}
          onEditRoom={handleEditRoomClick}
          onEditSchedule={handleEditSchedule}
          onEmptyCellClick={(room, timeSlot) => addNewNote({ room, timeSlot })}
          onOpenNote={openNote}
          onToggleScheduleHighlight={handleToggleScheduleHighlightWrapper}
        />
      </div>

      <DragOverlay dropAnimation={DROP_ANIMATION} zIndex={50}>
        {activeNote ? (
          <StickyNoteGhost color={roomColors?.[activeNote.room] ?? "#a1a1aa"} note={activeNote} variant={view} />
        ) : null}
      </DragOverlay>
    </DndContext>
  );

  return (
    // On desktop the scroller's own height, so an urgent banner above doesn't push the board's bottom off screen.
    <div className="flex h-(--admin-content-h) min-h-0 flex-col md:h-full">
      <AgendaHeader
        autoHighlight={{
          enabled: autoHighlightEnabled,
          disabled: openSpaceLoading || updateOpenSpaceMutation.isPending,
          toggle: () => void handleToggleAutoHighlight(),
        }}
        eventId={eventId}
        kioskHref={kioskHref}
        ready={isGridReady}
        search={searchTerm}
        searchRef={searchRef}
        summary={summary}
        view={view}
        onNew={() => addNewNote()}
        onSearchChange={setSearchTerm}
        onStructure={() => setIsStructureOpen(true)}
        onSuggest={suggestWithAi}
        onViewChange={setView}
      />

      {/* Size containment: the board and the inspector scroll inside this row, so their content
          must not stretch the page around them. */}
      <div className="flex min-h-0 flex-1 contain-size">
        <div className="flex min-w-0 flex-1 flex-col">{board}</div>

        {showInspector ? (
          <AgendaInspector
            color={selectedNote ? (roomColors[selectedNote.room] ?? "#a1a1aa") : "#a1a1aa"}
            controller={inspectorForm}
            eventId={eventId}
            isCast={selectedNote != null && highlightedNoteId === selectedNote.id}
            isSaving={isUpdating}
            note={selectedNote}
            rooms={rooms}
            roomsData={roomsData}
            schedule={selectedSchedule}
            tab={inspectorTab}
            timeSlots={timeSlots}
            wall={wall}
            onBoard={onBoard}
            onCast={() => selectedNote && void handleCastToScreen(selectedNote)}
            onClose={closeInspector}
            onDelete={() => selectedNote && handleDeleteNoteWrapper(selectedNote.id)}
            onSelect={(id) => {
              const note = notes.find((candidate) => candidate.id === id);
              if (note) openNote(note);
            }}
            onTabChange={setInspectorTab}
            onToggleKiosk={() => selectedNote && void handleToggleScheduleHighlight(selectedNote.scheduleId)}
          />
        ) : null}
      </div>

      {/* Talk form */}
      <TalkFormModal
        isSaving={editingNote?.id ? isUpdating : isCreating}
        note={sheetNote}
        notes={notes}
        open={isFormOpen}
        openSpaceId={eventId}
        rooms={rooms}
        roomsData={roomsData}
        suggest={formSuggest}
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

      {/* Slot editor */}
      <ScheduleFormModal
        isSaving={createScheduleMutation.isPending || updateScheduleMutation.isPending}
        open={isScheduleFormOpen}
        schedule={editingSchedule}
        schedules={schedulesData}
        talksInSlot={editingSchedule ? notes.filter((note) => note.scheduleId === editingSchedule.id).length : 0}
        onDelete={editingSchedule ? () => requestDeleteSlot(editingSchedule) : undefined}
        onOpenChange={setIsScheduleFormOpen}
        onSave={handleSaveScheduleForm}
      />

      {/* Room editor — same one the event settings page uses */}
      <RoomFormModal
        open={isRoomFormOpen}
        openSpaceId={eventId}
        room={editingRoom}
        onDelete={requestDeleteRoom}
        onOpenChange={setIsRoomFormOpen}
      />

      <StructurePanel
        notes={notes}
        open={isStructureOpen}
        rooms={roomsData}
        schedules={schedulesData}
        onAddRoom={handleAddRoomClick}
        onAddSlot={handleAddScheduleClick}
        onDeleteRoom={requestDeleteRoom}
        onDeleteSlot={requestDeleteSlot}
        onEditRoom={openRoomEditor}
        onEditSlot={openSlotEditor}
        onOpenChange={setIsStructureOpen}
        onReorderRooms={reorderRooms}
        onSetRoomActive={setRoomActive}
        onToggleSlotHighlight={(schedule) => void handleToggleScheduleHighlight(schedule.id)}
      />

      <ConfirmDialog
        confirmLabel={pendingDelete?.kind === "slot" ? "Eliminar horario" : "Eliminar sala"}
        description={
          pendingDelete
            ? `${pendingDelete.talks === 1 ? "La charla" : `Las ${plural(pendingDelete.talks, "charla", "charlas")}`} de ${
                pendingDelete.kind === "room" ? "esta sala" : "este bloque"
              } también se ${pendingDelete.talks === 1 ? "elimina" : "eliminan"}. Esta acción no se puede deshacer.`
            : ""
        }
        open={Boolean(pendingDelete)}
        pending={isDeletingRoom || deleteScheduleMutation.isPending}
        title={
          pendingDelete?.kind === "room"
            ? `¿Eliminar la sala “${pendingDelete.room.name}”?`
            : pendingDelete?.kind === "slot"
              ? `¿Eliminar el horario ${slotLabel(pendingDelete.schedule)}?`
              : ""
        }
        onConfirm={() => void confirmPendingDelete()}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      />

      <ConfirmDialog
        confirmLabel="Descartar"
        description={`Los cambios a «${selectedNote?.title ?? "la charla"}» no se guardaron.`}
        open={pendingLeave !== null}
        title="¿Descartar los cambios?"
        onConfirm={() => {
          const next = pendingLeave;
          setPendingLeave(null);
          inspectorForm.discardChanges();
          next?.();
        }}
        onOpenChange={(open) => !open && setPendingLeave(null)}
      />
    </div>
  );
}
