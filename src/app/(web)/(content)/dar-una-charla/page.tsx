import { ArrowRight, ArrowUpRight, MapPin } from "lucide-react";
import Link from "next/link";

import { SOCIAL_LINKS } from "app/lib/constants";
import {
  Badge,
  ButtonLink,
  Cell,
  Cells,
  CommunityLogo,
  Eyebrow,
  PageHeader,
  Section,
  SmartLink,
  Terminal,
} from "components/community/ui";
import Footer from "components/shared/Footer";
import { getCommunities } from "lib/community/content";
import { pageMetadata } from "lib/community/metadata";
import { CONF_URL, PAGES, SLACK_CHANNELS } from "lib/community/site";
import { TOPICS } from "lib/community/topics";

export const metadata = pageMetadata({
  title: "Dá una charla",
  description:
    "Cómo preparar tu primera charla, en qué comunidad encaja tu tema y cómo funciona la convocatoria de OWU CONF.",
  path: "/dar-una-charla",
});

const STEPS = [
  {
    title: "Elegí un tema",
    body: "Algo que aprendiste este año, un bug que te costó una semana, una herramienta que te ahorró horas. Lo que a vos te sirvió le sirve a alguien más.",
  },
  {
    title: "Elegí dónde",
    body: "Cada comunidad tiene su público. Más abajo tenés en qué grupo encaja cada tema.",
    href: "#donde",
    cta: "Ver dónde encaja",
  },
  {
    title: "Mandá tu propuesta",
    body: "Un título y tres líneas alcanzan. Escribile a quien organiza el grupo: por su página de eventos, su web o su canal en el Slack.",
  },
  {
    title: "Ensayá con alguien",
    body: `Pedí en #${SLACK_CHANNELS.general} que alguien te escuche una pasada. Practicar en voz alta una vez cambia todo.`,
    href: SOCIAL_LINKS.slack,
    cta: "Entrar al Slack",
  },
];

const TIPS = [
  "Entre 15 y 20 minutos alcanzan. Mejor corta y clara que larga y apurada.",
  "Contá una historia: el problema, qué probaste, qué funcionó y qué no.",
  "Una idea por slide, letra grande y el código justo.",
  "Si hacés una demo en vivo, tené un video o capturas de respaldo.",
  "Llegá temprano y probá el proyector, el audio y el adaptador.",
  "Dejá unos minutos para preguntas. “No sé, lo averiguo” es una respuesta válida.",
  "Después compartí las slides: sumalas al archivo de charlas.",
];

/* Places that hosted community events, from the meetup feed and past editions */
const VENUES = ["Effectus Software", "Mimiquate", "Sinergia", "ISACA", "LATU", "Cubo Itaú"];

