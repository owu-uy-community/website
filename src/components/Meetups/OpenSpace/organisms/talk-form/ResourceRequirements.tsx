"use client";

import type { Control } from "react-hook-form";
import { Controller } from "react-hook-form";
import { CheckCircle2, Presentation, Tv, XCircle } from "lucide-react";

import { Checkbox } from "components/shared/ui/checkbox";
import { Label } from "components/shared/ui/label";

import type { RoomWithResources, TalkFormData } from "./types";

interface ResourceRequirementsProps {
  control: Control<TalkFormData>;
  watchedValues: TalkFormData;
  roomsData: RoomWithResources[];
}

function Availability({ available }: { available: boolean }) {
  return available ? (
    <span className="flex items-center gap-1.5 text-xs text-emerald-500">
      <CheckCircle2 className="h-3.5 w-3.5" />
      Disponible
    </span>
  ) : (
    <span className="flex items-center gap-1.5 text-xs text-destructive">
      <XCircle className="h-3.5 w-3.5" />
      No disponible
    </span>
  );
}

export function ResourceRequirements({ control, watchedValues, roomsData }: ResourceRequirementsProps) {
  const selectedRoomData = roomsData.find((r) => r.name === watchedValues.room);

  return (
    <div className="space-y-3 rounded-md border border-border bg-muted/30 p-3">
      <Label className="text-sm font-medium">Recursos necesarios</Label>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Controller
              control={control}
              name="needsTV"
              render={({ field }) => <Checkbox checked={field.value} id="needsTV" onCheckedChange={field.onChange} />}
            />
            <Label
              className="flex cursor-pointer items-center gap-1.5 text-sm font-normal text-muted-foreground hover:text-foreground"
              htmlFor="needsTV"
            >
              <Tv className="h-4 w-4" />
              Necesita TV
            </Label>
          </div>
          {watchedValues.needsTV && <Availability available={selectedRoomData?.hasTV || false} />}
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Controller
              control={control}
              name="needsWhiteboard"
              render={({ field }) => (
                <Checkbox checked={field.value} id="needsWhiteboard" onCheckedChange={field.onChange} />
              )}
            />
            <Label
              className="flex cursor-pointer items-center gap-1.5 text-sm font-normal text-muted-foreground hover:text-foreground"
              htmlFor="needsWhiteboard"
            >
              <Presentation className="h-4 w-4" />
              Necesita pizarra
            </Label>
          </div>
          {watchedValues.needsWhiteboard && <Availability available={selectedRoomData?.hasWhiteboard || false} />}
        </div>
      </div>
    </div>
  );
}
