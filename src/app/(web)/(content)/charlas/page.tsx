import { ArrowUpRight, FilePlus2, Plus } from "lucide-react";

import { SOCIAL_LINKS } from "app/lib/constants";
import { cn } from "app/lib/utils";
import { Reveal } from "components/community/motion";
import TalkCard, { talkEventLabel } from "components/community/TalkCard";
import {
  ButtonLink,
  cardClassName,
  Cells,
  headingClassName,
  PageHeader,
  Section,
  SmartLink,
} from "components/community/ui";
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

const normalize = (value: string) => value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

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

  // Talks join the archive once their date has passed
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
        <p className="owu-rise mt-10 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-zinc-500">
          <span>
            <strong className="font-semibold text-zinc-200">{archive.length}</strong>{" "}
            {archive.length === 1 ? "charla" : "charlas"}
          </span>
          <span aria-hidden>·</span>
          <span>
            <strong className="font-semibold text-zinc-200">{withVideo}</strong> con video
          </span>
          {sessionCount > 0 ? (
            <>
              <span aria-hidden>·</span>
              <span>
                <strong className="font-semibold text-zinc-200">{sessionCount}</strong>{" "}
                {sessionCount === 1 ? "sesión de open space" : "sesiones de open space"}
              </span>
            </>
          ) : null}
        </p>
      </PageHeader>

      <Section
        description="Buscá por título, speaker o tema. Si te perdiste una, acá la encontrás."
        eyebrow="Archivo"
        id="archivo"
        title="Charlas de La Meetup y OWU CONF"
      >
        <TalkFilters events={eventOptions} talks={filterable} topics={topicOptions}>
          <div className="flex flex-col gap-16 [&_article:target]:rounded-2xl [&_article:target]:outline [&_article:target]:outline-2 [&_article:target]:outline-offset-8 [&_article:target]:outline-yellow-400/70">
            {groups.map(([event, eventTalks]) => (
              <FilterGroup key={event} slugs={eventTalks.map((talk) => talk.slug)}>
                <Reveal>
                  <div className="mb-6 flex items-baseline justify-between gap-4">
                    <h3 className={headingClassName.h3}>
                      {talkEventLabel(event)}
                      <span className="ml-3 font-normal text-zinc-500">{eventTalks[0].date.slice(0, 4)}</span>
                    </h3>
                    <span className="text-[13px] text-zinc-500 tabular-nums">
                      {pluralize(eventTalks.length, "charla", "charlas")}
                    </span>
                  </div>
                  {/* Plain grid on purpose: the filters hide cards in place and a staggered wrapper would leave gaps */}
                  <div className="grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
                    {eventTalks.map((talk) => (
                      <FilterItem key={talk.slug} slug={talk.slug}>
                        <TalkCard talk={talk} />
                      </FilterItem>
                    ))}
                  </div>
                </Reveal>
              </FilterGroup>
            ))}
          </div>
        </TalkFilters>

        <Reveal className="mt-16">
          <div className="flex flex-col gap-5 rounded-2xl border border-dashed border-white/15 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-7">
            <div className="flex items-start gap-4">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-yellow-400/10 text-yellow-400">
                <FilePlus2 aria-hidden className="size-5" />
              </span>
              <div>
                <h3 className="font-title text-[17px] font-semibold text-white">
                  ¿Tenés el video o las slides de una charla?
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">
                  Sumalos en Keystatic (Charlas, elegí la charla, campos Video y Slides) o mandá un PR editando su
                  archivo en{" "}
                  <code className="rounded-md bg-white/[0.06] px-1.5 py-0.5 font-terminal text-[12px] text-zinc-300">
                    content/talks
                  </code>
                  .
                </p>
              </div>
            </div>
            <ButtonLink arrow href={sourceUrl("content/talks")} size="sm" utm="charlas-video" variant="secondary">
              Ver en GitHub
            </ButtonLink>
          </div>
        </Reveal>
      </Section>

      {editions.length > 0 ? (
        <Section
          description="En un open space la agenda la arma el público: cada quien propone un tema en el mercado de ideas y la grilla se completa ahí mismo. Estos son los temas que se propusieron."
          eyebrow="Open space"
          id="open-space"
          title="Lo que propuso la gente"
        >
          <Reveal>
            <div className={cardClassName(false, "divide-y divide-white/[0.07] px-5 sm:px-7")}>
              {editions.map((edition, index) => {
                const when = dateParts(edition.startDate);

                return (
                  <details key={edition.id} className="group" open={index < 2}>
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 [&::-webkit-details-marker]:hidden">
                      <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        <span className="font-title text-base font-semibold text-white sm:text-[17px]">
                          {edition.name}
                        </span>
                        <span className="text-[13px] text-zinc-500">
                          {when.day} {when.month} {edition.startDate.slice(0, 4)} ·{" "}
                          {pluralize(edition.sessions.length, "sesión", "sesiones")}
                        </span>
                      </span>
                      <Plus
                        aria-hidden
                        className="size-5 shrink-0 text-zinc-500 transition-[transform,color] duration-200 group-open:rotate-45 group-open:text-yellow-400 motion-reduce:transition-none"
                      />
                    </summary>
                    <ul className="flex flex-wrap gap-2 pb-6">
                      {edition.sessions.map((session) => (
                        <li
                          key={session.id}
                          className="inline-flex max-w-full items-baseline gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-1.5 text-[13px] text-zinc-200"
                        >
                          <span className="truncate">{session.title}</span>
                          {session.speaker ? <span className="shrink-0 text-zinc-500">{session.speaker}</span> : null}
                        </li>
                      ))}
                    </ul>
                  </details>
                );
              })}
            </div>
          </Reveal>
        </Section>
      ) : null}

      <Section eyebrow="Más charlas" title="Más charlas de la comunidad">
        <Cells className="md:grid-cols-3">
          {OUTSIDE.map(({ href, label, body }) => (
            <SmartLink
              key={href}
              className={cardClassName(true, "group flex flex-col gap-3 p-6 sm:p-7")}
              href={href}
              utm="charlas-afuera"
            >
              <span className={cn(headingClassName.h3, "flex items-center gap-2")}>
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
        <p className="mt-10 max-w-xl text-[15px] leading-relaxed text-zinc-400">
          <strong className="font-semibold text-white">¿Querés que tu charla esté acá?</strong> Proponela en una meetup
          de la comunidad o en el open space de OWU CONF.{" "}
          <SmartLink
            className="text-zinc-200 underline decoration-white/30 underline-offset-4 hover:decoration-yellow-400"
            href={PAGES.darCharla.href}
          >
            Te contamos cómo
          </SmartLink>
          .
        </p>
      </Section>

      <Footer />
    </>
  );
}
