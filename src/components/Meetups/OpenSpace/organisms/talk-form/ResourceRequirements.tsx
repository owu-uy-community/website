"use client";

import type { Control } from "react-hook-form";
import { Controller } from "react-hook-form";
import { CheckCircle2, Presentation, TriangleAlert, Tv } from "lucide-react";

import { SwitchRow } from "components/Admin/panel";

import type { RoomWithResources, TalkFormData } from "./types";

interface ResourceRequirementsProps {
  control: Control<TalkFormData>;
  watchedValues: TalkFormData;
  roomsData: RoomWithResources[];
}

/** Whether the room picked above has what the talk asks for. */
function Availability({ needed, available }: { needed: boolean; available: boolean }) {
  if (!needed) return null;

  return available ? (
    <span className="flex items-center gap-1 text-success-foreground">
      <CheckCircle2 aria-hidden className="size-3.5" />
      La sala la tiene
    </span>
  ) : (
    <span className="flex items-center gap-1 text-warning-foreground">
      <TriangleAlert aria-hidden className="size-3.5" />
      La sala no la tiene
    </span>
  );
}

export function ResourceRequirements({ control, watchedValues, roomsData }: ResourceRequirementsProps) {
  const selectedRoomData = roomsData.find((r) => r.name === watchedValues.room);

  return (
    // Side by side only where there's room for both hints (the sheet, not the inspector).
    <div className="grid grid-cols-1 gap-2 @[26rem]:grid-cols-2">
      <Controller
        control={control}
        name="needsTV"
        render={({ field }) => (
          <SwitchRow
            checked={field.value}
            hint={<Availability available={selectedRoomData?.hasTV ?? false} needed={field.value} />}
            icon={Tv}
            id="needsTV"
            label="Necesita TV"
            onCheckedChange={field.onChange}
          />
        )}
      />
      <Controller
        control={control}
        name="needsWhiteboard"
        render={({ field }) => (
          <SwitchRow
            checked={field.value}
            hint={<Availability available={selectedRoomData?.hasWhiteboard ?? false} needed={field.value} />}
            icon={Presentation}
            id="needsWhiteboard"
            label="Necesita pizarra"
            onCheckedChange={field.onChange}
          />
        )}
      />
    </div>
  );
}
