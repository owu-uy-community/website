"use client";

import * as React from "react";
import { ORPCError } from "@orpc/client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "motion/react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { DoorOpen, Eye, Monitor, Presentation, Trash2 } from "lucide-react";

import { orpc, type Room } from "lib/orpc";
import { ROOM_ICON_KEYS, ROOM_ICONS, roomIconFor } from "lib/rooms/icons";
import { roomColorFor, ROOM_PALETTE } from "lib/rooms/palette";
import { cn } from "app/lib/utils";
import { EditorPanel, FieldError, Notice, PanelSection, SwitchRow } from "components/Admin/panel";
import { Button } from "components/shared/ui/button";
import { Input } from "components/shared/ui/input";
import { Label } from "components/shared/ui/label";
import { Textarea } from "components/shared/ui/textarea";
import { toast } from "components/shared/ui/toast-utils";

const roomFormSchema = z.object({
  name: z.string().trim().min(1, "Poné un nombre para la sala"),
  description: z.string(),
  capacity: z.string().regex(/^\d*$/, "Solo números"),
  hasTV: z.boolean(),
  hasWhiteboard: z.boolean(),
  isActive: z.boolean(),
  /** null = automatic palette color */
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Usá el formato #rrggbb o elegí uno de la paleta")
    .nullable(),
  /** null = no icon */
  icon: z.string().nullable(),
});

type RoomFormValues = z.infer<typeof roomFormSchema>;

const EMPTY_ROOM_FORM: RoomFormValues = {
  name: "",
  description: "",
  capacity: "",
  hasTV: false,
  hasWhiteboard: false,
  isActive: true,
  color: null,
  icon: null,
};

const toFormValues = (room: Room): RoomFormValues => ({
  name: room.name,
  description: room.description ?? "",
  capacity: room.capacity ? String(room.capacity) : "",
  hasTV: room.hasTV,
  hasWhiteboard: room.hasWhiteboard,
  isActive: room.isActive,
  color: room.color ?? null,
  icon: room.icon ?? null,
});

/** The ring that glides to whichever swatch or shape is picked. */
function SelectedRing({ show, layoutId }: { show: boolean; layoutId: string }) {
  if (!show) return null;

  return (
    <motion.span
      aria-hidden
      className="pointer-events-none absolute -inset-[3px] rounded-[10px] ring-2 ring-foreground"
      layoutId={layoutId}
      transition={{ type: "spring", stiffness: 500, damping: 38 }}
    />
  );
}

function ColorPicker({
  value,
  fallback,
  error,
  onChange,
}: {
  value: string | null;
  fallback: string;
  error?: string;
  onChange: (value: string | null) => void;
}) {
  const ringId = React.useId();
  const isCustom = value !== null && !(ROOM_PALETTE as readonly string[]).includes(value);

  return (
    <div className="space-y-2">
      <Label>Color</Label>
      <div className="flex flex-wrap items-center gap-2.5">
        <button
          aria-label="Color automático"
          aria-pressed={value === null}
          className="relative flex h-11 items-center gap-1.5 rounded-lg border border-border px-3 text-xs text-muted-foreground transition-colors hover:text-foreground sm:h-9"
          type="button"
          onClick={() => onChange(null)}
        >
          <SelectedRing layoutId={ringId} show={value === null} />
          <span aria-hidden className="h-3.5 w-3.5 rounded-full" style={{ backgroundColor: fallback }} />
          Auto
        </button>
        {ROOM_PALETTE.map((hex) => (
          <button
            key={hex}
            aria-label={`Color ${hex}`}
            aria-pressed={value === hex}
            className="relative h-11 w-11 rounded-lg transition-transform hover:scale-105 active:scale-95 sm:h-9 sm:w-9"
            style={{ backgroundColor: hex }}
            type="button"
            onClick={() => onChange(hex)}
          >
            <SelectedRing layoutId={ringId} show={value === hex} />
          </button>
        ))}
        <div className="relative">
          <SelectedRing layoutId={ringId} show={isCustom} />
          <Input
            aria-invalid={Boolean(error)}
            aria-label="Color personalizado (hex)"
            className="h-11 w-28 rounded-lg font-terminal text-base sm:h-9 sm:text-xs"
            placeholder="#a1ff00"
            value={value ?? ""}
            onChange={(event) => {
              const raw = event.target.value.trim();
              onChange(raw === "" ? null : raw.startsWith("#") ? raw : `#${raw}`);
            }}
          />
        </div>
      </div>
      <FieldError message={error} />
    </div>
  );
}