export default async function DarUnaCharlaPage() {
  const communities = await getCommunities();

  const rows = TOPICS.map((topic) => ({
    ...topic,
    communities: communities.filter((community) => community.topics.includes(topic.value)),
  })).filter((row) => row.communities.length > 0);

  return (
    <>
      <PageHeader
        actions={
          <>
            <ButtonLink arrow href="#donde">
              Ver dónde encaja tu tema
            </ButtonLink>
            <ButtonLink href={SOCIAL_LINKS.slack} utm="dar-charla-header" variant="secondary">
              Preguntá en el Slack
            </ButtonLink>
          </>
        }
        description="Las meetups de la comunidad son el mejor lugar para una primera charla: el público es chico, conocido y viene con ganas de aprender con vos. Acá tenés cómo arrancar, dónde proponerla y cómo prepararla."
        eyebrow="Dá una charla"
        title="Si resolviste un problema, ya tenés una charla"
      />

      <Section bordered={false} eyebrow="Cómo empezar" title="Cuatro pasos, ninguno difícil">
        <Cells className="sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map(({ title, body, href, cta }, index) => (
            <Cell key={title} className="flex flex-col gap-5">
              <span className="font-terminal text-[11px] tracking-[0.12em] text-zinc-600">0{index + 1}</span>
              <div className="flex-1">
                <h3 className="text-lg font-semibold tracking-[-0.02em] text-zinc-50">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-400">{body}</p>
              </div>
              {href && cta ? (
                <ButtonLink
                  arrow
                  className="self-start px-0 hover:translate-y-0 hover:bg-transparent hover:text-yellow-400"
                  href={href}
                  size="sm"
                  utm="dar-charla-pasos"
                  variant="ghost"
                >
                  {cta}
                </ButtonLink>
              ) : null}
            </Cell>
          ))}
        </Cells>
      </Section>

      <Section
        description="Cada grupo arma su agenda. Elegí el que mejor encaja con tu tema y mirá su ficha para saber cómo proponer."
        eyebrow="Dónde"
        id="donde"
        title="¿Dónde encaja tu charla?"
      >
        <div className="overflow-hidden rounded-xl border border-line">
          <div className="hidden grid-cols-[220px_1fr] border-b border-line bg-white/[0.02] px-6 py-3 font-terminal text-[10.5px] tracking-[0.12em] text-zinc-500 uppercase md:grid">
            <span>Tema</span>
            <span>Comunidades</span>
          </div>
          <ul className="divide-y divide-line">
            {rows.map((row) => (
              <li key={row.value} className="grid gap-3 px-5 py-5 md:grid-cols-[220px_1fr] md:gap-6 md:px-6">
                <p className="text-[15px] font-medium text-zinc-100">{row.label}</p>
                <ul className="flex flex-wrap gap-2">
                  {row.communities.map((community) => (
                    <li key={community.slug}>
                      <Link
                        className="group inline-flex items-center gap-2 rounded-lg border border-line bg-white/[0.02] py-1 pr-3 pl-1 text-sm text-zinc-300 transition-colors hover:border-line-strong hover:text-zinc-50"
                        href={`/comunidades#${community.slug}`}
                      >
                        <CommunityLogo
                          className="size-7 rounded-md p-1"
                          logo={community.logo}
                          name={community.name}
                          size="sm"
                        />
                        {community.name}
                        <ArrowRight
                          aria-hidden
                          className="size-3.5 text-zinc-600 transition-transform group-hover:translate-x-0.5 group-hover:text-zinc-300"
                        />
                      </Link>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
            <li className="grid gap-3 bg-yellow-400/[0.03] px-5 py-5 md:grid-cols-[220px_1fr] md:gap-6 md:px-6">
              <p className="text-[15px] font-medium text-zinc-100">Cualquier tema</p>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm leading-relaxed text-zinc-400">
                  El open space de OWU CONF: proponés tu tema en el mercado de ideas y la grilla se arma ahí mismo.
                </p>
                <SmartLink
                  className="inline-flex shrink-0 items-center gap-1 text-sm text-zinc-200 hover:text-yellow-400"
                  href={CONF_URL}
                  utm="dar-charla-openspace"
                >
                  OWU CONF <ArrowUpRight aria-hidden className="size-3.5" />
                </SmartLink>
              </div>
            </li>
          </ul>
        </div>
        <p className="mt-4 font-terminal text-[11px] text-zinc-600">
          ¿Tu tema no tiene grupo? Proponelo igual en el Slack: muchas veces así nace una comunidad nueva.{" "}
          <Link className="text-zinc-400 underline underline-offset-4 hover:text-zinc-200" href={PAGES.organizar.href}>
            Organizá con OWU
          </Link>
        </p>
      </Section>

      <Section eyebrow="OWU CONF" id="conf" title="Hablar en la conferencia de la comunidad">
        <Cells className="md:grid-cols-2">
          <Cell className="flex flex-col gap-4">
            <Badge tone="accent" className="self-start">
              Programa
            </Badge>
            <h3 className="text-lg font-semibold tracking-[-0.02em] text-zinc-50">Charlas del programa</h3>
            <p className="text-sm leading-relaxed text-zinc-400">
              Se eligen por convocatoria abierta. Cuando abre, la anunciamos en conf.owu.uy y en el Slack. La de 2026 ya
              cerró.
            </p>
            <ButtonLink
              arrow
              className="mt-auto self-start"
              href={`${CONF_URL}/call-for-proposals`}
              size="sm"
              utm="dar-charla-cfp"
              variant="secondary"
            >
              Cómo es la convocatoria
            </ButtonLink>
          </Cell>
          <Cell className="flex flex-col gap-4">
            <Badge className="self-start">Open space</Badge>
            <h3 className="text-lg font-semibold tracking-[-0.02em] text-zinc-50">Sesiones del open space</h3>
            <p className="text-sm leading-relaxed text-zinc-400">
              No hay convocatoria: cualquier persona que vaya puede proponer un tema el mismo día. Es la forma más fácil
              de hablar en OWU CONF por primera vez.
            </p>
            <ButtonLink
              arrow
              className="mt-auto self-start"
              href={`${PAGES.charlas.href}#open-space`}
              size="sm"
              variant="secondary"
            >
              Temas que se propusieron
            </ButtonLink>
          </Cell>
        </Cells>
      </Section>

      <Section eyebrow="Preparala" title="Tips para tu primera charla">
        <div className="grid items-start gap-10 lg:grid-cols-[1fr_1.1fr]">
          <Terminal
            lines={[
              { kind: "cmd", text: "owu charla nueva" },
              { kind: "out", text: "✓ tema: lo que aprendí este año" },
              { kind: "out", text: "✓ duración: 20 minutos" },
              { kind: "out", text: "✓ ensayo: una pasada con alguien del Slack" },
              { kind: "out", text: "✓ slides: compartidas después" },
              { kind: "cursor" },
            ]}
            className="lg:sticky lg:top-24"
            title="~/primera-charla"
          />
          <ol className="divide-y divide-line border-y border-line">
            {TIPS.map((tip, index) => (
              <li key={tip} className="flex gap-4 py-4 text-[15px] leading-relaxed text-zinc-300">
                <span className="w-6 shrink-0 font-terminal text-[11px] leading-6 text-zinc-600">
                  {String(index + 1).padStart(2, "0")}
                </span>
                {tip}
              </li>
            ))}
          </ol>
        </div>
      </Section>

      <Section
        description={`Lugares que ya recibieron eventos de la comunidad. Si tu grupo necesita dónde hacer su próxima meetup, pedí contactos en #${SLACK_CHANNELS.organizers}.`}
        eyebrow="Lugares"
        title="Dónde se hacen las meetups"
      >
        <ul className="flex flex-wrap gap-2">
          {VENUES.map((venue) => (
            <li
              key={venue}
              className="inline-flex items-center gap-2 rounded-full border border-line bg-white/[0.02] px-4 py-2 text-sm text-zinc-300"
            >
              <MapPin aria-hidden className="size-3.5 text-zinc-500" />
              {venue}
            </li>
          ))}
        </ul>
        <div className="mt-12 flex flex-col gap-4 rounded-xl border border-dashed border-line-strong p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Eyebrow>¿Tu empresa tiene un espacio?</Eyebrow>
            <p className="mt-2 text-sm text-zinc-400">
              Prestarlo una noche es una de las formas más concretas de apoyar.
            </p>
          </div>
          <ButtonLink arrow href={PAGES.empresas.href} size="sm" variant="secondary">
            Para empresas
          </ButtonLink>
        </div>
      </Section>

      <Footer />
    </>
  );
}
