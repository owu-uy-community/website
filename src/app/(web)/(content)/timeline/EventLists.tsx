import Link from "next/link";

import { CommunityLogo, Container } from "components/community/ui";
import { firstPhoto, getTimeline } from "lib/timeline/data";
import { formatDate } from "lib/timeline/format";
import { photoSources } from "lib/timeline/image";
import type { TimelineEvent } from "lib/timeline/types";

/** What a profile or a place page lists: a strip of photos from their events, and every event by year */

const number = new Intl.NumberFormat("es-UY");
export const eventsLabel = (count: number) => `${number.format(count)} ${count === 1 ? "evento" : "eventos"}`;

/** A photo of each of the latest events that has one (the Wayback Machine's load slowly, or not) */
export function PhotoStrip({ events, label }: { events: TimelineEvent[]; label: string }) {
  const moments = events
    .toReversed()
    .flatMap((event) => {
      const src = firstPhoto(event);
      return src && !src.includes("web.archive.org") ? [{ event, src }] : [];
    })
    .slice(0, 8);
  if (!moments.length) return null;

  return (
    <section aria-labelledby="momentos" className="border-y border-white/[0.06] bg-zinc-950 py-10">
      <Container>
        <h2 className="mb-5 text-sm font-medium text-zinc-400" id="momentos">
          {label}
        </h2>
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {moments.map(({ event, src }) => {
            const photo = photoSources(src, "(min-width: 1280px) 300px, (min-width: 640px) 25vw, 50vw");
            return (
              <li key={event.slug}>
                <Link
                  className="group relative block aspect-[4/3] overflow-hidden rounded-xl bg-zinc-900"
                  href={`/timeline/${event.slug}`}
                >
                  <img
                    alt=""
                    className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
                    decoding="async"
                    loading="lazy"
                    sizes={photo.sizes}
                    src={photo.src}
                    srcSet={photo.srcSet}
                  />
                  <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-3 pt-8 text-[13px] leading-snug text-white">
                    <span className="line-clamp-2">{event.title}</span>
                    <span className="block text-[12px] text-zinc-300">{formatDate(event)}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </Container>
    </section>
  );
}

/** Newest year first; each event with its community's logo */
export function EventsByYear({ events }: { events: TimelineEvent[] }) {
  const { community: byCommunity } = getTimeline();
  const byYear = Map.groupBy(events.toReversed(), (event) => event.start.slice(0, 4));

  return [...byYear].map(([year, list]) => (
    <div key={year} className="mt-8">
      <h3 className="font-terminal text-sm text-zinc-400 tabular-nums">
        {year} · {eventsLabel(list.length)}
      </h3>
      <ol className="mt-2 divide-y divide-white/[0.06]">
        {list.map((event) => {
          const community = byCommunity.get(event.community);
          return (
            <li key={event.slug}>
              <Link className="group flex items-center gap-4 py-3" href={`/timeline/${event.slug}`}>
                <CommunityLogo logo={community?.logo ?? null} name={community?.name ?? event.community} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-zinc-100 transition-colors group-hover:text-yellow-200">
                    {event.title}
                  </span>
                  <span className="block truncate text-sm text-zinc-400">
                    {formatDate(event)} · {community?.name}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </div>
  ));
}

/** The communities a person or a place had events with, and how many */
export function CommunityList({
  title,
  items,
}: {
  title: string;
  items: { slug: string; name: string; logo?: string; label: string }[];
}) {
  return (
    <section aria-labelledby="comunidades">
      <h2 className="text-sm font-medium text-zinc-400" id="comunidades">
        {title}
      </h2>
      <ul className="mt-3 flex flex-col gap-2">
        {items.map((item) => (
          <li key={item.slug}>
            <Link
              className="flex items-center gap-3 rounded-xl border border-white/[0.08] p-2.5 transition-colors hover:border-white/20"
              href={`/timeline?comunidad=${item.slug}#archivo`}
            >
              <CommunityLogo logo={item.logo ?? null} name={item.name} size="sm" />
              <span className="min-w-0">
                <span className="block truncate text-[14px] text-zinc-100">{item.name}</span>
                <span className="block text-[12px] text-zinc-400">{item.label}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
