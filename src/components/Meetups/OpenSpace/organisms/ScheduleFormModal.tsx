"use client";

import * as React from "react";
import { useEffect, useRef } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Clock, Star, Trash2 } from "lucide-react";

import { EditorPanel, FieldError, Notice, PanelSection, SwitchRow } from "components/Admin/panel";
import { Button } from "components/shared/ui/button";
import { Input } from "components/shared/ui/input";
import { Label } from "components/shared/ui/label";
import type { Schedule } from "lib/orpc";

const HHMM = /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/;

const minutesOf = (time: string) => {
  const [hours, minutes] = time.split(":").map(Number);

  return hours * 60 + minutes;
};

const scheduleFormSchema = z
  .object({
    startTime: z.string().regex(HHMM, "Formato inválido (HH:MM)"),
    endTime: z.string().regex(HHMM, "Formato inválido (HH:MM)"),
    highlightInKiosk: z.boolean(),
  })
  .refine((data) => minutesOf(data.endTime) > minutesOf(data.startTime), {
    message: "El fin tiene que ser después del inicio",
    path: ["endTime"],
  });

type ScheduleFormData = z.infer<typeof scheduleFormSchema>;

/** A new slot starts where the last one ends and lasts an hour. */
function suggestedSlot(schedules: Schedule[]): ScheduleFormData {
  const last = schedules[schedules.length - 1];
  if (!last) return { startTime: "09:00", endTime: "10:00", highlightInKiosk: false };

  const [hours, minutes] = last.endTime.split(":").map(Number);
  const pad = (value: number) => String(value).padStart(2, "0");

  return {
    startTime: `${pad(hours)}:${pad(minutes)}`,
    endTime: `${pad(Math.min(hours + 1, 23))}:${pad(minutes)}`,
    highlightInKiosk: false,
  };
}

function durationLabel(startTime: string, endTime: string) {
  if (!HHMM.test(startTime) || !HHMM.test(endTime)) return null;
  const total = minutesOf(endTime) - minutesOf(startTime);
  if (total <= 0) return null;
  const hours = Math.floor(total / 60);
  const minutes = total % 60;

  return [hours ? `${hours} h` : null, minutes ? `${minutes} min` : null].filter(Boolean).join(" ");
}

interface ScheduleFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null creates a new slot. */
  schedule: Schedule | null;
  schedules: Schedule[];
  onSave: (data: {
    startTime: string;
    endTime: string;
    scheduleId?: string;
    highlightInKiosk: boolean;
  }) => Promise<void>;
  /** The board asks for confirmation when the slot holds talks. */
  onDelete?: () => void;
  isSaving?: boolean;
  /** How many talks live in this slot (they move with a time change). */
  talksInSlot?: number;
}

