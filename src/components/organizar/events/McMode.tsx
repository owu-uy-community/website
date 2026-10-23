"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, CloudOff, Plus, X } from "lucide-react";

import { cn } from "app/lib/utils";
import { isTransient } from "components/Admin/attendees/scan-queue";
import { useNow } from "components/Admin/ui/time";
import { Button } from "components/shared/ui/button";
import { useWakeLock } from "hooks/useWakeLock";
import { montevideoIso } from "lib/community/time";
import { client, orpc } from "lib/orpc/client";
import type { Moment, RunOfShow } from "lib/orpc/run-of-show/schemas";
import { rundownStatus } from "lib/orpc/run-of-show/timing";

/** What MC mode did while offline, sent in order when the phone is back */
type Change =
  | { kind: "go"; itemId?: string }
  | { kind: "save"; items: { id: string; title: string; durationMin: number }[] };

const EXTRA_MIN = 5;
const pad = (value: number) => String(value).padStart(2, "0");

/** "12:05", "1:02:09": a countdown's figures */
function clock(ms: number) {
  const total = Math.floor(Math.abs(ms) / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);

  return `${hours ? `${hours}:${pad(minutes)}` : minutes}:${pad(total % 60)}`;
}

/**
 * MC mode, for the phone of whoever presents: what's on now with its countdown, what's next,
 * "+5 min" and "Siguiente". It keeps the screen on, and works offline: changes apply here at once
 * and go to the server, in order, when the connection is back.
 */
