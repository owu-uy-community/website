"use client";

import type * as React from "react";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { Copy, Pizza, Share2, Users } from "lucide-react";
import { FaLinkedin, FaWhatsapp } from "react-icons/fa";

import { cn } from "app/lib/utils";
import { QrCode } from "components/Admin/comms/QrCode";
import { Countdown } from "components/Admin/hoy/PrepView";
import { AreaChart } from "components/Admin/ui/charts";
import { Meter, MicroLabel, Panel, PanelHead } from "components/Admin/ui/page";
import { ErrorState } from "components/Admin/ui/states";
import { useNow } from "components/Admin/ui/time";
import { Button } from "components/shared/ui/button";
import { copyText } from "components/shared/ui/copy-text";
import { Skeleton } from "components/shared/ui/skeleton";
import { SITE_URL } from "lib/community/site";
import { clockTime, dateParts, MONTEVIDEO_TZ } from "lib/community/time";
import { eventChecklist } from "lib/organizar/checklist";
import { eventPhase } from "lib/organizar/rules";
import { headcount, plural } from "lib/organizar/words";
import type { EditableEvent, EventStats } from "lib/orpc/events/schemas";
import { orpc } from "lib/orpc/client";

import { usePanel } from "../shell/context";
import { AgendaPanel } from "./AgendaPanel";
import { CloseOut } from "./CloseOut";
import { DayView } from "./DayView";
import type { Tab } from "./EventDashboard";
import { ReadyList } from "./ReadyList";
import type { EventInput } from "./save";
import { VolunteersPanel } from "./VolunteersPanel";

/** A stat card: micro label, a big mono figure, then a meter or a line under it. */
function Stat({
  label,
  value,
  note,
  meter,
}: {
  label: string;
  value: React.ReactNode;
  note?: React.ReactNode;
  meter?: React.ReactNode;
}) {
  return (
    <Panel className="flex flex-col gap-2 p-4">
      <MicroLabel>{label}</MicroLabel>
      <p className="font-terminal text-[28px] leading-8 font-semibold text-foreground tabular-nums">{value}</p>
      {meter}
      {note ? <p className="text-meta text-muted-foreground">{note}</p> : null}
    </Panel>
  );
}

const outOf = (value: number, total: number | null) =>
  total ? (
    <>
      {value}
      <span className="text-[16px] text-muted-foreground">/{total}</span>
    </>
  ) : (
    value
  );

