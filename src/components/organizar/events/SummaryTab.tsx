"use client";

import type * as React from "react";
import Link from "next/link";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { CircleCheck, Copy, ListChecks, Share2, Users } from "lucide-react";
import { FaLinkedin, FaWhatsapp } from "react-icons/fa";

import { cn } from "app/lib/utils";
import { QrCode } from "components/Admin/comms/QrCode";
import { Countdown } from "components/Admin/hoy/PrepView";
import { AreaChart } from "components/Admin/ui/charts";
import { Meter, MicroLabel, Panel, PanelHead } from "components/Admin/ui/page";
import { Button } from "components/shared/ui/button";
import { Skeleton } from "components/shared/ui/skeleton";
import { toast } from "components/shared/ui/toast-utils";
import { SITE_URL } from "lib/community/site";
import { dateParts, MONTEVIDEO_TZ } from "lib/community/time";
import type { EditableEvent, EventStats } from "lib/orpc/events/schemas";
import { orpc } from "lib/orpc/client";

import type { Tab } from "./EventDashboard";

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

type Todo = { key: string; title: string; meta: string; done: boolean; go?: Tab; href?: string };

/** What an event should have before its day, each with where to fix it. */
function todos(event: EditableEvent, stats: EventStats, surveyOpen: boolean | null, base: string): Todo[] {
  const place = event.venue?.name ?? event.placeName;
  const hasPlace = Boolean(event.venue ?? event.placeName);
  const signUp = event.registration === "owu" || event.registration === "eventbrite";
  const list: (Todo | false)[] = [
    event.mode !== "online" && {
      key: "lugar",
      title: "Lugar confirmado",
      meta: hasPlace ? (place ?? "") : "Elegí un espacio o poné la dirección",
      done: hasPlace,
      href: `${base}/editar?paso=espacio`,
    },
    event.mode !== "presencial" && {
      key: "online",
      title: "Link para conectarse",
      meta: event.onlineUrl ? "Le llega a quien confirma" : "Falta el link de la transmisión",
      done: Boolean(event.onlineUrl),
      href: `${base}/editar?paso=espacio`,
    },
    event.registration === "owu" && {
      key: "recordatorios",
      title: "Recordatorios con tu nota",
      meta: event.reminderNote
        ? "Salen solos 48 h y 2 h antes"
        : "Salen solos 48 h y 2 h antes: sumales cómo entrar o qué traer",
      done: Boolean(event.reminderNote),
      go: "emails",
    },
    signUp &&
      event.mode !== "online" && {
        key: "puerta",
        title: "Link de la puerta",
        meta: stats.doorLink ? "Ya lo tiene quien acredita" : "Para quienes ayudan a acreditar, sin cuenta",
        done: stats.doorLink,
        go: "puerta",
      },
    {
      key: "encuesta",
      title: "Encuesta lista",
      meta: surveyOpen
        ? "Abierta: sale sola al día siguiente"
        : surveyOpen === false
          ? "Creada, sin abrir"
          : "Sin encuesta",
      done: Boolean(surveyOpen),
      go: "feedback",
    },
    {
      key: "meetup",
      title: "También en Meetup",
      meta: event.externalLinks.meetup ? "Enlazado" : "Publicalo ahí y pegá el link",
      done: Boolean(event.externalLinks.meetup),
      go: "publicaciones",
    },
  ];

  return list.filter((item) => item !== false);
}

