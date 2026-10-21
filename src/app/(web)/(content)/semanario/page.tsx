import { ArrowRight, Rss } from "lucide-react";
import Link from "next/link";

import { SOCIAL_LINKS } from "app/lib/constants";
import CopyField from "components/community/CopyField";
import { ButtonLink, Cell, Cells, Eyebrow, PageHeader, Section } from "components/community/ui";
import Footer from "components/shared/Footer";
import { pageMetadata } from "lib/community/metadata";
import { SITE_URL, SLACK_CHANNELS } from "lib/community/site";

import { excerpt, getIssues, longDate, SEMANARIO_EMOJI, weekRange } from "./data";

// Published issues re-render on publish; this is the fallback
export const revalidate = 3600;

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
        <code className="rounded bg-white/[0.06] px-1.5 py-0.5 font-terminal text-[12px] text-yellow-300">
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
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="rounded-xl border border-line bg-ink-elev/60 p-6">
        <Eyebrow>RSS</Eyebrow>
        <p className="mt-2 text-[15px] leading-relaxed text-zinc-300">
          Pegá esta dirección en tu lector (Feedly, NetNewsWire, Inoreader…) y cada número te llega solo.
        </p>
        <CopyField className="mt-4" label="la dirección del feed" value={FEED_URL} />
      </div>
      <div className="flex flex-col justify-between gap-4 rounded-xl border border-line bg-ink-elev/60 p-6">
        <div>
          <Eyebrow>Slack</Eyebrow>
          <p className="mt-2 text-[15px] leading-relaxed text-zinc-300">
            Cada número también se comparte en{" "}
            <span className="font-terminal text-zinc-100">#{SLACK_CHANNELS.semanario}</span>. Ahí podés comentarlo o
            proponer lo que falta.
          </p>
        </div>
        <ButtonLink arrow className="self-start" href={SOCIAL_LINKS.slack} size="sm" utm="semanario" variant="secondary">
          Entrar al Slack
        </ButtonLink>
      </div>
    </div>
  );
}

export default async function SemanarioPage() {
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
        <Section bordered={false} eyebrow="Último número">
          <Link
            className="group relative grid overflow-hidden rounded-2xl border border-line bg-ink-elev/60 transition-colors hover:border-line-strong md:grid-cols-[220px_1fr]"
            href={`/semanario/${latest.number}`}
          >
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_90%_at_0%_0%,rgba(250,204,21,0.10),transparent_60%)]"
            />
            <div className="relative flex items-end border-b border-line p-6 md:border-r md:border-b-0 md:p-8">
              <span className="text-7xl leading-none font-semibold tracking-[-0.05em] text-yellow-400 tabular-nums sm:text-8xl">
                #{latest.number}
              </span>
            </div>
            <div className="relative flex flex-col gap-4 p-6 md:p-8">
              <p className="font-terminal text-[11px] tracking-[0.12em] text-zinc-500 uppercase">
                Semana del {weekRange(latest.weekStart)}
              </p>
              <h2 className="text-2xl leading-tight font-semibold tracking-[-0.03em] text-balance text-zinc-50 sm:text-3xl">
                {latest.title}
              </h2>
              {latest.intro ? <p className="max-w-2xl leading-relaxed text-zinc-400">{excerpt(latest.intro)}</p> : null}
              <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
                <p className="flex flex-wrap gap-x-3 gap-y-1 font-terminal text-[11px] tracking-[0.06em] text-zinc-500 uppercase">
                  <span>{latest.counts.events} eventos</span>
                  <span aria-hidden className="text-zinc-700">
                    /
                  </span>
                  <span>{latest.counts.threads} hilos</span>
                  <span aria-hidden className="text-zinc-700">
                    /
                  </span>
                  <span>{latest.counts.jobs} búsquedas</span>
                </p>
                <span className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-200 group-hover:text-yellow-400">
                  Leer el número
                  <ArrowRight aria-hidden className="size-4 transition-transform group-hover:translate-x-0.5" />
                </span>
              </div>
            </div>
          </Link>
        </Section>
      ) : (
        <Section bordered={false}>
          <div className="relative overflow-hidden rounded-2xl border border-dashed border-line-strong p-8 text-center sm:p-14">
            <p className="font-terminal text-[11px] tracking-[0.12em] text-yellow-400 uppercase">Número #1</p>
            <h2 className="mt-4 text-3xl font-semibold tracking-[-0.03em] text-zinc-50 sm:text-4xl">
              El primero sale un lunes de estos
            </h2>
            <p className="mx-auto mt-4 max-w-lg leading-relaxed text-zinc-400">
              Mientras tanto podés ir marcando hilos con{" "}
              <code className="font-terminal text-[13px] text-yellow-300">:{SEMANARIO_EMOJI}:</code> en el Slack, y
              suscribirte para no perdértelo.
            </p>
          </div>
        </Section>
      )}

      {archive.length > 0 ? (
        <Section eyebrow="Archivo" title="Números anteriores">
          <ol className="divide-y divide-line overflow-hidden rounded-xl border border-line">
            {archive.map((issue) => (
              <li key={issue.number}>
                <Link
                  className="group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-white/[0.025] sm:gap-6 sm:px-6"
                  href={`/semanario/${issue.number}`}
                >
                  <span className="w-12 shrink-0 font-terminal text-sm text-yellow-400 tabular-nums">#{issue.number}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-medium text-zinc-100 group-hover:text-zinc-50">
                      {issue.title}
                    </span>
                    <span className="mt-0.5 block font-terminal text-[11px] text-zinc-500">
                      Semana del {weekRange(issue.weekStart)}
                      {issue.publishedAt ? ` · publicado el ${longDate(issue.publishedAt)}` : ""}
                    </span>
                  </span>
                  <ArrowRight
                    aria-hidden
                    className="size-4 shrink-0 text-zinc-600 transition-transform group-hover:translate-x-0.5 group-hover:text-zinc-200"
                  />
                </Link>
              </li>
            ))}
          </ol>
        </Section>
      ) : null}

      <Section
        description="Nadie lo escribe de cero: es la suma de lo que la comunidad comparte durante la semana."
        eyebrow="Cómo se arma"
        title="Lo elige la comunidad, lo revisa una persona"
      >
        <Cells className="md:grid-cols-3">
          {STEPS.map(({ title, body }, index) => (
            <Cell key={title} className="flex flex-col gap-4">
              <span className="font-terminal text-[11px] tracking-[0.12em] text-zinc-600">0{index + 1}</span>
              <h3 className="text-lg font-semibold tracking-[-0.02em] text-zinc-50">{title}</h3>
              <p className="text-sm leading-relaxed text-zinc-400">{body}</p>
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
