import { ArrowLeft, ArrowRight, ArrowUpRight, CalendarDays, Camera, MapPin, Sparkles, Users } from "lucide-react";
import { cacheLife } from "next/cache";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge, CommunityLogo, Container, headingClassName, Kbd, TitleBar } from "components/community/ui";
import Footer from "components/shared/Footer";
import { pageMetadata } from "lib/community/metadata";
import { PRIVACY_EMAIL, SITE_URL } from "lib/community/site";
import { getTimeline, photoCount } from "lib/timeline/data";
import { formatDate, formatTime, KIND_LABEL, plainText, STATUS_LABEL } from "lib/timeline/format";
import { photoSources } from "lib/timeline/image";
import { venueHref } from "lib/timeline/map";
import { organizersOf } from "lib/timeline/people";
import { getVenues } from "lib/timeline/venues";
import type { TimelineEvent, TimelinePhoto } from "lib/timeline/types";

import Markdown from "../Markdown";
import Organizers, { SpeakerNames } from "../Organizers";
import EventNav from "./EventNav";
import Gallery, { type GalleryPhoto } from "./Gallery";

type Props = { params: Promise<{ slug: string }> };

/** Conferences, milestones and photo-rich events at build; any other event renders on its first visit */
export function generateStaticParams() {
  return getTimeline()
    .events.filter((event) => event.kind !== "meetup" || event.highlights || photoCount(event) >= 20)
    .map(({ slug }) => ({ slug }));
}

// Fully static; a slug that isn't prerendered waits for its complete render, so an unknown one is a real 404
export const ensureStatic = "navigation";

const number = new Intl.NumberFormat("es-UY");
const decimal = new Intl.NumberFormat("es-UY", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const describe = (event: TimelineEvent, community: string) =>
  [
    `${KIND_LABEL[event.kind]} de ${community}`,
    formatDate(event, true),
    event.venue ? `en ${event.venue}` : event.online ? "online" : null,
    event.rsvps ? `${number.format(event.rsvps)} personas anotadas` : null,
  ]
    .filter(Boolean)
    .join(", ") + ".";

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const { bySlug, community } = getTimeline();
  const event = bySlug.get(slug);
  if (!event) return {};

  return pageMetadata({
    title: event.title,
    description:
      plainText(event.summary ?? event.description ?? "").slice(0, 160) ||
      describe(event, community.get(event.community)?.name ?? ""),
    path: `/timeline/${slug}`,
  });
}

const credit = (photo: TimelinePhoto) =>
  photo.by ? `Foto: ${photo.by}${photo.source && photo.source !== photo.by ? ` · ${photo.source}` : ""}` : photo.source;

export default async function TimelineEventPage({ params }: Props) {
  const { slug } = await params;
  if (!getTimeline().bySlug.has(slug)) notFound();

  return <EventView slug={slug} />;
}

