import { ArrowLeft, ArrowRight, ArrowUpRight, MessagesSquare } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { SOCIAL_LINKS } from "app/lib/constants";
import { EventList } from "components/community/events";
import { Reveal } from "components/community/motion";
import {
  Badge,
  ButtonLink,
  cardClassName,
  Cell,
  Cells,
  Freshness,
  outbound,
  PageHeader,
  Section,
} from "components/community/ui";
import Footer from "components/shared/Footer";
import { RichText } from "components/shared/RichText";
import type { CommunityEvent } from "lib/community/events";
import { pageMetadata } from "lib/community/metadata";
import { PAGES, SLACK_CHANNELS } from "lib/community/site";

import { excerpt, getIssue, getIssues, longDate, SEMANARIO_EMOJI, weekRange } from "../data";

export const revalidate = 3600;

type Props = { params: Promise<{ numero: string }> };

const parseNumber = (value: string) => (/^\d{1,5}$/.test(value) ? Number(value) : null);

export async function generateStaticParams() {
  const issues = await getIssues();

  return issues.map((issue) => ({ numero: String(issue.number) }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const number = parseNumber((await params).numero);
  const issue = number ? await getIssue(number) : null;
  if (!issue) return { title: "Semanario OWU" };

  return pageMetadata({
    title: `Semanario #${issue.number}: ${issue.title}`,
    description: excerpt(issue.intro) || `Lo que pasó en la comunidad la semana del ${weekRange(issue.weekStart)}.`,
    path: `/semanario/${issue.number}`,
  });
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

const navLabel = "block text-xs font-semibold tracking-[0.14em] text-zinc-500 uppercase";

export default async function SemanarioIssuePage({ params }: Props) {
  const number = parseNumber((await params).numero);
  const issue = number ? await getIssue(number) : null;
  if (!issue) notFound();

  const { events, threads, jobs, newCommunities } = issue.sections;
  // The issue's events render with the same rows as the agenda
  const rows: CommunityEvent[] = events.map((event, index) => ({
    id: `semanario-${issue.number}-${index}`,
    title: event.title,
    group: event.group,
    communitySlug: null,
    start: event.start,
    end: null,
    venue: event.venue,
    url: event.url,
    source: "meetup",
    isOwu: false,
  }));

  return (
    <>
      <PageHeader
        description={`Semana del ${weekRange(issue.weekStart)}`}
        eyebrow={`Semanario OWU · #${issue.number}`}
        title={issue.title}
      >
        <Freshness className="owu-rise mt-8">
          Lo armó Owy
          {issue.reviewedBy ? ` · lo revisó ${issue.reviewedBy}` : ""}
          {issue.publishedAt ? ` · publicado el ${longDate(issue.publishedAt)}` : ""}
        </Freshness>
      </PageHeader>

      {issue.intro ? (
        <Section className="py-12 sm:py-16">
          <Reveal className="max-w-2xl space-y-4 text-base leading-relaxed text-zinc-300 sm:text-[17px] [&_a]:text-zinc-100 [&_a]:underline [&_a]:decoration-white/30 [&_a]:underline-offset-4 [&_a:hover]:decoration-yellow-400 [&_strong]:font-semibold [&_strong]:text-white [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5">
            <RichText content={issue.intro} />
          </Reveal>
        </Section>
      ) : null}

      {threads.length > 0 ? (
        <Section
          description={`Los que la comunidad marcó con :${SEMANARIO_EMOJI}: en los canales públicos. Los links abren el Slack de OWU.`}
          eyebrow="Hilos destacados"
          title="De qué se habló"
        >
          <Cells className="gap-3 md:grid-cols-2">
            {threads.map((thread) => (
              <a
                key={thread.permalink}
                className={cardClassName(true, "group flex flex-col gap-5 p-5 sm:p-6")}
                href={thread.permalink}
                rel="noopener"
                target="_blank"
              >
                <span className="flex items-center justify-between gap-3">
                  <Badge>#{thread.channel}</Badge>
                  <span className="flex items-center gap-1.5 text-[13px] text-zinc-500">
                    <MessagesSquare aria-hidden className="size-3.5" />
                    {plural(thread.replies, "respuesta", "respuestas")}
                  </span>
                </span>
                <span className="flex-1 text-[15px] leading-snug font-semibold text-white">{thread.title}</span>
                <span className="inline-flex items-center gap-1 text-[13px] text-zinc-500 transition-colors group-hover:text-yellow-400">
                  Abrir en Slack
                  <ArrowUpRight aria-hidden className="size-3.5" />
                </span>
              </a>
            ))}
          </Cells>
          <p className="mt-6 text-sm text-zinc-500">
            ¿Todavía no estás en el Slack?{" "}
            <a
              className="text-zinc-300 underline decoration-white/20 underline-offset-4 hover:decoration-yellow-400"
              href={outbound(SOCIAL_LINKS.slack, "semanario")}
              rel="noopener"
              target="_blank"
            >
              Sumate acá
            </a>
            .
          </p>
        </Section>
      ) : null}

      {rows.length > 0 ? (
        <Section
          actions={
            <ButtonLink arrow href={PAGES.eventos.href} size="sm" variant="secondary">
              Toda la agenda
            </ButtonLink>
          }
          eyebrow="Agenda"
          title="Qué se viene"
        >
          <Reveal className={cardClassName(false, "overflow-hidden")}>
            <EventList events={rows} />
          </Reveal>
        </Section>
      ) : null}

      {jobs || newCommunities.length > 0 ? (
        <Section eyebrow="Y además" title="Búsquedas y caras nuevas">
          <Cells className={newCommunities.length > 0 && jobs ? "md:grid-cols-2" : undefined}>
            {jobs ? (
              <Cell className="gap-6">
                <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="font-title text-5xl font-extrabold tracking-[-0.02em] text-yellow-400 tabular-nums">
                    {jobs.count}
                  </span>
                  <span className="text-zinc-400">
                    {jobs.count === 1 ? "búsqueda nueva" : "búsquedas nuevas"} en{" "}
                    <span className="font-medium text-zinc-200">#{SLACK_CHANNELS.jobs}</span>
                  </span>
                </p>
                <div className="flex flex-wrap gap-2">
                  {jobs.channelUrl ? (
                    <ButtonLink arrow href={jobs.channelUrl} size="sm" utm="semanario-jobs" variant="secondary">
                      Ver en Slack
                    </ButtonLink>
                  ) : null}
                  <ButtonLink href="/empresas#jobs" size="sm" variant="ghost">
                    Reglas para publicar
                  </ButtonLink>
                </div>
              </Cell>
            ) : null}
            {newCommunities.length > 0 ? (
              <Cell className="gap-5">
                <p className="text-zinc-400">
                  {newCommunities.length === 1
                    ? "Se sumó una comunidad"
                    : `Se sumaron ${newCommunities.length} comunidades`}{" "}
                  al directorio:
                </p>
                <ul className="flex flex-wrap gap-2">
                  {newCommunities.map((community) => (
                    <li key={community.slug}>
                      <Link
                        className="inline-flex h-9 items-center rounded-full border border-white/10 bg-white/[0.04] px-3.5 text-sm font-medium text-zinc-200 transition-colors hover:border-white/20 hover:bg-white/[0.08] hover:text-white"
                        href={`/comunidades#${community.slug}`}
                      >
                        {community.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </Cell>
            ) : null}
          </Cells>
        </Section>
      ) : null}

      <Section>
        <nav aria-label="Otros números" className="grid gap-3 sm:grid-cols-2">
          {issue.prev ? (
            <Link
              className={cardClassName(true, "group flex items-center gap-4 p-5")}
              href={`/semanario/${issue.prev}`}
            >
              <ArrowLeft
                aria-hidden
                className="size-4 text-zinc-500 transition-transform group-hover:-translate-x-0.5"
              />
              <span>
                <span className={navLabel}>Anterior</span>
                <span className="font-title font-semibold text-white">#{issue.prev}</span>
              </span>
            </Link>
          ) : (
            <span />
          )}
          {issue.next ? (
            <Link
              className={cardClassName(true, "group flex items-center justify-end gap-4 p-5 text-right")}
              href={`/semanario/${issue.next}`}
            >
              <span>
                <span className={navLabel}>Siguiente</span>
                <span className="font-title font-semibold text-white">#{issue.next}</span>
              </span>
              <ArrowRight
                aria-hidden
                className="size-4 text-zinc-500 transition-transform group-hover:translate-x-0.5"
              />
            </Link>
          ) : (
            <Link
              className="group flex items-center justify-end gap-4 rounded-2xl border border-dashed border-white/15 p-5 text-right transition-colors hover:border-yellow-400/40"
              href="/semanario#recibilo"
            >
              <span>
                <span className={navLabel}>El próximo sale el lunes</span>
                <span className="font-title font-semibold text-white">Recibilo por RSS o en Slack</span>
              </span>
              <ArrowRight
                aria-hidden
                className="size-4 text-zinc-500 transition-transform group-hover:translate-x-0.5"
              />
            </Link>
          )}
        </nav>
        <p className="mt-10 text-center text-sm text-zinc-500">
          ¿Viste un hilo que tendría que estar acá? Marcalo con{" "}
          <code className="font-terminal text-[12.5px] text-yellow-300">:{SEMANARIO_EMOJI}:</code> y entra en el
          próximo.{" "}
          <Link
            className="text-zinc-300 underline decoration-white/20 underline-offset-4 hover:decoration-yellow-400"
            href="/semanario"
          >
            Todos los números
          </Link>
        </p>
      </Section>

      <Footer />
    </>
  );
}
