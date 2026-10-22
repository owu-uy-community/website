"use client";

import Link from "next/link";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Bookmark, CalendarDays, CalendarSearch, Circle, ListChecks, Users } from "lucide-react";

import { MicroLabel, Meter, PageContainer, PageHeader, Panel, PanelHead } from "components/Admin/ui/page";
import { EmptyState } from "components/Admin/ui/states";
import { Badge } from "components/shared/ui/badge";
import { Button } from "components/shared/ui/button";
import { Skeleton } from "components/shared/ui/skeleton";
import { toast } from "components/shared/ui/toast-utils";
import { daysBetween } from "lib/calendar/holidays";
import { shiftMonth } from "lib/calendar/items";
import { dayKey, shortWhen } from "lib/community/time";
import type { PlanItem } from "lib/orpc/calendar/schemas";
import { orpc } from "lib/orpc/client";
import type { OrganizerEvent } from "lib/orpc/events/schemas";

import type { CalendarCommunity } from "../calendar/CalendarClient";

const HOLD_DAYS = 14;
const AHEAD_DAYS = 21;

const left = (days: number) => (days <= 0 ? "vence hoy" : days === 1 ? "vence mañana" : `vence en ${days} días`);

/** The panel's front page: the next event, the reserved dates, what needs doing, what's on in OWU. */
export function HomeClient({ community, today }: { community: CalendarCommunity; today: string }) {
  const base = `/organizar/panel/${community.slug}`;
  const queryClient = useQueryClient();
  const events = useQuery(orpc.events.list.queryOptions({ input: { communityId: community.id } }));
  const months = [today.slice(0, 7), shiftMonth(today.slice(0, 7), 1)];
  const plans = useQueries({
    queries: months.map((month) => orpc.calendar.plan.queryOptions({ input: { communityId: community.id, month } })),
  });

  const invitations = useQuery(orpc.events.cohostInvitations.queryOptions({ input: { communityId: community.id } }));
  const polls = useQuery(orpc.polls.list.queryOptions({ input: { communityId: community.id } }));
  const answer = useMutation(
    orpc.events.answerCohost.mutationOptions({
      onSuccess: (result) => {
        toast.success(result.accepted ? "Ahora lo coorganizan" : "Invitación rechazada");
        void queryClient.invalidateQueries({ queryKey: orpc.events.cohostInvitations.key() });
      },
      onError: (error) => toast.error("No se pudo responder", error.message),
    })
  );

  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: orpc.events.list.key() }),
      queryClient.invalidateQueries({ queryKey: orpc.calendar.plan.key() }),
    ]);
  const renew = useMutation(
    orpc.events.hold.mutationOptions({
      onSuccess: (result) => {
        toast.success("Renovaste la reserva", `El ${shortWhen(result.startDate)} queda tuyo 14 días más.`);
        void invalidate();
      },
      onError: (error) => toast.error("No se pudo renovar", error.message),
    })
  );
  const release = useMutation(
    orpc.events.release.mutationOptions({
      onSuccess: () => {
        toast.success("Liberaste la fecha");
        void invalidate();
      },
      onError: (error) => toast.error("No se pudo liberar", error.message),
    })
  );
  const renewHold = (event: OrganizerEvent) => {
    const start = new Date(event.startDate);
    const clock = new Intl.DateTimeFormat("en-GB", {
      timeZone: "America/Montevideo",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(start);
    renew.mutate({
      communityId: community.id,
      eventId: event.id,
      day: dayKey(start),
      startTime: clock,
      durationMin: Math.round((Date.parse(event.endDate) - start.getTime()) / 60_000),
    });
  };

  const now = Date.now();
  const all = events.data ?? [];
  const next = all
    .filter((event) => event.status === "published" && Date.parse(event.endDate) > now)
    .toSorted((a, b) => a.startDate.localeCompare(b.startDate))[0];
  const holds = all
    .filter((event) => event.status === "draft" && event.heldUntil && Date.parse(event.heldUntil) > now)
    .toSorted((a, b) => a.startDate.localeCompare(b.startDate));
  const lapsed = all.filter(
    (event) => event.status === "draft" && event.heldUntil !== null && Date.parse(event.heldUntil) <= now
  );
  const undated = all.filter((event) => event.status === "draft" && !event.dateChosen);

  const seen = new Set<string>();
  const around = plans
    .flatMap((plan) => plan.data?.items ?? [])
    .filter((item) => {
      if (item.own || seen.has(item.id)) return false;
      seen.add(item.id);
      const start = Date.parse(item.start);

      return start >= now && start <= now + AHEAD_DAYS * 86_400_000;
    })
    .toSorted((a, b) => a.start.localeCompare(b.start));

  const todo: { id: string; text: string; action: React.ReactNode }[] = [
    ...(polls.data ?? [])
      .filter(
        (poll) =>
          !poll.mine &&
          !poll.chosenDay &&
          Object.keys(poll.communities.find((row) => row.id === community.id)?.answers ?? {}).length === 0
      )
      .map((poll) => ({
        id: `poll-${poll.id}`,
        text: `${poll.asker.name} pregunta qué fecha les sirve para «${poll.title}»`,
        action: (
          <Button asChild size="xs" variant="outline">
            <Link href={`${base}/encuestas`}>Responder</Link>
          </Button>
        ),
      })),
    ...(invitations.data ?? []).map((invitation) => ({
      id: `cohost-${invitation.eventId}`,
      text: `${invitation.host} los invita a coorganizar «${invitation.name}» (${shortWhen(invitation.startDate)})`,
      action: (
        <span className="flex gap-1.5">
          <Button
            disabled={answer.isPending}
            size="xs"
            variant="outline"
            onClick={() =>
              answer.mutate({ communityId: community.id, hostedEventId: invitation.eventId, accept: true })
            }
          >
            Aceptar
          </Button>
          <Button
            disabled={answer.isPending}
            size="xs"
            variant="ghost"
            onClick={() =>
              answer.mutate({ communityId: community.id, hostedEventId: invitation.eventId, accept: false })
            }
          >
            No
          </Button>
        </span>
      ),
    })),
    ...holds
      .filter((event) => daysBetween(today, dayKey(event.heldUntil ?? event.startDate)) <= 3)
      .map((event) => ({
        id: `renew-${event.id}`,
        text: `La reserva del ${shortWhen(event.startDate)} ${left(daysBetween(today, dayKey(event.heldUntil ?? "")))}`,
        action: (
          <Button disabled={renew.isPending} size="xs" variant="outline" onClick={() => renewHold(event)}>
            Renovar
          </Button>
        ),
      })),
    ...[...lapsed, ...undated].map((event) => ({
      id: `date-${event.id}`,
      text: lapsed.includes(event) ? `La reserva de «${event.name}» venció` : `«${event.name}» no tiene fecha`,
      action: (
        <Button asChild size="xs" variant="outline">
          <Link href={`${base}/calendario?evento=${event.id}`}>Elegir fecha</Link>
        </Button>
      ),
    })),
    ...(holds.length === 0 && !next && events.isSuccess
      ? [
          {
            id: "first-date",
            text: "Reservá la fecha de tu próximo meetup",
            action: (
              <Button asChild size="xs" variant="outline">
                <Link href={`${base}/calendario`}>Buscar fecha</Link>
              </Button>
            ),
          },
        ]
      : []),
  ];

  return (
    <PageContainer>
      <PageHeader
        actions={
          <Button asChild>
            <Link href={`${base}/calendario`}>
              <CalendarSearch />
              Buscar fecha
            </Link>
          </Button>
        }
        description={`Lo que ${community.name} tiene en marcha, y lo que pasa en OWU.`}
        title="Inicio"
      />

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex flex-col gap-4">
          <Panel>
            <PanelHead icon={CalendarDays} title="Próximo evento" />
            {events.isPending ? (
              <Skeleton className="m-3.5 h-14" />
            ) : next ? (
              <div className="flex items-center gap-4 p-3.5">
                <div className="grid size-14 shrink-0 place-items-center rounded-lg border border-border bg-raised text-center">
                  <span className="font-terminal text-[22px] leading-6 font-semibold text-foreground tabular-nums">
                    {Number(dayKey(next.startDate).slice(8))}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-medium text-foreground">{next.name}</p>
                  <p className="font-terminal text-meta text-muted-foreground tabular-nums">
                    {shortWhen(next.startDate)}
                  </p>
                </div>
                <Badge variant="success">
                  {daysBetween(today, dayKey(next.startDate)) === 0
                    ? "Hoy"
                    : `Faltan ${daysBetween(today, dayKey(next.startDate))} días`}
                </Badge>
              </div>
            ) : (
              <EmptyState
                compact
                description="Cuando publiques uno desde Organizá, aparece acá."
                icon={CalendarDays}
                title="Ningún evento publicado por delante"
              />
            )}
          </Panel>

          <Panel>
            <PanelHead icon={Bookmark} meta={holds.length || undefined} title="Tus reservas" />
            {events.isPending ? (
              <Skeleton className="m-3.5 h-20" />
            ) : holds.length === 0 ? (
              <EmptyState
                compact
                action={
                  <Button asChild size="sm" variant="outline">
                    <Link href={`${base}/calendario`}>Ir al calendario</Link>
                  </Button>
                }
                description="Reservá una fecha en el calendario: todas las comunidades la ven y la evitan."
                icon={Bookmark}
                title="Sin fechas reservadas"
              />
            ) : (
              <ul className="divide-y divide-border">
                {holds.map((event) => {
                  const days = daysBetween(today, dayKey(event.heldUntil ?? ""));

                  return (
                    <li key={event.id} className="flex flex-wrap items-center gap-3 px-3.5 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-ui font-medium text-foreground">{event.name}</p>
                        <p className="font-terminal text-meta text-muted-foreground tabular-nums">
                          {shortWhen(event.startDate)} · {left(days)}
                        </p>
                        <Meter
                          className="mt-2 max-w-48"
                          label="Tiempo que le queda a la reserva"
                          max={HOLD_DAYS}
                          tone={days <= 2 ? "warning" : "info"}
                          value={days}
                        />
                      </div>
                      <div className="flex gap-1.5">
                        <Button disabled={renew.isPending} size="sm" variant="outline" onClick={() => renewHold(event)}>
                          Renovar
                        </Button>
                        <Button
                          disabled={release.isPending}
                          size="sm"
                          variant="ghost"
                          onClick={() => release.mutate({ communityId: community.id, eventId: event.id })}
                        >
                          Liberar
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        </div>

        <div className="flex flex-col gap-4">
          <Panel>
            <PanelHead icon={ListChecks} meta={todo.length || undefined} title="Para hacer" />
            {events.isPending ? (
              <Skeleton className="m-3.5 h-16" />
            ) : todo.length === 0 ? (
              <p className="p-3.5 text-ui text-muted-foreground">Nada pendiente. Bien ahí.</p>
            ) : (
              <ul className="divide-y divide-border">
                {todo.map((item) => (
                  <li key={item.id} className="flex items-center gap-2.5 px-3.5 py-2.5">
                    <Circle aria-hidden className="size-3.5 shrink-0 text-faint" />
                    <span className="min-w-0 flex-1 text-ui text-foreground">{item.text}</span>
                    {item.action}
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel>
            <PanelHead icon={Users} meta={around.length || undefined} title="En OWU las próximas 3 semanas" />
            {plans.some((plan) => plan.isPending) ? (
              <Skeleton className="m-3.5 h-24" />
            ) : around.length === 0 ? (
              <p className="p-3.5 text-ui text-muted-foreground">Nadie anunció nada todavía.</p>
            ) : (
              <ul className="flex flex-col p-1.5">
                {around.slice(0, 8).map((item) => (
                  <AroundRow key={item.id} item={item} />
                ))}
              </ul>
            )}
            <div className="border-t border-border p-1.5">
              <Button asChild className="w-full justify-between" size="sm" variant="ghost">
                <Link href={`${base}/calendario`}>
                  <MicroLabel>Ver el calendario</MicroLabel>
                  <ArrowRight />
                </Link>
              </Button>
            </div>
          </Panel>
        </div>
      </div>
    </PageContainer>
  );
}

function AroundRow({ item }: { item: PlanItem }) {
  const [day, time] = shortWhen(item.start).split(" · ");

  return (
    <li className="flex items-center gap-3 rounded-md px-2 py-1.5">
      <span className="flex w-[72px] shrink-0 flex-col font-terminal text-meta leading-4 tabular-nums">
        <span className="whitespace-nowrap text-foreground">{day}</span>
        <span className="text-muted-foreground">{time}</span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-ui text-foreground">
          {item.kind === "hold" ? "Reserva tentativa" : item.title}
        </span>
        <span className="block truncate text-meta text-muted-foreground">{item.communityName}</span>
      </span>
      {item.related ? (
        <Badge title="Público parecido al tuyo" variant="warning">
          Parecido
        </Badge>
      ) : null}
    </li>
  );
}