/** The event's link to copy, its QR, and WhatsApp and LinkedIn ready to post. */
export function ShareBox({ url, name }: { url: string; name: string }) {
  return (
    <Panel>
      <PanelHead icon={Share2} title="Compartir" />
      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-center gap-2 rounded-md border border-border bg-raised/50 py-1 pr-1 pl-2.5">
          <span className="min-w-0 flex-1 truncate font-terminal text-meta text-foreground">
            {url.replace(/^https?:\/\//, "")}
          </span>
          <Button size="xs" variant="outline" onClick={() => void copyText(url, "Link copiado")}>
            <Copy />
            Copiar
          </Button>
        </div>
        <div className="flex items-start gap-3">
          <div className="shrink-0 rounded-lg bg-white p-1.5">
            <QrCode size={112} title={`QR de ${name}`} value={url} />
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Button asChild size="sm" variant="outline">
              <a href={`https://wa.me/?text=${encodeURIComponent(`${name} ${url}`)}`} rel="noreferrer" target="_blank">
                <FaWhatsapp aria-hidden />
                WhatsApp
              </a>
            </Button>
            <Button asChild size="sm" variant="outline">
              <a
                href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`}
                rel="noreferrer"
                target="_blank"
              >
                <FaLinkedin aria-hidden />
                LinkedIn
              </a>
            </Button>
            <p className="text-meta text-muted-foreground">
              El QR lleva a la página: sirve para una pantalla o un flyer.
            </p>
          </div>
        </div>
      </div>
    </Panel>
  );
}

/** "Comida para ~34: 11 pizzas (3 veggie), 68 bebidas" */
export const foodLine = (stats: EventStats) => {
  const { food, likely } = { food: stats.turnout.food, likely: stats.turnout.likely };
  const extras = [food.veggie ? `${food.veggie} veggie` : "", food.glutenFree ? `${food.glutenFree} sin TACC` : ""]
    .filter(Boolean)
    .join(", ");

  return `Para ~${likely}: ${plural(food.pizzas, "pizza", "pizzas")}${extras ? ` (${extras})` : ""}, ${food.drinks} bebidas`;
};

/**
 * "Cuántos esperamos" and "Comida para ~N": a range, never a bare number, each with its n and why
 * (the community's own show rate, or the default for free meetups).
 */
function Turnout({ stats }: { stats: EventStats }) {
  const { turnout } = stats;
  const { diets } = turnout;
  const people = stats.attending + stats.guests;
  const why = turnout.fromHistory
    ? `Con el ${Math.round(turnout.rate * 100)} % que vino a ${plural(turnout.events, "evento", "eventos")} con puerta de la comunidad`
    : `Con el ${Math.round(turnout.rate * 100)} % que suele venir a un meetup gratis: la comunidad todavía no tiene 3 eventos con puerta`;

  return (
    <Panel id="comida" tabIndex={-1}>
      <PanelHead icon={Pizza} title="Cuántos esperamos" />
      <div className="grid gap-4 p-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <p className="text-ui text-foreground">
            <span className="font-terminal text-[20px] font-semibold tabular-nums">
              {turnout.low}–{turnout.high}
            </span>{" "}
            <span className="text-muted-foreground">(lo más probable {turnout.likely})</span>
          </p>
          <p className="text-meta text-muted-foreground">
            De {plural(people, "anotado", "anotados")} con sus +1. {why}
            {stats.confirmed ? `; los ${stats.confirmed} que confirmaron cuentan casi enteros` : ""}.
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <p className="text-ui text-foreground">
            Comida <span className="font-medium">{foodLine(stats).replace(/^Para/, "para")}</span>
          </p>
          <p className="text-meta text-muted-foreground">
            2,5 porciones por persona y 10 % de más; al menos un cuarto veggie y 1 sin TACC cada 50.
            {diets.answered
              ? ` De ${plural(diets.answered, "respuesta", "respuestas")} a la pregunta de comida: ${diets.vegetarian} veggie, ${diets.glutenFree} sin TACC.`
              : ""}
          </p>
        </div>
      </div>
    </Panel>
  );
}

type HoyProps = {
  /** The event's path in the panel */
  base: string;
  input: EventInput;
  event: EditableEvent;
  stats: UseQueryResult<EventStats>;
  /** Days until the event: 0 is today, negative once it passed */
  days: number;
  /** How its publication on Eventbrite is going, when people sign up there */
  eventbrite: React.ReactNode;
  onGo: (tab: Tab) => void;
};

/**
 * "Hoy", the event's first page, changes with its phase: getting ready (what's missing, the
 * tasks, who helps, the agenda), the day itself from an hour before (the door first), and the
 * close-out from two hours after the end.
 */
export function HoyTab(props: HoyProps) {
  const now = useNow(60_000);
  const phase = props.event.status === "cancelled" ? "antes" : eventPhase(props.event, now || Date.now());
  if (phase === "dia") return <DayView {...props} />;
  if (phase === "despues") return <CloseOut event={props.event} input={props.input} stats={props.stats} />;

  return <Antes {...props} />;
}

/** Before the day: the countdown and sign-ups, who's likely to come, what's missing, the tasks. */
function Antes({ base, input, event, stats, days, eventbrite, onGo }: HoyProps) {
  const { can } = usePanel();
  const signUp = event.registration === "owu" || event.registration === "eventbrite";
  const survey = useQuery(orpc.surveys.get.queryOptions({ input: { eventId: event.id }, staleTime: 30_000 }));
  const tasks = useQuery(orpc.events.tasks.queryOptions({ input, enabled: can("event:read") }));
  const url = new URL(
    `/comunidad/${event.communitySlug}/events/${event.slug}`,
    process.env.NEXT_PUBLIC_BASE_URL ?? SITE_URL
  ).toString();
  const upcoming = days >= 0 && event.status === "published";
  const data = stats.data;
  const count = data ? headcount(data, data.capacity) : null;
  const place = event.mode === "online" ? "Online" : (event.venue?.name ?? event.placeName);
  const food = tasks.data?.tasks.find((task) => task.templateKey?.endsWith(":comida"));

  return (
    <div className="flex flex-col gap-4">
      {eventbrite}
      <div className={cn("grid gap-4", upcoming && "lg:grid-cols-[auto_minmax(0,1fr)]")}>
        {upcoming ? <Countdown startDate={event.startDate} timeZone={MONTEVIDEO_TZ} venue={place} /> : null}
        {signUp ? (
          <Panel className="min-w-0 p-4">
            <div className="flex items-baseline gap-3">
              <MicroLabel>Inscripciones</MicroLabel>
              <span className="ml-auto font-terminal text-2xs text-muted-foreground">últimos 30 días</span>
            </div>
            {data ? (
              <div className="mt-6">
                <AreaChart
                  height={110}
                  label="Lugares ocupados al final de cada día"
                  points={data.series.map((point) => {
                    const parts = dateParts(`${point.day}T12:00:00-03:00`);
                    return { label: `${parts.day} ${parts.month}`, value: point.total };
                  })}
                  reference={data.capacity ? { value: data.capacity, label: `cupo ${data.capacity}` } : undefined}
                />
              </div>
            ) : (
              <Skeleton className="mt-6 h-[110px]" />
            )}
          </Panel>
        ) : null}
      </div>

      {signUp ? (
        data && count ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" data-testid="summary-stats">
            <Stat
              label="Lugares"
              meter={
                data.capacity ? <Meter label="Lugares ocupados" max={data.capacity} value={count.seats} /> : undefined
              }
              note={
                <>
                  {count.attendingLabel}
                  {data.guests ? ` · ${data.guests} +1` : ""}
                  {data.offered ? ` · ${plural(data.offered, "lugar ofrecido", "lugares ofrecidos")}` : ""}
                  {data.capacity ? "" : " · sin límite"}
                </>
              }
              value={outOf(count.seats, data.capacity)}
            />
            <Stat
              label="En espera"
              note={data.pending > 0 ? `${data.pending} por aprobar` : "Toman los lugares que se liberan"}
              value={data.waitlisted}
            />
            <Stat
              label="Confirmaron"
              note={`${data.confirmed} confirmaron · ${Math.max(0, data.attending - data.confirmed)} sin respuesta`}
              value={outOf(data.confirmed, data.attending || null)}
            />
            <Stat label="Entraron" note="Se cuentan el día del evento" value="–" />
          </div>
        ) : stats.isError ? (
          <ErrorState onRetry={() => void stats.refetch()} title="No pudimos traer los números" />
        ) : (
          <Skeleton className="h-28 rounded-lg" />
        )
      ) : null}

      {data && event.registration === "owu" && upcoming ? <Turnout stats={data} /> : null}

      {data && data.pending > 0 && can("rsvp:review") ? (
        <Panel className="flex items-center gap-3 p-3.5">
          <Users aria-hidden className="size-4 text-warning" />
          <p className="flex-1 text-ui text-foreground">
            {data.pending === 1 ? "Una persona espera" : `${data.pending} personas esperan`} que la apruebes.
          </p>
          <Button size="sm" variant="outline" onClick={() => onGo("personas")}>
            Revisar
          </Button>
        </Panel>
      ) : null}

      <div className={cn("grid items-start gap-4", upcoming ? "xl:grid-cols-[minmax(0,1fr)_360px]" : "max-w-md")}>
        {upcoming ? (
          <div className="flex min-w-0 flex-col gap-4">
            {data ? (
              <ReadyList
                input={input}
                rows={eventChecklist(
                  {
                    event,
                    doorLink: data.doorLink,
                    surveyOpen: survey.data?.isOpen ?? null,
                    foodDone: food ? food.status === "done" : null,
                    food: event.registration === "owu" ? foodLine(data) : null,
                  },
                  base
                )}
              />
            ) : (
              <Skeleton className="h-64 rounded-lg" />
            )}
            {can("attendee:read") && (event.volunteerRoles.length > 0 || event.registration === "owu") ? (
              <VolunteersPanel input={input} />
            ) : null}
            <AgendaPanel base={base} input={input} start={clockTime(event.startDate)} />
          </div>
        ) : null}
        <ShareBox name={event.name} url={url} />
      </div>
    </div>
  );
}
