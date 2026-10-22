import { ArrowRight, ArrowUpRight, Compass, LayoutGrid, Lightbulb, MessagesSquare, Mic, Send } from "lucide-react";
import Link from "next/link";

import { SOCIAL_LINKS } from "app/lib/constants";
import { Reveal } from "components/community/motion";
import {
  ButtonLink,
  cardClassName,
  Cell,
  Cells,
  CommunityLogo,
  headingClassName,
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
    icon: Lightbulb,
    title: "Elegí un tema",
    body: "Algo que aprendiste este año, un bug que te costó una semana, una herramienta que te ahorró horas. Lo que a vos te sirvió le sirve a alguien más.",
  },
  {
    icon: Compass,
    title: "Elegí dónde",
    body: "Cada comunidad tiene su público. Más abajo tenés en qué comunidad encaja cada tema.",
    href: "#donde",
    cta: "Ver dónde encaja",
  },
  {
    icon: Send,
    title: "Mandá tu propuesta",
    body: "Un título y tres líneas alcanzan. Escribile a quien organiza la comunidad: por su página de eventos, su web o su canal en el Slack.",
  },
  {
    icon: MessagesSquare,
    title: "Ensayá con alguien",
    body: `Pedí en #${SLACK_CHANNELS.ayuda} o en el canal de tu tema que alguien te escuche una pasada. Practicar en voz alta una vez cambia todo.`,
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
  `Después compartí las slides y el video en #${SLACK_CHANNELS.anuncios}, y sumalos al archivo de charlas.`,
];

