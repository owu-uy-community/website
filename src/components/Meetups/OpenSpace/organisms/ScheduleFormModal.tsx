"use client";

import * as React from "react";
import { useEffect, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Clock, AlertTriangle } from "lucide-react";

import { Button } from "components/shared/ui/button";
import { Input } from "components/shared/ui/input";
import { Label } from "components/shared/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "components/shared/ui/dialog";
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
      message: "La hora de fin debe ser posterior a la hora de inicio",
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
}: ScheduleFormModalProps) {
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
      reset({
        startTime: "09:00",
        endTime: "10:00",
      });
      clearErrors();
      onOpenChange(false);
    } catch (error) {
      console.error("Error saving schedule:", error);
      setError("root", {
        message: "Error al guardar el horario",
      });
    }
  };

  const handleDelete = async () => {
    if (!onDelete) return;

    if (hasTracksInSlot) {
      if (
        !confirm(
          "⚠️ Este horario tiene charlas asignadas. ¿Estás seguro de eliminarlo?\n\nEsta acción no se puede deshacer y las charlas se perderán."
        )
      ) {
        return;
      }
    } else {
      if (!confirm("¿Estás seguro de eliminar este horario?\n\nEsta acción no se puede deshacer.")) {
        return;
      }
    }

    try {
      await onDelete();
      // Success! Clean up and close
      reset({
        startTime: "09:00",
        endTime: "10:00",
      });
      clearErrors();
      onOpenChange(false);
    } catch (error) {
      console.error("Error deleting schedule:", error);
      setError("root", {
        message: "Error al eliminar el horario",
      });
    }
  };

  // Handle modal close - cleanup form state
  const handleModalClose = useCallback(
    (open: boolean) => {
      if (!open) {
        // Reset form to default values
        reset({
          startTime: "09:00",
          endTime: "10:00",
        });
        // Clear all errors
        clearErrors();
      }
      onOpenChange(open);
    },
    [onOpenChange, reset, clearErrors]
  );

  const isEditMode = !!schedule;
  const title = isEditMode ? "Editar Horario" : "Agregar Nuevo Horario";
  const description = isEditMode
    ? "Modifica los horarios de inicio y fin del slot"
    : "El horario se insertará automáticamente en orden cronológico";

  return (
    <Dialog open={open} onOpenChange={handleModalClose}>
      <DialogContent className="border-blue-600/50 bg-zinc-900 sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-blue-300">
            <Clock className="h-5 w-5" />
            {title}
          </DialogTitle>
          <DialogDescription className="text-zinc-300">{description}</DialogDescription>
        </DialogHeader>

        <form onSubmit={rhfHandleSubmit(onSubmit)} className="space-y-4">
          {/* Time inputs */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="startTime" className="text-white">
                Hora de Inicio *
              </Label>
              <Input
                id="startTime"
                {...register("startTime")}
                placeholder="09:00"
                className="border-zinc-700 bg-zinc-800 text-white placeholder:text-zinc-500"
              />
              {formErrors.startTime && <p className="text-sm text-red-400">{formErrors.startTime.message}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="endTime" className="text-white">
                Hora de Fin *
              </Label>
              <Input
                id="endTime"
                {...register("endTime")}
                placeholder="10:00"
                className="border-zinc-700 bg-zinc-800 text-white placeholder:text-zinc-500"
              />
              {formErrors.endTime && <p className="text-sm text-red-400">{formErrors.endTime.message}</p>}
            </div>
          </div>

          {/* Warning about tracks in edit mode */}
          {isEditMode && hasTracksInSlot && (
            <div className="flex items-start gap-2 rounded-md border border-blue-600/50 bg-blue-500/10 p-3">
              <AlertTriangle className="h-5 w-5 flex-shrink-0 text-blue-400" />
              <div className="text-sm text-blue-200">
                <strong>Nota:</strong> Este horario tiene charlas asignadas. Al cambiar el horario, todas las charlas se
                actualizarán automáticamente al nuevo horario.
              </div>
            </div>
          )}

          {/* Error message */}
          {formErrors.root && (
            <div className="flex items-start gap-2 rounded-md border border-red-600/50 bg-red-500/10 p-3">
              <AlertTriangle className="h-5 w-5 flex-shrink-0 text-red-400" />
              <p className="text-sm text-red-200">{formErrors.root.message}</p>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-3 pt-4">
            <Button
              type="submit"
              disabled={isSaving}
              className="flex-1 border-blue-600 bg-blue-500/20 text-blue-200 hover:bg-blue-500/30"
            >
              {isSaving ? (
                <>
                  <span className="animate-spin">⏳</span> Guardando...
                </>
              ) : (
                <>{isEditMode ? "Actualizar" : "Crear"} Horario</>
              )}
            </Button>

            {isEditMode && onDelete && (
              <Button
                type="button"
                onClick={handleDelete}
                disabled={isDeleting || isSaving}
                variant="outline"
                className="border-red-600 bg-red-500/20 text-red-200 hover:bg-red-500/30"
              >
                {isDeleting ? (
                  <>
                    <span className="animate-spin">⏳</span> Eliminando...
                  </>
                ) : (
                  "Eliminar"
                )}
              </Button>
            )}

            <Button
              type="button"
              onClick={() => handleModalClose(false)}
              disabled={isSaving || isDeleting}
              variant="outline"
              className="text-zinc-400 hover:text-zinc-300"
            >
              Cancelar
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
