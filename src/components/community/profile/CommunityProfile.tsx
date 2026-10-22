import Link from "next/link";
import { ArrowRight, CalendarPlus, Globe, MessageSquare } from "lucide-react";
import { FaInstagram, FaLinkedin, FaMeetup } from "react-icons/fa";

import { cn } from "app/lib/utils";
import {
  Badge,
  ButtonLink,
  cardClassName,
  CommunityLogo,
  Container,
  headingClassName,
  outbound,
} from "components/community/ui";
import type { CommunityEvent } from "lib/community/events";

import { FollowButton } from "./FollowButton";
import { dateParts, monthKey, shortWhen } from "lib/community/time";
import { topicLabel } from "lib/community/topics";
import type { CommunityRow, EventRow } from "lib/db/schema";

const STATUS = { pausa: "En pausa", "busca-organizadores": "Busca organizadores", activa: null } as const;

function EventLine({ event }: { event: CommunityEvent }) {
  const parts = dateParts(event.start);
  const external = event.source !== "owu";

  return (
    <a
      className={cardClassName(true, "flex items-center gap-4 p-4 sm:p-5")}
      href={external ? outbound(event.url, "perfil") : event.url}
      rel={external ? "noreferrer" : undefined}
      target={external ? "_blank" : undefined}
    >
      <span className="flex size-14 shrink-0 flex-col items-center justify-center rounded-xl border border-white/10 bg-white/[0.04]">
        <span className="text-[10px] font-medium tracking-[0.12em] text-yellow-400 uppercase">{parts.month}</span>
        <span className="font-title text-xl leading-none font-bold text-white">{parts.day}</span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium text-white">{event.title}</span>
        <span className="block truncate text-[14px] text-zinc-400">
          {shortWhen(event.start)}
          {event.venue ? ` · ${event.venue}` : ""}
        </span>
      </span>
      {external ? <Badge>Meetup</Badge> : null}
      <ArrowRight aria-hidden className="size-4 shrink-0 text-zinc-500" />
    </a>
  );
}

/**
 * A community's page on owu.uy: who they are, where to find them, what's next and what they did.
 * Bespoke landings (community-landings/registry) take its place when a community has one.
 */