async function EventView({ slug }: { slug: string }) {
  "use cache";
  // The dataset ships with the deploy (content/timeline): it only changes with one
  cacheLife({ stale: 300, revalidate: 31_536_000, expire: 31_536_000 });

  const { events, bySlug, community: communities } = getTimeline();
  const event = bySlug.get(slug)!;

  const community = communities.get(event.community);
  const name = community?.name ?? event.community;
  // The place's page, when it held other events too
  const place = getVenues().ofEvent.get(slug);
  const sameCommunity = events.filter((e) => e.community === event.community);
  const index = sameCommunity.indexOf(event);
  const previous = sameCommunity[index - 1];
  const next = sameCommunity[index + 1];
  const month = event.start.slice(0, 7);
  const around = events
    .filter((e) => e !== event && e.start.startsWith(month) && e.layer === "community" && e.kind !== "hito")
    .slice(0, 6);
  const photos: GalleryPhoto[] = (event.photos ?? []).map((photo, index) => ({
    // The grid is 4 columns in a 1152px container (3 on tablets, 2 on phones); the first tile is 2×2
    tile: photoSources(
      photo.src,
      index === 0
        ? "(min-width: 1024px) 576px, (min-width: 640px) 66vw, 100vw"
        : "(min-width: 1024px) 288px, (min-width: 640px) 33vw, 50vw"
    ),
    full: photoSources(photo.src, "100vw"),
    alt: photo.alt ?? `Foto de ${event.title}`,
    credit: credit(photo),
    page: photo.page,
    license: photo.license,
  }));
  const credits = [...new Set((event.photos ?? []).map(credit).filter(Boolean))];
  const time = formatTime(event.start);
  const year = event.start.slice(0, 4);
  const sourceUrl = event.url ?? event.wayback;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: event.title,
    startDate: event.start,
    ...(event.end ? { endDate: event.end } : {}),
    eventAttendanceMode: event.online
      ? "https://schema.org/OnlineEventAttendanceMode"
      : "https://schema.org/OfflineEventAttendanceMode",
    eventStatus: "https://schema.org/EventScheduled",
    location: event.online
      ? { "@type": "VirtualLocation", url: sourceUrl ?? `${SITE_URL}/timeline/${slug}` }
      : {
          "@type": "Place",
          name: event.venue ?? event.city ?? "Uruguay",
          address: event.city ?? "Uruguay",
          ...(event.geo ? { geo: { "@type": "GeoCoordinates", latitude: event.geo[0], longitude: event.geo[1] } } : {}),
        },
    organizer: { "@type": "Organization", name },
    // The original file, as published (an absolute URL either way)
    ...(event.photos?.[0] ? { image: [new URL(event.photos[0].src, SITE_URL).href] } : {}),
    url: `${SITE_URL}/timeline/${slug}`,
    ...((event.summary ?? event.description)
      ? { description: plainText(event.summary ?? event.description!).slice(0, 500) }
      : {}),
  };

  return (
    <>
      <script
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
        type="application/ld+json"
      />
      <main>
        <Container className="pt-10 pb-12 sm:pt-16">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <nav aria-label="Ruta" className="flex flex-wrap items-center gap-2 text-sm text-zinc-400">
              <Link className="hover:text-zinc-200" href="/timeline">
                Historia
              </Link>
              <span aria-hidden>/</span>
              <Link className="hover:text-zinc-200" href={`/timeline#anio-${year}`}>
                {year}
              </Link>
              <span aria-hidden>/</span>
              <Link className="hover:text-zinc-200" href={`/timeline?comunidad=${event.community}#archivo`}>
                {name}
              </Link>
            </nav>
            <EventNav archive={`/timeline#anio-${year}`} next={next?.slug} previous={previous?.slug} />
          </div>

          <header className="mt-8 grid gap-8 lg:grid-cols-[1fr_20rem]">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={event.kind === "hito" ? "accent" : "neutral"}>{KIND_LABEL[event.kind]}</Badge>
                {event.layer === "ecosystem" ? <Badge>Ecosistema</Badge> : null}
                {event.online ? <Badge>Online</Badge> : null}
                {event.upcoming ? <Badge tone="accent">Se viene</Badge> : null}
                {event.highlights?.map((highlight) => (
                  <Badge key={highlight} tone="accent">
                    <Sparkles aria-hidden className="size-3" /> {highlight}
                  </Badge>
                ))}
              </div>
              <h1 className={`${headingClassName.h1} mt-5`}>{event.title}</h1>
              <TitleBar className="mt-6" />
              {event.kind === "hito" && event.description ? (
                <Markdown className="mt-6 max-w-2xl text-lg leading-relaxed text-zinc-300" text={event.description} />
              ) : null}
            </div>

            <div className="flex flex-col gap-4 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 text-sm">
              {/* Each fact is a dt/dd pair; the icon lives inside its dd */}
              <dl className="flex flex-col gap-4">
                <div>
                  <dt className="sr-only">Fecha</dt>
                  <dd className="flex gap-3 text-zinc-100">
                    <CalendarDays aria-hidden className="mt-0.5 size-4 shrink-0 text-zinc-400" />
                    <span>
                      {formatDate(event, true)}
                      {time ? <span className="text-zinc-400"> · {time}</span> : null}
                      {event.confidence ? (
                        <span className="mt-1 block text-xs text-zinc-400">
                          {event.confidence === "low" ? "Fecha aproximada" : "Fecha según una sola fuente"}
                        </span>
                      ) : null}
                    </span>
                  </dd>
                </div>
                {event.venue || event.city || event.online ? (
                  <div>
                    <dt className="sr-only">Lugar</dt>
                    <dd className="flex gap-3 text-zinc-100">
                      <MapPin aria-hidden className="mt-0.5 size-4 shrink-0 text-zinc-400" />
                      <span>
                        {event.online ? (
                          "Online"
                        ) : place ? (
                          <Link
                            className="underline decoration-white/20 underline-offset-4 hover:decoration-yellow-400"
                            href={venueHref(place)}
                          >
                            {event.venue}
                          </Link>
                        ) : (
                          event.venue
                        )}
                        {event.city && event.city !== event.venue ? (
                          <span className="block text-zinc-400">{event.city}</span>
                        ) : null}
                      </span>
                    </dd>
                  </div>
                ) : null}
                {event.rsvps || event.attendance ? (
                  <div>
                    <dt className="sr-only">Gente</dt>
                    <dd className="flex gap-3 text-zinc-100">
                      <Users aria-hidden className="mt-0.5 size-4 shrink-0 text-zinc-400" />
                      {event.rsvps
                        ? `${number.format(event.rsvps)} ${event.url?.includes("meetup.com") || event.wayback ? "anotados en Meetup" : "personas"}`
                        : event.attendance}
                    </dd>
                  </div>
                ) : null}
                <div className="border-t border-white/[0.06] pt-4">
                  <dt className="sr-only">Organiza</dt>
                  <dd className="flex items-center gap-3">
                    <CommunityLogo logo={community?.logo ?? null} name={name} size="sm" />
                    <span className="min-w-0">
                      <span className="block truncate text-zinc-100">{name}</span>
                      {community ? (
                        <span className="block text-xs text-zinc-400">
                          {community.events} eventos · {STATUS_LABEL[community.status]}
                          {community.members ? ` · ${number.format(community.members)} miembros` : null}
                          {community.rating && (community.ratings ?? 0) >= 20 ? (
                            <span
                              title={`Promedio de ${number.format(community.ratings!)} calificaciones de sus eventos en Meetup`}
                            >
                              {" · "}★ {decimal.format(community.rating)}
                            </span>
                          ) : null}
                          {community.directory ? (
                            <>
                              {" · "}
                              <Link
                                className="text-zinc-300 underline decoration-white/20 underline-offset-2 hover:decoration-yellow-400"
                                href={`/comunidad/${community.slug}`}
                              >
                                Su página
                              </Link>
                            </>
                          ) : null}
                        </span>
                      ) : null}
                    </span>
                  </dd>
                </div>
                {event.organizers?.length ? (
                  <div className="border-t border-white/[0.06] pt-4">
                    <dt className="mb-2 text-xs font-medium tracking-wide text-zinc-400 uppercase">Organizaron</dt>
                    <dd>
                      <Organizers people={organizersOf(event)} />
                    </dd>
                  </div>
                ) : null}
              </dl>
              {sourceUrl ? (
                <a
                  className="inline-flex items-center gap-1 text-zinc-300 underline decoration-white/20 underline-offset-4 hover:decoration-yellow-400"
                  href={sourceUrl}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  {event.url?.includes("meetup.com")
                    ? "Ver en Meetup"
                    : event.wayback
                      ? "Ver la página archivada"
                      : "Ver el evento"}
                  <ArrowUpRight aria-hidden className="size-3.5" />
                </a>
              ) : null}
            </div>
          </header>
        </Container>

        {photos.length ? (
          <section aria-labelledby="fotos" className="border-y border-white/[0.06] bg-zinc-950 py-10 sm:py-14">
            <Container>
              <h2 className="mb-6 flex items-center gap-2 text-sm font-medium text-zinc-400" id="fotos">
                <Camera aria-hidden className="size-4" /> {photos.length} {photos.length === 1 ? "foto" : "fotos"}
                {event.photoCount && event.photoCount > photos.length ? (
                  <span className="text-zinc-400">· el álbum tiene {event.photoCount}</span>
                ) : null}
                {/* A community with photos of other events too: all of them in one place */}
                {community?.photos && community.photos > photos.length ? (
                  <Link
                    className="ml-auto text-zinc-300 underline decoration-white/20 underline-offset-4 hover:text-white hover:decoration-yellow-400"
                    href={`/timeline/fotos/${event.community}`}
                  >
                    Ver todas las fotos de {name}
                  </Link>
                ) : null}
              </h2>
              <Gallery photos={photos} title={event.title} />
              <p className="mt-6 text-xs leading-relaxed text-zinc-400">
                {credits.join(" · ")}. Cada foto se ve desde donde está publicada. ¿Aparecés en una y preferís que no
                esté?{" "}
                <a
                  className="underline underline-offset-2 hover:text-zinc-300"
                  href={`mailto:${PRIVACY_EMAIL}?subject=Foto%20en%20${encodeURIComponent(event.title)}`}
                >
                  Escribinos
                </a>
                .
              </p>
            </Container>
          </section>
        ) : null}

        <Container className="grid gap-12 py-12 sm:py-16 lg:grid-cols-[1fr_20rem]">
          <div className="flex min-w-0 flex-col gap-10">
            {event.summary ? (
              <section aria-labelledby="que-fue">
                <h2 className={headingClassName.h3} id="que-fue">
                  Qué fue
                </h2>
                <Markdown className="mt-4 max-w-2xl leading-relaxed text-zinc-300" text={event.summary} />
              </section>
            ) : null}

            {event.talks?.length ? (
              <section aria-labelledby="charlas">
                <h2 className={`${headingClassName.h3} scroll-mt-28`} id="charlas">
                  Charlas
                </h2>
                <ol className="mt-4 divide-y divide-white/[0.06]">
                  {event.talks.map((talk) => (
                    <li
                      key={talk.title}
                      className="flex flex-col gap-1 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6"
                    >
                      <div>
                        <p className="text-zinc-100">{talk.title}</p>
                        {talk.speakers?.length ? (
                          <p className="text-sm text-zinc-400">
                            <SpeakerNames speakers={talk.speakers} />
                          </p>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 gap-3 text-sm">
                        {talk.slides ? (
                          <a
                            className="text-zinc-300 underline decoration-white/20 underline-offset-4 hover:decoration-yellow-400"
                            href={talk.slides}
                            rel="noopener noreferrer"
                            target="_blank"
                          >
                            Slides
                          </a>
                        ) : null}
                        {talk.video ? (
                          <a
                            className="text-zinc-300 underline decoration-white/20 underline-offset-4 hover:decoration-yellow-400"
                            href={talk.video}
                            rel="noopener noreferrer"
                            target="_blank"
                          >
                            Video
                          </a>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ol>
              </section>
            ) : event.talkCount ? (
              <p className="text-zinc-400">{event.talkCount} charlas, según el sitio del evento.</p>
            ) : null}

            {event.kind !== "hito" && event.description ? (
              <section aria-labelledby="descripcion">
                <h2 className={headingClassName.h3} id="descripcion">
                  Cómo lo anunciaron
                </h2>
                <Markdown className="mt-4 max-w-2xl leading-relaxed text-zinc-400" text={event.description} />
              </section>
            ) : null}

            {event.links?.length || event.sources.length ? (
              <section aria-labelledby="fuentes">
                <h2 className={headingClassName.h3} id="fuentes">
                  Links y fuentes
                </h2>
                <ul className="mt-4 flex flex-col gap-2 text-sm">
                  {[...(event.links ?? []), ...event.sources].map((link) => (
                    <li key={`${link.label}-${link.url}`}>
                      <a
                        className="inline-flex items-center gap-1 text-zinc-300 underline decoration-white/20 underline-offset-4 hover:decoration-yellow-400"
                        href={link.url}
                        rel="noopener noreferrer"
                        target="_blank"
                      >
                        {link.label} <ArrowUpRight aria-hidden className="size-3.5" />
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>

          <aside className="flex flex-col gap-8">
            {around.length ? (
              <section aria-labelledby="ese-mes">
                <h2 className="text-sm font-medium text-zinc-400" id="ese-mes">
                  Ese mes en la escena
                </h2>
                <ul className="mt-3 flex flex-col gap-3">
                  {around.map((e) => (
                    <li key={e.slug}>
                      <Link className="group block" href={`/timeline/${e.slug}`}>
                        <span className="font-terminal text-[12px] text-zinc-400">{formatDate(e)}</span>
                        <span className="block text-sm text-zinc-200 group-hover:text-yellow-200">{e.title}</span>
                        <span className="block text-xs text-zinc-400">{communities.get(e.community)?.name}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </aside>
        </Container>

        <Container className="pb-16">
          <nav aria-label={`Más de ${name}`} className="grid gap-3 sm:grid-cols-2">
            {previous ? (
              <Link
                className="group rounded-2xl border border-white/[0.08] p-5 transition-colors hover:border-white/20"
                href={`/timeline/${previous.slug}`}
              >
                <span className="flex items-center gap-1 text-xs text-zinc-400">
                  <ArrowLeft aria-hidden className="size-3.5" /> Anterior de {name}
                  <Kbd className="ml-auto hidden sm:inline-flex">←</Kbd>
                </span>
                <span className="mt-2 block text-zinc-100 group-hover:text-yellow-200">{previous.title}</span>
                <span className="font-terminal text-[12px] text-zinc-400">{formatDate(previous)}</span>
              </Link>
            ) : (
              <span />
            )}
            {next ? (
              <Link
                className="group rounded-2xl border border-white/[0.08] p-5 text-right transition-colors hover:border-white/20"
                href={`/timeline/${next.slug}`}
              >
                <span className="flex items-center justify-end gap-1 text-xs text-zinc-400">
                  <Kbd className="mr-auto hidden sm:inline-flex">→</Kbd>
                  Siguiente de {name} <ArrowRight aria-hidden className="size-3.5" />
                </span>
                <span className="mt-2 block text-zinc-100 group-hover:text-yellow-200">{next.title}</span>
                <span className="font-terminal text-[12px] text-zinc-400">{formatDate(next)}</span>
              </Link>
            ) : null}
          </nav>
        </Container>
      </main>
      <Footer />
    </>
  );
}
