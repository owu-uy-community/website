"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, CircleHelp, Minus, Plus, Send, Trash2, Vote, X } from "lucide-react";

import { cn } from "app/lib/utils";
import { ConfirmDialog } from "components/Admin/panel";
import { MicroLabel, PageContainer, PageHeader, Panel, PanelHead } from "components/Admin/ui/page";
import { EmptyState, ErrorState } from "components/Admin/ui/states";
import { Badge } from "components/shared/ui/badge";
import { Button } from "components/shared/ui/button";
import { Input } from "components/shared/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "components/shared/ui/select";
import { Skeleton } from "components/shared/ui/skeleton";
import { toast } from "components/shared/ui/toast-utils";
import { shortWhen } from "lib/community/time";
import { orpc } from "lib/orpc/client";
import type { Poll } from "lib/orpc/polls/schemas";

import type { CalendarCommunity } from "../calendar/CalendarClient";

type Answer = "yes" | "maybe" | "no";

/** What a cell says, never by colour alone: an icon and its word. */
const ANSWERS: Record<Answer, { label: string; icon: typeof Check; className: string }> = {
  yes: { label: "Sí", icon: Check, className: "border-success/30 bg-success-surface text-success-foreground" },
  maybe: {
    label: "Si hace falta",
    icon: CircleHelp,
    className: "border-warning/30 bg-warning-surface text-warning-foreground",
  },
  no: { label: "No", icon: X, className: "border-live/30 bg-live-surface text-live-foreground" },
};
const NEXT: Record<Answer | "none", Answer> = { none: "yes", yes: "maybe", maybe: "no", no: "yes" };

const dayLabel = (day: string) => shortWhen(`${day}T12:00:00-03:00`).replace(/ · .*$/, "");

/** Choosing a date with other communities: ask, answer, and pick. */
export function PollsClient({ community, today }: { community: CalendarCommunity; today: string }) {
  const [creating, setCreating] = useState(false);
  const polls = useQuery(orpc.polls.list.queryOptions({ input: { communityId: community.id } }));

  return (
    <PageContainer size="large">
      <PageHeader
        actions={
          creating ? null : (
            <Button onClick={() => setCreating(true)}>
              <Plus aria-hidden />
              Nueva encuesta
            </Button>
          )
        }
        description="Para un evento con otras comunidades: proponé fechas, cada una dice cuáles le sirven y vos elegís."
        title="Encuestas de fecha"
      />

      <div className="flex flex-col gap-4">
        {creating ? <NewPoll community={community} today={today} onDone={() => setCreating(false)} /> : null}
        {polls.isError ? (
          <ErrorState onRetry={() => void polls.refetch()} />
        ) : !polls.data ? (
          <Skeleton className="h-40 rounded-lg" />
        ) : polls.data.length === 0 && !creating ? (
          <Panel>
            <EmptyState
              description="Cuando otra comunidad te pregunte por una fecha, aparece acá."
              icon={Vote}
              title="Ninguna encuesta todavía"
            />
          </Panel>
        ) : (
          polls.data.map((poll) => <PollCard key={poll.id} community={community} poll={poll} />)
        )}
      </div>
    </PageContainer>
  );
}