export function CommunityProfile({
  community,
  upcoming,
  past,
  hosts,
  organizers,
  claimHref,
  canFollow = false,
}: {
  community: CommunityRow;
  upcoming: CommunityEvent[];
  /** Its own and the ones it co-organized (`hostSlug`: whose page the event is on) */
  past: (EventRow & { hostSlug: string })[];
  /** The spaces that hosted its events */
  hosts: { name: string; logoUrl: string | null }[];
  /** Organizers who chose to appear: name and photo, nothing else */
  organizers: { name: string; image: string | null }[];
  /** "¿Organizás esta comunidad?", once Organizá is open */
  claimHref: string | null;
  /** "Seguir", once Organizá is open (its emails come with it) */
  canFollow?: boolean;
}) {
  const [next, ...later] = upcoming;
  const status = STATUS[community.status];
  const links = [
    community.links.website && { href: community.links.website, label: "Web", icon: Globe },
    community.links.meetup && { href: community.links.meetup, label: "Meetup", icon: FaMeetup },
    community.links.linkedin && { href: community.links.linkedin, label: "LinkedIn", icon: FaLinkedin },
    community.links.instagram && { href: community.links.instagram, label: "Instagram", icon: FaInstagram },
  ].filter(Boolean) as { href: string; label: string; icon: typeof Globe }[];
  const calendar = `webcal://owu.uy/comunidad/${community.slug}/eventos.ics`;
  // "12 eventos · desde 2019": what it did here plus what it has announced in OWU
  const starts = [
    ...past.map((event) => event.startDate.toISOString()),
    ...upcoming.filter((event) => event.source === "owu").map((event) => event.start),
  ];
  const since = starts.map((start) => monthKey(start).slice(0, 4)).toSorted()[0];

  return (
    <main className="pb-24">
      <Container className="pt-10 sm:pt-16">
        <nav aria-label="Ruta" className="mb-8 flex items-center gap-2 text-[13px] text-zinc-500">
          <Link className="hover:text-zinc-300" href="/comunidades">
            Comunidades
          </Link>
          <span aria-hidden>/</span>
          <span className="text-zinc-400">{community.name}</span>
        </nav>

        <header className="flex flex-col gap-6 sm:flex-row sm:items-start">
          <CommunityLogo logo={community.logoUrl} name={community.name} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              {status ? <Badge tone="accent">{status}</Badge> : null}
              {community.topics.map((topic) => (
                <Badge key={topic}>{topicLabel(topic)}</Badge>
              ))}
            </div>
            <h1 className={cn(headingClassName.h1, "mt-3")}>{community.name}</h1>
            {since ? (
              <p className="mt-2 text-[15px] text-zinc-400 tabular-nums">
                {starts.length === 1 ? "1 evento" : `${starts.length} eventos`} · desde {since}
              </p>
            ) : null}
            {community.description ? (
              <p className="mt-4 max-w-2xl text-lg leading-relaxed text-zinc-300">{community.description}</p>
            ) : null}
            <div className="mt-6 flex flex-wrap items-center gap-3">
              {canFollow ? <FollowButton communityId={community.id} /> : null}
              <ButtonLink href={calendar} size="md" variant={canFollow ? "secondary" : "primary"}>
                <CalendarPlus aria-hidden className="mr-2 size-4" />
                Suscribirme al calendario
              </ButtonLink>
              {community.slackChannel ? (
                <ButtonLink href="https://slack.owu.uy" size="md" variant="secondary">
                  <MessageSquare aria-hidden className="mr-2 size-4" />#{community.slackChannel}
                </ButtonLink>
              ) : null}
              {links.map((link) => (
                <a
                  key={link.href}
                  aria-label={link.label}
                  className="grid size-10 place-items-center rounded-xl border border-white/10 text-zinc-300 transition-colors hover:border-white/25 hover:text-white"
                  href={outbound(link.href, "perfil")}
                  rel="noreferrer"
                  target="_blank"
                >
                  <link.icon aria-hidden className="size-4" />
                </a>
              ))}
            </div>
          </div>
        </header>

        <section aria-labelledby="proximo" className="mt-14">
          <h2 className={headingClassName.h3} id="proximo">
            Próximo evento
          </h2>
          <div className="mt-4">
            {next ? (
              <EventLine event={next} />
            ) : (
              <p className={cardClassName(false, "p-5 text-zinc-400")}>
                Todavía no anunciaron el próximo. Suscribite al calendario y te enterás apenas lo publiquen.
              </p>
            )}
          </div>
          {later.length > 0 ? (
            <div className="mt-8">
              <h3 className="text-[13px] font-medium tracking-[0.12em] text-zinc-500 uppercase">Más adelante</h3>
              <div className="mt-3 flex flex-col gap-3">
                {later.map((event) => (
                  <EventLine key={event.id} event={event} />
                ))}
              </div>
            </div>
          ) : null}
        </section>

        {past.length > 0 ? (
          <section aria-labelledby="pasados" className="mt-14">
            <h2 className={headingClassName.h3} id="pasados">
              Ya pasaron
            </h2>
            <ul className="mt-4 divide-y divide-white/[0.06] rounded-2xl border border-white/[0.08]">
              {past.slice(0, 10).map((event) => (
                <li key={event.id}>
                  <Link
                    className="flex items-center justify-between gap-4 px-5 py-3.5 text-[15px] text-zinc-300 transition-colors hover:bg-white/[0.03] hover:text-white"
                    href={`/comunidad/${event.hostSlug}/events/${event.slug}`}
                  >
                    <span className="min-w-0 truncate">{event.name}</span>
                    <span className="shrink-0 text-[14px] text-zinc-500 tabular-nums">
                      {dateParts(event.startDate.toISOString()).monthYear}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {organizers.length > 0 ? (
          <section aria-labelledby="organizan" className="mt-14">
            <h2 className={headingClassName.h3} id="organizan">
              Organizan
            </h2>
            <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-4">
              {organizers.map((person, index) => (
                <li key={`${person.name}-${index}`} className="flex items-center gap-3 text-[15px] text-zinc-200">
                  {person.image ? (
                    // eslint-disable-next-line @next/next/no-img-element -- avatars come from Slack and other hosts
                    <img alt="" className="size-10 rounded-full object-cover" src={person.image} />
                  ) : (
                    <CommunityLogo className="size-10 rounded-full" logo={null} name={person.name} size="sm" />
                  )}
                  {person.name}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {hosts.length > 0 ? (
          <section aria-labelledby="nos-recibieron" className="mt-14">
            <h2 className={headingClassName.h3} id="nos-recibieron">
              Nos recibieron
            </h2>
            <ul className="mt-4 flex flex-wrap gap-2">
              {hosts.map((host) => (
                <li key={host.name}>
                  {host.logoUrl ? (
                    <span className="flex h-12 items-center rounded-xl bg-white px-3" title={host.name}>
                      {/* eslint-disable-next-line @next/next/no-img-element -- the spaces' logos live on their own hosts */}
                      <img alt={host.name} className="max-h-8 w-auto max-w-32 object-contain" src={host.logoUrl} />
                    </span>
                  ) : (
                    <Badge>{host.name}</Badge>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {claimHref ? (
          <p className="mt-16 text-[14px] text-zinc-500">
            ¿Organizás {community.name}?{" "}
            <Link className="text-yellow-400 underline-offset-4 hover:underline" href={claimHref}>
              Usá Organizá para tus eventos
            </Link>
          </p>
        ) : null}
      </Container>
    </main>
  );
}
