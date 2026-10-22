"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Gift, MonitorPlay, RotateCcw, Shuffle } from "lucide-react";

import { MicroLabel, Panel, PanelHead } from "components/Admin/ui/page";
import { EmptyState, ErrorState } from "components/Admin/ui/states";
import { StatusDot } from "components/Admin/ui/status";
import { formatClock } from "components/Admin/ui/time";
import { Button } from "components/shared/ui/button";
import { Input } from "components/shared/ui/input";
import { Skeleton } from "components/shared/ui/skeleton";
import { toast } from "components/shared/ui/toast-utils";
import { orpc } from "lib/orpc";
import type { Raffle } from "lib/orpc/attendees/schemas";

function RaffleCard({
  raffle,
  timezone,
  busy,
  onDraw,
  onRedraw,
  onClaim,
  onShow,
}: {
  raffle: Raffle;
  timezone: string;
  busy: boolean;
  onDraw: () => void;
  onRedraw: () => void;
  onClaim: (drawId: string) => void;
  onShow: () => void;
}) {
  const pending = raffle.draws.find((draw) => draw.status === "pending");
  const past = raffle.draws.filter((draw) => draw.status !== "pending").toReversed();
  const drawn = raffle.draws.some((draw) => draw.status !== "redrawn");

  return (
    <li className="space-y-2.5 px-3.5 py-3">
      <div className="flex items-baseline gap-2">
        <p className="min-w-0 flex-1 truncate text-ui font-medium text-foreground">{raffle.prize}</p>
        <span className="shrink-0 font-terminal text-meta text-muted-foreground tabular-nums">
          {raffle.pool} en el sorteo
        </span>
      </div>

      {pending ? (
        <div className="rounded-lg border border-success/25 bg-success-surface px-3 py-2.5">
          <MicroLabel className="text-success-foreground">
            Ganó · {formatClock(new Date(pending.drawnAt), timezone)} · esperando
          </MicroLabel>
          <p className="mt-1 truncate text-[15px] font-semibold text-foreground">{pending.name}</p>
          <p className="truncate text-meta text-subtle">
            {pending.ticketClass ? `${pending.ticketClass} · ` : ""}salió entre {pending.poolSize}
          </p>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            <Button disabled={busy} size="sm" variant="outline" onClick={() => onClaim(pending.id)}>
              Entregado
            </Button>
            <Button disabled={busy || raffle.pool === 0} size="sm" variant="ghost" onClick={onRedraw}>
              <RotateCcw />
              No vino, resortear
            </Button>
          </div>
        </div>
      ) : (
        <Button className="w-full" disabled={busy || raffle.pool === 0} size="sm" variant="outline" onClick={onDraw}>
          <Shuffle />
          {raffle.pool === 0 ? (raffle.draws.length ? "Ya salieron todos" : "Nadie acreditado todavía") : "Sortear"}
        </Button>
      )}

      {drawn ? (
        <Button className="w-full" disabled={busy} size="sm" variant="ghost" onClick={onShow}>
          <MonitorPlay />
          Mostrar en la pantalla
        </Button>
      ) : null}

      {past.length > 0 ? (
        <ul className="space-y-1">
          {past.map((draw) => (
            <li key={draw.id} className="flex items-center gap-2 text-meta">
              <StatusDot tone={draw.status === "claimed" ? "ok" : "idle"} />
              <span className="min-w-0 flex-1 truncate text-subtle">
                {draw.status === "claimed" ? "Se lo llevó" : "No se acercó"} · {draw.name}
              </span>
              <span className="shrink-0 font-terminal text-muted-foreground tabular-nums">
                {formatClock(new Date(draw.drawnAt), timezone)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

/**
 * Raffles among the people who came in. Every draw is reproducible from the raffle's seed;
 * the winner waits until they come up (or a redraw sets them aside), and the wall can spin it.
 */
export function RafflesPanel({
  eventId,
  raffles,
  error,
  onRetry,
  timezone,
}: {
  eventId: string;
  raffles: Raffle[] | undefined;
  error: Error | null;
  onRetry: () => void;
  timezone: string;
}) {
  const queryClient = useQueryClient();
  const [prize, setPrize] = useState("");
  const options = {
    onSuccess: () => queryClient.invalidateQueries({ queryKey: orpc.attendees.raffles.key() }),
    onError: (failure: Error) => toast.error("No se pudo", failure.message),
  };
  const create = useMutation(orpc.attendees.raffles.create.mutationOptions(options));
  const draw = useMutation(orpc.attendees.raffles.draw.mutationOptions(options));
  const redraw = useMutation(orpc.attendees.raffles.redraw.mutationOptions(options));
  const claim = useMutation(orpc.attendees.raffles.claim.mutationOptions(options));
  const show = useMutation(
    orpc.attendees.raffles.show.mutationOptions({
      onSuccess: () => toast.success("Sorteo en la pantalla", "La escena gira y cae en quien ganó."),
      onError: options.onError,
    })
  );
  const busy = create.isPending || draw.isPending || redraw.isPending || claim.isPending || show.isPending;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (prize.trim()) create.mutate({ eventId, prize: prize.trim() }, { onSuccess: () => setPrize("") });
  };

  return (
    <Panel>
      <PanelHead icon={Gift} title="Sorteos" />
      {raffles === undefined && error ? (
        <div className="p-3">
          <ErrorState compact description={error.message} onRetry={onRetry} />
        </div>
      ) : raffles === undefined ? (
        <div className="space-y-2 p-3.5">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-7 w-full" />
        </div>
      ) : raffles.length === 0 ? (
        <EmptyState
          compact
          description="Se sortea entre quienes ya entraron, sin repetir."
          icon={Gift}
          title="Sin sorteos"
        />
      ) : (
        <ul className="divide-y divide-border">
          {raffles.map((raffle) => (
            <RaffleCard
              key={raffle.id}
              busy={busy}
              raffle={raffle}
              timezone={timezone}
              onClaim={(drawId) => claim.mutate({ drawId })}
              onDraw={() => draw.mutate({ raffleId: raffle.id })}
              onRedraw={() => redraw.mutate({ raffleId: raffle.id })}
              onShow={() => show.mutate({ raffleId: raffle.id })}
            />
          ))}
        </ul>
      )}
      <form className="flex gap-2 border-t border-border p-3" onSubmit={submit}>
        <Input
          aria-label="Premio del sorteo nuevo"
          maxLength={40}
          placeholder="¿Qué se sortea?"
          value={prize}
          onChange={(event) => setPrize(event.target.value)}
        />
        <Button disabled={!prize.trim() || busy} size="sm" type="submit" variant="outline">
          Crear
        </Button>
      </form>
    </Panel>
  );
}
