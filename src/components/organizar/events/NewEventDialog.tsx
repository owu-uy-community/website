"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CalendarPlus, Copy, Repeat } from "lucide-react";

import { MicroLabel } from "components/Admin/ui/page";
import { ErrorState } from "components/Admin/ui/states";
import { Button } from "components/shared/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "components/shared/ui/dialog";
import { Skeleton } from "components/shared/ui/skeleton";
import { toast } from "components/shared/ui/toast-utils";
import { shortWhen } from "lib/community/time";
import { LEVEL_LABEL } from "lib/organizar/repeat";
import { MAX_HOLDS } from "lib/organizar/rules";
import { shortDay } from "lib/organizar/times";
import { orpc } from "lib/orpc/client";

const OPEN_EVENT = "organizar:new-event";

/** Open "Nuevo evento" from anywhere in the panel: the top bar, ⌘K, `c`, the phone's +. */
export function openNewEvent() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

/**
 * Start an event: from scratch or from a previous one (its texts and sign-up), then on to the
 * wizard. Mounted once by the panel shell; `?nuevo=1` on any panel page opens it too.
 */
export function NewEventDialog({ community }: { community: { id: string; slug: string } }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener(OPEN_EVENT, show);
    return () => window.removeEventListener(OPEN_EVENT, show);
  }, []);

  // ?nuevo=1 opens it once, then leaves the URL clean
  useEffect(() => {
    if (params.get("nuevo") !== "1") return;
    setOpen(true);
    const rest = new URLSearchParams(params);
    rest.delete("nuevo");
    window.history.replaceState(null, "", rest.size > 0 ? `${pathname}?${rest}` : pathname);
  }, [params, pathname]);

  const events = useQuery(orpc.events.list.queryOptions({ input: { communityId: community.id }, enabled: open }));
  const next = useQuery(orpc.events.nextDate.queryOptions({ input: { communityId: community.id }, enabled: open }));
  const create = useMutation(
    orpc.events.createDraft.mutationOptions({
      onSuccess: (event, variables) => {
        setOpen(false);
        if (variables.copyFrom) {
          toast.success(
            event.dateChosen ? `Reservamos el ${shortWhen(event.startDate)}` : "Quedó sin fecha",
            event.dateChosen
              ? "Revisá lo que viene del evento anterior."
              : `Ya tenían ${MAX_HOLDS} fechas reservadas: elegí una en Fecha.`
          );
        }
        router.push(`/organizar/panel/${community.slug}/eventos/${event.id}/editar`);
      },
      onError: (error) => toast.error("No se pudo crear el evento", error.message),
    })
  );
  const previous = (events.data ?? [])
    .filter((event) => event.status === "published" && event.id !== next.data?.source.id)
    .slice(0, 6);
  const last = next.data;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nuevo evento</DialogTitle>
          <DialogDescription>
            Repetí el último (mismo día y hora, unas cuatro semanas después), empezá de cero o partí de otro.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          {last ? (
            <Button
              className="h-auto min-h-11 flex-col items-start gap-0.5 py-2 text-left whitespace-normal"
              disabled={create.isPending}
              onClick={() => create.mutate({ communityId: community.id, copyFrom: last.source.id })}
            >
              <span className="flex items-center gap-2">
                <Repeat aria-hidden />
                Repetir «{last.source.name}»
              </span>
              <span className="text-meta font-normal opacity-80">
                {shortDay(last.day)} · {last.startTime} · {LEVEL_LABEL[last.level]}
              </span>
            </Button>
          ) : next.isPending ? (
            <Skeleton className="h-14 rounded-md" />
          ) : null}
          <Button
            disabled={create.isPending}
            variant={last || next.isPending ? "outline" : "default"}
            onClick={() => create.mutate({ communityId: community.id })}
          >
            <CalendarPlus />
            Empezar de cero
          </Button>
          {events.isError ? (
            <ErrorState
              compact
              description="Podés empezar de cero igual, o probá de nuevo para copiar uno."
              retrying={events.isFetching}
              title="No pudimos traer tus eventos anteriores"
              onRetry={() => void events.refetch()}
            />
          ) : events.isPending ? (
            <Skeleton className="h-24 rounded-lg" />
          ) : previous.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              <MicroLabel>O a partir de</MicroLabel>
              <ul className="flex flex-col rounded-lg border border-border">
                {previous.map((event) => (
                  <li key={event.id} className="border-b border-border last:border-0">
                    <button
                      className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-raised disabled:opacity-50"
                      disabled={create.isPending}
                      type="button"
                      onClick={() => create.mutate({ communityId: community.id, copyFrom: event.id })}
                    >
                      <Copy aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate text-ui text-foreground">{event.name}</span>
                      <span className="font-terminal text-meta text-muted-foreground tabular-nums">
                        {shortWhen(event.startDate).split(" · ")[0]}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
