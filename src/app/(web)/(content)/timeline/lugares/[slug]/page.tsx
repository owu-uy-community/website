import { MapPin } from "lucide-react";
import { cacheLife } from "next/cache";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Container, headingClassName, TitleBar } from "components/community/ui";
import Footer from "components/shared/Footer";
import { pageMetadata } from "lib/community/metadata";
import { getTimeline } from "lib/timeline/data";
import { yearSpan } from "lib/timeline/format";
import { project, venueHref } from "lib/timeline/map";
import { dotsOn, getMaps, getVenues } from "lib/timeline/venues";

import { CommunityList, EventsByYear, eventsLabel, PhotoStrip } from "../../EventLists";
import VenueMap from "../VenueMap";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return getVenues().venues.map(({ slug }) => ({ slug }));
}

// Fully static; a slug that isn't prerendered waits for its complete render, so an unknown one is a real 404
export const ensureStatic = "navigation";

export async function generateMetadata({ params }: Props) {
  const venue = getVenues().bySlug.get((await params).slug);
  if (!venue) return {};
  const span = yearSpan(venue.events[0].start, venue.events.at(-1)!.start);
  return pageMetadata({
    title: `${venue.name}: los eventos de la comunidad tech que recibió`,
    description: `${venue.name}${venue.city ? `, en ${venue.city},` : ""} recibió ${eventsLabel(venue.events.length)} de la comunidad tech uruguaya (${span}): cuáles, de qué comunidades y sus fotos.`,
    path: venueHref(venue.slug),
  });
}

export default async function VenuePage({ params }: Props) {
  const { slug } = await params;
  if (!getVenues().bySlug.has(slug)) notFound();

  return <VenueView slug={slug} />;
}

async function VenueView({ slug }: { slug: string }) {
  "use cache";
  // The dataset ships with the deploy (content/timeline): it only changes with one
  cacheLife({ stale: 300, revalidate: 31_536_000, expire: 31_536_000 });

  const { venues, bySlug } = getVenues();
  const venue = bySlug.get(slug)!;
  const { community } = getTimeline();
  const maps = getMaps();
  // Up close when it's in the city's map, the whole country otherwise
  const view = venue.geo && project(maps.montevideo, venue.geo) ? maps.montevideo : maps.uruguay;
  const counts = Map.groupBy(venue.events, (event) => event.community);

  return (
    <>
      <main>
        <Container className="pt-10 pb-10 sm:pt-16">
          <nav aria-label="Ruta" className="flex flex-wrap items-center gap-2 text-sm text-zinc-400">
            <Link className="hover:text-zinc-200" href="/timeline">
              Historia
            </Link>
            <span aria-hidden>/</span>
            <Link className="hover:text-zinc-200" href="/timeline/lugares">
              Lugares
            </Link>
            <span aria-hidden>/</span>
            <span className="text-zinc-300">{venue.name}</span>
          </nav>

          <header className="mt-8 grid gap-8 lg:grid-cols-[1fr_24rem] lg:items-center">
            <div className="min-w-0">
              <h1 className={headingClassName.h1}>{venue.name}</h1>
              <TitleBar className="mt-6" />
              <p className="mt-6 text-lg text-zinc-300">
                Recibió {eventsLabel(venue.events.length)}
                {venue.communities.length > 1 ? ` de ${venue.communities.length} comunidades` : ""}
                <span className="text-zinc-400"> · {yearSpan(venue.events[0].start, venue.events.at(-1)!.start)}</span>
              </p>
              {venue.city ? (
                <p className="mt-3 flex items-center gap-2 text-zinc-400">
                  <MapPin aria-hidden className="size-4" /> {venue.city}
                </p>
              ) : null}
            </div>
            {venue.geo ? (
              <div className="rounded-2xl border border-white/[0.06] bg-zinc-950 p-2">
                <VenueMap current={slug} dots={dotsOn(view, venues)} label={`${venue.name} en el mapa`} view={view} />
              </div>
            ) : null}
          </header>
        </Container>

        <PhotoStrip events={venue.events} label="Lo que pasó ahí" />

        <Container className="grid gap-12 py-12 sm:py-16 lg:grid-cols-[1fr_20rem]">
          <section aria-labelledby="eventos" className="min-w-0">
            <h2 className={headingClassName.h3} id="eventos">
              Sus eventos
            </h2>
            <EventsByYear events={venue.events} />
          </section>

          <aside>
            <CommunityList
              items={venue.communities.flatMap((key) => {
                const found = community.get(key);
                return found ? [{ ...found, label: eventsLabel(counts.get(key)!.length) }] : [];
              })}
              title="Las comunidades que se juntaron ahí"
            />
          </aside>
        </Container>

        <Container className="pb-16">
          <p className="max-w-2xl text-xs leading-relaxed text-zinc-400">
            El lugar de cada evento, como lo anotó quien lo organizó; los nombres de un mismo lugar se unificaron
            («Oficina de Pyxis» y «Pyxis»). ¿Algo está mal?{" "}
            <Link className="underline underline-offset-2 hover:text-zinc-300" href="/contacto">
              Avisanos
            </Link>
            .
          </p>
        </Container>
      </main>
      <Footer />
    </>
  );
}
