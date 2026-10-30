"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import * as ToggleGroup from "@radix-ui/react-toggle-group";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Camera, LoaderCircle, LockKeyhole, Siren, Trash2, X } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import * as z from "zod";

import { cn } from "app/lib/utils";
import { ConfirmDialog, EditorPanel, FieldError, Notice, PanelSection, SwitchRow } from "components/Admin/panel";
import { Button } from "components/shared/ui/button";
import { Input } from "components/shared/ui/input";
import { Label } from "components/shared/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "components/shared/ui/select";
import { Textarea } from "components/shared/ui/textarea";
import { toast } from "components/shared/ui/toast-utils";
import { orpc } from "lib/orpc";
import {
  IncidentCategorySchema,
  IncidentSeveritySchema,
  MAX_PHOTO_BYTES,
  type IncidentDetail,
} from "lib/orpc/incidents/schemas";
import { roomColorFor } from "lib/rooms/palette";

import { CATEGORIES, isLoud, SEVERITIES } from "./meta";

export type RoomOption = { id: string; name: string; color: string | null };

const NO_ROOM = "none";

const reportSchema = z.object({
  title: z.string().trim().min(1, "Contá qué pasa en pocas palabras").max(140, "Hasta 140 caracteres"),
  category: IncidentCategorySchema.nullable().refine((value) => value !== null, "Elegí qué tipo de incidente es"),
  severity: IncidentSeveritySchema,
  roomId: z.string(),
  location: z.string().trim().max(120, "Hasta 120 caracteres"),
  description: z.string().trim().max(4000, "Hasta 4000 caracteres"),
  sensitive: z.boolean(),
  photo: z.string().nullable(),
});
type ReportInput = z.input<typeof reportSchema>;
type ReportValues = z.output<typeof reportSchema>;

/** An incident as the form shows it, to edit it. */
const fromIncident = (incident: IncidentDetail): ReportInput => ({
  title: incident.title,
  category: incident.category,
  severity: incident.severity,
  roomId: incident.room?.id ?? NO_ROOM,
  location: incident.location ?? "",
  description: incident.description ?? "",
  sensitive: incident.sensitive,
  photo: incident.photo,
});

const blank = (roomId?: string | null): ReportInput => ({
  title: "",
  category: null,
  severity: "medium",
  roomId: roomId ?? NO_ROOM,
  location: "",
  description: "",
  sensitive: false,
  photo: null,
});

/** Bytes a data URL's base64 payload decodes to. */
const photoBytes = (dataUrl: string) => Math.ceil(((dataUrl.length - dataUrl.indexOf(",") - 1) * 3) / 4);

/**
 * The photo as a JPEG light enough to send from a phone on the venue's wifi: the longest side
 * down to 1600 px, then quality and size down until it fits the server's 400 KB.
 */
async function compressPhoto(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    // An <img> applies the photo's EXIF rotation, so portrait shots stay upright.
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Sin canvas");

    for (const side of [1600, 1200, 800]) {
      const scale = Math.min(1, side / Math.max(image.naturalWidth, image.naturalHeight));
      canvas.width = Math.round(image.naturalWidth * scale);
      canvas.height = Math.round(image.naturalHeight * scale);
      // Transparent PNGs would turn black as JPEG.
      context.fillStyle = "#fff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.8, 0.65, 0.5]) {
        const data = canvas.toDataURL("image/jpeg", quality);
        if (photoBytes(data) <= MAX_PHOTO_BYTES) return data;
      }
    }
    throw new Error("Muy pesada");
  } finally {
    URL.revokeObjectURL(url);
  }
}

function PhotoField({
  value,
  error,
  disabled,
  onChange,
  onError,
}: {
  value: string | null;
  error?: string;
  disabled: boolean;
  onChange: (value: string | null) => void;
  onError: (message: string) => void;
}) {
  const input = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      onChange(await compressPhoto(file));
    } catch {
      onError("No pudimos usar esa foto. Probá con otra.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <div className="space-y-2">
      <Label className="block" htmlFor="incident-photo">
        Foto (opcional)
      </Label>
      <input
        ref={input}
        accept="image/*"
        className="sr-only"
        disabled={disabled || busy}
        id="incident-photo"
        tabIndex={-1}
        type="file"
        onChange={(event) => void pick(event.target.files?.[0])}
      />
      {value ? (
        <div className="flex items-center gap-3 rounded-lg border border-border bg-background p-2 pr-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- a local data URL, nothing to optimize */}
          <img alt="Foto del incidente" className="size-14 shrink-0 rounded-md object-cover" src={value} />
          <div className="min-w-0 flex-1">
            <p className="text-ui text-foreground">Foto lista</p>
            <p className="font-terminal text-meta text-muted-foreground tabular-nums">
              {Math.round(photoBytes(value) / 1024)} KB · JPEG
            </p>
          </div>
          <Button
            aria-label="Quitar la foto"
            disabled={disabled}
            size="icon-sm"
            type="button"
            variant="ghost"
            onClick={() => onChange(null)}
          >
            <X />
          </Button>
        </div>
      ) : (
        <Button
          className="w-full sm:w-auto"
          disabled={disabled || busy}
          type="button"
          variant="outline"
          onClick={() => input.current?.click()}
        >
          {busy ? <LoaderCircle className="animate-spin" /> : <Camera />}
          {busy ? "Preparando la foto…" : "Sacar o elegir una foto"}
        </Button>
      )}
      <FieldError message={error} />
    </div>
  );
}