export function McMode({
  communityId,
  eventId,
  eventName,
  backHref,
}: {
  communityId: string;
  eventId: string;
  eventName: string;
  backHref: string;
}) {
  useWakeLock(true);
  const queryClient = useQueryClient();
  const input = { communityId, eventId };
  const key = `organizar:mc:${eventId}`;
  const agenda = useQuery(orpc.events.agenda.queryOptions({ input, refetchInterval: 20_000 }));
  const [local, setLocal] = useState<RunOfShow | null>(null);
  const [queue, setQueue] = useState<Change[]>([]);
  // The queue as of now (a press while sending lands after what's in flight, never instead of it)
  const pending = useRef<Change[]>([]);
  const update = (change: (current: Change[]) => Change[]) => {
    pending.current = change(pending.current);
    setQueue(pending.current);
  };
  const sending = useRef(false);
  const now = useNow(1000);
  const data = local ?? agenda.data;
  const moments = data?.moments ?? [];
  const { live, next } = rundownStatus(moments);
  const current: Moment | undefined = moments[live];
  const upcoming: Moment | undefined = moments[next];

  // The queue outlives a reload
  useEffect(() => {
    const saved = window.localStorage.getItem(key);
    if (saved) {
      pending.current = JSON.parse(saved) as Change[];
      setQueue(pending.current);
    }
  }, [key]);
  useEffect(() => {
    if (queue.length > 0) window.localStorage.setItem(key, JSON.stringify(queue));
    else window.localStorage.removeItem(key);
  }, [key, queue]);

  const send = useCallback(async () => {
    if (sending.current) return;
    sending.current = true;
    try {
      while (pending.current.length > 0) {
        const change = pending.current[0];
        try {
          const result =
            change.kind === "go"
              ? await client.events.agendaGo({ communityId, eventId, itemId: change.itemId })
              : await client.events.saveAgenda({ communityId, eventId, items: change.items });
          queryClient.setQueryData(orpc.events.agenda.queryKey({ input: { communityId, eventId } }), result);
        } catch (error) {
          // Still offline: try again later, in the same order. Anything else the server refused for good.
          if (isTransient(error)) return;
        }
        pending.current = pending.current.slice(1);
        setQueue(pending.current);
      }
      setLocal(null);
    } finally {
      sending.current = false;
    }
  }, [queryClient, communityId, eventId]);

  useEffect(() => {
    if (queue.length === 0) return;
    void send();
    const retry = window.setInterval(() => void send(), 15_000);
    window.addEventListener("online", send);

    return () => {
      window.clearInterval(retry);
      window.removeEventListener("online", send);
    };
  }, [queue, send]);

  const apply = (moments: Moment[], change: Change) => {
    if (!data) return;
    setLocal({ ...data, moments });
    update((current) => [...current, change]);
  };

  const goNext = () => {
    const at = new Date().toISOString();
    apply(
      moments.map((moment) =>
        moment.id === current?.id
          ? { ...moment, actualEnd: at }
          : moment.id === upcoming?.id
            ? { ...moment, actualStart: at, actualEnd: null }
            : moment
      ),
      { kind: "go", itemId: upcoming?.id }
    );
  };

  const addFive = () => {
    if (!current) return;
    const longer = moments.map((moment) =>
      moment.id === current.id ? { ...moment, durationMin: moment.durationMin + EXTRA_MIN } : moment
    );
    apply(longer, {
      kind: "save",
      items: longer.map(({ id, title, durationMin }) => ({ id, title, durationMin })),
    });
  };

  const startOf = (moment: Moment) =>
    data ? Date.parse(montevideoIso(`${data.day}T${moment.plannedStart}`)) : Number.NaN;
  const left = !now
    ? null
    : current?.actualStart
      ? Date.parse(current.actualStart) + current.durationMin * 60_000 - now
      : upcoming
        ? startOf(upcoming) - now
        : null;
  const over = current !== undefined && left !== null && left < 0;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] text-foreground">
      <header className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-ui font-semibold">Modo MC</h1>
          <p className="truncate text-meta text-muted-foreground">{eventName}</p>
        </div>
        {queue.length > 0 ? (
          <span className="flex items-center gap-1.5 text-meta text-warning-foreground" role="status">
            <CloudOff aria-hidden className="size-4" />
            {queue.length === 1 ? "1 cambio por mandar" : `${queue.length} cambios por mandar`}
          </span>
        ) : null}
        <Button asChild aria-label="Salir del modo MC" className="size-11" size="icon" variant="ghost">
          <Link href={backHref}>
            <X />
          </Link>
        </Button>
      </header>

      <main className="flex min-h-0 flex-1 flex-col justify-center gap-8">
        {agenda.isError && !data ? (
          <p className="text-ui text-live-foreground" role="alert">
            No pudimos traer la agenda. Revisá la conexión y probá de nuevo.
          </p>
        ) : !data ? (
          <p className="text-ui text-muted-foreground">Cargando la agenda…</p>
        ) : moments.length === 0 ? (
          <p className="text-[22px] leading-snug">
            Todavía no hay agenda.{" "}
            <Link className="underline underline-offset-4" href={backHref}>
              Armala en el evento
            </Link>{" "}
            con las charlas.
          </p>
        ) : (
          <>
            <section aria-labelledby="mc-now">
              <p className="text-meta tracking-[0.12em] text-muted-foreground uppercase" id="mc-now">
                {current ? "Ahora" : upcoming ? "Antes de empezar" : "Terminó la agenda"}
              </p>
              <p className="mt-2 text-[32px] leading-tight font-semibold text-balance" data-testid="mc-current">
                {current?.title ?? (upcoming ? `Empieza «${upcoming.title}»` : "¡Gracias por venir!")}
              </p>
              {left !== null ? (
                <p
                  aria-label={over ? `Pasado por ${clock(left)}` : `Quedan ${clock(left)}`}
                  className={cn(
                    "mt-4 font-terminal text-[88px] leading-none font-semibold tabular-nums",
                    over ? "text-live-foreground" : "text-foreground"
                  )}
                  data-testid="mc-countdown"
                  role="timer"
                >
                  {over ? "+" : ""}
                  {clock(left)}
                </p>
              ) : null}
              {current ? (
                <p className="mt-2 text-ui text-muted-foreground">
                  {current.durationMin} min{over ? ": se pasó, cerrá o sumá tiempo" : ""}
                </p>
              ) : null}
            </section>
            {upcoming && current ? (
              <section aria-labelledby="mc-next" className="border-t border-border pt-5">
                <p className="text-meta tracking-[0.12em] text-muted-foreground uppercase" id="mc-next">
                  Después
                </p>
                <p className="mt-1 text-[22px] leading-snug" data-testid="mc-next">
                  {upcoming.title}
                </p>
              </section>
            ) : null}
          </>
        )}
      </main>

      {moments.length > 0 ? (
        <footer className="grid grid-cols-[auto_minmax(0,1fr)] gap-3">
          <Button className="h-16 px-5 text-[17px]" disabled={!current} size="lg" variant="outline" onClick={addFive}>
            <Plus />5 min
          </Button>
          <Button className="h-16 text-[17px]" disabled={!current && !upcoming} size="lg" onClick={goNext}>
            {current ? (upcoming ? "Siguiente" : "Terminar") : "Empezar"}
            <ArrowRight />
          </Button>
        </footer>
      ) : null}
    </div>
  );
}
