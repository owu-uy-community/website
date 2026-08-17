"use client";

import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Monitor, Presentation } from "lucide-react";

import { orpc, type Room } from "lib/orpc";
import { ROOM_ICON_KEYS, ROOM_ICONS } from "lib/rooms/icons";
import { roomColorFor, ROOM_PALETTE } from "lib/rooms/palette";
import { cn } from "app/lib/utils";
import { Button } from "components/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "components/shared/ui/dialog";
import { Input } from "components/shared/ui/input";
import { Label } from "components/shared/ui/label";
import { Switch } from "components/shared/ui/switch";
import { Textarea } from "components/shared/ui/textarea";
import { toast } from "components/shared/ui/toast-utils";

type RoomFormState = {
  name: string;
  description: string;
  capacity: string;
  hasTV: boolean;
  hasWhiteboard: boolean;
  isActive: boolean;
  color: string | null; // null = automatic palette color
  icon: string | null; // null = no icon
};

const EMPTY_ROOM_FORM: RoomFormState = {
  name: "",
  description: "",
  capacity: "",
  hasTV: false,
  hasWhiteboard: false,
  isActive: true,
  color: null,
  icon: null,
};

function ColorPicker({
  value,
  fallback,
  onChange,
}: {
  value: string | null;
  fallback: string;
  onChange: (value: string | null) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>Color</Label>
      <div className="flex flex-wrap items-center gap-2">
        <button
          aria-label="Color automático"
          className={cn(
            "flex h-8 items-center rounded-md border px-2 text-xs",
            value === null ? "border-primary text-foreground" : "border-border text-muted-foreground"
          )}
          type="button"
          onClick={() => onChange(null)}
        >
          <span aria-hidden className="mr-1.5 h-3.5 w-3.5 rounded-full" style={{ backgroundColor: fallback }} />
          Auto
        </button>
        {ROOM_PALETTE.map((hex) => (
          <button
            key={hex}
            aria-label={`Color ${hex}`}
            className={cn(
              "h-8 w-8 rounded-md border-2 transition-transform hover:scale-105",
              value === hex ? "border-foreground" : "border-transparent"
            )}
            style={{ backgroundColor: hex }}
            type="button"
            onClick={() => onChange(hex)}
          />
        ))}
        <Input
          aria-label="Color personalizado (hex)"
          className="h-8 w-24 font-terminal text-xs"
          placeholder="#a1ff00"
          value={value ?? ""}
          onChange={(event) => {
            const raw = event.target.value.trim();
            if (raw === "") onChange(null);
            else onChange(raw.startsWith("#") ? raw : `#${raw}`);
          }}
        />
      </div>
    </div>
  );
}

