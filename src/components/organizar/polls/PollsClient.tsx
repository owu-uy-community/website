"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Check, ChevronDown, CircleHelp, Lock, Minus, Plus, Send, Trash2, Vote, X } from "lucide-react";

import { cn } from "app/lib/utils";
import { MicroLabel, PageContainer, PageHeader, Panel, PanelHead } from "components/Admin/ui/page";
import { EmptyState, ErrorState } from "components/Admin/ui/states";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "components/shared/ui/alert-dialog";
import { Badge } from "components/shared/ui/badge";
import { Button } from "components/shared/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "components/shared/ui/dropdown-menu";
import { Input } from "components/shared/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "components/shared/ui/select";
import { Skeleton } from "components/shared/ui/skeleton";
import { toast } from "components/shared/ui/toast-utils";
import { dateParts } from "lib/community/time";
import { HOLD_DAYS } from "lib/organizar/rules";
import { plural } from "lib/organizar/words";
import { client, orpc } from "lib/orpc/client";
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

/** "jue 12 nov": a poll's days are calendar days, read at noon UTC so no time zone moves them. */
const dayLabel = (day: string) => {
  const parts = dateParts(`${day}T12:00:00Z`, "UTC");

  return `${parts.weekday} ${parts.day} ${parts.month}`;
};