function IconPicker({
  value,
  color,
  onChange,
}: {
  value: string | null;
  /** Effective room color, to preview each shape as it will render. */
  color: string;
  onChange: (value: string | null) => void;
}) {
  const ringId = React.useId();

  return (
    <div className="space-y-2">
      <Label>Ícono</Label>
      <div className="flex flex-wrap items-center gap-2.5">
        <button
          aria-pressed={value === null}
          className="relative flex h-11 items-center rounded-lg border border-border px-3 text-xs text-muted-foreground transition-colors hover:text-foreground sm:h-9"
          type="button"
          onClick={() => onChange(null)}
        >
          <SelectedRing layoutId={ringId} show={value === null} />
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
                "relative flex h-11 w-11 items-center justify-center rounded-lg transition-[transform,background-color] hover:scale-105 active:scale-95 sm:h-9 sm:w-9",
                value === key ? "bg-muted" : "bg-muted/40"
              )}
              type="button"
              onClick={() => onChange(key)}
            >
              <SelectedRing layoutId={ringId} show={value === key} />
              <Shape aria-hidden className="h-4 w-4" style={{ color, fill: color }} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** How the column header will look with the current picks. */
function HeaderPreview({ name, color, icon }: { name: string; color: string; icon: string | null }) {
  const Shape = roomIconFor(icon);

  return (
    <div className="flex h-14 items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-card px-3">
      {Shape ? <Shape aria-hidden className="h-3.5 w-3.5 shrink-0" style={{ color, fill: color }} /> : null}
      <span className="truncate font-display text-sm font-semibold tracking-wide text-foreground uppercase">
        {name.trim() || "Nombre de la sala"}
      </span>
      <span aria-hidden className="ml-1 h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
    </div>
  );
}

/**
 * Create/edit a room. Owns its form and mutations so both the event settings
 * page and the board offer the same editor. Deleting is the caller's call
 * (`onDelete`): it knows how many talks would go with the room.
 */
