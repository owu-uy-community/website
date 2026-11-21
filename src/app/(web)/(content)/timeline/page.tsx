import { Info } from "lucide-react";
import { cacheLife } from "next/cache";

import { cn } from "app/lib/utils";
import {
  ButtonLink,
  Container,
  delay,
  Eyebrow,
  headingClassName,
  Section,
  StatStrip,
  TitleBar,
} from "components/community/ui";
import Footer from "components/shared/Footer";
import { pageMetadata } from "lib/community/metadata";
import { issueFormUrl, PRIVACY_EMAIL, sourceUrl } from "lib/community/site";
import { getArchive, getStats, getStory, getTimeline, isCommunityEvent } from "lib/timeline/data";
import { photoSources } from "lib/timeline/image";
import { communityActivity } from "lib/timeline/activity";

import Activity from "./Activity";
import ArchiveGate from "./ArchiveGate";
import { YearBars } from "./Charts";
import HeroTiles from "./HeroTiles";
import { pageLine, takedownHref } from "./Provenance";
import StatsSection from "./stats/StatsSection";
import SectionNav from "./SectionNav";
import StoryRail from "./StoryRail";

export const metadata = pageMetadata({
  title: "La historia de la comunidad tech uruguaya",
  description:
    "Cada meetup, conferencia, hackatón y game jam de las comunidades tech de Uruguay desde 2007, con fechas, lugares y fotos. Reconstruido de Meetup, GitHub y los sitios de cada evento.",
  path: "/timeline",
});

const number = new Intl.NumberFormat("es-UY");

/** The hero's contact sheet: one photo per era, each opening its event */
const MOSAIC = [
  ["2011-11-11-rubyconf-uruguay-2011", 26],
  ["2013-03-22-rubyconf-uruguay-2013", 2],
  ["2014-03-14-jsconf-uruguay-2014", 1],
  ["2017-05-15-testinguy-2017", 18],
  ["2024-10-19-la-meetup-2024", 0],
  ["2025-11-01-la-meetup-2025", 0],
] as const;

/** The communities grid, drawn by the server: the busiest 24 up front, the rest a click away */
function ActivityGrid({ to }: { to: number }) {
  const { rows, communities } = getArchive();
  const { top, rest } = communityActivity(rows, communities, 24);
  const from = Math.min(...top.map((row) => row.first), ...rest.map((row) => row.first));
  return <Activity from={from} rest={rest} to={to} top={top} />;
}

function HeroMosaic() {
  const { bySlug } = getTimeline();
  const tiles = MOSAIC.flatMap(([slug, index]) => {
    const event = bySlug.get(slug);
    const photo = event?.photos?.[index];
    return event && photo
      ? [
          {
            slug,
            title: event.title,
            year: event.start.slice(0, 4),
            alt: photo.alt ?? event.title,
            // Three to a 30rem column on wide screens, 112–128px in the row to swipe
            sources: photoSources(photo.src, "(min-width: 1280px) 152px, (min-width: 640px) 128px, 112px"),
          },
        ]
      : [];
  });
  return <HeroTiles tiles={tiles} />;
}

