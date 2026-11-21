import { cacheLife } from "next/cache";

import { ButtonLink, Container, PageHeader } from "components/community/ui";
import Footer from "components/shared/Footer";
import { pageMetadata } from "lib/community/metadata";
import { getTimeline } from "lib/timeline/data";
import type { GivenTalk } from "lib/timeline/people";

import Provenance from "../Provenance";
import Talks from "../Talks";

export const metadata = pageMetadata({
  title: "Charlas grabadas de la comunidad tech uruguaya",
  description:
    "Los videos y las slides de las charlas de conferencias y meetups de la comunidad tech de Uruguay, desde 2010: quién las dio y en qué evento.",
  path: "/timeline/charlas",
});

const number = new Intl.NumberFormat("es-UY");

export default async function TalksPage() {
  "use cache";
  // The dataset ships with the deploy (content/timeline): it only changes with one
  cacheLife({ stale: 300, revalidate: 31_536_000, expire: 31_536_000 });

  // Newest first; the ones with something to watch or read
  const talks: GivenTalk[] = getTimeline()
    .events.toReversed()
    .flatMap((event) => (event.talks ?? []).map((talk) => ({ event, talk })))
    .filter(({ talk }) => talk.video || talk.slides);
  const byYear = Map.groupBy(talks, ({ event }) => event.start.slice(0, 4));
  const videos = talks.filter(({ talk }) => talk.video).length;

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
              {number.format(videos)} charlas con video y {number.format(talks.length - videos)} más con sus slides, de
              las conferencias y meetups de la historia. Cada una, con quién la dio y el evento donde fue.
            </>
          }
          eyebrow="Historia · Charlas"
          title="Charlas grabadas"
        />
        <Container className="pb-16">
          <nav aria-label="Años" className="mb-10 flex flex-wrap gap-2">
            {[...byYear].map(([year, list]) => (
              <a
                key={year}
                className="rounded-full border border-white/10 px-3 py-1 font-terminal text-[13px] text-zinc-300 tabular-nums transition-colors hover:border-yellow-400/60 hover:text-white"
                href={`#charlas-${year}`}
              >
                {year} <span className="text-zinc-500">{list.length}</span>
              </a>
            ))}
          </nav>
          <div className="flex max-w-4xl flex-col gap-12">
            {[...byYear].map(([year, list]) => (
              <section key={year} aria-labelledby={`charlas-${year}`}>
                <h2
                  className="mb-4 scroll-mt-28 font-terminal text-sm text-zinc-400 tabular-nums"
                  id={`charlas-${year}`}
                >
                  {year} · {list.length} {list.length === 1 ? "charla" : "charlas"}
                </h2>
                <Talks talks={list} />
              </section>
            ))}
          </div>
          <Provenance className="mt-16" path="/timeline/charlas" subject="Sacar una charla de la historia">
            Las charlas salen de cómo anunció cada evento en Meetup y de los programas de cada conferencia; los videos y
            las slides se ven desde donde los publicaron. Cada charla lleva a su evento, que dice de dónde salió.
          </Provenance>
        </Container>
      </main>
      <Footer />
    </>
  );
}