export function RoomFormModal({
  open,
  onOpenChange,
  room,
  openSpaceId,
  onSaved,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Room being edited; null creates a new one. */
  room: Room | null;
  openSpaceId: string;
  onSaved?: () => void | Promise<void>;
  onDelete?: (room: Room) => void;
}) {
  const queryClient = useQueryClient();
  const {
    control,
    register,
    handleSubmit,
    reset,
    watch,
    setError,
    formState: { errors },
  } = useForm<RoomFormValues>({ resolver: zodResolver(roomFormSchema), defaultValues: EMPTY_ROOM_FORM });

  // Reload the form whenever the panel opens so a previous edit never leaks into the next one.
  React.useEffect(() => {
    if (open) reset(room ? toFormValues(room) : EMPTY_ROOM_FORM);
  }, [open, room, reset]);

  const showError = (error: unknown) => {
    if (error instanceof ORPCError && error.code === "CONFLICT") {
      setError("name", { message: error.message });
    } else {
      setError("root", { message: error instanceof Error && error.message ? error.message : "Error inesperado" });
    }
  };

  async function settle() {
    await queryClient.invalidateQueries({ queryKey: orpc.rooms.getByOpenSpace.key({ input: { openSpaceId } }) });
    await onSaved?.();
  }

  const createMutation = useMutation(
    orpc.rooms.create.mutationOptions({
      onSuccess: async (created) => {
        toast.success("Sala creada", `"${created.name}" se sumó a la grilla.`);
        onOpenChange(false);
        await settle();
      },
      onError: showError,
    })
  );

  const updateMutation = useMutation(
    orpc.rooms.update.mutationOptions({
      onSuccess: async () => {
        toast.success("Sala actualizada", "Los cambios ya están en la grilla.");
        onOpenChange(false);
        await settle();
      },
      onError: showError,
    })
  );

  const isSaving = createMutation.isPending || updateMutation.isPending;
  const fallbackColor = room ? roomColorFor(room.id, null) : ROOM_PALETTE[0];
  const [name, color, icon] = watch(["name", "color", "icon"]);

  const submit = handleSubmit((values) => {
    const payload = {
      name: values.name.trim(),
      description: values.description.trim() || undefined,
      capacity: values.capacity ? Number(values.capacity) : undefined,
      hasTV: values.hasTV,
      hasWhiteboard: values.hasWhiteboard,
      isActive: values.isActive,
      color: values.color,
      icon: values.icon,
    };

    if (room) updateMutation.mutate({ id: room.id, data: payload });
    else createMutation.mutate({ ...payload, openSpaceId });
  });

  return (
    <EditorPanel
      actions={
        <>
          <Button disabled={isSaving} type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button disabled={isSaving} form="room-form" type="submit">
            {isSaving ? "Guardando…" : room ? "Guardar cambios" : "Crear sala"}
          </Button>
        </>
      }
      busy={isSaving}
      danger={
        room && onDelete ? (
          <Button
            aria-label="Eliminar sala"
            className="h-11 px-3 text-destructive hover:bg-destructive/10 hover:text-destructive sm:h-10"
            disabled={isSaving}
            type="button"
            variant="ghost"
            onClick={() => onDelete(room)}
          >
            <Trash2 />
            <span className="hidden sm:inline">Eliminar</span>
          </Button>
        ) : undefined
      }
      description={
        room
          ? "Los cambios se ven al instante en la grilla y el kiosco."
          : "Se agrega como última columna de la grilla."
      }
      icon={DoorOpen}
      open={open}
      title={room ? `Editar “${room.name}”` : "Nueva sala"}
      onOpenChange={onOpenChange}
    >
      <form className="space-y-7" id="room-form" noValidate onSubmit={submit}>
        <PanelSection title="Sala">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_7rem]">
            <div className="space-y-2">
              <Label htmlFor="room-name">Nombre</Label>
              <Input
                aria-invalid={Boolean(errors.name)}
                data-autofocus
                id="room-name"
                placeholder="Sala principal"
                {...register("name")}
              />
              <FieldError message={errors.name?.message} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="room-capacity">Capacidad</Label>
              <Input
                aria-invalid={Boolean(errors.capacity)}
                id="room-capacity"
                inputMode="numeric"
                placeholder="30"
                {...register("capacity")}
              />
              <FieldError message={errors.capacity?.message} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="room-description">Descripción (opcional)</Label>
            <Textarea
              id="room-description"
              placeholder="¿Dónde queda? ¿Qué tiene de particular?"
              rows={2}
              {...register("description")}
            />
          </div>
        </PanelSection>

        <PanelSection title="Identidad">
          <HeaderPreview color={color ?? fallbackColor} icon={icon} name={name} />
          <Controller
            control={control}
            name="color"
            render={({ field, fieldState }) => (
              <ColorPicker
                error={fieldState.error?.message}
                fallback={fallbackColor}
                value={field.value}
                onChange={field.onChange}
              />
            )}
          />
          <Controller
            control={control}
            name="icon"
            render={({ field }) => (
              <IconPicker
                color={color && /^#[0-9a-fA-F]{6}$/.test(color) ? color : fallbackColor}
                value={field.value}
                onChange={field.onChange}
              />
            )}
          />
        </PanelSection>

        <PanelSection title="Equipamiento y estado">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Controller
              control={control}
              name="hasTV"
              render={({ field }) => (
                <SwitchRow
                  checked={field.value}
                  icon={Monitor}
                  id="room-tv"
                  label="TV"
                  onCheckedChange={field.onChange}
                />
              )}
            />
            <Controller
              control={control}
              name="hasWhiteboard"
              render={({ field }) => (
                <SwitchRow
                  checked={field.value}
                  icon={Presentation}
                  id="room-whiteboard"
                  label="Pizarra"
                  onCheckedChange={field.onChange}
                />
              )}
            />
          </div>
          <Controller
            control={control}
            name="isActive"
            render={({ field }) => (
              <SwitchRow
                checked={field.value}
                hint={
                  field.value
                    ? "Se ve en el kiosco y en las pantallas públicas."
                    : "Oculta en el kiosco y las pantallas; acá queda atenuada."
                }
                icon={Eye}
                id="room-active"
                label="Activa"
                onCheckedChange={field.onChange}
              />
            )}
          />
        </PanelSection>

        <Notice show={Boolean(errors.root)} tone="danger">
          {errors.root?.message}
        </Notice>
      </form>
    </EditorPanel>
  );
}