/* Places that hosted community events, from the meetup feed and past editions */

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

      <Section eyebrow="Cómo empezar" title="Cuatro pasos, ninguno difícil">
        <Cells className="sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map(({ icon: Icon, title, body, href, cta }, index) => (
            <Cell key={title} className="group gap-7">
              <div className="flex items-start justify-between">
                <span className="flex size-11 items-center justify-center rounded-xl bg-yellow-400/10 text-yellow-400">
                  <Icon aria-hidden className="size-5" />
                </span>
                <span className="font-title text-3xl leading-none font-extrabold text-white/[0.08]">0{index + 1}</span>
              </div>
              <div className="flex-1">
                <h3 className={headingClassName.h3}>{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-400">{body}</p>
              </div>
              {href && cta ? (
                <SmartLink
                  className="group/link inline-flex items-center gap-1.5 text-sm font-semibold text-zinc-200 transition-colors hover:text-yellow-400"
                  href={href}
                  utm="dar-charla-pasos"
                >
                  {cta}
                  <ArrowRight aria-hidden className="size-4 transition-transform group-hover/link:translate-x-0.5" />
                </SmartLink>
              ) : null}
            </Cell>
          ))}
        </Cells>
      </Section>

      <Section
        description="Cada comunidad arma su agenda. Elegí la que mejor encaja con tu tema y mirá su ficha para saber cómo proponer."
        eyebrow="Dónde"
        id="donde"
        title="¿Dónde encaja tu charla?"
      >
        <Reveal>
          <div className={cardClassName(false, "divide-y divide-white/[0.07] overflow-hidden")}>
            {rows.map((row) => (
              <div key={row.value} className="grid gap-3 px-5 py-5 md:grid-cols-[220px_1fr] md:gap-6 md:px-7">
                <p className="font-title text-[15px] font-semibold text-white">{row.label}</p>
                <ul className="flex flex-wrap gap-2">
                  {row.communities.map((community) => (
                    <li key={community.slug}>
                      <Link
                        className="group inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] py-1 pr-3.5 pl-1 text-sm text-zinc-300 transition-colors hover:bg-white/[0.08] hover:text-white"
                        href={`/comunidades#${community.slug}`}
                      >
                        <CommunityLogo
                          className="size-7 rounded-full p-1"
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
              </div>
            ))}
            <div className="grid gap-3 bg-yellow-400/[0.04] px-5 py-5 md:grid-cols-[220px_1fr] md:gap-6 md:px-7">
              <p className="font-title text-[15px] font-semibold text-white">Cualquier tema</p>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm leading-relaxed text-zinc-400">
                  El open space de OWU CONF: proponés tu tema en el mercado de ideas y la grilla se arma ahí mismo.
                </p>
                <SmartLink
                  className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-zinc-200 transition-colors hover:text-yellow-400"
                  href={CONF_URL}
                  utm="dar-charla-openspace"
                >
                  OWU CONF <ArrowUpRight aria-hidden className="size-3.5" />
                </SmartLink>
              </div>
            </div>
          </div>
        </Reveal>
        <p className="mt-5 text-sm text-zinc-500">
          ¿Tu tema no tiene comunidad? Proponelo igual en el Slack: muchas veces así nace una nueva.{" "}
          <Link
            className="text-zinc-300 underline decoration-white/20 underline-offset-4 transition-colors hover:text-white hover:decoration-yellow-400"
            href={PAGES.organizar.href}
          >
            Organizá con OWU
          </Link>
        </p>
      </Section>

      <Section eyebrow="OWU CONF" id="conf" title="Hablar en la conferencia de la comunidad">
        <Cells className="md:grid-cols-2">
          <Cell className="gap-5">
            <span className="flex size-11 items-center justify-center rounded-xl bg-yellow-400/10 text-yellow-400">
              <Mic aria-hidden className="size-5" />
            </span>
            <div className="flex-1">
              <h3 className={headingClassName.h3}>Charlas del programa</h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                Se eligen por convocatoria abierta. Cuando abre, la anunciamos en conf.owu.uy y en el Slack. La de 2026
                ya cerró.
              </p>
            </div>
            <ButtonLink
              arrow
              className="self-start"
              href={`${CONF_URL}/call-for-proposals`}
              size="sm"
              utm="dar-charla-cfp"
              variant="secondary"
            >
              Cómo es la convocatoria
            </ButtonLink>
          </Cell>
          <Cell className="gap-5">
            <span className="flex size-11 items-center justify-center rounded-xl bg-yellow-400/10 text-yellow-400">
              <LayoutGrid aria-hidden className="size-5" />
            </span>
            <div className="flex-1">
              <h3 className={headingClassName.h3}>Sesiones del open space</h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                No hay convocatoria: cualquier persona que vaya puede proponer un tema el mismo día. Es la forma más
                fácil de hablar en OWU CONF por primera vez.
              </p>
            </div>
            <ButtonLink
              arrow
              className="self-start"
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
          <Reveal>
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
          </Reveal>
          <Reveal delay={0.1}>
            <ol className="divide-y divide-white/[0.07]">
              {TIPS.map((tip, index) => (
                <li key={tip} className="flex gap-5 py-4 text-[15px] leading-relaxed text-zinc-300">
                  <span className="w-7 shrink-0 font-title text-sm leading-6 font-bold text-yellow-400 tabular-nums">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  {tip}
                </li>
              ))}
            </ol>
          </Reveal>
        </div>
      </Section>

      <Section
        description={`Si tu comunidad necesita dónde hacer su próxima meetup, pedí contactos en #${SLACK_CHANNELS.organizers}.`}
        eyebrow="Lugares"
        title="Un lugar para tu meetup"
      >
        <Reveal>
          <div className="flex flex-col gap-5 rounded-2xl border border-dashed border-white/15 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-7">
            <div>
              <h3 className="font-title text-[17px] font-semibold text-white">¿Tu empresa tiene un espacio?</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">
                Prestarlo una noche es una de las formas más concretas de apoyar.
              </p>
            </div>
            <ButtonLink arrow href={PAGES.empresas.href} size="sm" variant="secondary">
              Para empresas
            </ButtonLink>
          </div>
        </Reveal>
      </Section>

      <Footer />
    </>
  );
}
