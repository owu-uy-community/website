"use client";

import { format } from "date-fns";
import { es } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";

import { cn } from "app/lib/utils";
import { Button } from "components/shared/ui/button";
import { Calendar } from "components/shared/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "components/shared/ui/popover";

/**
 * Date picker over the shadcn calendar, speaking the same `yyyy-MM-dd` strings
 * the native input used. Parsing is deliberately manual: `new Date("2026-10-01")`
 * is UTC midnight, which renders as the previous day anywhere west of GMT.
 */
function parse(value: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return undefined;

  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function serialize(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function DatePicker({
  value,
  onChange,
  id,
  placeholder = "Elegí una fecha",
  disabled,
  /** date-fns pattern; pass a shorter one in tight/side-by-side layouts. */
  dateFormat = "d 'de' MMMM 'de' yyyy",
}: {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  placeholder?: string;
  disabled?: boolean;
  dateFormat?: string;
}) {
  const selected = parse(value);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          className={cn("w-full justify-start font-normal", !selected && "text-muted-foreground")}
          disabled={disabled}
          id={id}
          variant="outline"
        >
          <CalendarIcon className="mr-2 size-4 shrink-0" />
          <span className="truncate">{selected ? format(selected, dateFormat, { locale: es }) : placeholder}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          defaultMonth={selected}
          initialFocus
          locale={es}
          mode="single"
          selected={selected}
          onSelect={(date) => date && onChange(serialize(date))}
        />
      </PopoverContent>
    </Popover>
  );
}
