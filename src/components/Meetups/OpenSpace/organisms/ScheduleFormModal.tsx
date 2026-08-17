"use client";

import * as React from "react";
import { useEffect, useCallback, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { AlertTriangle, Clock } from "lucide-react";

import { Button } from "components/shared/ui/button";
import { Input } from "components/shared/ui/input";
import { Label } from "components/shared/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "components/shared/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "components/shared/ui/alert-dialog";
import type { Schedule } from "../../../../lib/orpc";

// Zod schema for form validation
const scheduleFormSchema = z
  .object({
    startTime: z.string().regex(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/, "Formato inválido (HH:MM)"),
    endTime: z.string().regex(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/, "Formato inválido (HH:MM)"),
  })
  .refine(
    (data) => {
      // Validate that endTime is after startTime
      const [startHour, startMin] = data.startTime.split(":").map(Number);
      const [endHour, endMin] = data.endTime.split(":").map(Number);
      const startMinutes = startHour * 60 + startMin;
      const endMinutes = endHour * 60 + endMin;
      return endMinutes > startMinutes;
    },
    {
      message: "La hora de fin debe ser posterior a la de inicio",
      path: ["endTime"],
    }
  );

type ScheduleFormData = z.infer<typeof scheduleFormSchema>;

interface ScheduleFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schedule: Schedule | null; // null for create, Schedule for edit
  schedules: Schedule[];
  onSave: (data: { startTime: string; endTime: string; scheduleId?: string }) => Promise<void>;
  onDelete?: () => Promise<void>;
  isSaving?: boolean;
  isDeleting?: boolean;
  hasTracksInSlot?: boolean; // Indicates if this schedule has tracks
  /** How many talks live in this slot (for the delete confirmation copy). */
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
  isDeleting = false,
  hasTracksInSlot = false,
  talksInSlot = 0,
}: ScheduleFormModalProps) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // React Hook Form setup
  const {
    register,
    handleSubmit: rhfHandleSubmit,
    formState: { errors: formErrors },
    reset,
    setError,
    clearErrors,
  } = useForm<ScheduleFormData>({
    resolver: zodResolver(scheduleFormSchema),
    defaultValues: {
      startTime: "09:00",
      endTime: "10:00",
    },
  });

  // Update form when schedule changes (for edit mode)
  useEffect(() => {
    if (schedule) {
      reset({
        startTime: schedule.startTime,
        endTime: schedule.endTime,
      });
    } else {
      // For new schedules, suggest time after the last schedule
      const lastSchedule = schedules[schedules.length - 1];
      if (lastSchedule) {
        const [hours, minutes] = lastSchedule.endTime.split(":").map(Number);
        const nextStartHour = hours;
        const nextEndHour = hours + 1;
        reset({
          startTime: `${String(nextStartHour).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`,
          endTime: `${String(nextEndHour).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`,
        });
      } else {
        reset({
          startTime: "09:00",
          endTime: "10:00",
        });
      }
    }
  }, [schedule, schedules, reset]);

  // Validate for conflicts
  const checkForConflicts = useCallback(
    (formData: ScheduleFormData) => {
      const { startTime, endTime } = formData;

      const [startHour, startMin] = startTime.split(":").map(Number);
      const [endHour, endMin] = endTime.split(":").map(Number);
      const startMinutes = startHour * 60 + startMin;
      const endMinutes = endHour * 60 + endMin;

      // Check for overlaps with existing schedules (excluding current schedule when editing)
      for (const existingSchedule of schedules) {
        if (schedule && existingSchedule.id === schedule.id) continue; // Skip self when editing

        const [exStartHour, exStartMin] = existingSchedule.startTime.split(":").map(Number);
        const [exEndHour, exEndMin] = existingSchedule.endTime.split(":").map(Number);
        const exStartMinutes = exStartHour * 60 + exStartMin;
        const exEndMinutes = exEndHour * 60 + exEndMin;

        // Check if there's an overlap
        const hasOverlap =
          (startMinutes >= exStartMinutes && startMinutes < exEndMinutes) ||
          (endMinutes > exStartMinutes && endMinutes <= exEndMinutes) ||
          (startMinutes <= exStartMinutes && endMinutes >= exEndMinutes);

        if (hasOverlap) {
          return {
            hasConflict: true,
            conflictingSchedule: existingSchedule,
          };
        }
      }

      return { hasConflict: false };
    },
    [schedules, schedule]
  );

  const onSubmit = async (formData: ScheduleFormData) => {
    clearErrors("root");

    // Check for conflicts
    const conflictCheck = checkForConflicts(formData);
    if (conflictCheck.hasConflict && conflictCheck.conflictingSchedule) {
      setError("root", {
        message: `El horario se superpone con "${conflictCheck.conflictingSchedule.startTime} - ${conflictCheck.conflictingSchedule.endTime}"`,
      });
      return;
    }

    try {
      await onSave({
        startTime: formData.startTime,
        endTime: formData.endTime,
        scheduleId: schedule?.id,
      });
      // Success! Clean up and close
      reset({ startTime: "09:00", endTime: "10:00" });
      clearErrors();
      onOpenChange(false);
    } catch (error) {
      console.error("Error saving schedule:", error);
      setError("root", {
        message: "No se pudo guardar el horario",
      });
    }
  };

  const handleConfirmedDelete = async () => {
    if (!onDelete) return;

    try {
      await onDelete();
      // Success! Clean up and close
      setConfirmingDelete(false);
      reset({ startTime: "09:00", endTime: "10:00" });
      clearErrors();
      onOpenChange(false);
    } catch (error) {
      console.error("Error deleting schedule:", error);
      setConfirmingDelete(false);
      setError("root", {
        message: "No se pudo eliminar el horario",
      });
    }
  };

  // Handle modal close - cleanup form state
  const handleModalClose = useCallback(
    (isOpen: boolean) => {
      if (!isOpen) {
        if (isSaving || isDeleting) return; // Don't close mid-mutation
        reset({ startTime: "09:00", endTime: "10:00" });
        clearErrors();
      }
      onOpenChange(isOpen);
    },
    [onOpenChange, reset, clearErrors, isSaving, isDeleting]
  );

  const isEditMode = !!schedule;
  const title = isEditMode ? "Editar horario" : "Nuevo horario";
  const description = isEditMode
    ? "Modificá el inicio y el fin del bloque."
    : "El bloque se inserta automáticamente en orden cronológico.";

  return (
    <>
      <Dialog open={open} onOpenChange={handleModalClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              {title}
            </DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>

          <form className="space-y-4" onSubmit={rhfHandleSubmit(onSubmit)}>
            {/* Time inputs */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="startTime">Inicio</Label>
                <Input
                  id="startTime"
                  type="time"
                  {...register("startTime")}
                  className="font-terminal tabular-nums [&::-webkit-calendar-picker-indicator]:invert"
                />
                {formErrors.startTime && <p className="text-sm text-destructive">{formErrors.startTime.message}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="endTime">Fin</Label>
                <Input
                  id="endTime"
                  type="time"
                  {...register("endTime")}
                  className="font-terminal tabular-nums [&::-webkit-calendar-picker-indicator]:invert"
                />
                {formErrors.endTime && <p className="text-sm text-destructive">{formErrors.endTime.message}</p>}
              </div>
            </div>

            {/* Warning about tracks in edit mode */}
            {isEditMode && hasTracksInSlot && (
              <div className="flex items-start gap-2 rounded-md border border-primary/30 bg-primary/[0.06] px-3 py-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <p className="text-sm text-foreground">
                  Este bloque tiene charlas asignadas: al cambiar el horario se mueven todas al nuevo bloque.
                </p>
              </div>
            )}

            {/* Error message */}
            {formErrors.root && (
              <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                <p className="text-sm text-foreground">{formErrors.root.message}</p>
              </div>
            )}

            <DialogFooter className="border-t border-border pt-4 sm:justify-between">
              <div>
                {isEditMode && onDelete && (
                  <Button
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    disabled={isDeleting || isSaving}
                    type="button"
                    variant="ghost"
                    onClick={() => setConfirmingDelete(true)}
                  >
                    {isDeleting ? "Eliminando…" : "Eliminar"}
                  </Button>
                )}
              </div>
              <div className="flex flex-col-reverse gap-2 sm:flex-row">
                <Button
                  disabled={isSaving || isDeleting}
                  type="button"
                  variant="ghost"
                  onClick={() => handleModalClose(false)}
                >
                  Cancelar
                </Button>
                <Button disabled={isSaving || isDeleting} type="submit">
                  {isSaving ? "Guardando…" : isEditMode ? "Guardar cambios" : "Crear horario"}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation (used to be a native window.confirm) */}
      <AlertDialog open={confirmingDelete} onOpenChange={setConfirmingDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              ¿Eliminar el horario {schedule ? `${schedule.startTime} - ${schedule.endTime}` : ""}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {talksInSlot > 0
                ? `Este bloque tiene ${talksInSlot} charla${talksInSlot > 1 ? "s" : ""} asignada${talksInSlot > 1 ? "s" : ""} que también se van a eliminar. `
                : ""}
              Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={isDeleting}
              variant="destructive"
              onClick={(e) => {
                e.preventDefault();
                void handleConfirmedDelete();
              }}
            >
              {isDeleting ? "Eliminando…" : "Eliminar horario"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