/** Choosing a date with other communities: ask, answer, and pick. */
export function PollsClient({ community, today }: { community: CalendarCommunity; today: string }) {
  const [creating, setCreating] = useState(false);
  const polls = useQuery(orpc.polls.list.queryOptions({ input: { communityId: community.id } }));
  const start = () => setCreating(true);

  return (
    <PageContainer>
      <PageHeader
        actions={
          creating ? null : (
            <Button onClick={start}>
              <Plus aria-hidden />
              Nueva votación
            </Button>
          )
        }
        description="Para un evento con otras comunidades: proponé fechas, cada una dice cuáles le sirven y vos elegís."
        title="Votar fecha"
      />

      <div className="flex flex-col gap-4">
        {creating ? <NewPoll community={community} today={today} onDone={() => setCreating(false)} /> : null}
        {polls.isError ? (
          <ErrorState
            retrying={polls.isFetching}
            title="No pudimos traer las votaciones"
            onRetry={() => void polls.refetch()}
          />
        ) : !polls.data ? (
          <Skeleton className="h-40 rounded-lg" />
        ) : polls.data.length === 0 && !creating ? (
          <Panel>
            <EmptyState
              action={
                <Button size="sm" variant="outline" onClick={start}>
                  <Plus aria-hidden />
                  Nueva votación
                </Button>
              }
              description="Proponé fechas a otras comunidades para un evento juntos. Cuando otra te pregunte, aparece acá."
              icon={Vote}
              title="Ninguna votación todavía"
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
        toast.success(
          "Votación enviada",
          `Les avisamos por mail a ${plural(poll.communities.length - 1, "comunidad", "comunidades")}.`
        );
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
      <PanelHead icon={Vote} title="Nueva votación" />
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
              // oxlint-disable-next-line react/no-array-index-key -- the rows are positions; their values repeat while empty
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
            step={900}
            type="time"
            value={startTime}
            onChange={(event) => setStartTime(event.target.value)}
          />
        </label>
        <div className="flex flex-col gap-1.5">
          <MicroLabel>A quién le preguntás</MicroLabel>
          {others.isError ? (
            <ErrorState
              compact
              description="Sin la lista no podés invitar a nadie. Probá de nuevo."
              retrying={others.isFetching}
              title="No pudimos traer las comunidades"
              onRetry={() => void others.refetch()}
            />
          ) : (
            <div className="flex flex-wrap items-center gap-1.5">
              {invited.map((id) => {
                const name = others.data?.find((item) => item.id === id)?.name ?? "";

                return (
                  <span
                    key={id}
                    className="flex h-7 items-center gap-1.5 rounded-md border border-input pr-1 pl-2 text-meta text-foreground"
                  >
                    {name}
                    <button
                      aria-label={`Sacar a ${name}`}
                      className="grid size-6 place-items-center rounded-sm text-muted-foreground hover:bg-raised hover:text-foreground"
                      type="button"
                      onClick={() => setInvited(invited.filter((item) => item !== id))}
                    >
                      <X aria-hidden className="size-3" />
                    </button>
                  </span>
                );
              })}
              {others.isPending ? (
                <Skeleton className="h-9 w-56" />
              ) : (
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
              )}
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <Button disabled={!ready || create.isPending} type="submit">
            <Send aria-hidden />
            {invited.length > 0 ? `Enviar a ${plural(invited.length, "comunidad", "comunidades")}` : "Enviar"}
          </Button>
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancelar
          </Button>
        </div>
      </form>
    </Panel>
  );
}

/** The community's own answer for a day: a button showing it, a menu to change it. */
function AnswerPicker({
  day,
  answer,
  disabled,
  onPick,
}: {
  day: string;
  answer: Answer | undefined;
  disabled: boolean;
  onPick: (answer: Answer) => void;
}) {
  const shown = answer ? ANSWERS[answer] : null;
  const Icon = shown?.icon ?? Minus;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <button
          aria-label={`Tu respuesta para el ${dayLabel(day)}: ${shown?.label.toLowerCase() ?? "sin responder"}`}
          className={cn(
            "inline-flex h-8 min-w-28 items-center justify-center gap-1 rounded-md border px-2 text-meta shadow-edge transition-colors hover:brightness-125 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60",
            shown?.className ?? "border-input bg-raised text-foreground"
          )}
          type="button"
        >
          <Icon aria-hidden className="size-3.5" />
          {shown?.label ?? "Responder"}
          <ChevronDown aria-hidden className="size-3.5 opacity-70" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center">
        <DropdownMenuRadioGroup value={answer ?? ""} onValueChange={(value) => onPick(value as Answer)}>
          {(Object.keys(ANSWERS) as Answer[]).map((key) => (
            <DropdownMenuRadioItem key={key} value={key}>
              {ANSWERS[key].label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function PollCard({ community, poll }: { community: CalendarCommunity; poll: Poll }) {
  const queryClient = useQueryClient();
  const [picking, setPicking] = useState<string | null>(null);
  const refresh = () => void queryClient.invalidateQueries({ queryKey: orpc.polls.list.key() });
  const ref = { communityId: community.id, pollId: poll.id };
  const vote = useMutation(
    orpc.polls.vote.mutationOptions({
      onSuccess: refresh,
      onError: (error) => toast.error("No se guardó tu respuesta", error.message),
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
            : `Queda reservada ${HOLD_DAYS} días: seguí armando el evento.`
        );
        refresh();
      },
      onError: (error) => toast.error("No se pudo reservar", error.message),
    })
  );
  const close = useMutation(
    orpc.polls.close.mutationOptions({
      onSuccess: () => {
        toast.success("Votación cerrada", "Ya nadie puede cambiar su respuesta.");
        refresh();
      },
      onError: (error) => toast.error("No se pudo cerrar", error.message),
    })
  );
  const remove = useMutation(
    orpc.polls.remove.mutationOptions({
      onSuccess: () => {
        refresh();
        // The card is gone by then: the undo calls the API on its own
        toast.undo(`Borraste «${poll.title}»`, () =>
          client.polls
            .restore(ref)
            .then(refresh)
            .catch((error: Error) => toast.error("No se pudo recuperar", error.message))
        );
      },
      onError: (error) => toast.error("No se pudo borrar", error.message),
    })
  );

  const chosen = poll.chosenDay !== null;
  const open = !chosen && poll.closedAt === null;
  const tally = (day: string) =>
    poll.communities.reduce(
      (sum, row) => ({
        yes: sum.yes + (row.answers[day] === "yes" ? 1 : 0),
        maybe: sum.maybe + (row.answers[day] === "maybe" ? 1 : 0),
      }),
      { yes: 0, maybe: 0 }
    );
  const yesOn = (day: string) =>
    Math.min(3, poll.communities.filter((row) => row.id !== community.id && row.answers[day] === "yes").length);

  return (
    <Panel>
      <PanelHead
        actions={
          chosen ? (
            <Badge variant="success">
              <Check aria-hidden />
              {dayLabel(poll.chosenDay ?? "")}
            </Badge>
          ) : !open ? (
            <Badge variant="secondary">
              <Lock aria-hidden />
              Cerrada
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
      {poll.days.length > 1 ? (
        <p className="px-4 pt-2 text-meta text-muted-foreground sm:hidden">
          Deslizá la tabla para ver las {poll.days.length} fechas.
        </p>
      ) : null}
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
                    if (own && open) {
                      return (
                        <td key={day} className="px-2 py-2 text-center">
                          <AnswerPicker
                            answer={answer}
                            day={day}
                            disabled={vote.isPending}
                            onPick={(next) => vote.mutate({ ...ref, votes: [{ day, answer: next }] })}
                          />
                        </td>
                      );
                    }
                    const shown = answer ? ANSWERS[answer] : null;
                    const Icon = shown?.icon ?? Minus;

                    return (
                      <td key={day} className="px-2 py-2 text-center">
                        <span
                          className={cn(
                            "inline-flex h-7 min-w-24 items-center justify-center gap-1 rounded-md border px-2 text-meta",
                            shown?.className ?? "border-border text-muted-foreground"
                          )}
                        >
                          <Icon aria-hidden className="size-3.5" />
                          {shown?.label ?? "Sin responder"}
                        </span>
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
                    <span className="text-meta text-subtle tabular-nums">
                      {yes} sí{maybe ? ` · ${maybe} si hace falta` : ""}
                    </span>
                    {poll.mine && open ? (
                      <div className="mt-1.5">
                        <Button
                          aria-label={`Elegir el ${dayLabel(day)}`}
                          size="xs"
                          variant="outline"
                          onClick={() => setPicking(day)}
                        >
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
      {poll.mine ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-2.5">
          <p className="mr-auto text-meta text-muted-foreground">
            {poll.eventId ? (
              <>
                Reservada como borrador:{" "}
                <Link
                  className="text-foreground underline underline-offset-2"
                  href={`/organizar/panel/${community.slug}/eventos/${poll.eventId}/editar`}
                >
                  seguir armando el evento
                </Link>
              </>
            ) : null}
          </p>
          {open ? (
            <Button disabled={close.isPending} size="sm" variant="ghost" onClick={() => close.mutate(ref)}>
              <Ban aria-hidden />
              Cerrar
            </Button>
          ) : null}
          <Button
            aria-label={`Borrar la votación «${poll.title}»`}
            disabled={remove.isPending}
            size="sm"
            variant="ghost"
            onClick={() => remove.mutate(ref)}
          >
            <Trash2 aria-hidden />
            Borrar
          </Button>
        </div>
      ) : null}
      <AlertDialog open={picking !== null} onOpenChange={(next) => !next && !choose.isPending && setPicking(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{picking ? `Reservar el ${dayLabel(picking)} · ${poll.startTime}` : ""}</AlertDialogTitle>
            <AlertDialogDescription>
              Queda reservada {HOLD_DAYS} días como cualquier reserva y la votación se cierra.
              {picking && yesOn(picking) > 0
                ? ` ${yesOn(picking) === 1 ? "La comunidad que dijo" : `Las ${yesOn(picking)} comunidades que dijeron`} que sí quedan invitadas a coorganizar: les avisamos por mail.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={choose.isPending}>Volver</AlertDialogCancel>
            <AlertDialogAction
              disabled={choose.isPending}
              onClick={(event) => {
                event.preventDefault();
                if (picking) choose.mutate({ ...ref, day: picking });
              }}
            >
              {choose.isPending
                ? "Reservando…"
                : picking && yesOn(picking) > 0
                  ? `Reservar e invitar a ${plural(yesOn(picking), "comunidad", "comunidades")}`
                  : "Reservar esta fecha"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Panel>
  );
}
