"use client";

import type * as React from "react";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, Images, Megaphone } from "lucide-react";

import { FieldError } from "components/Admin/panel";
import { Panel, PanelHead } from "components/Admin/ui/page";
import { StatusDot, type Tone } from "components/Admin/ui/status";
import { Button } from "components/shared/ui/button";
import { Input } from "components/shared/ui/input";
import { toast } from "components/shared/ui/toast-utils";
import { shortWhen } from "lib/community/time";
import { orpc } from "lib/orpc/client";
import { DraftPatchSchema, type EditableEvent } from "lib/orpc/events/schemas";

import { EventbriteStatus } from "../integrations/EventbriteStatus";
import { usePanel } from "../shell/context";
import { CardLink } from "../talks/parts";
import { MeetupCopy } from "../wizard/WizardSteps";
import { StaleNotice, useEventSave, type EventInput } from "./save";

type Place = {
  key: string;
  name: string;
  tone: Tone;
  state: string;
  detail: React.ReactNode;
  link?: { href: string; label: string };
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
          <a
            className="ml-auto inline-flex items-center gap-1 text-meta text-info-foreground hover:underline"
            href={place.link.href}
            rel="noreferrer"
            target="_blank"
          >
            {place.link.label}
            <ArrowUpRight aria-hidden className="size-3.5" />
          </a>
        ) : null}
      </div>
      <div className="text-meta text-muted-foreground">{place.detail}</div>
      {children}
    </li>
  );
}

const CHANNEL = { slack: "Slack", telegram: "Telegram" } as const;

/** Owy's posts on OWU's Slack and Telegram: asked for before publishing, sent when it was published. */
function announcementPlace(event: EditableEvent): Place {
  const { announcements } = event;
  const failed = announcements.filter((post) => post.status === "failed");
  const sent = announcements.filter((post) => post.status === "sent");
  if (announcements.length === 0) {
    return {
      key: "canales",
      name: "Slack · Telegram",
      tone: "idle",
      state: "Sin anunciar",
      detail:
        "Owy anuncia un evento cuando se publica, y este salió sin pedirlo: ya no se suma. Compartí el link o las tarjetas en los canales.",
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

/** Paste the Meetup event's link here, with what to copy there right above it. */
function MeetupLink({ input, event }: { input: EventInput; event: EditableEvent }) {
  const { save, saving, stale, reload } = useEventSave(input);
  const [url, setUrl] = useState("");
  // Only what's typed: the Meetup check reads the URL, and an empty one isn't a URL
  const checked = url.trim() ? DraftPatchSchema.shape.externalLinks.safeParse({ meetup: url.trim() }) : null;
  const error = checked && !checked.success ? checked.error.issues[0]?.message : undefined;

  return (
    <div className="flex flex-col gap-3">
      <MeetupCopy communitySlug={event.communitySlug} draft={event} />
      <form
        className="flex flex-col gap-1.5"
        onSubmit={(submit) => {
          submit.preventDefault();
          if (!checked?.success) return;
          void save({ externalLinks: { meetup: url.trim() } }).then(
            (ok) => ok && toast.success("Enlazado con Meetup", "La página del evento lleva ahí también.")
          );
        }}
      >
        <StaleNotice show={stale} onReload={() => void reload()} />
        <label className="text-meta text-foreground" htmlFor="meetup-url">
          Link del evento en Meetup
        </label>
        <div className="flex flex-wrap gap-2">
          <Input
            className="min-w-56 flex-1"
            id="meetup-url"
            inputMode="url"
            placeholder="https://www.meetup.com/tu-grupo/events/…"
            value={url}
            onChange={(change) => setUrl(change.target.value)}
          />
          <Button disabled={saving || !url.trim() || Boolean(error)} size="sm" type="submit" variant="outline">
            Guardar
          </Button>
        </div>
        <FieldError message={error} />
      </form>
    </div>
  );
}

/** Where the event is published (owu.uy, Eventbrite, Meetup, OWU's channels) and the cards to share it. */
export function PublicationsTab({
  event,
  community,
  input,
}: {
  event: EditableEvent;
  community: { id: string; slug: string };
  input: EventInput;
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
      link: { href: page, label: "Ver la página" },
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
        : "Crealo en tu grupo con esto y pegá el link: así se ven entre ellos y el meetup-bot no lo cuenta dos veces.",
      link: event.externalLinks.meetup ? { href: event.externalLinks.meetup, label: "Ver en Meetup" } : undefined,
    },
    announcementPlace(event),
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
              {place.key === "meetup" && !event.externalLinks.meetup && !cancelled ? (
                <MeetupLink event={event} input={input} />
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
export function ShareCards({ communityId, eventId }: { communityId: string; eventId: string }) {
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