function NewPoll({ community, today, onDone }: { community: CalendarCommunity; today: string; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [days, setDays] = useState<string[]>(["", ""]);
  const [startTime, setStartTime] = useState("19:00");
  const [invited, setInvited] = useState<string[]>([]);
  const others = useQuery({
    ...orpc.communities.list.queryOptions({ input: {} }),
    staleTime: 5 * 60_000,
    select: (all) => all.filter((item) => item.id !== community.id && item.listed),
  });
  const create = useMutation(
    orpc.polls.create.mutationOptions({
      onSuccess: (poll) => {
        toast.success("Encuesta enviada", `Les avisamos a ${poll.communities.length - 1} comunidades por mail.`);
        void queryClient.invalidateQueries({ queryKey: orpc.polls.list.key() });
        onDone();
      },
      onError: (error) => toast.error("No se pudo enviar", error.message),
    })
  );
  const filled = [...new Set(days.filter(Boolean))];
  const ready = title.trim().length >= 3 && filled.length >= 2 && invited.length > 0;

  return (
    <Panel>
      <PanelHead icon={Vote} title="Nueva encuesta" />
      <form
        className="flex flex-col gap-4 p-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (ready) create.mutate({ communityId: community.id, title, days: filled, startTime, invited });
        }}
      >
        <label className="flex flex-col gap-1.5">
          <MicroLabel>Para qué evento</MicroLabel>
          <Input
            maxLength={120}
            placeholder="Meetup conjunto de fin de año"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
        <div className="flex flex-col gap-1.5">
          <MicroLabel>Fechas posibles</MicroLabel>
          <div className="flex flex-wrap items-center gap-2">
            {days.map((day, index) => (
              <span key={index} className="flex items-center gap-1">
                <Input
                  aria-label={`Fecha ${index + 1}`}
                  className="w-40 font-terminal tabular-nums"
                  min={today}
                  type="date"
                  value={day}
                  onChange={(event) => setDays(days.map((item, at) => (at === index ? event.target.value : item)))}
                />
                {days.length > 2 ? (
                  <Button
                    aria-label={`Sacar la fecha ${index + 1}`}
                    size="icon-sm"
                    type="button"
                    variant="ghost"
                    onClick={() => setDays(days.filter((_, at) => at !== index))}
                  >
                    <Trash2 aria-hidden />
                  </Button>
                ) : null}
              </span>
            ))}
            {days.length < 6 ? (
              <Button size="sm" type="button" variant="outline" onClick={() => setDays([...days, ""])}>
                <Plus aria-hidden />
                Otra fecha
              </Button>
            ) : null}
          </div>
        </div>
        <label className="flex w-36 flex-col gap-1.5">
          <MicroLabel>Hora</MicroLabel>
          <Input
            className="font-terminal tabular-nums"
            type="time"
            value={startTime}
            onChange={(event) => setStartTime(event.target.value)}
          />
        </label>
        <div className="flex flex-col gap-1.5">
          <MicroLabel>A quién le preguntás</MicroLabel>
          <div className="flex flex-wrap items-center gap-1.5">
            {invited.map((id) => (
              <span
                key={id}
                className="flex h-7 items-center gap-1.5 rounded-md border border-input pr-1 pl-2 text-meta text-foreground"
              >
                {others.data?.find((item) => item.id === id)?.name}
                <button
                  aria-label="Sacar"
                  className="grid size-5 place-items-center rounded-sm text-muted-foreground hover:bg-raised hover:text-foreground"
                  type="button"
                  onClick={() => setInvited(invited.filter((item) => item !== id))}
                >
                  <X aria-hidden className="size-3" />
                </button>
              </span>
            ))}
            <Select disabled={invited.length >= 8} value="" onValueChange={(id) => setInvited([...invited, id])}>
              <SelectTrigger aria-label="Sumar una comunidad" className="w-56">
                <SelectValue placeholder="Sumar una comunidad" />
              </SelectTrigger>
              <SelectContent>
                {(others.data ?? [])
                  .filter((item) => !invited.includes(item.id))
                  .map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex gap-2">
          <Button disabled={!ready || create.isPending} type="submit">
            <Send aria-hidden />
            {invited.length > 0 ? `Enviar a ${invited.length} comunidades` : "Enviar"}
          </Button>
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancelar
          </Button>
        </div>
      </form>
    </Panel>
  );
}

