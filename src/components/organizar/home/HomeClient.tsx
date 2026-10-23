"use client";

import type React from "react";
import Link from "next/link";
import { useMutation, useQueries, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  Bookmark,
  CalendarDays,
  CalendarSearch,
  Check,
  CircleCheck,
  ListChecks,
  Rocket,
  Users,
} from "lucide-react";

import { cn } from "app/lib/utils";
import { Kpi } from "components/Admin/hoy/parts";
import { MicroLabel, Meter, PageContainer, PageHeader, Panel, PanelHead } from "components/Admin/ui/page";
import { PersonAvatar } from "components/Admin/ui/person";
import { EmptyState, ErrorState } from "components/Admin/ui/states";
import { RelativeTime } from "components/Admin/ui/time";
import { usePanelSummary } from "components/organizar/shell/context";
import {
  holdLeft,
  isNew,
  milestones,
  onboarding,
  todoItems,
  type Todo,
  type TodoKind,
} from "components/organizar/shell/todo";
import { Badge } from "components/shared/ui/badge";
import { Button } from "components/shared/ui/button";
import { Skeleton } from "components/shared/ui/skeleton";
import { toast } from "components/shared/ui/toast-utils";
import { daysBetween } from "lib/calendar/holidays";
import { shiftMonth } from "lib/calendar/items";
import { clockTime, dayKey, shortWhen } from "lib/community/time";
import { HOLD_DAYS } from "lib/organizar/rules";
import { plural } from "lib/organizar/words";
import type { PlanItem } from "lib/orpc/calendar/schemas";
import { orpc } from "lib/orpc/client";
import type { OrganizerEvent } from "lib/orpc/events/schemas";
import type { PanelSummary } from "lib/orpc/panel/schemas";

import type { CalendarCommunity } from "../calendar/CalendarClient";

const AHEAD_DAYS = 21;

/** The button that takes a to-do to the page where it gets resolved. */
const GO_RESOLVE: Record<TodoKind, string> = {
  renew: "Renovar",
  task: "Ver",
  closeout: "Cerrar",
  pacing: "Difundir",
  venue: "Pedir a otro",
  conflict: "Ver el día",
  poll: "Responder",
  cohost: "Responder",
  date: "Elegir fecha",
  slot: "Reservar",
  health: "Buscar fecha",
  team: "Sumar a alguien",
  first: "Buscar fecha",
};

/** A hold's schedule as the hold procedure takes it: its day, wall-clock start and length. */
const scheduleOf = (event: OrganizerEvent) => {
  const start = new Date(event.startDate);

  return {
    day: dayKey(start),
    startTime: clockTime(start),
    durationMin: Math.round((Date.parse(event.endDate) - start.getTime()) / 60_000),
  };
};

/**
 * The panel's front page: the next event and how it fills, how the community is doing, what needs
 * doing, what's coming, what the team did, and what's on in OWU. A community that never published
 * gets its first steps instead.
 */
