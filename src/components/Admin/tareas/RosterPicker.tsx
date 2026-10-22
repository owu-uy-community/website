"use client";

import { useState, type ReactNode } from "react";
import { Check } from "lucide-react";

import { cn } from "app/lib/utils";
import { PersonAvatar } from "components/Admin/ui/person";
import { Badge } from "components/shared/ui/badge";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "components/shared/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "components/shared/ui/popover";

import type { RosterMember } from "./helpers";

/**
 * Pick people from the community's staff: search by name, a check on whoever is chosen, and
 * the people who are free right now listed first.
 */
export function RosterPicker({
  roster,
  selected,
  free,
  onToggle,
  children,
}: {
  roster: RosterMember[];
  selected: string[];
  /** On site with nothing assigned right now. */
  free?: ReadonlySet<string>;
  onToggle: (userId: string) => void;
  /** The trigger button. */
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const people = free ? roster.toSorted((a, b) => Number(free.has(b.userId)) - Number(free.has(a.userId))) : roster;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align="start" className="w-[min(20rem,calc(100vw-2rem))] p-0">
        <Command>
          <CommandInput placeholder="Buscar por nombre…" />
          {/* As tall as the room on its side, minus the search box (see SwapMenu). */}
          <CommandList className="max-h-[min(20rem,calc(var(--radix-popover-content-available-height,24rem)_-_3.5rem))]">
            <CommandEmpty>No hay nadie del staff con ese nombre.</CommandEmpty>
            <CommandGroup>
              {people.map((member) => {
                const chosen = selected.includes(member.userId);
                return (
                  <CommandItem key={member.userId} value={member.name} onSelect={() => onToggle(member.userId)}>
                    <PersonAvatar image={member.image} name={member.name} size={20} />
                    <span className="min-w-0 flex-1 truncate">{member.name}</span>
                    {free?.has(member.userId) ? <Badge variant="info">libre</Badge> : null}
                    <Check aria-hidden className={cn("size-4 text-primary", chosen ? "opacity-100" : "opacity-0")} />
                    <span className="sr-only">{chosen ? "elegida" : ""}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
