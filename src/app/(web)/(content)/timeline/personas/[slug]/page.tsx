import { ArrowUpRight } from "lucide-react";
import { cacheLife } from "next/cache";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Container, headingClassName, TitleBar } from "components/community/ui";
import Footer from "components/shared/Footer";
import { pageMetadata } from "lib/community/metadata";
import { getTimeline } from "lib/timeline/data";
import { ROLE_LABEL, yearSpan } from "lib/timeline/format";
import { getPersonPage } from "lib/timeline/people";

import Avatar from "../../Avatar";
import { CommunityList, EventsByYear, eventsLabel, PhotoStrip } from "../../EventLists";
import { personHref } from "../../Organizers";
import Provenance from "../../Provenance";
import Talks from "../../Talks";

type Props = { params: Promise<{ slug: string }> };

/** Organizers and repeat speakers at build; someone who gave one talk renders on its first visit */
export function generateStaticParams() {
  return getTimeline()
    .people.filter((person) => person.events || person.roles || (person.talks ?? 0) > 1)
    .map(({ slug }) => ({ slug }));
}

// Fully static; a slug that isn't prerendered waits for its complete render, so an unknown one is a real 404
export const ensureStatic = "navigation";

const number = new Intl.NumberFormat("es-UY");
const LINK = "underline decoration-white/20 underline-offset-4 transition-colors hover:decoration-yellow-400";

/** "A, B y C" */
const listOf = (names: string[]) =>
  names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} y ${names.at(-1)}`;
const talksLabel = (count: number) => `${number.format(count)} ${count === 1 ? "charla" : "charlas"}`;

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const page = getPersonPage(slug);
  if (!page) return {};
  const { person, communities } = page;
  const names = listOf(communities.slice(0, 3).map(({ community }) => community.name));
  const span = yearSpan(person.first, person.last);
  const did = [
    person.events ? `organizó ${eventsLabel(person.events)}` : null,
    person.talks ? `dio ${talksLabel(person.talks)}` : null,
  ].filter(Boolean);

  return pageMetadata({
    title: `${person.name} en la comunidad tech uruguaya`,
    description: did.length
      ? `${person.name} ${listOf(did as string[])} en ${names}${span ? ` (${span})` : ""}: cada uno, con quién y sus fotos.`
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

  const { person, events, talks, communities, partners } = getPersonPage(slug)!;
  const { community: byCommunity } = getTimeline();
  const span = yearSpan(person.first, person.last);
  const involved = [...new Set([...events, ...talks.map(({ event }) => event)])].toSorted((a, b) =>
    a.start.localeCompare(b.start)
  );
  const where = communities.filter((entry) => entry.events);

  return (
    <>
      <main>
        <Container className="pt-10 pb-10 sm:pt-16">
          <nav aria-label="Ruta" className="flex flex-wrap items-center gap-2 text-sm text-zinc-400">
            <Link className="hover:text-zinc-200" href="/timeline">
              Historia
            </Link>
            <span aria-hidden>/</span>
            <Link className="hover:text-zinc-200" href="/timeline/personas">
              Personas
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
                {person.events || person.talks ? (
                  <>
                    {[
                      person.events ? `Organizó ${eventsLabel(person.events)}` : null,
                      person.talks ? `${person.events ? "dio" : "Dio"} ${talksLabel(person.talks)}` : null,
                    ]
                      .filter(Boolean)
                      .join(" y ")}
                    {where.length > 1 ? ` en ${where.length} comunidades` : ""}
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

        <PhotoStrip events={involved} label="De sus eventos" />

        <Container className="grid gap-12 py-12 sm:py-16 lg:grid-cols-[1fr_20rem]">
          <div className="flex min-w-0 flex-col gap-14">
            {talks.length ? (
              <section aria-labelledby="charlas">
                <h2 className={headingClassName.h3} id="charlas">
                  Sus charlas
                </h2>
                <Talks className="mt-6" current={slug} talks={talks.toReversed()} />
              </section>
            ) : null}
            {events.length || !talks.length ? (
              <section aria-labelledby="eventos">
                <h2 className={headingClassName.h3} id="eventos">
                  {events.length ? "Lo que organizó" : "Todavía sin eventos"}
                </h2>
                <EventsByYear events={events} />
              </section>
            ) : null}
          </div>

          <aside className="flex flex-col gap-10">
            {communities.length ? (
              <CommunityList
                items={communities.map(({ community, events: count }) => ({
                  ...community,
                  label: count ? eventsLabel(count) : "En su equipo hoy",
                }))}
                title="Comunidades"
              />
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
          <Provenance
            path={personHref(person.slug)}
            sources={person.meetup ? [{ label: "Su perfil en Meetup", url: person.meetup }] : undefined}
            subject={`Mi página en la historia: ${person.name}`}
          >
            Esta página junta quién figura como anfitrión de cada evento en Meetup (con su foto de perfil, que se ve
            desde Meetup), el equipo de cada grupo hoy y lo que dicen los sitios y programas de cada conferencia sobre
            quién la organizó y quién dio cada charla; cada evento dice de dónde salió. Si sos vos, también podés pedir
            que corrijamos algo o que saquemos solo la foto.
          </Provenance>
        </Container>
      </main>
      <Footer />
    </>
  );
}
