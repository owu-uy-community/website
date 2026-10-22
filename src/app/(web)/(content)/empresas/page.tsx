import { Briefcase, Building2, Sparkles } from "lucide-react";

import { SOCIAL_LINKS } from "app/lib/constants";
import { Reveal } from "components/community/reveal";
import {
  Badge,
  ButtonLink,
  cardClassName,
  Cell,
  Cells,
  Faq,
  Freshness,
  headingClassName,
  PageHeader,
  Section,
  StatStrip,
} from "components/community/ui";
import Footer from "components/shared/Footer";
import { getCommunities, getLanding } from "lib/community/content";
import { getUpcomingEvents } from "lib/community/events";
import { ORGANIZAR_ON } from "lib/community/flags";
import { pageMetadata } from "lib/community/metadata";
import { CONF_URL, issueFormUrl, PAGES, SLACK_CHANNELS } from "lib/community/site";

// Community and event counts come from the live agenda
export const revalidate = 3600;

export const metadata = pageMetadata({
  title: "Para empresas",
  description:
    "Cómo apoyar a la comunidad tech de Uruguay: prestá tu espacio para una meetup, patrociná OWU CONF o publicá búsquedas siguiendo las reglas de #jobs.",
  path: "/empresas",
});

/** Where "offer your space" goes: OWU's own form once Organizá is on, the GitHub issue form until then */
const OFFER_SPACE = ORGANIZAR_ON ? "/empresas/espacio" : issueFormUrl("ofrecer-espacio");

const OFFERS = [
  {
    icon: Building2,
    title: "Alojá una meetup",
    body: "Prestá tu espacio una noche: un lugar con proyector, sillas y wifi. Muchas meetups de la comunidad se hacen en oficinas de empresas que abren sus puertas.",
    href: OFFER_SPACE,
    cta: "Ofrecer tu espacio",
    primary: true,
  },
  {
    icon: Sparkles,
    title: "Patrociná OWU CONF",
    body: "La conferencia anual de la comunidad. En su web podés escribirnos para ser sponsor.",
    href: `${CONF_URL}/sponsors`,
    cta: "Ir a la web de la conf",
  },
  {
    icon: Briefcase,
    title: "Publicá búsquedas",
    body: `En el canal #${SLACK_CHANNELS.jobs} del Slack, siguiendo sus reglas. Es gratis.`,
    href: "#jobs",
    cta: "Ver las reglas",
  },
];

/* The channel's own rule is its topic: roles for people working remotely or in Uruguay, candidates in #for-hire */
const JOB_RULES = [
  {
    title: "Remoto o en Uruguay",
    body: "Es la regla del canal: puestos que se puedan hacer desde Uruguay, sean remotos, híbridos o presenciales.",
  },
  {
    title: "Rango salarial, si podés",
    body: "Mínimo y máximo, moneda y si es nominal o líquido. Ayuda a que te escriba la gente indicada.",
  },
  { title: "Modalidad y ubicación", body: "Dónde está el equipo y si patrocinan visa o reubicación." },
  {
    title: "Una búsqueda por mensaje",
    body: "Si cambia algo o se cubre el puesto, actualizalo en el hilo en vez de publicar de nuevo.",
  },
  {
    title: `Candidatos, a #${SLACK_CHANNELS.forHire}`,
    body: `Si buscás trabajo, compartí tu perfil o tu CV en #${SLACK_CHANNELS.forHire}, no en #${SLACK_CHANNELS.jobs}.`,
  },
];

/* Places that hosted community events, from the meetup feed and past editions */

const formatCount = (value: number) => new Intl.NumberFormat("es-UY").format(value);