function PollCard({ community, poll }: { community: CalendarCommunity; poll: Poll }) {
  const queryClient = useQueryClient();
  const [picking, setPicking] = useState<string | null>(null);
  const refresh = () => void queryClient.invalidateQueries({ queryKey: orpc.polls.list.key() });
  const vote = useMutation(
    orpc.polls.vote.mutationOptions({
      onSuccess: refresh,
      onError: (error) => toast.error("No se pudo", error.message),
    })
  );
  const choose = useMutation(
    orpc.polls.choose.mutationOptions({
      onSuccess: (result) => {
        setPicking(null);
        const day = result.poll.chosenDay ?? "";
        const yes = result.poll.communities.filter(
          (row) => row.id !== community.id && row.answers[day] === "yes"
        ).length;
        toast.success(
          "Fecha reservada",
          yes > 0
            ? "Invitamos a coorganizar a las comunidades que dijeron que sí."
            : "Queda reservada 14 días: seguí armando el evento."
        );
        refresh();
      },
      onError: (error) => toast.error("No se pudo reservar", error.message),
    })
  );
  const closed = poll.chosenDay !== null;
  const tally = (day: string) =>
    poll.communities.reduce(
      (sum, row) => ({
        yes: sum.yes + (row.answers[day] === "yes" ? 1 : 0),
        maybe: sum.maybe + (row.answers[day] === "maybe" ? 1 : 0),
      }),
      { yes: 0, maybe: 0 }
    );

  return (
    <Panel>
      <PanelHead
        actions={
          closed ? (
            <Badge variant="success">
              <Check aria-hidden />
              {dayLabel(poll.chosenDay ?? "")}
            </Badge>
          ) : poll.mine ? (
            <Badge variant="info">Elegís vos</Badge>
          ) : (
            <Badge variant="secondary">Pregunta {poll.asker.name}</Badge>
          )
        }
        icon={Vote}
        meta={<span className="font-terminal tabular-nums">{poll.startTime}</span>}
        title={poll.title}
      />
      <div className="overflow-x-auto">
        <table className="w-full min-w-max border-collapse text-ui">
          <thead>
            <tr className="border-b border-border">
              <th className="px-4 py-2 text-left font-normal text-muted-foreground" scope="col">
                Comunidad
              </th>
              {poll.days.map((day) => (
                <th
                  key={day}
                  className={cn(
                    "px-2 py-2 text-center font-terminal font-normal text-muted-foreground tabular-nums",
                    poll.chosenDay === day && "text-primary"
                  )}
                  scope="col"
                >
                  {dayLabel(day)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {poll.communities.map((row) => {
              const own = row.id === community.id;

              return (
                <tr key={row.id} className={cn("border-b border-border", own && "bg-raised/40")}>
                  <th className="px-4 py-2 text-left font-normal text-foreground" scope="row">
                    {row.name}
                    {own ? <span className="ml-2 text-meta text-muted-foreground">(ustedes)</span> : null}
                  </th>
                  {poll.days.map((day) => {
                    const answer = row.answers[day] as Answer | undefined;
                    const shown = answer ? ANSWERS[answer] : null;
                    const Icon = shown?.icon ?? Minus;
                    const cell = (
                      <span
                        className={cn(
                          "inline-flex h-7 min-w-24 items-center justify-center gap-1 rounded-md border px-2 text-meta",
                          shown?.className ?? "border-border text-faint"
                        )}
                      >
                        <Icon aria-hidden className="size-3.5" />
                        {shown?.label ?? "Sin responder"}
                      </span>
                    );

                    return (
                      <td key={day} className="px-2 py-2 text-center">
                        {own && !closed ? (
                          <button
                            aria-label={`${dayLabel(day)}: ${shown?.label ?? "sin responder"}. Cambiar`}
                            className="rounded-md focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none disabled:opacity-60"
                            disabled={vote.isPending}
                            type="button"
                            onClick={() =>
                              vote.mutate({
                                communityId: community.id,
                                pollId: poll.id,
                                votes: [{ day, answer: NEXT[answer ?? "none"] }],
                              })
                            }
                          >
                            {cell}
                          </button>
                        ) : (
                          cell
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            <tr>
              <th className="px-4 py-2 text-left font-normal text-muted-foreground" scope="row">
                Les sirve
              </th>
              {poll.days.map((day) => {
                const { yes, maybe } = tally(day);

                return (
                  <td key={day} className="px-2 py-2 text-center">
                    <span className="font-terminal text-meta text-subtle tabular-nums">
                      {yes} sí{maybe ? ` · ${maybe} ?` : ""}
                    </span>
                    {poll.mine && !closed ? (
                      <div className="mt-1.5">
                        <Button size="xs" variant="outline" onClick={() => setPicking(day)}>
                          Elegir
                        </Button>
                      </div>
                    ) : null}
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>
      {poll.mine && poll.eventId ? (
        <p className="border-t border-border px-4 py-3 text-meta text-muted-foreground">
          Reservada como borrador:{" "}
          <Link
            className="text-foreground underline underline-offset-2"
            href={`/organizar/panel/${community.slug}/eventos/${poll.eventId}/editar`}
          >
            seguir armando el evento
          </Link>
        </p>
      ) : null}
      <ConfirmDialog
        confirmLabel="Reservar esta fecha"
        description="Queda reservada 14 días como cualquier reserva, y las comunidades que dijeron que sí quedan invitadas a coorganizar. La encuesta se cierra."
        open={picking !== null}
        pending={choose.isPending}
        pendingLabel="Reservando…"
        title={picking ? `¿Elegir el ${dayLabel(picking)}?` : ""}
        onConfirm={() => picking && choose.mutate({ communityId: community.id, pollId: poll.id, day: picking })}
        onOpenChange={(open) => !open && setPicking(null)}
      />
    </Panel>
  );
}
