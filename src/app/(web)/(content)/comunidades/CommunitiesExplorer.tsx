"use client";

import { ArrowUpRight, CalendarDays, MapPin, Plus, Search, Wifi, X } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { FaSlack } from "react-icons/fa6";

import { SOCIAL_LINKS } from "app/lib/constants";
import { cn } from "app/lib/utils";
import { Badge, buttonClassName, cardClassName, Cells, CommunityLogo, outbound } from "components/community/ui";
import type { Community } from "lib/community/content";
import type { CommunityEvent } from "lib/community/events";
import { issueFormUrl, PAGES } from "lib/community/site";
import { dateParts } from "lib/community/time";
import { TOPICS, topicLabel } from "lib/community/topics";

const STATUS_LABELS = {
  pausa: "En pausa",
  "busca-organizadores": "Busca organizadores",
} as const;

const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();

type Props = {
  communities: Community[];
  /** Next event per community slug (only those with one) */
  nextEvents: Record<string, CommunityEvent>;
};

/**
 * The directory grid with client-side search and topic filters. Every card is in
 * the server HTML (this renders on the server too), so the directory stays crawlable
 * and /comunidades#slug links land even before hydration.
 */
export default function CommunitiesExplorer({ communities, nextEvents }: Props) {
  const [query, setQuery] = useState("");
  const [topic, setTopic] = useState<string | null>(null);
  const [onlyUpcoming, setOnlyUpcoming] = useState(false);

  const topicCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const community of communities) {
      for (const value of community.topics) counts.set(value, (counts.get(value) ?? 0) + 1);
    }

    return TOPICS.filter(({ value }) => counts.has(value)).map(({ value, label }) => ({
      value,
      label,
      count: counts.get(value) ?? 0,
    }));
  }, [communities]);

  const upcomingCount = communities.filter((community) => nextEvents[community.slug]).length;

  const visible = useMemo(() => {
    const needle = normalize(query.trim());

    return communities.filter((community) => {
      if (topic && !community.topics.includes(topic)) return false;
      if (onlyUpcoming && !nextEvents[community.slug]) return false;
      if (!needle) return true;
      const haystack = normalize(
        [community.name, community.description, ...community.topics.map(topicLabel), ...community.feedNames].join(" ")
      );

      return haystack.includes(needle);
    });
  }, [communities, nextEvents, onlyUpcoming, query, topic]);

  const reset = () => {
    setQuery("");
    setTopic(null);
    setOnlyUpcoming(false);
  };

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4">
        <label className="relative block w-full sm:max-w-md">
          <span className="sr-only">Buscar comunidades</span>
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-zinc-500"
          />
          <input
            className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.04] pr-10 pl-11 text-[15px] text-white transition-colors outline-none placeholder:text-zinc-500 focus:border-yellow-400/60 focus:ring-2 focus:ring-yellow-400/20"
            placeholder="Buscá por nombre o tema"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {query ? (
            <button
              aria-label="Borrar búsqueda"
              className="absolute top-1/2 right-2 flex size-7 -translate-y-1/2 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-white/[0.08] hover:text-white"
              type="button"
              onClick={() => setQuery("")}
            >
              <X aria-hidden className="size-3.5" />
            </button>
          ) : null}
        </label>

        <div aria-label="Filtrar por tema" className="flex flex-wrap gap-2" role="group">
          <Chip
            active={topic === null && !onlyUpcoming}
            count={communities.length}
            onClick={() => {
              setTopic(null);
              setOnlyUpcoming(false);
            }}
          >
            Todas
          </Chip>
          {upcomingCount > 0 ? (
            <Chip active={onlyUpcoming} count={upcomingCount} onClick={() => setOnlyUpcoming((current) => !current)}>
              <CalendarDays aria-hidden className="size-3.5" /> Con fecha
            </Chip>
          ) : null}
          {topicCounts.map(({ value, label, count }) => (
            <Chip
              key={value}
              active={topic === value}
              count={count}
              onClick={() => setTopic((current) => (current === value ? null : value))}
            >
              {label}
            </Chip>
          ))}
        </div>

        <p aria-live="polite" className="text-[13px] text-zinc-500">
          {visible.length === communities.length
            ? `${communities.length} comunidades`
            : `${visible.length} de ${communities.length} comunidades`}
        </p>
      </div>

      {visible.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-white/15 px-6 py-16 text-center">
          <p className="text-zinc-300">Ninguna comunidad coincide con esa búsqueda.</p>
          <button className={buttonClassName("secondary", "sm")} type="button" onClick={reset}>
            Ver todas
          </button>
        </div>
      ) : (
        <Cells className="sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((community) => (
            <CommunityCard key={community.slug} community={community} next={nextEvents[community.slug]} />
          ))}
          <JoinCard />
        </Cells>
      )}
    </div>
  );
}

function Chip({
  active,
  count,
  onClick,
  children,
}: {
  active: boolean;
  count: number;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      aria-pressed={active}
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-medium transition-colors",
        active
          ? "border-yellow-400 bg-yellow-400 text-zinc-950"
          : "border-white/10 bg-white/[0.04] text-zinc-300 hover:bg-white/[0.08] hover:text-white"
      )}
      type="button"
      onClick={onClick}
    >
      {children}
      <span className={cn("tabular-nums", active ? "text-zinc-800" : "text-zinc-500")}>{count}</span>
    </button>
  );
}

