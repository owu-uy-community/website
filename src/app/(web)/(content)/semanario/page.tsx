import { ArrowRight, Rss } from "lucide-react";
import Link from "next/link";
import { cacheLife } from "next/cache";

import { SOCIAL_LINKS } from "app/lib/constants";
import CopyField from "components/community/CopyField";
import { Reveal } from "components/community/reveal";
import {
  ButtonLink,
  Card,
  cardClassName,
  Cell,
  Cells,
  Eyebrow,
  headingClassName,
  PageHeader,
  Section,
} from "components/community/ui";
import Footer from "components/shared/Footer";
import { pageMetadata } from "lib/community/metadata";
import { SITE_URL, SLACK_CHANNELS } from "lib/community/site";

import { excerpt, getIssues, longDate, SEMANARIO_EMOJI, weekRange } from "./data";

export const metadata = pageMetadata({
  title: "Semanario OWU",
  description:
    "Lo que pasó en el Slack de OWU y lo que se viene, cada lunes: hilos que marcó la comunidad, la agenda de la semana y las búsquedas nuevas.",
  path: "/semanario",
});

const FEED_URL = `${SITE_URL}/semanario/feed.xml`;

const STEPS = [
  {
    title: "Marcás un hilo",
    body: (
      <>
        Si un hilo de un canal público te pareció bueno, reaccioná con{" "}
        <code className="rounded-md bg-white/[0.06] px-1.5 py-0.5 font-terminal text-[12px] text-yellow-300">
          :{SEMANARIO_EMOJI}:
        </code>
        . Cuantas más marcas, más arriba queda.
      </>
    ),
  },
  {
    title: "Owy arma el borrador",
    body: "Cada lunes de mañana junta los hilos marcados de la semana, la agenda que viene y las búsquedas nuevas, y escribe una intro corta.",
  },
  {
    title: "Una persona lo revisa",
    body: "Alguien del staff lo lee, saca lo que no va y lo publica. Owy nunca publica solo, y solo mira canales públicos.",
  },
];

function Subscribe() {
  return (
    <Cells className="lg:grid-cols-2">
      <Card className="flex flex-col gap-4">
        <Eyebrow>RSS</Eyebrow>
        <p className="text-[15px] leading-relaxed text-zinc-300">
          Pegá esta dirección en tu lector (Feedly, NetNewsWire, Inoreader…) y cada número te llega solo.
        </p>
        <CopyField className="mt-auto" label="la dirección del feed" value={FEED_URL} />
      </Card>
      <Card className="flex flex-col gap-4">
        <Eyebrow>Slack</Eyebrow>
        <p className="text-[15px] leading-relaxed text-zinc-300">
          Cada número también se comparte en{" "}
          <span className="font-medium text-zinc-100">#{SLACK_CHANNELS.semanario}</span>. Ahí podés comentarlo o
          proponer lo que falta.
        </p>
        <ButtonLink
          arrow
          className="mt-auto self-start"
          href={SOCIAL_LINKS.slack}
          size="sm"
          utm="semanario"
          variant="secondary"
        >
          Entrar al Slack
        </ButtonLink>
      </Card>
    </Cells>
  );
}

