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
    <div className="grid grid-cols-2 gap-4">
      <div className="space-y-2">
        <Label className="text-sm text-muted-foreground" htmlFor="room">
          Lugar
        </Label>
        <Controller
          control={control}
          name="room"
          render={({ field }) => (
            <Select key={`room-${note?.id || "new"}-${field.value}`} value={field.value} onValueChange={field.onChange}>
              <SelectTrigger id="room">
                <SelectValue placeholder="Seleccioná el lugar" />
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
      </div>

      <div className="space-y-2">
        <Label className="text-sm text-muted-foreground" htmlFor="timeSlot">
          Horario
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
              <SelectTrigger className="font-terminal tabular-nums" id="timeSlot">
                <SelectValue placeholder="Seleccioná el horario" />
              </SelectTrigger>
              <SelectContent>
                {timeSlots.map((slot) => (
                  <SelectItem key={slot} className="font-terminal tabular-nums" value={slot}>
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