/**
 * Report an incident: what, what kind, how bad, where, and optionally a photo from the phone.
 * The same panel serves the Incidentes page and the room host's phone; with `editing`, it edits
 * that incident (each change lands in its log) and can delete it.
 */
export function ReportIncidentPanel({
  open,
  onOpenChange,
  eventId,
  rooms,
  defaultRoomId,
  source,
  onReported,
  editing = null,
  organizer = false,
  onDeleted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventId: string;
  rooms: RoomOption[];
  defaultRoomId?: string | null;
  /** "phone" from the staff phone views. */
  source: "admin" | "phone";
  onReported?: (incident: IncidentDetail) => void;
  /** The incident to edit instead of reporting a new one. */
  editing?: IncidentDetail | null;
  /** Organizers take an incident out of confidential; anyone who edits it can put it in. */
  organizer?: boolean;
  onDeleted?: () => void;
}) {
  const queryClient = useQueryClient();
  const {
    control,
    register,
    handleSubmit,
    reset,
    setError,
    setValue,
    watch,
    formState: { errors, dirtyFields },
  } = useForm<ReportInput, unknown, ReportValues>({
    resolver: zodResolver(reportSchema),
    defaultValues: blank(defaultRoomId),
  });

  // The incident as it is when the panel opens: a refetch while editing doesn't wipe what's typed.
  const editingRef = React.useRef(editing);
  editingRef.current = editing;
  const editingId = editing?.id;
  React.useEffect(() => {
    if (!open) return;
    const incident = editingRef.current;
    reset(incident ? fromIncident(incident) : blank(defaultRoomId));
  }, [open, editingId, defaultRoomId, reset]);
  const [confirming, setConfirming] = React.useState(false);

  const create = useMutation(
    orpc.incidents.create.mutationOptions({
      onSuccess: (incident) => {
        toast.success(
          "Incidente reportado",
          isLoud(incident.severity) ? "Le avisamos a todo el staff con un anuncio urgente." : "Ya está en Incidentes."
        );
        void queryClient.invalidateQueries({ queryKey: orpc.incidents.list.key({ input: { eventId } }) });
        onOpenChange(false);
        onReported?.(incident);
      },
      onError: (error) => setError("root", { message: error.message || "No se pudo reportar. Probá de nuevo." }),
    })
  );

  const update = useMutation(
    orpc.incidents.update.mutationOptions({
      onSuccess: (incident) => {
        queryClient.setQueryData(orpc.incidents.get.queryKey({ input: { eventId, id: incident.id } }), incident);
        void queryClient.invalidateQueries({ queryKey: orpc.incidents.list.key({ input: { eventId } }) });
        toast.success("Cambios guardados", "Quedaron en el registro del incidente.");
        onOpenChange(false);
      },
      onError: (error) => setError("root", { message: error.message || "No se pudo guardar. Probá de nuevo." }),
    })
  );
  const remove = useMutation(
    orpc.incidents.delete.mutationOptions({
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: orpc.incidents.list.key({ input: { eventId } }) });
        toast.success("Incidente borrado");
        setConfirming(false);
        onOpenChange(false);
        onDeleted?.();
      },
      onError: (error) => {
        setConfirming(false);
        toast.error("No se pudo borrar", error.message);
      },
    })
  );

  const submit = handleSubmit((values) => {
    if (editing) {
      update.mutate({
        eventId,
        id: editing.id,
        title: values.title,
        category: values.category,
        severity: values.severity,
        roomId: values.roomId === NO_ROOM ? null : values.roomId,
        location: values.location || null,
        description: values.description || null,
        sensitive: values.sensitive,
        photo: values.photo,
      });
      return;
    }
    create.mutate({
      eventId,
      title: values.title,
      category: values.category,
      severity: values.severity,
      roomId: values.roomId === NO_ROOM ? undefined : values.roomId,
      location: values.location || undefined,
      description: values.description || undefined,
      sensitive: values.sensitive,
      photo: values.photo ?? undefined,
      source,
    });
  });

  const [severity, sensitive] = watch(["severity", "sensitive"]);
  const busy = create.isPending || update.isPending || remove.isPending;
  // Out of confidential, a conduct report reaches the whole staff: that one is the organizers' call.
  const lockedConfidential = Boolean(editing?.sensitive) && !organizer;
  // Saving alerts the staff only when it reaches high or critical; an incident already there stays quiet.
  const alerts = isLoud(severity) && !(editing && isLoud(editing.severity));

  return (
    <>
      <EditorPanel
        actions={
          <>
            <Button disabled={busy} type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button disabled={busy} form="incident-report" type="submit">
              {editing ? (update.isPending ? "Guardando…" : "Guardar cambios") : busy ? "Reportando…" : "Reportar"}
            </Button>
          </>
        }
        busy={busy}
        danger={
          editing ? (
            <Button
              className="text-live-foreground hover:bg-live-surface hover:text-live-foreground"
              disabled={busy}
              type="button"
              variant="ghost"
              onClick={() => setConfirming(true)}
            >
              <Trash2 />
              <span className="max-sm:sr-only">Borrar</span>
            </Button>
          ) : undefined
        }
        description={
          editing
            ? "Cada cambio queda en el registro del incidente."
            : "Lo ven al instante en Hoy, en Incidentes y en el teléfono de cada host."
        }
        icon={Siren}
        open={open}
        title={editing ? "Editar incidente" : "Reportar un incidente"}
        onOpenChange={onOpenChange}
      >
        <form className="space-y-7" id="incident-report" noValidate onSubmit={submit}>
          <Notice show={Boolean(errors.root)} tone="danger">
            {errors.root?.message}
          </Notice>
          {/* Read-only, not disabled: the form still sends them, unchanged. */}
          <Notice show={lockedConfidential} tone="info">
            Lo que dice un incidente confidencial lo cambia un organizador. Acá podés cambiarle la gravedad y la sala;
            lo nuevo, anotalo en el registro.
          </Notice>

          <PanelSection title="Qué pasa">
            <div className="space-y-2">
              <Label htmlFor="incident-title">En pocas palabras</Label>
              <Input
                aria-invalid={Boolean(errors.title)}
                autoComplete="off"
                data-autofocus
                id="incident-title"
                placeholder="Ej.: el proyector de Cueva no da imagen"
                readOnly={lockedConfidential}
                {...register("title")}
              />
              <FieldError message={errors.title?.message} />
            </div>

            <Controller
              control={control}
              name="category"
              render={({ field, fieldState }) => (
                <div className="space-y-2">
                  <Label id="incident-category">Tipo</Label>
                  <ToggleGroup.Root
                    aria-labelledby="incident-category"
                    className="grid grid-cols-3 gap-2"
                    disabled={lockedConfidential}
                    type="single"
                    value={field.value ?? ""}
                    onValueChange={(value) => {
                      if (!value) return;
                      field.onChange(value);
                      // Code-of-conduct reports start confidential, unless already decided.
                      if (value === "conduct" && !dirtyFields.sensitive) setValue("sensitive", true);
                    }}
                  >
                    {CATEGORIES.map(({ value, label, icon: Icon }) => (
                      <ToggleGroup.Item
                        key={value}
                        className={cn(
                          "flex h-16 flex-col items-center justify-center gap-1 rounded-lg border text-meta font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:outline-hidden",
                          field.value === value
                            ? "border-primary/50 bg-primary-surface text-foreground shadow-[0_0_0_3px_hsl(var(--primary)/0.12)]"
                            : "border-input bg-background text-subtle hover:bg-raised hover:text-foreground"
                        )}
                        value={value}
                      >
                        <Icon
                          aria-hidden
                          className={cn("size-5", field.value === value ? "text-primary" : "text-muted-foreground")}
                        />
                        {label}
                      </ToggleGroup.Item>
                    ))}
                  </ToggleGroup.Root>
                  <FieldError message={fieldState.error?.message} />
                </div>
              )}
            />

            <Controller
              control={control}
              name="severity"
              render={({ field }) => (
                <div className="space-y-2">
                  <Label id="incident-severity">Gravedad</Label>
                  <ToggleGroup.Root
                    aria-labelledby="incident-severity"
                    className="grid h-9 grid-cols-4 rounded-lg border border-input bg-background p-0.5 pointer-coarse:h-12"
                    type="single"
                    value={field.value}
                    onValueChange={(value) => value && field.onChange(value)}
                  >
                    {SEVERITIES.map((item) => (
                      <ToggleGroup.Item
                        key={item.value}
                        className={cn(
                          "inline-flex items-center justify-center gap-1.5 rounded-md text-ui font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:outline-hidden",
                          field.value === item.value
                            ? "bg-raised text-foreground shadow-[inset_0_0_0_1px_hsl(var(--input)),0_1px_2px_rgb(0_0_0/0.5)]"
                            : "text-muted-foreground hover:text-foreground"
                        )}
                        value={item.value}
                      >
                        <span
                          aria-hidden
                          className={cn("size-1.5 rounded-full", {
                            "bg-faint": item.tone === "idle",
                            "bg-warning": item.tone === "warn",
                            "bg-live": item.tone === "live",
                          })}
                        />
                        {item.label}
                      </ToggleGroup.Item>
                    ))}
                  </ToggleGroup.Root>
                  <p className={cn("text-meta", alerts ? "text-live-foreground" : "text-muted-foreground")}>
                    {alerts
                      ? sensitive
                        ? "Avisa urgente al staff que hay un reporte confidencial, sin decir qué pasó."
                        : "Avisa urgente a todo el staff, con el título y el lugar."
                      : editing && isLoud(editing.severity)
                        ? "Ya avisó cuando llegó a esta gravedad: guardar no vuelve a avisar."
                        : "Alta y crítica avisan urgente a todo el staff."}
                  </p>
                </div>
              )}
            />
          </PanelSection>

          <PanelSection title="Dónde">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Controller
                control={control}
                name="roomId"
                render={({ field }) => (
                  <div className="space-y-2">
                    <Label htmlFor="incident-room">Sala</Label>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="incident-room">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_ROOM}>Ninguna sala</SelectItem>
                        {rooms.map((room) => (
                          <SelectItem key={room.id} value={room.id}>
                            <span className="flex items-center gap-2">
                              <span
                                aria-hidden
                                className="size-2 rounded-full"
                                style={{ backgroundColor: roomColorFor(room.id, room.color) }}
                              />
                              {room.name}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              />
              <div className="space-y-2">
                <Label htmlFor="incident-location">Lugar (opcional)</Label>
                <Input
                  aria-invalid={Boolean(errors.location)}
                  autoComplete="off"
                  id="incident-location"
                  placeholder="Ej.: baños de planta baja"
                  readOnly={lockedConfidential}
                  {...register("location")}
                />
                <FieldError message={errors.location?.message} />
              </div>
            </div>
          </PanelSection>

          <PanelSection title="Detalle">
            <div className="space-y-2">
              <Label htmlFor="incident-description">Lo que ayude a resolverlo (opcional)</Label>
              <Textarea
                aria-invalid={Boolean(errors.description)}
                id="incident-description"
                placeholder="Qué viste, a quién buscar, qué ya probaron."
                rows={3}
                readOnly={lockedConfidential}
                {...register("description")}
              />
              <FieldError message={errors.description?.message} />
            </div>
            <Controller
              control={control}
              name="photo"
              render={({ field, fieldState }) => (
                <PhotoField
                  disabled={busy || lockedConfidential}
                  error={fieldState.error?.message}
                  value={field.value}
                  onChange={field.onChange}
                  onError={(message) => setError("photo", { message })}
                />
              )}
            />
            <Controller
              control={control}
              name="sensitive"
              render={({ field }) => (
                <SwitchRow
                  checked={field.value}
                  disabled={lockedConfidential}
                  hint={
                    lockedConfidential
                      ? "Solo un organizador le saca lo confidencial."
                      : "Solo lo ven los organizadores, vos y quien lo tome. El aviso al staff no dice qué pasó."
                  }
                  icon={LockKeyhole}
                  id="incident-sensitive"
                  label="Confidencial (código de conducta)"
                  onCheckedChange={field.onChange}
                />
              )}
            />
          </PanelSection>
        </form>
      </EditorPanel>
      {editing ? (
        <ConfirmDialog
          confirmLabel="Borrar incidente"
          description="Se borra con todo su registro, para todo el staff. No se puede deshacer."
          open={confirming}
          pending={remove.isPending}
          pendingLabel="Borrando…"
          title={`¿Borrar «${editing.title}»?`}
          onConfirm={() => remove.mutate({ eventId, id: editing.id })}
          onOpenChange={setConfirming}
        />
      ) : null}
    </>
  );
}