export default async function EmpresasPage() {
  const [landing, communities, events] = await Promise.all([getLanding(), getCommunities(), getUpcomingEvents()]);
  const stat = (title: string, subtitle: string) =>
    landing?.stats?.find((entry) => entry.title === title && entry.subtitle === subtitle)?.count ?? null;
  const people = stat("Personas", "conectadas");
  const monthly = stat("Personas", "activas cada mes");

  const stats = [
    ...(people ? [{ value: `+${formatCount(people)}`, label: "Personas en el Slack" }] : []),
    ...(monthly ? [{ value: `+${formatCount(monthly)}`, label: "Activas cada mes" }] : []),
    { value: String(communities.length), label: "Comunidades" },
    { value: String(events.length), label: "Eventos en agenda" },
  ];

  return (
    <>
      <PageHeader
        actions={
          <>
            <ButtonLink arrow href={OFFER_SPACE} utm="empresas-header">
              Alojá una meetup
            </ButtonLink>
            <ButtonLink href={`${CONF_URL}/sponsors`} utm="empresas-header" variant="secondary">
              Patrociná OWU CONF
            </ButtonLink>
          </>
        }
        description="La comunidad tech de Uruguay se sostiene con gente que presta su tiempo y empresas que prestan su espacio. Estas son las formas de sumarse que la comunidad agradece."
        eyebrow="Para empresas"
        title="Apoyá a la comunidad que te ayudó a crecer"
      />

      <Section eyebrow="La comunidad" title="A quién llegás">
        <Reveal>
          <StatStrip stats={stats} />
          <Freshness className="mt-8 max-w-3xl leading-relaxed">
            Cómo medimos: las personas y la actividad diaria salen de las estadísticas del workspace de Slack de OWU y
            se cargan a mano en este sitio. Comunidades y eventos salen del directorio y de la agenda, que se actualizan
            solos.
          </Freshness>
        </Reveal>
      </Section>

      <Section eyebrow="Cómo apoyar" title="Tres formas de sumarse">
        <Cells className="md:grid-cols-3">
          {OFFERS.map(({ icon: Icon, title, body, href, cta, primary }) => (
            <Cell key={title} className="gap-6">
              <span className="flex size-11 items-center justify-center rounded-xl bg-yellow-400/10 text-yellow-400">
                <Icon aria-hidden className="size-5" />
              </span>
              <div className="flex-1">
                <h3 className={headingClassName.h3}>{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-400">{body}</p>
              </div>
              <ButtonLink
                arrow
                className="self-start"
                href={href}
                size="sm"
                utm="empresas-ofertas"
                variant={primary ? "primary" : "secondary"}
              >
                {cta}
              </ButtonLink>
            </Cell>
          ))}
        </Cells>
      </Section>

      <Section
        description="Para que el canal siga siendo útil para quien busca trabajo y para quien busca gente."
        eyebrow={`#${SLACK_CHANNELS.jobs}`}
        id="jobs"
        title={`Reglas para publicar en #${SLACK_CHANNELS.jobs}`}
      >
        <div className="grid items-start gap-6 lg:grid-cols-[1.1fr_1fr] lg:gap-10">
          <Reveal>
            <ol className={cardClassName(false, "divide-y divide-white/[0.07] overflow-hidden")}>
              {JOB_RULES.map(({ title, body }, index) => (
                <li key={title} className="flex gap-5 px-5 py-5 sm:px-7">
                  <span className="w-7 shrink-0 font-title text-sm leading-6 font-bold text-yellow-400 tabular-nums">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <p className="font-title text-[15px] font-semibold text-white">{title}</p>
                    <p className="mt-1 text-sm leading-relaxed text-zinc-400">{body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Reveal>

          <Reveal delay={0.1}>
            <figure className={cardClassName(false, "overflow-hidden lg:sticky lg:top-24")}>
              <figcaption className="flex items-center justify-between border-b border-white/[0.07] bg-white/[0.02] px-5 py-3">
                <span className="text-sm font-medium text-zinc-300">#{SLACK_CHANNELS.jobs}</span>
                <Badge>Plantilla</Badge>
              </figcaption>
              {/* Mono on purpose: it is a message to copy into Slack as is */}
              <div className="space-y-1.5 px-5 py-5 font-terminal text-[13px] leading-relaxed text-zinc-300 sm:px-6">
                <p className="text-zinc-50">
                  <span className="text-zinc-500">[Empresa]</span> busca <span className="text-zinc-500">[Puesto]</span>{" "}
                  (<span className="text-zinc-500">seniority</span>)
                </p>
                <p>
                  Rango: <span className="text-yellow-400">mín – máx</span> USD o UYU, nominal por mes
                </p>
                <p>Modalidad: remoto desde Uruguay / híbrido / presencial</p>
                <p>
                  Equipo en: <span className="text-zinc-500">[ciudad]</span> · Visa:{" "}
                  <span className="text-zinc-500">sí / no</span>
                </p>
                <p>Stack: lo principal, sin listas eternas</p>
                <p>Cómo postularse: link o a quién escribirle</p>
                <p className="pt-2 text-zinc-600">↳ actualizaciones en este hilo</p>
              </div>
            </figure>
          </Reveal>
        </div>
      </Section>

      <Section eyebrow="Preguntas" title="Preguntas frecuentes">
        <Reveal>
          <Faq
            items={[
              {
                question: "¿Cuánto cuesta alojar una meetup?",
                answer: "Nada. Ponés el espacio; si querés, algo para tomar o comer. La comunidad organiza el resto.",
              },
              {
                question: "¿Podemos dar una charla de nuestra empresa?",
                answer: (
                  <>
                    Sí, si es una charla técnica útil para la comunidad y no una presentación comercial. Proponela en el
                    comunidad donde encaje: <a href={PAGES.darCharla.href}>te contamos cómo</a>.
                  </>
                ),
              },
              {
                question: `¿Publicar en #${SLACK_CHANNELS.jobs} tiene costo?`,
                answer: "No. Solo pedimos que sigas las reglas de esta página.",
              },
              {
                question: "¿Cómo patrocinamos OWU CONF?",
                answer: (
                  <>
                    Los paquetes están en <a href={`${CONF_URL}/sponsors`}>conf.owu.uy/sponsors</a>.
                  </>
                ),
              },
              {
                question: "¿Podemos escribirle a toda la comunidad?",
                answer: (
                  <>
                    No compartimos datos de las personas de la comunidad. Las formas de llegar son las de esta página.
                    Para cualquier otra cosa, escribinos en el <a href={SOCIAL_LINKS.slack}>Slack</a>.
                  </>
                ),
              },
            ]}
            name="empresas-faq"
          />
          <div className="mt-14 flex flex-col gap-5 rounded-2xl border border-dashed border-white/15 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-7">
            <div>
              <h3 className="font-title text-[17px] font-semibold text-white">
                ¿Tu equipo quiere organizar algo más grande?
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">
                Un taller, una hackathon, una serie de charlas: lo charlamos.
              </p>
            </div>
            <ButtonLink arrow href={PAGES.organizar.href} size="sm" variant="secondary">
              Organizá con OWU
            </ButtonLink>
          </div>
        </Reveal>
      </Section>

      <Footer />
    </>
  );
}