export default async function TimelinePage() {
  "use cache";
  // The dataset ships with the deploy (content/timeline): it only changes with one
  cacheLife({ stale: 300, revalidate: 31_536_000, expire: 31_536_000 });

  const { events } = getTimeline();
  const stats = getStats();
  const own = events.filter(isCommunityEvent);
  const thisYear = Number(own.at(-1)?.start.slice(0, 4) ?? 2026);
  const years = [...new Set(own.map((event) => Number(event.start.slice(0, 4))))];

  return (
    <>
      <main>
        <header className="relative">
          <Container className="pt-8 sm:pt-10">
            <p
              className="flex w-fit max-w-full items-start gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-3.5 py-2 text-[12px] leading-relaxed text-zinc-400 sm:items-center sm:rounded-full"
              role="note"
            >
              <Info aria-hidden className="mt-0.5 size-3.5 shrink-0 text-yellow-300 sm:mt-0" />
              <span>
                OWU solo indexa contenido público y no aloja las fotos: se ven desde su fuente original. ¿Querés que
                saquemos algo? Escribinos a{" "}
                <a
                  className="text-zinc-200 underline decoration-white/25 underline-offset-4 hover:decoration-yellow-400"
                  href={takedownHref("Sacar algo de la historia", [pageLine("/timeline")])}
                >
                  {PRIVACY_EMAIL}
                </a>
                .
              </span>
            </p>
          </Container>

          <Container className="grid gap-12 pt-14 pb-14 sm:pt-20 sm:pb-16 xl:grid-cols-[minmax(0,1fr)_30rem] xl:items-center xl:gap-20 xl:pt-16">
            <div className="min-w-0">
              <div className="owu-rise" style={delay(0)}>
                <Eyebrow>Historia</Eyebrow>
              </div>
              <h1 className={cn(headingClassName.h1, "owu-rise mt-4 max-w-3xl text-balance")} style={delay(80)}>
                La historia de la comunidad tech uruguaya
              </h1>
              <TitleBar className="owu-rise mt-8" />
              <div className="owu-rise mt-8 max-w-2xl" style={delay(160)}>
                <p className="text-lg leading-relaxed text-pretty text-zinc-300 sm:text-xl sm:leading-relaxed">
                  Desde el primer FLISoL en 2007 hasta la OWU CONF: cada meetup, conferencia, hackatón y game jam de las
                  comunidades tech de Uruguay, con fecha, lugar y fotos.
                </p>
                <p className="mt-4 max-w-xl leading-relaxed text-pretty text-zinc-400">
                  Lo reconstruimos de Meetup, de los repositorios de cada comunidad y de los sitios de cada evento,
                  también los que ya no existen.
                </p>
              </div>
              <div
                className="owu-rise mt-10 grid gap-3 sm:flex sm:flex-wrap sm:items-center [&>a]:justify-center"
                style={delay(240)}
              >
                <ButtonLink arrow href="#archivo">
                  Ver todos los eventos
                </ButtonLink>
                {/* The deck is made for a phone: there it's one tap away */}
                <ButtonLink className="sm:hidden" href="/timeline/descubrir" variant="secondary">
                  Deslizá los eventos
                </ButtonLink>
                <ButtonLink href="#sumar" variant="secondary">
                  ¿Falta algo? Sumalo
                </ButtonLink>
              </div>
            </div>
            <HeroMosaic />
          </Container>

          <Container className="pb-16 sm:pb-24">
            <StatStrip
              className="border-t border-white/[0.08] pt-10 sm:pt-12"
              stats={[
                { value: number.format(stats.events), label: "eventos de comunidades" },
                { value: number.format(stats.communities), label: "comunidades, de ayer y de hoy" },
                { value: number.format(stats.photos), label: "fotos de sus eventos" },
                { value: thisYear - stats.since, label: `años, desde ${stats.since}` },
              ]}
            />
          </Container>
        </header>

        <SectionNav years={years} />

        {/* ------------------------------------------------------------ the story */}
        <section className="scroll-mt-36 border-y border-white/[0.06] bg-zinc-950 py-12 sm:py-16" id="historia">
          <Container className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <Eyebrow className="mb-3">Año por año</Eyebrow>
              <h2 className={headingClassName.h2}>Cómo llegamos hasta acá</h2>
              <TitleBar className="mt-5" />
            </div>
            <p className="max-w-sm text-sm text-zinc-400">
              <span className="md:hidden">
                Deslizá los años de costado, o tocá uno abajo. Tocá una foto para verla grande.
              </span>
              <span className="hidden md:inline">
                Arranca en el presente: seguí bajando y la línea viaja hacia atrás, hasta 1990. Tocá una foto para verla
                grande.
              </span>
            </p>
          </Container>
          <StoryRail markers={getStory()} />
        </section>

        {/* ------------------------------------------------------ communities */}
        <Section
          description={
            <>
              Cada fila es una comunidad y cada casillero, un año de su vida: cuanto más brilla, más eventos hizo. Se ve
              el boom de 2014 a 2019, el corte de 2020 y la vuelta desde 2022.
            </>
          }
          className="scroll-mt-36"
          eyebrow="Las comunidades"
          id="comunidades"
          title="Quién estuvo y cuándo"
        >
          <div className="flex flex-col gap-14">
            <YearBars
              years={Array.from({ length: thisYear - 2007 + 1 }, (_, i) => 2007 + i).map((year) => {
                const inYear = own.filter((event) => event.start.startsWith(String(year)));
                return {
                  year,
                  inPerson: inYear.filter((e) => !e.online).length,
                  online: inYear.filter((e) => e.online).length,
                };
              })}
            />
            <ActivityGrid to={thisYear} />
          </div>
        </Section>

        {/* ------------------------------------------------------------ numbers */}
        <StatsSection />

        {/* ---------------------------------------------------------- archive */}
        <Section
          description={
            <>
              Filtrá por comunidad, tipo, tema, ciudad o años y elegí un evento para leerlo con sus fotos; con las
              flechas (o deslizando, en el teléfono) pasás al siguiente. Por defecto, los eventos presenciales que
              organizan comunidades.
            </>
          }
          className="scroll-mt-36"
          eyebrow="El archivo"
          id="archivo"
          title="Todos los eventos"
        >
          {/* The static HTML carries the archive's skeleton; the archive (and its URL state) is client-only */}
          <ArchiveGate />
        </Section>

        {/* ------------------------------------------------------------ closing */}
        <Section className="scroll-mt-36 pt-0" id="sumar">
          <div className="grid gap-6 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6 sm:p-10 lg:grid-cols-[1.4fr_1fr]">
            <div>
              <h2 className={headingClassName.h3}>¿Falta algo? Seguro que sí.</h2>
              <p className="mt-3 max-w-xl text-zinc-400">
                Si organizaste o fuiste a algo que no está, o tenés fotos de un evento, contanos: lo sumamos con su
                fuente. Los datos están en{" "}
                <a
                  className="text-zinc-200 underline decoration-white/20 underline-offset-4 hover:decoration-yellow-400"
                  href={sourceUrl("content/timeline")}
                  rel="noopener"
                  target="_blank"
                >
                  content/timeline
                </a>{" "}
                y cada evento dice de dónde salió.
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                <ButtonLink arrow href={issueFormUrl("sumar-a-la-historia")} utm="timeline">
                  Sumá un evento o una foto
                </ButtonLink>
              </div>
            </div>
            <div className="text-sm leading-relaxed text-zinc-400">
              <p className="font-medium text-zinc-200">Las fotos son de quienes las sacaron</p>
              <p className="mt-2">
                Las mostramos desde donde están publicadas (Meetup, Flickr, GitHub, el Wayback Machine), con su autor y
                un link a la original. ¿Aparecés en una y preferís que no esté? Escribinos a{" "}
                <a
                  className="text-zinc-200 underline decoration-white/20 underline-offset-4 hover:decoration-yellow-400"
                  href={takedownHref("Sacar una foto de la historia", [pageLine("/timeline")])}
                >
                  {PRIVACY_EMAIL}
                </a>{" "}
                y la sacamos en 72 horas.
              </p>
            </div>
          </div>
        </Section>
      </main>

      <Footer />
    </>
  );
}
