"use client";

import * as React from "react";
import { AnimatePresence, Reorder, motion, useDragControls } from "motion/react";
import { Clock, DoorOpen, GripVertical, LayoutGrid, Pencil, Plus, Star, Trash2 } from "lucide-react";

import { cn } from "app/lib/utils";
import { EditorPanel, FadeIn, SegmentedTabsList } from "components/Admin/panel";
import { Button } from "components/shared/ui/button";
import { Switch } from "components/shared/ui/switch";
import { Tabs, TabsContent } from "components/shared/ui/tabs";
import type { Room, Schedule, StickyNote } from "lib/orpc";
import { roomIconFor } from "lib/rooms/icons";
import { roomColorFor } from "lib/rooms/palette";

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

const ROW_MOTION = {
  initial: { opacity: 0, y: -6 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, scale: 0.97, transition: { duration: 0.15 } },
};

function AddRow({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/[0.04] hover:text-foreground"
      type="button"
      onClick={onClick}
    >
      <Plus aria-hidden className="h-4 w-4" />
      {label}
    </button>
  );
}

function RoomRow({
  room,
  talks,
  onDragEnd,
  onMove,
  onEdit,
  onDelete,
  onSetActive,
}: {
  room: Room;
  talks: number;
  onDragEnd: () => void;
  /** Keyboard reorder: -1 = one column left, 1 = one right. */
  onMove: (direction: -1 | 1) => void;
  onEdit: () => void;
  onDelete: () => void;
  onSetActive: (active: boolean) => void;
}) {
  const controls = useDragControls();
  const color = roomColorFor(room.id, room.color);
  const Shape = roomIconFor(room.icon);

  return (
    <Reorder.Item
      {...ROW_MOTION}
      className={cn(
        "flex items-center gap-2 rounded-xl border border-border bg-card py-2 pr-1.5 pl-1",
        !room.isActive && "bg-muted/30"
      )}
      dragControls={controls}
      dragListener={false}
      value={room}
      whileDrag={{ scale: 1.02, boxShadow: "0 12px 32px -12px rgba(0,0,0,0.6)", zIndex: 1 }}
      onDragEnd={onDragEnd}
    >
      <button
        aria-label={`Mover ${room.name} (flechas arriba/abajo)`}
        className="flex h-10 w-8 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden active:cursor-grabbing"
        type="button"
        onKeyDown={(event) => {
          if (event.key === "ArrowUp" || event.key === "ArrowDown") {
            event.preventDefault();
            onMove(event.key === "ArrowUp" ? -1 : 1);
          }
        }}
        onPointerDown={(event) => controls.start(event)}
      >
        <GripVertical aria-hidden className="h-4 w-4" />
      </button>
      <span aria-hidden className="h-9 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      <div className={cn("min-w-0 flex-1", !room.isActive && "opacity-60")}>
        <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
          {Shape ? <Shape aria-hidden className="h-3.5 w-3.5 shrink-0" style={{ color, fill: color }} /> : null}
          <span className="truncate">{room.name}</span>
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {[
            room.capacity ? `${room.capacity} pers.` : null,
            room.hasTV ? "TV" : null,
            room.hasWhiteboard ? "Pizarra" : null,
            plural(talks, "charla", "charlas"),
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
      <Switch
        aria-label={`${room.name} activa`}
        checked={room.isActive}
        title={room.isActive ? "Activa: visible en el kiosco" : "Inactiva: oculta en el kiosco"}
        onCheckedChange={onSetActive}
      />
      <Button
        aria-label={`Editar ${room.name}`}
        className="h-10 w-10 shrink-0"
        size="icon"
        variant="ghost"
        onClick={onEdit}
      >
        <Pencil />
      </Button>
      <Button
        aria-label={`Eliminar ${room.name}`}
        className="h-10 w-10 shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        size="icon"
        variant="ghost"
        onClick={onDelete}
      >
        <Trash2 />
      </Button>
    </Reorder.Item>
  );
}

function SlotRow({
  schedule,
  talks,
  onEdit,
  onDelete,
  onToggleHighlight,
}: {
  schedule: Schedule;
  talks: number;
  onEdit: () => void;
  onDelete: () => void;
  onToggleHighlight: () => void;
}) {
  const label = `${schedule.startTime} - ${schedule.endTime}`;

  return (
    <motion.li
      {...ROW_MOTION}
      layout
      className={cn(
        "flex items-center gap-2 rounded-xl border bg-card py-2 pr-1.5 pl-3",
        schedule.highlightInKiosk ? "border-primary/40 bg-primary/[0.04]" : "border-border"
      )}
    >
      <Clock aria-hidden className="h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="font-terminal text-sm font-medium text-foreground tabular-nums">{label}</p>
        <p className="truncate text-xs text-muted-foreground">
          {plural(talks, "charla", "charlas")}
          {schedule.highlightInKiosk ? " · resaltado en el kiosco" : ""}
        </p>
      </div>
      <Button
        aria-label={schedule.highlightInKiosk ? `Quitar ${label} del kiosco` : `Resaltar ${label} en el kiosco`}
        aria-pressed={schedule.highlightInKiosk}
        className={cn(
          "h-10 w-10 shrink-0",
          schedule.highlightInKiosk ? "text-primary hover:text-primary" : "text-muted-foreground"
        )}
        size="icon"
        variant="ghost"
        onClick={onToggleHighlight}
      >
        <Star className={cn(schedule.highlightInKiosk && "fill-current")} />
      </Button>
      <Button
        aria-label={`Editar ${label}`}
        className="h-10 w-10 shrink-0"
        size="icon"
        variant="ghost"
        onClick={onEdit}
      >
        <Pencil />
      </Button>
      <Button
        aria-label={`Eliminar ${label}`}
        className="h-10 w-10 shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        size="icon"
        variant="ghost"
        onClick={onDelete}
      >
        <Trash2 />
      </Button>
    </motion.li>
  );
}

/**
 * "Salas y horarios": the board's columns and rows as lists — the one place
 * to reorder rooms, switch them on/off, and reach every room and slot action
 * with real tap targets on a phone (the grid headers are small there).
 * Editing opens the regular editors on top of this panel.
 */
export function StructurePanel({
  open,
  onOpenChange,
  rooms,
  schedules,
  notes,
  onAddRoom,
  onEditRoom,
  onDeleteRoom,
  onReorderRooms,
  onSetRoomActive,
  onAddSlot,
  onEditSlot,
  onDeleteSlot,
  onToggleSlotHighlight,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rooms: Room[];
  schedules: Schedule[];
  notes: StickyNote[];
  onAddRoom: () => void;
  onEditRoom: (room: Room) => void;
  onDeleteRoom: (room: Room) => void;
  onReorderRooms: (ordered: Room[]) => void;
  onSetRoomActive: (room: Room, active: boolean) => void;
  onAddSlot: () => void;
  onEditSlot: (schedule: Schedule) => void;
  onDeleteSlot: (schedule: Schedule) => void;
  onToggleSlotHighlight: (schedule: Schedule) => void;
}) {
  const [tab, setTab] = React.useState("rooms");
  // The order being dragged; null = follow the server's order.
  const [draft, setDraft] = React.useState<Room[] | null>(null);
  const list = draft ?? rooms;

  const talksPerRoom = (roomId: string) => notes.filter((note) => note.roomId === roomId).length;
  const talksPerSlot = (scheduleId: string) => notes.filter((note) => note.scheduleId === scheduleId).length;

  const commitDraft = () => {
    if (draft && draft.some((room, index) => room.id !== rooms[index]?.id)) onReorderRooms(draft);
    setDraft(null);
  };

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= rooms.length) return;
    const reordered = [...rooms];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(target, 0, moved);
    onReorderRooms(reordered);
  };

  return (
    <EditorPanel
      description="El orden de las salas es el de las columnas de la grilla."
      icon={LayoutGrid}
      open={open}
      title="Salas y horarios"
      onOpenChange={onOpenChange}
    >
      <Tabs value={tab} onValueChange={setTab}>
        <SegmentedTabsList
          className="mb-5"
          items={[
            { value: "rooms", label: `Salas · ${rooms.length}`, icon: DoorOpen },
            { value: "slots", label: `Horarios · ${schedules.length}`, icon: Clock },
          ]}
          value={tab}
        />

        <TabsContent className="mt-0" value="rooms">
          <FadeIn className="space-y-2">
            {rooms.length > 1 ? (
              <p className="text-xs text-muted-foreground">
                Arrastrá desde el ícono ⋮⋮ (o usá las flechas) para reordenar.
              </p>
            ) : null}
            <Reorder.Group axis="y" className="space-y-2" values={list} onReorder={setDraft}>
              <AnimatePresence initial={false}>
                {list.map((room, index) => (
                  <RoomRow
                    key={room.id}
                    room={room}
                    talks={talksPerRoom(room.id)}
                    onDelete={() => onDeleteRoom(room)}
                    onDragEnd={commitDraft}
                    onEdit={() => onEditRoom(room)}
                    onMove={(direction) => move(index, direction)}
                    onSetActive={(active) => onSetRoomActive(room, active)}
                  />
                ))}
              </AnimatePresence>
            </Reorder.Group>
            <AddRow label="Nueva sala" onClick={onAddRoom} />
          </FadeIn>
        </TabsContent>

        <TabsContent className="mt-0" value="slots">
          <FadeIn className="space-y-2">
            <ul className="space-y-2">
              <AnimatePresence initial={false}>
                {schedules.map((schedule) => (
                  <SlotRow
                    key={schedule.id}
                    schedule={schedule}
                    talks={talksPerSlot(schedule.id)}
                    onDelete={() => onDeleteSlot(schedule)}
                    onEdit={() => onEditSlot(schedule)}
                    onToggleHighlight={() => onToggleSlotHighlight(schedule)}
                  />
                ))}
              </AnimatePresence>
            </ul>
            <AddRow label="Nuevo horario" onClick={onAddSlot} />
          </FadeIn>
        </TabsContent>
      </Tabs>
    </EditorPanel>
  );
}