function IconPicker({
  value,
  color,
  onChange,
}: {
  value: string | null;
  /** Effective room color, used to preview each shape as it will render. */
  color: string;
  onChange: (value: string | null) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>Ícono</Label>
      <div className="flex flex-wrap items-center gap-2">
        <button
          className={cn(
            "flex h-8 items-center rounded-md border px-2 text-xs",
            value === null ? "border-primary text-foreground" : "border-border text-muted-foreground"
          )}
          type="button"
          onClick={() => onChange(null)}
        >
          Sin ícono
        </button>
        {ROOM_ICON_KEYS.map((key) => {
          const Shape = ROOM_ICONS[key];

          return (
            <button
              key={key}
              aria-label={`Ícono ${key}`}
              aria-pressed={value === key}
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-md border-2 transition-transform hover:scale-105",
                value === key ? "border-foreground bg-muted" : "border-transparent bg-muted/40"
              )}
              type="button"
              onClick={() => onChange(key)}
            >
              <Shape aria-hidden className="h-4 w-4" style={{ color, fill: color }} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function RoomFormFields({
  form,
  setForm,
  fallbackColor,
}: {
  form: RoomFormState;
  setForm: (updater: (previous: RoomFormState) => RoomFormState) => void;
  fallbackColor: string;
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_120px]">
        <div className="space-y-2">
          <Label htmlFor="room-name">Nombre</Label>
          <Input
            id="room-name"
            placeholder="Sala principal"
            value={form.name}
            onChange={(event) => setForm((previous) => ({ ...previous, name: event.target.value }))}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="room-capacity">Capacidad</Label>
          <Input
            id="room-capacity"
            inputMode="numeric"
            placeholder="30"
            value={form.capacity}
            onChange={(event) =>
              setForm((previous) => ({ ...previous, capacity: event.target.value.replace(/[^0-9]/g, "") }))
            }
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="room-description">Descripción (opcional)</Label>
        <Textarea
          id="room-description"
          placeholder="¿Dónde queda? ¿Qué tiene de particular?"
          value={form.description}
          onChange={(event) => setForm((previous) => ({ ...previous, description: event.target.value }))}
        />
      </div>
      <ColorPicker
        fallback={fallbackColor}
        value={form.color}
        onChange={(color) => setForm((previous) => ({ ...previous, color }))}
      />
      <IconPicker
        color={form.color ?? fallbackColor}
        value={form.icon}
        onChange={(icon) => setForm((previous) => ({ ...previous, icon }))}
      />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <label className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
          <span className="flex items-center gap-2 text-foreground">
            <Monitor aria-hidden className="h-4 w-4 text-muted-foreground" /> TV
          </span>
          <Switch checked={form.hasTV} onCheckedChange={(hasTV) => setForm((previous) => ({ ...previous, hasTV }))} />
        </label>
        <label className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
          <span className="flex items-center gap-2 text-foreground">
            <Presentation aria-hidden className="h-4 w-4 text-muted-foreground" /> Pizarra
          </span>
          <Switch
            checked={form.hasWhiteboard}
            onCheckedChange={(hasWhiteboard) => setForm((previous) => ({ ...previous, hasWhiteboard }))}
          />
        </label>
        <label className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
          <span className="text-foreground">Activa</span>
          <Switch
            checked={form.isActive}
            onCheckedChange={(isActive) => setForm((previous) => ({ ...previous, isActive }))}
          />
        </label>
      </div>
    </div>
  );
}

/**
 * Create/edit a room. Owns its form state and mutations so both the event
 * settings page and the board itself can offer room editing without
 * duplicating the picker UI or drifting apart.
 */
export function RoomFormModal({
  open,
  onOpenChange,
  room,
  openSpaceId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Room being edited; null creates a new one. */
  room: Room | null;
  openSpaceId: string;
  onSaved?: () => void | Promise<void>;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = React.useState<RoomFormState>(EMPTY_ROOM_FORM);

  // Reload the form whenever the dialog opens so a previous edit never leaks
  // into the next one.
  React.useEffect(() => {
    if (!open) return;

    setForm(
      room
        ? {
            name: room.name,
            description: room.description ?? "",
            capacity: room.capacity ? String(room.capacity) : "",
            hasTV: room.hasTV,
            hasWhiteboard: room.hasWhiteboard,
            isActive: room.isActive,
            color: room.color ?? null,
            icon: room.icon ?? null,
          }
        : EMPTY_ROOM_FORM
    );
  }, [open, room]);

  async function settle() {
    await queryClient.invalidateQueries({
      queryKey: orpc.rooms.getByOpenSpace.key({ input: { openSpaceId } }),
    });
    await onSaved?.();
  }

  const createMutation = useMutation(
    orpc.rooms.create.mutationOptions({
      onSuccess: async (created) => {
        toast.success("Sala creada", `"${created.name}" se sumó a la grilla.`);
        onOpenChange(false);
        await settle();
      },
      onError: (error) => toast.error("No se pudo crear", error instanceof Error ? error.message : "Error inesperado"),
    })
  );

  const updateMutation = useMutation(
    orpc.rooms.update.mutationOptions({
      onSuccess: async () => {
        toast.success("Sala actualizada", "Los cambios fueron guardados.");
        onOpenChange(false);
        await settle();
      },
      onError: (error) =>
        toast.error("No se pudo guardar", error instanceof Error ? error.message : "Error inesperado"),
    })
  );

  const isSaving = createMutation.isPending || updateMutation.isPending;

  function handleSubmit() {
    if (form.color !== null && !/^#[0-9a-fA-F]{6}$/.test(form.color)) {
      toast.error("Color inválido", "Usá formato hex #rrggbb o dejá el color automático.");

      return;
    }

    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      capacity: form.capacity ? Number(form.capacity) : undefined,
      hasTV: form.hasTV,
      hasWhiteboard: form.hasWhiteboard,
      isActive: form.isActive,
      color: form.color,
      icon: form.icon,
    };

    if (room) updateMutation.mutate({ id: room.id, data: payload });
    else createMutation.mutate({ ...payload, openSpaceId });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{room ? `Editar "${room.name}"` : "Nueva sala"}</DialogTitle>
          <DialogDescription>
            {room ? "Los cambios se reflejan al instante en la grilla." : "Se agrega al final de la grilla."}
          </DialogDescription>
        </DialogHeader>

        <RoomFormFields
          fallbackColor={room ? roomColorFor(room.id, null) : ROOM_PALETTE[0]}
          form={form}
          setForm={setForm}
        />

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button disabled={!form.name.trim() || isSaving} onClick={handleSubmit}>
            {isSaving ? "Guardando…" : room ? "Guardar cambios" : "Crear sala"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
