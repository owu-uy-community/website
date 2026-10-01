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
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="min-w-0 space-y-2">
        <Label className="text-muted-foreground text-sm" htmlFor="room">
          Lugar
        </Label>
        <Controller
          control={control}
          name="room"
          render={({ field }) => (
            <Select key={`room-${note?.id || "new"}-${field.value}`} value={field.value} onValueChange={field.onChange}>
              <SelectTrigger className="h-11 min-w-0 sm:h-10 [&>span]:truncate" id="room">
                <SelectValue placeholder="Seleccioná el lugar" />
              </SelectTrigger>
              <SelectContent>
                {rooms.map((room) => (
                  <SelectItem key={room} className="min-h-11 break-words sm:min-h-0" value={room}>
                    {room}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </div>

      <div className="min-w-0 space-y-2">
        <Label className="text-muted-foreground text-sm" htmlFor="timeSlot">
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
              <SelectTrigger className="font-terminal h-11 min-w-0 tabular-nums sm:h-10" id="timeSlot">
                <SelectValue placeholder="Seleccioná el horario" />
              </SelectTrigger>
              <SelectContent>
                {timeSlots.map((slot) => (
                  <SelectItem key={slot} className="font-terminal min-h-11 tabular-nums sm:min-h-0" value={slot}>
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
