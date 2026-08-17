"use client";

import * as React from "react";
import { useState } from "react";
import { Check, ChevronDown, Clock } from "lucide-react";

import { cn } from "app/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "components/shared/ui/avatar";

import { initials, relativeTime, type StaffAnnouncement } from "./helpers";

function PersonRow({
  name,
  image,
  meta,
  muted,
}: {
  name: string;
  image: string | null;
  meta?: string;
  muted?: boolean;
}) {
  return (
    <li className="flex items-center gap-2 py-1">
      <Avatar className={cn("h-6 w-6 shrink-0", muted && "opacity-60")}>
        {image ? <AvatarImage alt={name} src={image} /> : null}
        <AvatarFallback className="text-[9px]">{initials(name)}</AvatarFallback>
      </Avatar>
      <span className={cn("min-w-0 flex-1 truncate text-xs", muted ? "text-muted-foreground" : "text-foreground")}>
        {name}
      </span>
      {meta && <span className="shrink-0 font-terminal text-[10px] tabular-nums text-muted-foreground">{meta}</span>}
    </li>
  );
}

/**
 * Read receipts for an announcement: who marked it received and — the half
 * that matters while the event runs — who still hasn't.
 */
export function AckList({ announcement }: { announcement: StaffAnnouncement }) {
  const [open, setOpen] = useState(false);
  const { acks, pending } = announcement;
  const total = acks.length + pending.length;
  const complete = pending.length === 0 && acks.length > 0;

  if (total === 0) {
    return <span className="text-xs text-muted-foreground">Sin destinatarios</span>;
  }

  return (
    <div className="min-w-0">
      <button
        aria-expanded={open}
        className="flex min-h-[36px] w-full items-center gap-2 rounded-md px-1 text-left transition-colors hover:bg-muted/50"
        type="button"
        onClick={() => setOpen((value) => !value)}
      >
        {acks.length > 0 && (
          <div className="flex -space-x-1.5">
            {acks.slice(0, 5).map((ack) => (
              <Avatar key={ack.userId} className="h-5 w-5 border border-border bg-muted">
                {ack.image ? <AvatarImage alt={ack.name} src={ack.image} /> : null}
                <AvatarFallback className="text-[8px]">{initials(ack.name)}</AvatarFallback>
              </Avatar>
            ))}
          </div>
        )}
        <span className={cn("text-xs", complete ? "text-emerald-500" : "text-muted-foreground")}>
          {complete ? "Todos recibieron" : `${acks.length} de ${total} recibieron`}
        </span>
        <ChevronDown
          className={cn(
            "ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180"
          )}
        />
      </button>

      {open && (
        <div className="mt-1.5 space-y-3 rounded-md border border-border bg-muted/30 px-3 py-2">
          <div>
            <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-emerald-500">
              <Check className="h-3 w-3" />
              Recibieron ({acks.length})
            </p>
            {acks.length === 0 ? (
              <p className="mt-1 text-xs text-muted-foreground">Todavía nadie.</p>
            ) : (
              <ul className="mt-1">
                {acks.map((ack) => (
                  <PersonRow key={ack.userId} image={ack.image} meta={relativeTime(ack.ackedAt)} name={ack.name} />
                ))}
              </ul>
            )}
          </div>

          {pending.length > 0 && (
            <div>
              <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                <Clock className="h-3 w-3" />
                Faltan ({pending.length})
              </p>
              <ul className="mt-1">
                {pending.map((person) => (
                  <PersonRow key={person.userId} image={person.image} muted name={person.name} />
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
