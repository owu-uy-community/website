import { ArrowUpRight } from "lucide-react";
import { cacheLife } from "next/cache";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CommunityLogo, Container, headingClassName, TitleBar } from "components/community/ui";
import Footer from "components/shared/Footer";
import { pageMetadata } from "lib/community/metadata";
import { PRIVACY_EMAIL } from "lib/community/site";
import { firstPhoto, getTimeline } from "lib/timeline/data";
import { formatDate, ROLE_LABEL, yearSpan } from "lib/timeline/format";
import { photoSources } from "lib/timeline/image";
import { getPersonPage } from "lib/timeline/people";
import type { TimelineEvent } from "lib/timeline/types";

import Avatar from "../../Avatar";
import { personHref } from "../../Organizers";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return getTimeline().people.map(({ slug }) => ({ slug }));
}

// Fully static; a slug that isn't prerendered waits for its complete render, so an unknown one is a real 404
export const ensureStatic = "navigation";

const number = new Intl.NumberFormat("es-UY");
const LINK = "underline decoration-white/20 underline-offset-4 transition-colors hover:decoration-yellow-400";

/** "A, B y C" */
const listOf = (names: string[]) =>
  names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} y ${names.at(-1)}`;
const eventsLabel = (count: number) => `${number.format(count)} ${count === 1 ? "evento" : "eventos"}`;

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const page = getPersonPage(slug);
  if (!page) return {};
  const { person, communities } = page;
  const names = listOf(communities.slice(0, 3).map(({ community }) => community.name));
  const span = yearSpan(person.first, person.last);

  return pageMetadata({
    title: `${person.name} en la comunidad tech uruguaya`,
    description: person.events
      ? `${person.name} organizó ${eventsLabel(person.events)} de ${names}${span ? ` (${span})` : ""}: cada uno, con quién y sus fotos.`
      : `${person.name} es parte del equipo de ${names}.`,
    path: personHref(slug),
  });
}

export default async function PersonPage({ params }: Props) {
  const { slug } = await params;
  if (!getPersonPage(slug)) notFound();

  return <ProfileView slug={slug} />;
}

async function ProfileView({ slug }: { slug: string }) {
  "use cache";
  // The dataset ships with the deploy (content/timeline): it only changes with one
  cacheLife({ stale: 300, revalidate: 31_536_000, expire: 31_536_000 });

  const { person, events, communities, partners } = getPersonPage(slug)!;
  const { community: byCommunity } = getTimeline();
  const span = yearSpan(person.first, person.last);
  const newest = [...events].reverse();
  // A photo of each of their latest events that has one (the Wayback Machine's load slowly, or not)
  const moments = newest
    .flatMap((event) => {
      const src = firstPhoto(event);
      return src && !src.includes("web.archive.org") ? [{ event, src }] : [];
    })
    .slice(0, 8);
  const byYear = new Map<string, TimelineEvent[]>();
  for (const event of newest)
    byYear.set(event.start.slice(0, 4), [...(byYear.get(event.start.slice(0, 4)) ?? []), event]);
  const organized = communities.filter((entry) => entry.events);

  return (
    <>
      <main>
        <Container className="pt-10 pb-10 sm:pt-16">
          <nav aria-label="Ruta" className="flex flex-wrap items-center gap-2 text-sm text-zinc-400">
            <Link className="hover:text-zinc-200" href="/timeline">
              Historia
            </Link>
            <span aria-hidden>/</span>
            <Link className="hover:text-zinc-200" href="/timeline/organizadores">
              Organizadores
            </Link>
            <span aria-hidden>/</span>
            <span className="text-zinc-300">{person.name}</span>
          </nav>

          <header className="mt-8 flex flex-col gap-6 sm:flex-row sm:items-center sm:gap-8">
            <Avatar className="ring-4 ring-yellow-400/25" eager name={person.name} photo={person.photo} size={112} />
            <div className="min-w-0 flex-1">
              <h1 className={headingClassName.h1}>{person.name}</h1>
              <TitleBar className="mt-6" />
              <p className="mt-6 text-lg text-zinc-300">
                {person.events ? (
                  <>
                    Organizó {eventsLabel(person.events)}
                    {organized.length > 1 ? ` en ${organized.length} comunidades` : ""}
                  </>
                ) : (
                  <>En el equipo de {listOf(communities.map(({ community }) => community.name))}</>
                )}
                {span ? <span className="text-zinc-400"> · {span}</span> : null}
              </p>
              {person.roles?.length ? (
                <ul aria-label="Hoy, en Meetup" className="mt-4 flex flex-wrap gap-2">
                  {person.roles.map(({ community, role }) => (
                    <li
                      key={community}
                      className="inline-flex items-center gap-1.5 rounded-full bg-yellow-400/15 px-3 py-1 text-[13px] text-yellow-100"
                    >
                      {ROLE_LABEL[role]} {byCommunity.get(community)?.name}
                    </li>
                  ))}
                </ul>
              ) : null}
              {person.meetup ? (
                <a
                  className={`mt-5 inline-flex items-center gap-1 text-sm text-zinc-300 ${LINK}`}
                  href={person.meetup}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  Su perfil en Meetup <ArrowUpRight aria-hidden className="size-3.5" />
                </a>
              ) : null}
            </div>
          </header>
        </Container>

        {moments.length ? (
          <section aria-labelledby="momentos" className="border-y border-white/[0.06] bg-zinc-950 py-10">
            <Container>
              <h2 className="mb-5 text-sm font-medium text-zinc-400" id="momentos">
                De sus eventos
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
        ) : null}

        <Container className="grid gap-12 py-12 sm:py-16 lg:grid-cols-[1fr_20rem]">
          <section aria-labelledby="eventos" className="min-w-0">
            <h2 className={headingClassName.h3} id="eventos">
              {events.length ? "Lo que organizó" : "Todavía sin eventos"}
            </h2>
            {[...byYear].map(([year, list]) => (
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
                          <CommunityLogo
                            logo={community?.logo ?? null}
                            name={community?.name ?? event.community}
                            size="sm"
                          />
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
            ))}
          </section>

          <aside className="flex flex-col gap-10">
            {communities.length ? (
              <section aria-labelledby="comunidades">
                <h2 className="text-sm font-medium text-zinc-400" id="comunidades">
                  Comunidades
                </h2>
                <ul className="mt-3 flex flex-col gap-2">
                  {communities.map(({ community, events: count }) => (
                    <li key={community.slug}>
                      <Link
                        className="flex items-center gap-3 rounded-xl border border-white/[0.08] p-2.5 transition-colors hover:border-white/20"
                        href={`/timeline?comunidad=${community.slug}#archivo`}
                      >
                        <CommunityLogo logo={community.logo ?? null} name={community.name} size="sm" />
                        <span className="min-w-0">
                          <span className="block truncate text-[14px] text-zinc-100">{community.name}</span>
                          <span className="block text-[12px] text-zinc-400">
                            {count ? eventsLabel(count) : "En su equipo hoy"}
                          </span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {partners.length ? (
              <section aria-labelledby="junto-a">
                <h2 className="text-sm font-medium text-zinc-400" id="junto-a">
                  Organizó junto a
                </h2>
                <ul className="mt-3 flex flex-col gap-1">
                  {partners.map(({ person: partner, events: count }) => (
                    <li key={partner.slug}>
                      <Link
                        className="group flex items-center gap-3 rounded-lg p-1.5 transition-colors hover:bg-white/[0.04]"
                        href={personHref(partner.slug)}
                      >
                        <Avatar name={partner.name} photo={partner.photo} size={32} />
                        <span className="min-w-0 flex-1 truncate text-[14px] text-zinc-200 group-hover:text-white">
                          {partner.name}
                        </span>
                        <span className="text-[12px] text-zinc-400 tabular-nums">{count}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </aside>
        </Container>

        <Container className="pb-16">
          <p className="max-w-2xl text-xs leading-relaxed text-zinc-400">
            Esta página junta lo que ya está publicado: quién figura como anfitrión de cada evento en Meetup (con su
            foto de perfil, que se ve desde Meetup), el equipo de cada grupo hoy y lo que dicen los sitios de cada
            conferencia. ¿Sos vos y querés corregir algo, sacar la foto o la página?{" "}
            <a
              className="underline underline-offset-2 hover:text-zinc-300"
              href={`mailto:${PRIVACY_EMAIL}?subject=${encodeURIComponent(`Mi página de organizador: ${person.name}`)}`}
            >
              Escribinos
            </a>
            .
          </p>
        </Container>
      </main>
      <Footer />
    </>
  );
}