export default async function SemanarioPage() {
  "use cache";
  // Published issues re-render on publish; this is the fallback
  cacheLife("hours");

  const issues = await getIssues();
  const [latest, ...archive] = issues;

  return (
    <>
      <PageHeader
        actions={
          <>
            {latest ? (
              <ButtonLink arrow href={`/semanario/${latest.number}`} size="lg">
                Leer el último número
              </ButtonLink>
            ) : null}
            <ButtonLink href="/semanario/feed.xml" size="lg" variant="secondary">
              <Rss aria-hidden className="size-4" />
              RSS
            </ButtonLink>
          </>
        }
        description="Lo que pasó en el Slack y lo que se viene, en cinco minutos de lectura. Los hilos los elige la comunidad, Owy arma el borrador y una persona del staff lo revisa antes de publicarlo."
        eyebrow="Semanario OWU · cada lunes"
        title="La semana de la comunidad, en un solo lugar"
      />

      {latest ? (
        <Section eyebrow="Último número">
          <Reveal>
            <Link
              className={cardClassName(true, "group grid overflow-hidden p-0 md:grid-cols-[240px_1fr]")}
              href={`/semanario/${latest.number}`}
            >
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_90%_at_0%_0%,rgba(250,204,21,0.10),transparent_60%)]"
              />
              <div className="relative flex items-end border-b border-white/[0.07] p-6 md:border-r md:border-b-0 md:p-8">
                <span className="font-title text-7xl leading-none font-extrabold tracking-[-0.04em] text-yellow-400 tabular-nums sm:text-8xl">
                  #{latest.number}
                </span>
              </div>
              <div className="relative flex flex-col gap-4 p-6 md:p-8">
                <Eyebrow>Semana del {weekRange(latest.weekStart)}</Eyebrow>
                <h2 className={headingClassName.h2}>{latest.title}</h2>
                {latest.intro ? (
                  <p className="max-w-2xl leading-relaxed text-zinc-400">{excerpt(latest.intro)}</p>
                ) : null}
                <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
                  <p className="flex flex-wrap gap-x-2 text-[13px] text-zinc-500">
                    <span>{latest.counts.events} eventos</span>
                    <span aria-hidden>·</span>
                    <span>{latest.counts.threads} hilos</span>
                    <span aria-hidden>·</span>
                    <span>{latest.counts.jobs} búsquedas</span>
                  </p>
                  <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-zinc-200 transition-colors group-hover:text-yellow-400">
                    Leer el número
                    <ArrowRight aria-hidden className="size-4 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </div>
              </div>
            </Link>
          </Reveal>
        </Section>
      ) : (
        <Section>
          <Reveal>
            <div className="rounded-2xl border border-dashed border-white/15 p-8 text-center sm:p-14">
              <p className="text-xs font-semibold tracking-[0.14em] text-yellow-400 uppercase">Número #1</p>
              <h2 className={`${headingClassName.h2} mt-4`}>El primero sale un lunes de estos</h2>
              <p className="mx-auto mt-5 max-w-lg leading-relaxed text-zinc-400">
                Mientras tanto podés ir marcando hilos con{" "}
                <code className="font-terminal text-[13px] text-yellow-300">:{SEMANARIO_EMOJI}:</code> en el Slack, y
                suscribirte para no perdértelo.
              </p>
            </div>
          </Reveal>
        </Section>
      )}

      {archive.length > 0 ? (
        <Section eyebrow="Archivo" title="Números anteriores">
          <Cells className="gap-3">
            {archive.map((issue) => (
              <Link
                key={issue.number}
                className={cardClassName(true, "group flex items-center gap-5 p-5 sm:gap-7 sm:px-7")}
                href={`/semanario/${issue.number}`}
              >
                <span className="w-16 shrink-0 font-title text-3xl leading-none font-extrabold text-white/[0.12] tabular-nums transition-colors group-hover:text-yellow-400/60 sm:text-4xl">
                  #{issue.number}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-title text-[17px] font-semibold text-white">{issue.title}</span>
                  <span className="mt-1 block text-[13px] text-zinc-500">
                    Semana del {weekRange(issue.weekStart)}
                    {issue.publishedAt ? ` · publicado el ${longDate(issue.publishedAt)}` : ""}
                  </span>
                </span>
                <ArrowRight
                  aria-hidden
                  className="size-4 shrink-0 text-zinc-600 transition-[color,transform] group-hover:translate-x-0.5 group-hover:text-zinc-200"
                />
              </Link>
            ))}
          </Cells>
        </Section>
      ) : null}

      <Section
        description="Nadie lo escribe de cero: es la suma de lo que la comunidad comparte durante la semana."
        eyebrow="Cómo se arma"
        title="Lo elige la comunidad, lo revisa una persona"
      >
        <Cells className="md:grid-cols-3">
          {STEPS.map(({ title, body }, index) => (
            <Cell key={title} className="gap-6">
              <span className="font-title text-3xl leading-none font-extrabold text-white/[0.08]">0{index + 1}</span>
              <div>
                <h3 className={headingClassName.h3}>{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-400">{body}</p>
              </div>
            </Cell>
          ))}
        </Cells>
      </Section>

      <Section eyebrow="Recibilo" id="recibilo" title="Que te llegue solo">
        <Subscribe />
      </Section>

      <Footer />
    </>
  );
}
