"use client";

import type * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, Images, Megaphone } from "lucide-react";

import { Panel, PanelHead } from "components/Admin/ui/page";
import { StatusDot, type Tone } from "components/Admin/ui/status";
import { shortWhen } from "lib/community/time";
import { orpc } from "lib/orpc/client";
import type { EditableEvent } from "lib/orpc/events/schemas";

import { EventbriteStatus } from "../integrations/EventbriteStatus";
import { usePanel } from "../shell/context";
import { CardLink } from "../talks/parts";

type Place = {
  key: string;
  name: string;
  tone: Tone;
  state: string;
  detail: React.ReactNode;
  link?: { href: string; label: string; external?: boolean };
};

/** One row per place the event lives: its state with a dot and a word, what it means, where to go. */
function Row({ place, children }: { place: Place; children?: React.ReactNode }) {
  return (
    <li className="flex flex-col gap-2.5 px-4 py-3.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="w-36 shrink-0 text-ui font-medium text-foreground">{place.name}</span>
        <span className="flex items-center gap-1.5 text-meta text-subtle">
          <StatusDot tone={place.tone} />
          {place.state}
        </span>
        {place.link ? (
          place.link.external ? (
            <a
              className="ml-auto inline-flex items-center gap-1 text-meta text-info-foreground hover:underline"
              href={place.link.href}
              rel="noreferrer"
              target="_blank"
            >
              {place.link.label}
              <ArrowUpRight aria-hidden className="size-3.5" />
            </a>
          ) : (
            <Link
              className="ml-auto inline-flex items-center gap-1 text-meta text-info-foreground hover:underline"
              href={place.link.href}
            >
              {place.link.label}
              <ArrowUpRight aria-hidden className="size-3.5" />
            </Link>
          )
        ) : null}
      </div>
      <div className="text-meta text-muted-foreground">{place.detail}</div>
      {children}
    </li>
  );
}

const CHANNEL = { slack: "Slack", telegram: "Telegram" } as const;

/** Owy's posts on OWU's Slack and Telegram: asked for in Difusión, sent when it was published. */
function announcementPlace(event: EditableEvent, base: string): Place {
  const { announcements } = event;
  const failed = announcements.filter((post) => post.status === "failed");
  const sent = announcements.filter((post) => post.status === "sent");
  if (announcements.length === 0) {
    return {
      key: "canales",
      name: "Slack · Telegram",
      tone: "idle",
      state: "Sin anunciar",
      detail: "Owy lo anuncia en los canales de OWU si lo pedís en Difusión antes de publicar.",
      link: event.status === "draft" ? { href: `${base}/editar?paso=difusion`, label: "Ir a Difusión" } : undefined,
    };
  }

  return {
    key: "canales",
    name: "Slack · Telegram",
    tone: failed.length > 0 ? "live" : sent.length === announcements.length ? "ok" : "info",
    state: failed.length > 0 ? "No salió" : sent.length === announcements.length ? "Anunciado" : "Saliendo",
    detail: announcements
      .map(
        (post) =>
          `${CHANNEL[post.channel]}: ${
            post.status === "sent" && post.sentAt
              ? `el ${shortWhen(post.sentAt)}`
              : post.status === "failed"
                ? "no se pudo (avisá en #organizadores-meetups)"
                : "en camino"
          }`
      )
      .join(" · "),
  };
}

/** Where the event is published: owu.uy, Eventbrite, Meetup and OWU's channels. */
export function PublicationsTab({
  event,
  community,
  base,
}: {
  event: EditableEvent;
  community: { id: string; slug: string };
  /** The event's path in the panel */
  base: string;
}) {
  const cancelled = event.status === "cancelled";
  const page = `/comunidad/${event.communitySlug}/events/${event.slug}`;
  const places: Place[] = [
    {
      key: "owu",
      name: "owu.uy",
      tone: cancelled ? "live" : "ok",
      state: cancelled ? "Cancelado" : "Publicado",
      detail: event.publishedAt
        ? `Desde el ${shortWhen(event.publishedAt)}, en la agenda y en el perfil`
        : "En la agenda",
      link: { href: page, label: "Ver la página", external: true },
    },
    {
      key: "eventbrite",
      name: "Eventbrite",
      tone: event.registration === "eventbrite" ? "info" : "idle",
      state: event.registration === "eventbrite" ? "Inscripción ahí" : "No se usa",
      detail:
        event.registration === "eventbrite"
          ? "Lo creamos y actualizamos solos con lo que editás acá."
          : "La gente se anota en OWU; Eventbrite se elige al crear el evento.",
    },
    {
      key: "meetup",
      name: "Meetup",
      tone: event.externalLinks.meetup ? "ok" : "idle",
      state: event.externalLinks.meetup ? "Enlazado" : "Sin link",
      detail: event.externalLinks.meetup
        ? "La página del evento enlaza a Meetup."
        : "Publicalo en tu grupo de Meetup y pegá el link en Difusión: así se ven entre ellos.",
      link: event.externalLinks.meetup
        ? { href: event.externalLinks.meetup, label: "Ver en Meetup", external: true }
        : { href: `${base}/editar?paso=difusion`, label: "Ir a Difusión" },
    },
    announcementPlace(event, base),
  ];

  return (
    <div className="flex flex-col gap-4">
      <Panel>
        <PanelHead icon={Megaphone} title="Dónde está publicado" />
        <ul className="divide-y divide-border">
          {places.map((place) => (
            <Row key={place.key} place={place}>
              {place.key === "eventbrite" && event.registration === "eventbrite" ? (
                <EventbriteStatus
                  communityId={community.id}
                  communitySlug={community.slug}
                  draft={false}
                  eventId={event.id}
                />
              ) : null}
            </Row>
          ))}
        </ul>
      </Panel>
      {cancelled ? null : <ShareCards communityId={community.id} eventId={event.id} />}
    </div>
  );
}

/** Square and story PNGs to post: the event's, and one per talk taken from Charlas that goes to it. */
function ShareCards({ communityId, eventId }: { communityId: string; eventId: string }) {
  const { can } = usePanel();
  const talks = useQuery(
    orpc.talks.claimedFor.queryOptions({
      input: { communityId },
      enabled: can("talk:read"),
      select: (claims) => claims.filter((claim) => claim.event?.id === eventId),
    })
  );

  return (
    <Panel>
      <PanelHead icon={Images} title="Tarjetas para compartir" />
      <ul className="divide-y divide-border">
        <li className="flex flex-wrap items-center gap-2 px-4 py-3.5">
          <span className="mr-auto text-ui font-medium text-foreground">El evento</span>
          <CardLink format="cuadrada" id={eventId} kind="evento" label="Cuadrada" />
          <CardLink format="historia" id={eventId} kind="evento" label="Historia" />
        </li>
        {(talks.data ?? []).map((talk) => (
          <li key={talk.id} className="flex flex-wrap items-center gap-2 px-4 py-3.5">
            <span className="mr-auto min-w-0 text-ui text-foreground">
              {talk.title} <span className="text-muted-foreground">· {talk.speakerName}</span>
            </span>
            <CardLink format="cuadrada" id={talk.id} kind="charla" label="Cuadrada" />
            <CardLink format="historia" id={talk.id} kind="charla" label="Historia" />
          </li>
        ))}
      </ul>
    </Panel>
  );
}
