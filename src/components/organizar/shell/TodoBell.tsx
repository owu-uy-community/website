"use client";

import { useState } from "react";
import Link from "next/link";
import { Bell, ListChecks } from "lucide-react";

import { Button } from "components/shared/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "components/shared/ui/popover";

import { usePanel, usePanelSummary } from "./context";
import { panelHref } from "./nav";
import { todoItems } from "./todo";

/** The header bell: Inicio's "Para hacer", from any page of the panel. */
export function TodoBell() {
  const { current } = usePanel();
  const summary = usePanelSummary();
  const [open, setOpen] = useState(false);
  if (!current) return null;
  const items = todoItems(summary.data, current.slug);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          aria-label={items.length ? `Para hacer: ${items.length}` : "Para hacer"}
          className="relative"
          size="icon-sm"
          variant="ghost"
        >
          <Bell />
          {items.length > 0 ? (
            <span className="absolute top-1 right-1 size-1.5 rounded-full bg-primary ring-2 ring-background" />
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[22rem] p-0">
        <div className="flex h-10 items-center gap-2 border-b border-border px-3">
          <ListChecks aria-hidden className="size-4 text-muted-foreground" />
          <span className="text-ui font-semibold">Para hacer</span>
          {items.length ? (
            <span className="font-terminal text-meta text-primary tabular-nums">{items.length}</span>
          ) : null}
          <Link
            className="touch-target ml-auto text-meta text-muted-foreground hover:text-foreground"
            href={panelHref(current.slug)}
            onClick={() => setOpen(false)}
          >
            Ir a Inicio
          </Link>
        </div>
        {items.length === 0 ? (
          <p className="px-3 py-8 text-center text-ui text-muted-foreground">
            {summary.isPending ? "Mirando…" : "Nada pendiente. Bien ahí."}
          </p>
        ) : (
          <ul className="max-h-80 scrollbar-thin divide-y divide-border overflow-y-auto">
            {items.map((item) => (
              <li key={item.id}>
                <Link
                  className="flex items-start gap-2.5 px-3 py-2.5 text-ui text-foreground transition-colors hover:bg-raised"
                  href={item.href}
                  onClick={() => setOpen(false)}
                >
                  <span
                    aria-hidden
                    className="mt-[3px] size-3.5 shrink-0 rounded-full border-[1.5px] border-dashed border-faint"
                  />
                  {item.text}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
