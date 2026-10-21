import { ArrowUpRight, FilePlus2 } from "lucide-react";

import { SOCIAL_LINKS } from "app/lib/constants";
import TalkCard, { talkEventLabel } from "components/community/TalkCard";
import { ButtonLink, Cells, Eyebrow, PageHeader, Section, SmartLink } from "components/community/ui";
import Footer from "components/shared/Footer";
import { TALK_EVENTS } from "keystatic/collections/talks";
import { getTalks, type Talk } from "lib/community/content";
import { pageMetadata } from "lib/community/metadata";
import { getOpenSpaceSessions } from "lib/community/openspace-sessions";
import { PAGES, sourceUrl } from "lib/community/site";
import { dateParts } from "lib/community/time";
import { TOPICS } from "lib/community/topics";

import { FilterGroup, FilterItem, TalkFilters, type FilterableTalk } from "./TalkFilters";

// Talks change by PR; the open space sessions come from the database once a day
export const revalidate = 86400;

export const metadata = pageMetadata({
  title: "Charlas",
  description:
    "Todo lo que se habló en La Meetup, OWU CONF y los open spaces de la comunidad, con video cuando hay grabación.",
  path: "/charlas",
});

const OUTSIDE = [
  { href: "https://ruby.uy/charlas/", label: "ruby.uy/charlas", body: "86 charlas de Ruby Montevideo, con buscador." },
  {
    href: "https://www.rubyevents.org/",
    label: "rubyevents.org",
    body: "Charlas de Ruby de conferencias de todo el mundo.",
  },
  { href: SOCIAL_LINKS.youtube, label: "YouTube @owuuy", body: "Las grabaciones de OWU, a medida que las subimos." },
];

const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

const isUpcoming = (talk: Talk) => Date.parse(`${talk.date}T23:59:59-03:00`) > Date.now();

/** Past talks by event, the event with the newest talk first */
function groupByEvent(talks: Talk[]) {
  const groups = new Map<string, Talk[]>();
  for (const talk of talks) groups.set(talk.event, [...(groups.get(talk.event) ?? []), talk]);

  return [...groups.entries()].sort(([, a], [, b]) => b[0].date.localeCompare(a[0].date));
}

const pluralize = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

