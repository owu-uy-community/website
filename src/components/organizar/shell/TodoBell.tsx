"use client";

import { useState } from "react";
import Link from "next/link";
import { Bell, ListChecks } from "lucide-react";

import { ErrorState } from "components/Admin/ui/states";
import { Button } from "components/shared/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "components/shared/ui/popover";
import { Skeleton } from "components/shared/ui/skeleton";

import { usePanel, usePanelSummary } from "./context";
import { panelHref } from "./nav";
import { todoItems } from "./todo";

/** The header bell: Inicio's "Para hacer", the same list and count, from any page of the panel. */
export function TodoBell() {
  const { current } = usePanel();
  const summary = usePanelSummary();
  const [open, setOpen] = useState(false);
  if (!current) return null;
  const items = todoItems(summary.data, current.slug);
  // A failed read is never "nothing to do"
  const failed = summary.isError && !summary.data;
  const label = failed
    ? "Para hacer: no se pudo cargar"
    : summary.isPending
      ? "Para hacer: cargando"
      : items.length
        ? `Para hacer: ${items.length}`
        : "Para hacer: nada pendiente";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button aria-label={label} className="relative" size="icon-sm" variant="ghost">
          <Bell />
          {failed ? (
            <span
              aria-hidden
              className="absolute top-0.5 right-0.5 grid size-3.5 place-items-center rounded-full bg-live text-[9px] leading-none font-bold text-background ring-2 ring-background"
            >
              !
            </span>
          ) : items.length > 0 ? (
            <span
              aria-hidden
              className="absolute -top-0.5 -right-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 font-terminal text-[10px] leading-none font-semibold text-primary-foreground tabular-nums ring-2 ring-background"
            >
              {items.length > 9 ? "9+" : items.length}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="flex max-h-[min(28rem,var(--radix-popover-content-available-height))] w-[22rem] flex-col p-0"
        collisionPadding={12}
      >
        <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3">
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
        {failed ? (
          <ErrorState
            compact
            className="m-3"
            retrying={summary.isFetching}
            title="No pudimos traer lo pendiente"
            onRetry={() => void summary.refetch()}
          />
        ) : summary.isPending ? (
          <div aria-label="Cargando lo pendiente" className="flex flex-col gap-2 p-3" role="status">
            <Skeleton className="h-9" />
            <Skeleton className="h-9" />
          </div>
        ) : items.length === 0 ? (
          <p className="px-3 py-8 text-center text-ui text-muted-foreground">Nada pendiente. Bien ahí.</p>
        ) : (
          <ul className="min-h-0 flex-1 scrollbar-thin divide-y divide-border overflow-y-auto overscroll-contain">
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