function CommunityCard({ community, next }: { community: Community; next?: CommunityEvent }) {
  const status = community.status === "activa" ? null : STATUS_LABELS[community.status];
  const when = next ? dateParts(next.start) : null;

  return (
    <article
      className={cardClassName(
        true,
        "group flex scroll-mt-24 flex-col gap-5 p-6 target:border-yellow-400/60 target:bg-yellow-400/[0.04]"
      )}
      id={community.slug}
    >
      <div className="flex items-start gap-4">
        <CommunityLogo logo={community.logo} name={community.name} size="lg" />
        <div className="min-w-0 flex-1">
          <h2 className="font-title text-lg leading-snug font-semibold text-white">
            <a className="transition-colors hover:text-yellow-200" href={`#${community.slug}`}>
              {community.name}
            </a>
          </h2>
          {status || community.confPartner ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {status ? <Badge>{status}</Badge> : null}
              {community.confPartner ? <Badge tone="accent">Aliada OWU CONF</Badge> : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-sm leading-relaxed text-zinc-400">{community.description}</p>
        {community.topics.length > 0 ? (
          <p className="text-xs text-zinc-500">{community.topics.map(topicLabel).join(" · ")}</p>
        ) : null}
      </div>

      <div className="mt-auto flex flex-col gap-4">
        {next && when ? (
          <a
            className="group/next block rounded-xl bg-white/[0.04] p-4 transition-colors hover:bg-white/[0.07]"
            href={outbound(next.url, "directorio")}
            rel="noopener"
            target="_blank"
          >
            <span className="flex items-center justify-between gap-2 text-[13px] font-semibold text-yellow-400">
              <span className="capitalize">
                {when.weekday} {when.day} {when.month} · {when.time} h
              </span>
              <ArrowUpRight
                aria-hidden
                className="size-4 shrink-0 text-zinc-500 transition-[transform,color] group-hover/next:translate-x-0.5 group-hover/next:-translate-y-0.5 group-hover/next:text-white"
              />
            </span>
            <span className="mt-1.5 line-clamp-2 block text-sm leading-snug text-zinc-200">{next.title}</span>
            <span className="mt-1.5 flex items-center gap-1 text-xs text-zinc-500">
              {next.venue ? (
                <MapPin aria-hidden className="size-3.5 shrink-0" />
              ) : (
                <Wifi aria-hidden className="size-3.5 shrink-0" />
              )}
              <span className="truncate">{next.venue ?? "Online"}</span>
            </span>
          </a>
        ) : (
          <p className="text-xs text-zinc-500">Sin fechas publicadas por ahora</p>
        )}

        <ul className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px]">
          {community.meetup ? (
            <li>
              <ExternalLink href={community.meetup}>Eventos</ExternalLink>
            </li>
          ) : null}
          {community.website ? (
            <li>
              <ExternalLink href={community.website}>Sitio web</ExternalLink>
            </li>
          ) : null}
          {community.slackChannel ? (
            <li>
              <a
                className="inline-flex items-center gap-1.5 text-zinc-400 transition-colors hover:text-white"
                href={outbound(SOCIAL_LINKS.slack, "directorio")}
                rel="noopener"
                target="_blank"
                title="Canal en el Slack de OWU"
              >
                <FaSlack aria-hidden className="size-3" />#{community.slackChannel}
              </a>
            </li>
          ) : null}
        </ul>
      </div>
    </article>
  );
}

function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      className="group/link inline-flex items-center gap-1 text-zinc-400 transition-colors hover:text-white"
      href={outbound(href, "directorio")}
      rel="noopener"
      target="_blank"
    >
      {children}
      <ArrowUpRight
        aria-hidden
        className="size-3 text-zinc-600 transition-transform group-hover/link:translate-x-0.5 group-hover/link:-translate-y-0.5"
      />
    </a>
  );
}

function JoinCard() {
  return (
    <div className="flex flex-col justify-between gap-6 rounded-2xl border border-dashed border-white/15 p-6 transition-colors hover:border-yellow-400/50 hover:bg-yellow-400/[0.04]">
      <div className="flex flex-col gap-5">
        <span className="flex size-11 items-center justify-center rounded-xl bg-yellow-400/10 text-yellow-400">
          <Plus aria-hidden className="size-5" />
        </span>
        <div>
          <h2 className="font-title text-lg font-semibold text-white">¿Tu comunidad no está?</h2>
          <p className="mt-2 text-sm leading-relaxed text-zinc-400">
            Contanos cómo se llama, de qué se trata y dónde se juntan. La sumamos al directorio, a la agenda y al ⌘K
            del sitio.
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <a
          className={buttonClassName("primary", "sm")}
          href={outbound(issueFormUrl("sumar-comunidad"), "directorio")}
          rel="noopener"
          target="_blank"
        >
          Sumá tu comunidad
        </a>
        <Link className={buttonClassName("ghost", "sm")} href={PAGES.organizar.href}>
          Qué te da OWU
        </Link>
      </div>
    </div>
  );
}
