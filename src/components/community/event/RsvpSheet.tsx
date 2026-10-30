"use client";

import type { ReactNode } from "react";

import { buttonClassName } from "components/community/ui";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "components/shared/ui/sheet";
import { shortWhen } from "lib/community/time";
import type { PublicEvent } from "lib/orpc/events/schemas";
import { rsvpBar } from "lib/organizar/rsvp-state";

import { useRsvp } from "./RsvpCard";

/**
 * Phones: a bar stuck to the bottom of the page ("Gratis · quedan 12 · Anotarme") that opens the
 * RSVP card in a sheet. Desktop has the card in the sticky column instead.
 */
export function RsvpSheet({ event, children }: { event: PublicEvent; children: ReactNode }) {
  const { state, loading, now } = useRsvp(event);
  const bar = rsvpBar(state, now);

  return (
    <Sheet>
      <div className="sticky bottom-0 z-40 mt-10 border-t border-white/10 bg-zinc-950/90 px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur lg:hidden">
        <div className="flex items-center gap-3">
          <p className="min-w-0 flex-1 truncate text-[15px] text-zinc-200">
            {loading ? <span className="inline-block h-4 w-32 animate-pulse rounded bg-white/[0.08]" /> : bar.text}
          </p>
          <SheetTrigger className={buttonClassName("primary", "md")} disabled={loading}>
            {bar.action}
          </SheetTrigger>
        </div>
      </div>
      <SheetContent
        className="owu-site max-h-[90dvh] overflow-y-auto border-white/10 bg-zinc-950 px-5 text-zinc-100"
        side="bottom"
      >
        <SheetHeader className="mb-5">
          <SheetTitle className="font-title text-lg text-white">{event.name}</SheetTitle>
          <SheetDescription className="text-[14px] text-zinc-400">{shortWhen(event.startDate)}</SheetDescription>
        </SheetHeader>
        {children}
      </SheetContent>
    </Sheet>
  );
}