export function HomeClient({ community, today }: { community: CalendarCommunity; today: string }) {
  const base = `/organizar/panel/${community.slug}`;
  const queryClient = useQueryClient();
  // The same read as the sidebar and the bell: the shell refreshes it after every change
  const summary = usePanelSummary();
  const months = [today.slice(0, 7), shiftMonth(today.slice(0, 7), 1)];
  const plans = useQueries({
    queries: months.map((month) => orpc.calendar.plan.queryOptions({ input: { communityId: community.id, month } })),
  });

  const answer = useMutation(
    orpc.events.answerCohost.mutationOptions({
      onSuccess: (result) => toast.success(result.accepted ? "Ahora lo coorganizan" : "Invitación rechazada"),
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
        toast.success("Renovaste la reserva", `El ${shortWhen(result.startDate)} queda tuyo ${HOLD_DAYS} días más.`);
        void invalidate();
      },
      onError: (error) => toast.error("No se pudo renovar", error.message),
    })
  );
  // Undoing a release reserves the same date again
  const rehold = useMutation(
    orpc.events.hold.mutationOptions({
      onSuccess: () => {
        toast.success("Volviste a reservar la fecha");
        void invalidate();
      },
      onError: (error) => toast.error("No se pudo volver a reservar", error.message),
    })
  );
  const release = useMutation(
    orpc.events.release.mutationOptions({
      onError: (error) => toast.error("No se pudo liberar", error.message),
    })
  );
  const renewHold = (event: OrganizerEvent) =>
    renew.mutate({ communityId: community.id, eventId: event.id, ...scheduleOf(event) });
  const releaseHold = (event: OrganizerEvent) =>
    release.mutate(
      { communityId: community.id, eventId: event.id },
      {
        onSuccess: () => {
          toast.undo(`Liberaste el ${shortWhen(event.startDate)}`, () =>
            rehold.mutate({ communityId: community.id, eventId: event.id, ...scheduleOf(event) })
          );
          void invalidate();
        },
      }
    );

  const now = Date.now();
  const data = summary.data;
  const next = data?.ahead[0];
  const holds = (data?.drafts ?? [])
    .filter((event) => event.heldUntil && Date.parse(event.heldUntil) > now)
    .toSorted((a, b) => a.startDate.localeCompare(b.startDate));
  const todo = todoItems(data, community.slug, now);
  const coming = milestones(data, now);
  const fresh = data ? isNew(data) : false;
  const steps = data && fresh ? onboarding(data, community.slug, now) : [];

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

  /** What resolves an item: right here when it can (renew, co-host), else a link to where. */
  const resolve = (item: Todo): React.ReactNode => {
    if (item.kind === "renew") {
      const event = holds.find((hold) => hold.id === item.eventId);
      return event ? (
        <Button disabled={renew.isPending} size="xs" variant="outline" onClick={() => renewHold(event)}>
          Renovar
        </Button>
      ) : null;
    }
    if (item.kind === "cohost" && item.eventId) {
      const hostedEventId = item.eventId;
      return (
        <span className="flex gap-1.5">
          <Button
            disabled={answer.isPending}
            size="xs"
            variant="outline"
            onClick={() => answer.mutate({ communityId: community.id, hostedEventId, accept: true })}
          >
            Aceptar
          </Button>
          <Button
            disabled={answer.isPending}
            size="xs"
            variant="ghost"
            onClick={() => answer.mutate({ communityId: community.id, hostedEventId, accept: false })}
          >
            No
          </Button>
        </span>
      );
    }

    return (
      <Button asChild size="xs" variant="outline">
        <Link href={item.href}>{GO_RESOLVE[item.kind]}</Link>
      </Button>
    );
  };

  // Phones read top to bottom: "Para hacer" right under the next event (it's in the side column on desktop)
  const todoPanel = (className: string) => (
    <Panel aria-label="Para hacer" className={className}>
      <PanelHead icon={ListChecks} meta={todo.length || undefined} title="Para hacer" />
      {!data ? (
        <Skeleton className="m-3.5 h-16" />
      ) : todo.length === 0 ? (
        <div className="flex items-center gap-2.5 p-3.5 text-ui text-muted-foreground">
          <CircleCheck aria-hidden className="size-[18px] shrink-0 text-success" />
          {fresh ? "Empezá por los primeros pasos." : "Nada pendiente. Bien ahí."}
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {todo.map((item) => (
            <li key={item.id} className="flex items-center gap-2.5 px-3.5 py-2.5">
              <span
                aria-label="Pendiente"
                className="size-[18px] shrink-0 rounded-full border-[1.5px] border-dashed border-faint"
                role="img"
              />
              <span className="min-w-0 flex-1 text-ui text-foreground">{item.text}</span>
              {resolve(item)}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );

  return (
    <PageContainer>
      <PageHeader
        actions={
          <Button asChild variant="outline">
            <Link href={`${base}/calendario`}>
              <CalendarSearch />
              Buscar fecha
            </Link>
          </Button>
        }
        description={`Lo que ${community.name} tiene en marcha, y lo que pasa en OWU.`}
        title="Inicio"
      />

      {summary.isError ? (
        <ErrorState
          retrying={summary.isFetching}
          title="No pudimos traer el resumen"
          onRetry={() => void summary.refetch()}
        />
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="flex min-w-0 flex-col gap-4">
            {fresh ? <FirstSteps steps={steps} /> : null}

            {fresh ? null : (
              <Panel aria-label="Próximo evento" className="order-1">
                <PanelHead icon={CalendarDays} title="Próximo evento" />
                {!data ? (
                  <Skeleton className="m-3.5 h-20" />
                ) : next ? (
                  <NextEvent base={base} event={next} seats={data.nextSeats} today={today} />
                ) : (
                  <EmptyState
                    compact
                    description="Cuando publiques uno desde Organizá, aparece acá."
                    icon={CalendarDays}
                    title="Ningún evento publicado por delante"
                  />
                )}
              </Panel>
            )}

            {todoPanel("order-2 lg:hidden")}

            {data && fresh ? null : (
              <div className="order-4 lg:order-2">
                {data ? <Stats summary={data} today={today} /> : <Skeleton className="h-[104px] rounded-lg" />}
              </div>
            )}

            {fresh && holds.length === 0 ? null : (
              <Panel aria-label="Tus reservas" className="order-3">
                <PanelHead icon={Bookmark} meta={holds.length || undefined} title="Tus reservas" />
                {!data ? (
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
                            <p className="text-ui font-medium break-words text-foreground">{event.name}</p>
                            <p className="font-terminal text-meta text-muted-foreground tabular-nums">
                              {shortWhen(event.startDate)} · {holdLeft(days)}
                            </p>
                            <Meter
                              className="mt-2 max-w-48"
                              label={`La reserva ${holdLeft(days)}`}
                              max={HOLD_DAYS}
                              tone={days <= 2 ? "warning" : "info"}
                              value={days}
                            />
                          </div>
                          <div className="flex gap-1.5">
                            <Button
                              aria-label={`Renovar la reserva del ${shortWhen(event.startDate)}`}
                              disabled={renew.isPending}
                              size="sm"
                              variant="outline"
                              onClick={() => renewHold(event)}
                            >
                              Renovar
                            </Button>
                            <Button
                              aria-label={`Liberar el ${shortWhen(event.startDate)}`}
                              disabled={release.isPending}
                              size="sm"
                              variant="ghost"
                              onClick={() => releaseHold(event)}
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
            )}

            {data && fresh ? null : (
              <Panel aria-label="Actividad del equipo" className="order-5">
                <PanelHead icon={Activity} meta="últimos cambios" title="Actividad del equipo" />
                {!data ? (
                  <Skeleton className="m-3.5 h-16" />
                ) : data.activity.length === 0 ? (
                  <p className="px-4 py-6 text-center text-meta text-muted-foreground">
                    Todavía no hay cambios registrados.
                  </p>
                ) : (
                  <ul className="grid py-1 md:grid-cols-2">
                    {data.activity.map((item) => (
                      <li key={item.id} className="flex min-w-0 items-start gap-2.5 px-4 py-2">
                        {item.actor ? (
                          <PersonAvatar className="mt-px" image={item.actor.image} name={item.actor.name} size={20} />
                        ) : (
                          <span className="mt-px flex size-5 shrink-0 items-center justify-center rounded-md bg-raised ring-1 ring-border">
                            <CircleCheck aria-hidden className="size-3 text-subtle" />
                          </span>
                        )}
                        <div className="min-w-0 flex-1 text-meta">
                          <p className="text-subtle">
                            {item.actor ? (
                              <span className="font-medium text-foreground">{item.actor.name.split(" ")[0]} </span>
                            ) : null}
                            {item.summary}
                          </p>
                          <p className="truncate text-2xs text-muted-foreground">{item.eventName}</p>
                        </div>
                        <RelativeTime className="shrink-0 text-2xs text-muted-foreground" date={item.createdAt} />
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            )}
          </div>

          <div className="flex min-w-0 flex-col gap-4">
            {todoPanel("max-lg:hidden")}

            {data && fresh ? null : (
              <Panel aria-label="Próximos hitos" className="p-4">
                <MicroLabel className="mb-3 block">Próximos hitos</MicroLabel>
                {!data ? (
                  <Skeleton className="h-16" />
                ) : coming.length === 0 ? (
                  <p className="text-meta text-muted-foreground">Nada en el horizonte: reservá una fecha.</p>
                ) : (
                  <ol>
                    {coming.map((milestone, index) => (
                      <li key={milestone.id} className="relative flex gap-3 pb-4 last:pb-0">
                        <div className="flex flex-col items-center">
                          <span
                            aria-hidden
                            className={cn(
                              "mt-1 size-2.5 rounded-full",
                              index === 0
                                ? "bg-primary shadow-[0_0_0_4px_hsl(var(--primary)/0.15)]"
                                : milestone.kind === "event"
                                  ? "bg-success"
                                  : milestone.kind === "hold"
                                    ? "border border-dashed border-info-foreground bg-background"
                                    : "border border-input bg-background"
                            )}
                          />
                          {index < coming.length - 1 ? (
                            <span aria-hidden className="mt-1 w-px flex-1 bg-input" />
                          ) : null}
                        </div>
                        <div className="-mt-0.5 min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className={cn("truncate text-ui", index === 0 && "font-medium")}>
                              {milestone.title}
                            </span>
                            <span
                              className={cn(
                                "shrink-0 font-terminal text-2xs tabular-nums",
                                index === 0 ? "text-primary" : "text-muted-foreground"
                              )}
                            >
                              {shortWhen(milestone.at)}
                            </span>
                          </div>
                          <p className="truncate text-meta text-muted-foreground">{milestone.meta}</p>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </Panel>
            )}

            <Panel aria-label="En OWU las próximas 3 semanas">
              <PanelHead icon={Users} meta={around.length || undefined} title="En OWU las próximas 3 semanas" />
              {plans.some((plan) => plan.isError) ? (
                <ErrorState
                  compact
                  className="m-3"
                  retrying={plans.some((plan) => plan.isFetching)}
                  title="No pudimos traer el calendario de OWU"
                  onRetry={() => plans.forEach((plan) => plan.isError && void plan.refetch())}
                />
              ) : plans.some((plan) => plan.isPending) ? (
                <Skeleton className="m-3.5 h-24" />
              ) : around.length === 0 ? (
                <p className="p-3.5 text-ui text-muted-foreground">Ninguna otra comunidad anunció nada todavía.</p>
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
      )}
    </PageContainer>
  );
}

/** A new community's first steps, ticked from what it already has; gone once it publishes. */
function FirstSteps({ steps }: { steps: ReturnType<typeof onboarding> }) {
  const done = steps.filter((step) => step.done).length;

  return (
    <Panel aria-label="Primeros pasos" className="order-first">
      <PanelHead
        icon={Rocket}
        meta={<span className="font-terminal tabular-nums">{`${done} de ${steps.length} listos`}</span>}
        title="Primeros pasos"
      />
      <ol className="divide-y divide-border">
        {steps.map((step) => (
          <li key={step.id}>
            <Link
              className="flex items-center gap-3 px-3.5 py-3 text-ui transition-colors hover:bg-raised"
              href={step.href}
            >
              {step.done ? (
                <span className="grid size-[18px] shrink-0 place-items-center rounded-full bg-success text-background">
                  <Check aria-hidden className="size-3" strokeWidth={3} />
                </span>
              ) : (
                <span
                  aria-hidden
                  className="size-[18px] shrink-0 rounded-full border-[1.5px] border-dashed border-faint"
                />
              )}
              <span
                className={cn("min-w-0 flex-1", step.done ? "text-muted-foreground line-through" : "text-foreground")}
              >
                {step.text}
                <span className="sr-only">{step.done ? " (listo)" : " (pendiente)"}</span>
              </span>
              {step.done ? null : <ArrowRight aria-hidden className="size-4 shrink-0 text-muted-foreground" />}
            </Link>
          </li>
        ))}
      </ol>
    </Panel>
  );
}

/** The next published event: when, how it fills (capacity meter, waitlist), a way into its tablero. */
function NextEvent({
  event,
  seats,
  base,
  today,
}: {
  event: OrganizerEvent;
  seats: PanelSummary["nextSeats"];
  base: string;
  today: string;
}) {
  const days = daysBetween(today, dayKey(event.startDate));
  const counted = event.registration === "owu" || event.registration === "eventbrite";

  return (
    <div className="flex flex-col gap-3 p-3.5">
      <div className="flex items-center gap-4">
        <div className="grid size-14 shrink-0 place-items-center rounded-lg border border-border bg-raised text-center">
          <span className="font-terminal text-[22px] leading-6 font-semibold text-foreground tabular-nums">
            {Number(dayKey(event.startDate).slice(8))}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-medium break-words text-foreground">{event.name}</p>
          <p className="font-terminal text-meta text-muted-foreground tabular-nums">{shortWhen(event.startDate)}</p>
        </div>
        <Badge variant="success">{days <= 0 ? "Hoy" : days === 1 ? "Mañana" : `Faltan ${days} días`}</Badge>
      </div>
      <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
        <div className="min-w-48 flex-1">
          {counted && seats ? (
            <>
              <div className="flex items-baseline justify-between gap-2">
                <MicroLabel>Lugares</MicroLabel>
                <span className="font-terminal text-meta text-muted-foreground tabular-nums">
                  {event.capacity
                    ? `${seats.taken} de ${event.capacity}`
                    : plural(seats.taken, "lugar ocupado", "lugares ocupados")}
                  {seats.waiting ? ` · ${seats.waiting} en espera` : ""}
                </span>
              </div>
              {event.capacity ? (
                <Meter
                  className="mt-2"
                  label="Lugares ocupados"
                  max={event.capacity}
                  tone={seats.taken >= event.capacity ? "warning" : "primary"}
                  value={seats.taken}
                />
              ) : null}
            </>
          ) : (
            <p className="text-meta text-muted-foreground">
              {event.registration === "external" ? "La inscripción es externa." : "Entrada libre, sin inscripción."}
            </p>
          )}
        </div>
        <Button asChild size="sm" variant="outline">
          <Link href={`${base}/eventos/${event.id}`}>
            Abrir el tablero
            <ArrowUpRight />
          </Link>
        </Button>
      </div>
    </div>
  );
}

/** Inicio's KPI strip: show-up rate, followers, events published this year. */
function Stats({ summary, today }: { summary: PanelSummary; today: string }) {
  const { rate, events } = summary.showUp;
  const mono = (value: React.ReactNode) => <span className="font-terminal tabular-nums">{value}</span>;

  return (
    <Panel className="grid divide-border max-sm:divide-y sm:grid-cols-3 sm:divide-x">
      <Kpi label="De los anotados, vienen" value={mono(rate === null ? "—" : `${Math.round(rate * 100)} %`)}>
        {rate === null ? (
          <p className="mt-2 text-meta text-muted-foreground">Lo calculamos cuando uses la puerta en 3 eventos.</p>
        ) : (
          <>
            <Meter className="mt-2" label="De los anotados, cuántos vienen" tone="success" value={rate * 100} />
            <p className="mt-1.5 text-meta text-muted-foreground">
              en tus últimos {plural(events, "evento", "eventos")}
            </p>
          </>
        )}
      </Kpi>
      <Kpi label="Seguidores" value={mono(summary.followers)}>
        <p className="mt-2 text-meta text-muted-foreground">Les llega cada evento nuevo que publiques.</p>
      </Kpi>
      <Kpi label={`Publicados en ${today.slice(0, 4)}`} value={mono(summary.publishedThisYear)}>
        <p className="mt-2 text-meta text-muted-foreground">
          {summary.ahead.length === 0
            ? "Ninguno por delante"
            : `${summary.ahead.length} ${summary.ahead.length === 1 ? "sigue" : "siguen"} por delante`}
        </p>
      </Kpi>
    </Panel>
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
