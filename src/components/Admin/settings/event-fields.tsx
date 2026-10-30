"use client";

import { useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";

import { cn } from "app/lib/utils";
import { Button } from "components/shared/ui/button";
import { DatePicker } from "components/shared/ui/date-picker";
import { Input } from "components/shared/ui/input";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "components/shared/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "components/shared/ui/popover";

import { timeZoneOptions, utcOffset } from "./event-time";

const readable = (zone: string) => zone.replaceAll("_", " ");

/** A day ("sáb 7 nov 2026") and a 24 h time side by side, on the event's own clock. */
export function DateTimeInput({
  id,
  day,
  time,
  timeLabel,
  invalid = false,
  onDayChange,
  onClockChange,
}: {
  id: string;
  day: string;
  time: string;
  /** The time input has no visible label of its own. */
  timeLabel: string;
  invalid?: boolean;
  onDayChange: (day: string) => void;
  onClockChange: (time: string) => void;
}) {
  return (
    <div className="flex gap-2">
      {/* The date button matches the time input's height on touchscreens (40px). */}
      <div className="min-w-0 flex-1 [&>button]:h-10 sm:[&>button]:h-8 pointer-coarse:[&>button]:h-10">
        <DatePicker dateFormat="EEE d MMM yyyy" id={id} value={day} onChange={onDayChange} />
      </div>
      <Input
        aria-invalid={invalid}
        aria-label={timeLabel}
        className="w-[6.5rem] shrink-0 font-terminal tabular-nums pointer-coarse:w-[8.5rem]"
        id={`${id}-time`}
        step={60}
        type="time"
        value={time}
        onChange={(event) => onClockChange(event.target.value)}
      />
    </div>
  );
}

/** An IANA time zone, searchable (there are hundreds); ours first, each with its current offset. */
export function TimezoneSelect({
  id,
  value,
  onChange,
}: {
  id?: string;
  value: string;
  onChange: (zone: string) => void;
}) {
  const [open, setOpen] = useState(false);
  // Hundreds of offsets: worked out when the list opens, not on every render of the page.
  const zones = useMemo(
    () => (open ? timeZoneOptions(value).map((zone) => ({ zone, offset: utcOffset(zone) })) : []),
    [open, value]
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          aria-expanded={open}
          className="w-full justify-between font-normal"
          id={id}
          role="combobox"
          variant="outline"
        >
          <span className="truncate">
            {readable(value)}{" "}
            <span className="text-muted-foreground" suppressHydrationWarning>
              · {utcOffset(value)}
            </span>
          </span>
          <ChevronsUpDown className="text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--radix-popover-trigger-width) min-w-72 p-0">
        <Command>
          <CommandInput placeholder="Buscá una ciudad…" />
          <CommandList className="max-h-72">
            <CommandEmpty>No hay ninguna zona con ese nombre.</CommandEmpty>
            <CommandGroup>
              {zones.map(({ zone, offset }) => (
                <CommandItem
                  key={zone}
                  keywords={[readable(zone), offset]}
                  value={zone}
                  onSelect={() => {
                    onChange(zone);
                    setOpen(false);
                  }}
                >
                  <Check className={cn("text-primary", zone === value ? "opacity-100" : "opacity-0")} />
                  <span className="truncate">{readable(zone)}</span>
                  <span className="ml-auto font-terminal text-meta text-muted-foreground tabular-nums">{offset}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
