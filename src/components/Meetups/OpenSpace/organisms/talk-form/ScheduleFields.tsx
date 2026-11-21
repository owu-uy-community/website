"use client";

import type { Control } from "react-hook-form";
import { Controller } from "react-hook-form";

import { Label } from "components/shared/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "components/shared/ui/select";
import type { StickyNote } from "lib/orpc";

import type { TalkFormData } from "./types";

interface ScheduleFieldsProps {
  control: Control<TalkFormData>;
  note: StickyNote | null;
  rooms: string[];
  timeSlots: string[];
}

export function ScheduleFields({ control, note, rooms, timeSlots }: ScheduleFieldsProps) {
  return (
    // The block reads "16:30 - 16:55" in mono: give it the wider half.
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-2">
      <div className="min-w-0 space-y-1.5">
        <Label className="text-meta text-muted-foreground" htmlFor="room">
          Sala
        </Label>
        <Controller
          control={control}
          name="room"
          render={({ field }) => (
            <Select key={`room-${note?.id || "new"}-${field.value}`} value={field.value} onValueChange={field.onChange}>
              <SelectTrigger className="min-w-0 [&>span]:truncate" id="room">
                <SelectValue placeholder="Elegí la sala" />
              </SelectTrigger>
              <SelectContent>
                {rooms.map((room) => (
                  <SelectItem key={room} className="break-words pointer-coarse:min-h-11" value={room}>
                    {room}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </div>

      <div className="min-w-0 space-y-1.5">
        <Label className="text-meta text-muted-foreground" htmlFor="timeSlot">
          Bloque
        </Label>
        <Controller
          control={control}
          name="timeSlot"
          render={({ field }) => (
            <Select
              key={`timeSlot-${note?.id || "new"}-${field.value}`}
              value={field.value}
              onValueChange={field.onChange}
            >
              <SelectTrigger className="min-w-0 font-terminal tabular-nums [&>span]:truncate" id="timeSlot">
                <SelectValue placeholder="Elegí el bloque" />
              </SelectTrigger>
              <SelectContent>
                {timeSlots.map((slot) => (
                  <SelectItem key={slot} className="font-terminal tabular-nums pointer-coarse:min-h-11" value={slot}>
                    {slot}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </div>
    </div>
  );
}