function Checklist({ items, isAdmin, onGo }: { items: Todo[]; isAdmin: boolean; onGo: (tab: Tab) => void }) {
  const done = items.filter((item) => item.done).length;
  // Inscriptos, Puerta and Emails are for admins: an editor sees what's missing without the way there
  const reachable = (item: Todo) => item.href ?? (item.go === "puerta" || item.go === "emails" ? isAdmin : true);

  return (
    <Panel>
      <PanelHead
        actions={<Meter className="w-28" label="Antes del evento" max={items.length} value={done} />}
        icon={ListChecks}
        meta={`${done} de ${items.length}`}
        title="Para hacer"
      />
      <ul className="divide-y divide-border">
        {items.map((item) => (
          <li key={item.key} className="flex items-center gap-3 px-4 py-2.5">
            {item.done ? (
              <CircleCheck aria-label="Listo" className="size-[18px] shrink-0 text-success" />
            ) : (
              <span
                aria-label="Pendiente"
                className="size-[18px] shrink-0 rounded-full border-[1.5px] border-dashed border-faint"
                role="img"
              />
            )}
            <div className="min-w-0 flex-1 leading-tight">
              <p className={cn("truncate text-ui", item.done ? "text-muted-foreground" : "text-foreground")}>
                {item.title}
              </p>
              <p className="truncate text-meta text-faint">{item.meta}</p>
            </div>
            {!item.done && reachable(item) ? (
              item.href ? (
                <Button asChild size="sm" variant="outline">
                  <Link href={item.href}>Resolver</Link>
                </Button>
              ) : (
                <Button size="sm" variant="outline" onClick={() => item.go && onGo(item.go)}>
                  Resolver
                </Button>
              )
            ) : null}
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/** The event's link to copy, its QR, and WhatsApp and LinkedIn ready to post. */
function ShareBox({ url, name }: { url: string; name: string }) {
  return (
    <Panel>
      <PanelHead icon={Share2} title="Compartir" />
      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-center gap-2 rounded-md border border-border bg-raised/50 py-1 pr-1 pl-2.5">
          <span className="min-w-0 flex-1 truncate font-terminal text-meta text-foreground">
            {url.replace(/^https?:\/\//, "")}
          </span>
          <Button
            size="xs"
            variant="outline"
            onClick={() =>
              void navigator.clipboard.writeText(url).then(
                () => toast.success("Link copiado"),
                () => toast.error("No se pudo copiar", "Seleccioná el link y copialo a mano.")
              )
            }
          >
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

/**
 * The event at a glance: the countdown, sign-ups against the cupo, who will likely come, what's
 * still missing before the day, and its link to share.
 */
export function SummaryTab({
  communityId,
  base,
  event,
  stats,
  days,
  isAdmin,
  eventbrite,
  onGo,
}: {
  communityId: string;
  /** The event's path in the panel */
  base: string;
  event: EditableEvent;
  stats: UseQueryResult<EventStats>;
  /** Days until the event: 0 is today, negative once it passed */
  days: number;
  isAdmin: boolean;
  /** How its publication on Eventbrite is going, when people sign up there */
  eventbrite: React.ReactNode;
  onGo: (tab: Tab) => void;
}) {
  const signUp = event.registration === "owu" || event.registration === "eventbrite";
  const showUp = useQuery(orpc.events.showUp.queryOptions({ input: { communityId }, enabled: signUp }));
  const survey = useQuery(orpc.surveys.get.queryOptions({ input: { eventId: event.id }, staleTime: 30_000 }));
  const url = new URL(
    `/comunidad/${event.communitySlug}/events/${event.slug}`,
    process.env.NEXT_PUBLIC_BASE_URL ?? SITE_URL
  ).toString();
  const upcoming = days >= 0 && event.status === "published";
  const data = stats.data;
  const rate = showUp.data?.rate ?? null;
  const place = event.mode === "online" ? "Online" : (event.venue?.name ?? event.placeName);

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
        data ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Stat
              label="Inscriptos"
              meter={
                data.capacity ? <Meter label="Lugares ocupados" max={data.capacity} value={data.taken} /> : undefined
              }
              note={data.capacity ? undefined : "Sin límite de lugares"}
              value={outOf(data.taken, data.capacity)}
            />
            <Stat
              label="En espera"
              note={data.pending > 0 ? `${data.pending} por aprobar` : "Toman los lugares que se liberan"}
              value={data.waiting}
            />
            <Stat
              label="Vienen"
              note={
                rate === null
                  ? "Lo calculamos con 3 eventos con puerta"
                  : `≈ ${Math.round(rate * data.attending)} de ${data.attending}, por los últimos ${showUp.data?.events} eventos`
              }
              value={
                rate === null ? (
                  <span className="text-[18px] leading-8 font-medium text-muted-foreground">todavía no sabemos</span>
                ) : (
                  `~${Math.round(rate * 100)} %`
                )
              }
            />
            <Stat
              label="Llegadas"
              meter={
                days <= 0 ? (
                  <Meter
                    label="Acreditados"
                    max={data.attending || data.checkedIn || 1}
                    tone="success"
                    value={data.checkedIn}
                  />
                ) : undefined
              }
              note={days > 0 ? "Se cuentan el día del evento" : undefined}
              value={days > 0 ? "–" : outOf(data.checkedIn, data.attending || null)}
            />
          </div>
        ) : (
          <Skeleton className="h-28 rounded-lg" />
        )
      ) : null}

      {data && data.pending > 0 && isAdmin ? (
        <Panel className="flex items-center gap-3 p-3.5">
          <Users aria-hidden className="size-4 text-warning" />
          <p className="flex-1 text-ui text-foreground">
            {data.pending === 1 ? "Una persona espera" : `${data.pending} personas esperan`} que la apruebes.
          </p>
          <Button size="sm" variant="outline" onClick={() => onGo("inscriptos")}>
            Revisar
          </Button>
        </Panel>
      ) : null}

      <div className={cn("grid gap-4", upcoming ? "xl:grid-cols-[minmax(0,1fr)_360px]" : "max-w-md")}>
        {upcoming ? (
          data ? (
            <Checklist isAdmin={isAdmin} items={todos(event, data, survey.data?.isOpen ?? null, base)} onGo={onGo} />
          ) : (
            <Skeleton className="h-64 rounded-lg" />
          )
        ) : null}
        <ShareBox name={event.name} url={url} />
      </div>
    </div>
  );
}
