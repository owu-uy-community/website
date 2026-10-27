import { cacheLife } from "next/cache";
import Link from "next/link";

import { ButtonLink, CommunityLogo, Container, PageHeader } from "components/community/ui";
import Footer from "components/shared/Footer";
import { pageMetadata } from "lib/community/metadata";
import { getTimeline } from "lib/timeline/data";
import { yearSpan } from "lib/timeline/format";
import { venueHref } from "lib/timeline/map";
import { dotsOn, getMaps, getVenues } from "lib/timeline/venues";

import { eventsLabel } from "../EventLists";
import VenueMap from "./VenueMap";

export const metadata = pageMetadata({
  title: "Dónde se juntó la comunidad tech uruguaya",
  description:
    "Las oficinas, coworks, universidades y bares que recibieron meetups, conferencias y hackatones de la comunidad tech de Uruguay, en un mapa y con todo lo que pasó en cada uno.",
  path: "/timeline/lugares",
});

const number = new Intl.NumberFormat("es-UY");

export default async function VenuesPage() {
  "use cache";
  // The dataset ships with the deploy (content/timeline): it only changes with one
  cacheLife({ stale: 300, revalidate: 31_536_000, expire: 31_536_000 });

  const { venues } = getVenues();
  const { community } = getTimeline();
  const maps = getMaps();
  const city = dotsOn(maps.montevideo, venues);
  // The country map shows what the city's doesn't
  const country = dotsOn(maps.uruguay, venues).filter((dot) => !city.some((other) => other.slug === dot.slug));
  const total = venues.reduce((sum, venue) => sum + venue.events.length, 0);

  return (
    <>
      <main>
        <PageHeader
          actions={
            <ButtonLink href="/timeline" variant="secondary">
              Volver a la historia
            </ButtonLink>
          }
          description={
            <>
              {number.format(venues.length)} lugares que recibieron a la comunidad más de una vez: oficinas de empresas,
              coworks, universidades y bares que abrieron sus puertas a {number.format(total)} eventos. Cada punto, del
              tamaño de lo que pasó ahí.
            </>
          }
          eyebrow="Historia · Lugares"
          title="Dónde nos juntamos"
        />

        <Container className="grid gap-4 lg:grid-cols-[2fr_1fr] lg:items-start">
          <div className="rounded-2xl border border-white/[0.06] bg-zinc-950 p-3 sm:p-4">
            <h2 className="mb-2 text-sm font-medium text-zinc-400">Montevideo, del Cerro a Carrasco</h2>
            <VenueMap dots={city} label={`Mapa de Montevideo con ${city.length} lugares`} view={maps.montevideo} />
          </div>
          <div className="rounded-2xl border border-white/[0.06] bg-zinc-950 p-3 sm:p-4">
            <h2 className="mb-2 text-sm font-medium text-zinc-400">El resto del país</h2>
            <VenueMap
              className="mx-auto max-w-sm"
              dots={country}
              label={`Mapa de Uruguay con ${country.length} lugares fuera de Montevideo`}
              view={maps.uruguay}
            />
          </div>
        </Container>
        <Container>
          <p className="mt-3 text-xs text-zinc-500">
            Ubicaciones según Meetup; los lugares de conferencias y archivos sin dirección no tienen punto. Mapa:{" "}
            <a
              className="underline underline-offset-2 hover:text-zinc-300"
              href="https://www.geoboundaries.org"
              rel="noopener noreferrer"
              target="_blank"
            >
              geoBoundaries
            </a>
            , con datos de © colaboradores de{" "}
            <a
              className="underline underline-offset-2 hover:text-zinc-300"
              href="https://www.openstreetmap.org/copyright"
              rel="noopener noreferrer"
              target="_blank"
            >
              OpenStreetMap
            </a>
            .
          </p>
        </Container>

        <Container className="py-12 sm:py-16">
          <ol className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {venues.map((venue, i) => (
              <li key={venue.slug}>
                <Link
                  className="flex h-full items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 transition-colors hover:border-white/20 hover:bg-white/[0.04]"
                  href={venueHref(venue.slug)}
                >
                  <span className="w-7 shrink-0 text-right font-terminal text-[13px] text-zinc-500 tabular-nums">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] text-zinc-100">{venue.name}</span>
                    <span className="block truncate text-[13px] text-zinc-400">
                      {eventsLabel(venue.events.length)} · {yearSpan(venue.events[0].start, venue.events.at(-1)!.start)}
                      {/* Almost every one is in Montevideo: the others say where */}
                      {venue.city && venue.city !== "Montevideo" ? ` · ${venue.city}` : ""}
                    </span>
                  </span>
                  <span aria-hidden className="flex shrink-0 -space-x-2">
                    {venue.communities.slice(0, 3).map((slug) => (
                      <CommunityLogo
                        key={slug}
                        className="ring-2 ring-zinc-950"
                        logo={community.get(slug)?.logo ?? null}
                        name={community.get(slug)?.name ?? slug}
                        size="sm"
                      />
                    ))}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </Container>
      </main>
      <Footer />
    </>
  );
}
