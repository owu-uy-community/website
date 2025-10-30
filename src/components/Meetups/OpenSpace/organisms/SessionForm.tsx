"use client";

import * as React from "react";
import { useEffect } from "react";
import { Trash2 } from "lucide-react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

import { Button } from "components/shared/ui/button";
import { Input } from "components/shared/ui/input";
import { Label } from "components/shared/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "components/shared/ui/select";

import type { StickyNote } from "../../../../lib/orpc";

// Zod schema for form validation
const sessionFormSchema = z.object({
  title: z.string().min(1, "Session title is required"),
  speaker: z.string(),
  room: z.string().min(1, "Room is required"),
  timeSlot: z.string().min(1, "Time slot is required"),
});

type SessionFormData = z.infer<typeof sessionFormSchema>;

interface SessionFormProps {
  note: StickyNote | null;
  notes: StickyNote[]; // All existing notes for validation
  rooms: string[];
  timeSlots: string[];
  onSave: (noteData: Partial<StickyNote>) => void;
  onDelete?: () => void;
  onCancel: () => void;
  isSaving?: boolean;
  isDeleting?: boolean;
}

export function SessionForm({
  note,
  notes,
  rooms,
  timeSlots,
  onSave,
  onDelete,
  onCancel,
  isSaving = false,
  isDeleting = false,
}: SessionFormProps) {
  // React Hook Form setup
  const {
    control,
    register,
    handleSubmit: rhfHandleSubmit,
    formState: { errors: formErrors },
    reset,
    watch,
    setError,
    clearErrors,
  } = useForm<SessionFormData>({
    resolver: zodResolver(sessionFormSchema),
    defaultValues: {
      title: "",
      speaker: "",
      room: rooms[0] || "",
      timeSlot: timeSlots[0] || "",
    },
  });

  const watchedValues = watch();

  // Update form when note changes
  useEffect(() => {
    if (note) {
      reset({
        title: note.title || "",
        speaker: note.speaker || "",
        room: note.room || rooms[0] || "",
        timeSlot: note.timeSlot || timeSlots[0] || "",
      });
    } else {
      reset({
        title: "",
        speaker: "",
        room: rooms[0] || "",
        timeSlot: timeSlots[0] || "",
      });
    }
  }, [note, rooms, timeSlots, reset]);

  // Clear validation error when room or timeSlot changes
  useEffect(() => {
    clearErrors("root");
  }, [watchedValues.room, watchedValues.timeSlot, clearErrors]);

  const onSubmit = (formData: SessionFormData) => {
    // Check for slot conflicts
    const conflictingNote = notes.find(
      (existingNote) =>
        existingNote.id !== note?.id && // Exclude current note when editing
        existingNote.room === formData.room &&
        existingNote.timeSlot === formData.timeSlot
    );

    if (conflictingNote) {
      setError("root", {
        message: `This slot is already occupied by "${conflictingNote.title}"`,
      });
      return;
    }

    // Transform data for save - convert empty speaker string to undefined
    onSave({
      title: formData.title,
      speaker: formData.speaker.trim() === "" ? undefined : formData.speaker,
      room: formData.room,
      timeSlot: formData.timeSlot,
    });
  };

  return (
    <form onSubmit={rhfHandleSubmit(onSubmit)} className="space-y-4 text-white">
      <div className="space-y-2">
        <Label htmlFor="title">Session Title *</Label>
        <Input id="title" {...register("title")} placeholder="Enter session title..." />
        {formErrors.title && <p className="text-sm text-red-400">{formErrors.title.message}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="speaker">Speaker (Optional)</Label>
        <Input id="speaker" {...register("speaker")} placeholder="Enter speaker name..." />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="room">Room</Label>
          <Controller
            name="room"
            control={control}
            render={({ field }) => (
              <Select
                key={`room-${note?.id || "new"}-${field.value}`}
                value={field.value}
                onValueChange={field.onChange}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select room" />
                </SelectTrigger>
                <SelectContent>
                  {rooms.map((room) => (
                    <SelectItem key={room} value={room}>
                      {room}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {formErrors.room && <p className="text-sm text-red-400">{formErrors.room.message}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="timeSlot">Time Slot</Label>
          <Controller
            name="timeSlot"
            control={control}
            render={({ field }) => (
              <Select
                key={`timeSlot-${note?.id || "new"}-${field.value}`}
                value={field.value}
                onValueChange={field.onChange}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select time slot" />
                </SelectTrigger>
                <SelectContent>
                  {timeSlots.map((slot) => (
                    <SelectItem key={slot} value={slot}>
                      {slot}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {formErrors.timeSlot && <p className="text-sm text-red-400">{formErrors.timeSlot.message}</p>}
        </div>
      </div>

      {/* Validation error display */}
      {formErrors.root && (
        <div className="rounded-md border border-red-500/50 bg-red-500/20 p-3 text-red-200">
          <p className="text-sm font-medium">⚠️ {formErrors.root.message}</p>
        </div>
      )}

      <div className="flex justify-between pt-4">
        <div>
          {onDelete && (
            <Button type="button" variant="destructive" onClick={onDelete} disabled={isSaving || isDeleting}>
              {isDeleting ? (
                <div className="mr-2 h-4 w-4 animate-spin rounded-full border-b-2 border-white"></div>
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              {isDeleting ? "Deleting..." : "Delete"}
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={onCancel} disabled={isSaving || isDeleting}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSaving || isDeleting}>
            {isSaving ? (
              <>
                <div className="mr-2 h-4 w-4 animate-spin rounded-full border-b-2 border-white"></div>
                Saving...
              </>
            ) : (
              "Save Session"
            )}
          </Button>
        </div>
      </div>
    </form>
  );
}