export default async function CharlasPage() {
  const [talks, editions] = await Promise.all([getTalks(), getOpenSpaceSessions()]);

  const upcoming = talks.filter(isUpcoming);
  const archive = talks.filter((talk) => !isUpcoming(talk));
  const groups = groupByEvent(archive);
  const withVideo = archive.filter((talk) => talk.video).length;
  const sessionCount = editions.reduce((total, edition) => total + edition.sessions.length, 0);

  const filterable: FilterableTalk[] = archive.map((talk) => ({
    slug: talk.slug,
    text: normalize([talk.title, ...talk.speakers, talk.summary].join(" ")),
    event: talk.event,
    topics: talk.topics,
    hasVideo: Boolean(talk.video),
  }));
  const eventOptions = TALK_EVENTS.filter(({ value }) => archive.some((talk) => talk.event === value)).map(
    ({ value, label }) => ({ value, label })
  );
  const topicOptions = TOPICS.filter(({ value }) => archive.some((talk) => talk.topics.includes(value))).map(
    ({ value, label }) => ({ value, label })
  );
  const conf = upcoming[0] ? dateParts(`${upcoming[0].date}T12:00:00-03:00`) : null;

  return (
    <>
      <PageHeader
        actions={
          <>
            <ButtonLink arrow href={SOCIAL_LINKS.youtube} utm="charlas-header">
              Ver en YouTube
            </ButtonLink>
            <ButtonLink href={PAGES.darCharla.href} variant="secondary">
              Proponé una charla
            </ButtonLink>
          </>
        }
        description="Lo que se habló en La Meetup y OWU CONF, y los temas que la gente propuso en cada open space. Con video cuando hay grabación."
        eyebrow="Charlas"
        title="Todo lo que se habló en OWU"
      >
        <p className="owu-rise mt-10 flex flex-wrap gap-x-3 gap-y-1 font-terminal text-[11px] tracking-[0.08em] text-zinc-500 uppercase">
          <span>{pluralize(archive.length, "charla", "charlas")}</span>
          <span aria-hidden className="text-zinc-700">
            /
          </span>
          <span>{pluralize(withVideo, "con video", "con video")}</span>
          {sessionCount > 0 ? (
            <>
              <span aria-hidden className="text-zinc-700">
                /
              </span>
              <span>{pluralize(sessionCount, "sesión de open space", "sesiones de open space")}</span>
            </>
          ) : null}
        </p>
      </PageHeader>

      {upcoming.length > 0 && conf ? (
        <Section
          bordered={false}
          description="El programa de la próxima conferencia. Después del evento quedan acá, con su grabación."
          eyebrow={`Próximamente · ${conf.weekday} ${conf.day} ${conf.month}`}
          title="En OWU CONF 2026"
        >
          <div className="grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {upcoming.map((talk) => (
              <TalkCard key={talk.slug} talk={talk} />
            ))}
          </div>
        </Section>
      ) : null}

      <Section
        bordered={upcoming.length > 0}
        description="Buscá por título, speaker o tema. Si te perdiste una, acá la encontrás."
        eyebrow="Archivo"
        id="archivo"
        title="Charlas de La Meetup y OWU CONF"
      >
        <TalkFilters events={eventOptions} talks={filterable} topics={topicOptions}>
          <div className="flex flex-col gap-14 [&_article:target]:rounded-lg [&_article:target]:outline [&_article:target]:outline-1 [&_article:target]:outline-offset-8 [&_article:target]:outline-yellow-400/70">
            {groups.map(([event, eventTalks]) => (
              <FilterGroup key={event} slugs={eventTalks.map((talk) => talk.slug)}>
                <div className="mb-6 flex items-baseline justify-between gap-4 border-b border-line pb-3">
                  <h3 className="font-terminal text-xs tracking-[0.12em] text-zinc-300 uppercase">
                    {talkEventLabel(event)}
                    <span className="ml-3 text-zinc-600">{eventTalks[0].date.slice(0, 4)}</span>
                  </h3>
                  <span className="font-terminal text-[11px] text-zinc-600">
                    {pluralize(eventTalks.length, "charla", "charlas")}
                  </span>
                </div>
                <div className="grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
                  {eventTalks.map((talk) => (
                    <FilterItem key={talk.slug} slug={talk.slug}>
                      <TalkCard talk={talk} />
                    </FilterItem>
                  ))}
                </div>
              </FilterGroup>
            ))}
          </div>
        </TalkFilters>

        <div className="mt-14 flex flex-col gap-4 rounded-xl border border-dashed border-line-strong p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="flex items-start gap-3">
            <FilePlus2 aria-hidden className="mt-0.5 size-4 shrink-0 text-yellow-400" />
            <p className="text-sm leading-relaxed text-zinc-400">
              <span className="text-zinc-200">¿Tenés el video o las slides de una charla?</span> Sumalos en Keystatic
              (Charlas, elegí la charla, campos Video y Slides) o mandá un PR editando su archivo en{" "}
              <code className="rounded bg-white/[0.06] px-1 font-terminal text-[12px] text-zinc-300">
                content/talks
              </code>
              .
            </p>
          </div>
          <ButtonLink arrow href={sourceUrl("content/talks")} size="sm" utm="charlas-video" variant="secondary">
            Ver en GitHub
          </ButtonLink>
        </div>
      </Section>

      {editions.length > 0 ? (
        <Section
          description="En un open space la agenda la arma el público: cada quien propone un tema en el mercado de ideas y la grilla se completa ahí mismo. Estos son los temas que se propusieron."
          eyebrow="Open space"
          id="open-space"
          title="Lo que propuso la gente"
        >
          <div className="flex flex-col divide-y divide-line border-y border-line">
            {editions.map((edition, index) => {
              const when = dateParts(edition.startDate);

              return (
                <details key={edition.id} className="group py-2" open={index < 2}>
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 [&::-webkit-details-marker]:hidden">
                    <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <span className="text-base font-medium text-zinc-100">{edition.name}</span>
                      <span className="font-terminal text-[11px] tracking-[0.08em] text-zinc-500 uppercase">
                        {when.day} {when.month} {edition.startDate.slice(0, 4)} ·{" "}
                        {pluralize(edition.sessions.length, "sesión", "sesiones")}
                      </span>
                    </span>
                    <span
                      aria-hidden
                      className="flex size-6 shrink-0 items-center justify-center rounded-full border border-line-strong text-zinc-400 transition-transform duration-200 group-open:rotate-45 group-open:text-yellow-400 motion-reduce:transition-none"
                    >
                      +
                    </span>
                  </summary>
                  <ul className="flex flex-wrap gap-2 pb-5">
                    {edition.sessions.map((session) => (
                      <li
                        key={session.id}
                        className="inline-flex max-w-full items-baseline gap-2 rounded-md border border-line bg-white/[0.02] px-3 py-1.5 text-[13px] text-zinc-300"
                      >
                        <span className="truncate">{session.title}</span>
                        {session.speaker ? (
                          <span className="shrink-0 font-terminal text-[11px] text-zinc-600">{session.speaker}</span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </details>
              );
            })}
          </div>
        </Section>
      ) : null}

      <Section eyebrow="Más charlas" title="Más charlas de la comunidad">
        <Cells className="md:grid-cols-3">
          {OUTSIDE.map(({ href, label, body }) => (
            <SmartLink
              key={href}
              className="group relative flex flex-col gap-3 bg-ink p-6 transition-colors hover:bg-white/[0.03] sm:p-8"
              href={href}
              utm="charlas-afuera"
            >
              <span className="flex items-center gap-2 text-lg font-semibold tracking-[-0.02em] text-zinc-50">
                {label}
                <ArrowUpRight
                  aria-hidden
                  className="size-4 text-zinc-600 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-zinc-200"
                />
              </span>
              <span className="text-sm leading-relaxed text-zinc-400">{body}</span>
            </SmartLink>
          ))}
        </Cells>
        <div>
          <Eyebrow className="mt-10">¿Querés que tu charla esté acá?</Eyebrow>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-zinc-400">
            Proponela en una meetup de la comunidad o en el open space de OWU CONF.{" "}
            <SmartLink
              className="text-zinc-200 underline decoration-white/30 underline-offset-4 hover:decoration-yellow-400"
              href={PAGES.darCharla.href}
            >
              Te contamos cómo
            </SmartLink>
            .
          </p>
        </div>
      </Section>

      <Footer />
    </>
  );
}
