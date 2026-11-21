"use client";

import { Check, CirclePlus } from "lucide-react";

import { cn } from "app/lib/utils";
import { Badge } from "components/shared/ui/badge";
import { Button } from "components/shared/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "components/shared/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "components/shared/ui/popover";

/**
 * A filter on one column with the count of each value (counted with the other filters
 * applied). Several values match any of them; what's chosen stays listed even at zero.
 */
export function FacetFilter({
  title,
  options,
  selected,
  onChange,
  emptyLabel,
}: {
  title: string;
  options: { value: string; count: number }[];
  selected: string[];
  onChange: (values: string[]) => void;
  /** How a blank value reads ("Sin entrada"). */
  emptyLabel: string;
}) {
  const shown = [
    ...options,
    ...selected
      .filter((value) => !options.some((option) => option.value === value))
      .map((value) => ({ value, count: 0 })),
  ];
  const toggle = (value: string) =>
    onChange(selected.includes(value) ? selected.filter((chosen) => chosen !== value) : [...selected, value]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button className="border-dashed" size="sm" variant="outline">
          <CirclePlus />
          {title}
          {selected.length > 0 ? (
            <>
              <span aria-hidden className="mx-0.5 h-3.5 w-px bg-input" />
              {selected.length > 2 ? (
                <Badge variant="secondary">{selected.length} elegidas</Badge>
              ) : (
                selected.map((value) => (
                  <Badge key={value} className="max-w-28 truncate" variant="secondary">
                    {value || emptyLabel}
                  </Badge>
                ))
              )}
            </>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-0">
        <Command>
          <CommandInput className="h-10" placeholder={`Buscar ${title.toLowerCase()}…`} />
          <CommandList>
            <CommandEmpty>No hay ninguna así</CommandEmpty>
            <CommandGroup>
              {shown.map((option) => {
                const checked = selected.includes(option.value);
                return (
                  <CommandItem
                    key={option.value}
                    value={option.value || emptyLabel}
                    onSelect={() => toggle(option.value)}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "flex size-4 shrink-0 items-center justify-center rounded-[4px] border",
                        checked ? "border-primary bg-primary text-primary-foreground" : "border-white/20"
                      )}
                    >
                      {checked ? <Check className="size-3" strokeWidth={3} /> : null}
                    </span>
                    <span className="truncate">{option.value || emptyLabel}</span>
                    <span className="ml-auto font-terminal text-meta text-muted-foreground tabular-nums">
                      {option.count}
                    </span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
            {selected.length > 0 ? (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem className="justify-center text-muted-foreground" onSelect={() => onChange([])}>
                    Limpiar
                  </CommandItem>
                </CommandGroup>
              </>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