export function ScheduleFormModal({
  open,
  onOpenChange,
  schedule,
  schedules,
  onSave,
  onDelete,
  isSaving = false,
  talksInSlot = 0,
}: ScheduleFormModalProps) {
  const {
    control,
    register,
    handleSubmit,
    formState: { errors },
    reset,
    setError,
    watch,
  } = useForm<ScheduleFormData>({
    resolver: zodResolver(scheduleFormSchema),
    defaultValues: suggestedSlot([]),
  });

  // Fresh values each time the panel opens: the slot being edited, or the next free hour. Only
  // on open — the slot list refetches when any screen changes the grid, and that must not wipe
  // what is being typed.
  const schedulesRef = useRef(schedules);
  useEffect(() => {
    schedulesRef.current = schedules;
  }, [schedules]);
  useEffect(() => {
    if (!open) return;
    reset(
      schedule
        ? { startTime: schedule.startTime, endTime: schedule.endTime, highlightInKiosk: schedule.highlightInKiosk }
        : suggestedSlot(schedulesRef.current)
    );
  }, [open, schedule, reset]);

  const onSubmit = async (formData: ScheduleFormData) => {
    const start = minutesOf(formData.startTime);
    const end = minutesOf(formData.endTime);
    const overlapping = schedules.find(
      (existing) =>
        existing.id !== schedule?.id && start < minutesOf(existing.endTime) && end > minutesOf(existing.startTime)
    );
    if (overlapping) {
      setError("root", {
        message: `Se superpone con el bloque ${overlapping.startTime} - ${overlapping.endTime}.`,
      });

      return;
    }

    try {
      await onSave({ ...formData, scheduleId: schedule?.id });
      onOpenChange(false);
    } catch {
      setError("root", { message: "No se pudo guardar el horario. Probá de nuevo." });
    }
  };

  const isEditMode = Boolean(schedule);
  const [startTime, endTime] = watch(["startTime", "endTime"]);
  const duration = durationLabel(startTime, endTime);
  const timesChanged = isEditMode && (startTime !== schedule?.startTime || endTime !== schedule?.endTime);

  return (
    <EditorPanel
      actions={
        <>
          <Button disabled={isSaving} type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button disabled={isSaving} form="schedule-form" type="submit">
            {isSaving ? "Guardando…" : isEditMode ? "Guardar cambios" : "Crear horario"}
          </Button>
        </>
      }
      busy={isSaving}
      danger={
        isEditMode && onDelete ? (
          <Button
            aria-label="Eliminar horario"
            className="h-11 px-3 text-destructive hover:bg-destructive/10 hover:text-destructive sm:h-10"
            disabled={isSaving}
            type="button"
            variant="ghost"
            onClick={onDelete}
          >
            <Trash2 />
            <span className="hidden sm:inline">Eliminar</span>
          </Button>
        ) : undefined
      }
      description={isEditMode ? "Cambiá cuándo empieza y termina el bloque." : "Se ubica solo en orden cronológico."}
      icon={Clock}
      open={open}
      title={isEditMode ? "Editar horario" : "Nuevo horario"}
      onOpenChange={onOpenChange}
    >
      <form className="space-y-7" id="schedule-form" noValidate onSubmit={handleSubmit(onSubmit)}>
        <PanelSection
          action={
            duration ? (
              <span className="rounded-full bg-muted px-2.5 py-1 font-terminal text-xs text-muted-foreground tabular-nums">
                {duration}
              </span>
            ) : null
          }
          title="Bloque"
        >
          <div className="grid grid-cols-2 gap-3">
            <div className="min-w-0 space-y-2">
              <Label htmlFor="startTime">Inicio</Label>
              <Input
                aria-invalid={Boolean(errors.startTime)}
                className="h-12 font-terminal text-lg tabular-nums [&::-webkit-calendar-picker-indicator]:invert"
                data-autofocus
                id="startTime"
                type="time"
                {...register("startTime")}
              />
              <FieldError message={errors.startTime?.message} />
            </div>
            <div className="min-w-0 space-y-2">
              <Label htmlFor="endTime">Fin</Label>
              <Input
                aria-invalid={Boolean(errors.endTime)}
                className="h-12 font-terminal text-lg tabular-nums [&::-webkit-calendar-picker-indicator]:invert"
                id="endTime"
                type="time"
                {...register("endTime")}
              />
              <FieldError message={errors.endTime?.message} />
            </div>
          </div>

          <Notice show={timesChanged && talksInSlot > 0} tone="info">
            {talksInSlot === 1
              ? "La charla de este bloque se mueve con él."
              : `Las ${talksInSlot} charlas de este bloque se mueven con él.`}
          </Notice>
        </PanelSection>

        {isEditMode ? (
          <PanelSection title="Kiosco">
            <Controller
              control={control}
              name="highlightInKiosk"
              render={({ field }) => (
                <SwitchRow
                  checked={field.value}
                  hint="Un solo bloque a la vez: resaltarlo apaga el anterior."
                  icon={Star}
                  id="schedule-highlight"
                  label="Resaltar en el kiosco"
                  onCheckedChange={field.onChange}
                />
              )}
            />
          </PanelSection>
        ) : null}

        <Notice show={Boolean(errors.root)} tone="danger">
          {errors.root?.message}
        </Notice>
      </form>
    </EditorPanel>
  );
}
