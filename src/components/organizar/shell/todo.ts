import { daysBetween } from "lib/calendar/holidays";
import { dayKey, shortWhen } from "lib/community/time";
import type { PanelSummary } from "lib/orpc/panel/schemas";

import { panelHref } from "./nav";

/** Holds this close to lapsing ask to be renewed. */
const RENEW_DAYS = 3;
const HOUR_MS = 3_600_000;

export type TodoKind = "renew" | "venue" | "conflict" | "poll" | "cohost" | "date" | "first";

export type Todo = {
  id: string;
  kind: TodoKind;
  text: string;
  /** Where it gets resolved; Inicio for what Inicio answers in place (renewing, co-hosting). */
  href: string;
  /** The hold to renew, or the event another community invites to */
  eventId?: string;
};

export const holdLeft = (days: number) =>
  days <= 0 ? "vence hoy" : days === 1 ? "vence mañana" : `vence en ${days} días`;

/**
 * "Para hacer", most urgent first: Inicio lists it with its buttons, the bell with links. Empty
 * until the summary arrives.
 */
export function todoItems(summary: PanelSummary | undefined, slug: string, now = Date.now()): Todo[] {
  if (!summary) return [];
  const today = dayKey(new Date(now));
  const home = panelHref(slug);
  const holds = summary.drafts.filter((event) => event.heldUntil !== null && Date.parse(event.heldUntil) > now);
  const lapsed = summary.drafts.filter((event) => event.heldUntil !== null && Date.parse(event.heldUntil) <= now);
  const undated = summary.drafts.filter((event) => !event.dateChosen);

  return [
    ...holds.flatMap((event) => {
      const days = daysBetween(today, dayKey(event.heldUntil ?? event.startDate));
      if (days > RENEW_DAYS) return [];

      return [
        {
          id: `renew-${event.id}`,
          kind: "renew" as const,
          text: `La reserva del ${shortWhen(event.startDate)} ${holdLeft(days)}`,
          href: home,
          eventId: event.id,
        },
      ];
    }),
    ...summary.venueRequests
      .filter((request) => request.status === "pending")
      .map((request) => ({
        id: `venue-${request.id}`,
        kind: "venue" as const,
        text: `${request.venueName} no contesta hace ${Math.floor((now - Date.parse(request.createdAt)) / HOUR_MS)} h: el pedido vence ${shortWhen(request.expiresAt)}`,
        href: panelHref(slug, "espacios"),
      })),
    ...summary.conflicts.map((clash) => ({
      id: `conflict-${clash.eventId}-${clash.other.id}`,
      kind: "conflict" as const,
      text: clash.other.title
        ? `«${clash.eventName}» cae el mismo día que «${clash.other.title}» de ${clash.other.communityName}`
        : `«${clash.eventName}» cae el mismo día que una reserva de ${clash.other.communityName}`,
      href: `${panelHref(slug, "calendario")}?dia=${clash.day}`,
    })),
    ...summary.polls.map((poll) => ({
      id: `poll-${poll.id}`,
      kind: "poll" as const,
      text: `${poll.asker} pregunta qué fecha les sirve para «${poll.title}»`,
      href: panelHref(slug, "encuestas"),
    })),
    ...summary.invitations.map((invitation) => ({
      id: `cohost-${invitation.eventId}`,
      kind: "cohost" as const,
      text: `${invitation.host} los invita a coorganizar «${invitation.name}» (${shortWhen(invitation.startDate)})`,
      href: home,
      eventId: invitation.eventId,
    })),
    ...[...lapsed, ...undated].map((event) => ({
      id: `date-${event.id}`,
      kind: "date" as const,
      text: lapsed.includes(event) ? `La reserva de «${event.name}» venció` : `«${event.name}» no tiene fecha`,
      href: `${panelHref(slug, "calendario")}?evento=${event.id}`,
    })),
    ...(holds.length === 0 && summary.ahead.length === 0
      ? [
          {
            id: "first-date",
            kind: "first" as const,
            text: "Reservá la fecha de tu próximo meetup",
            href: panelHref(slug, "calendario"),
          },
        ]
      : []),
  ];
}

export type Milestone = { id: string; at: string; title: string; meta: string; kind: "hold" | "event" | "reminder" };

/** "Próximos hitos": holds that lapse, events, and the reminders their people get (48 h and 2 h before). */
export function milestones(summary: PanelSummary | undefined, now = Date.now(), limit = 6): Milestone[] {
  if (!summary) return [];
  const holds = summary.drafts.flatMap((event) =>
    event.heldUntil && Date.parse(event.heldUntil) > now
      ? [
          {
            id: `hold-${event.id}`,
            at: event.heldUntil,
            title: "Vence una reserva",
            meta: `${event.name} · ${shortWhen(event.startDate)}`,
            kind: "hold" as const,
          },
        ]
      : []
  );
  const events = summary.ahead.flatMap((event) => {
    const start = Date.parse(event.startDate);
    const reminders =
      event.registration === "owu"
        ? [
            { hours: 48, title: "Recordatorio a los inscriptos", meta: "Confirman o liberan su lugar" },
            { hours: 2, title: "Cómo llegar, a los inscriptos", meta: "Dirección, link y entrada" },
          ].map((reminder) => ({
            id: `reminder-${reminder.hours}-${event.id}`,
            at: new Date(start - reminder.hours * HOUR_MS).toISOString(),
            title: reminder.title,
            meta: event.name,
            kind: "reminder" as const,
          }))
        : [];

    return [
      ...reminders,
      { id: `event-${event.id}`, at: event.startDate, title: event.name, meta: "El evento", kind: "event" as const },
    ];
  });

  return [...holds, ...events]
    .filter((milestone) => Date.parse(milestone.at) > now)
    .toSorted((a, b) => a.at.localeCompare(b.at))
    .slice(0, limit);
}
