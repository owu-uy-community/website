import { Briefcase, Building2, MapPin, Sparkles } from "lucide-react";

import { SOCIAL_LINKS } from "app/lib/constants";
import { ButtonLink, Cell, Cells, Eyebrow, Faq, PageHeader, Section, StatStrip } from "components/community/ui";
import Footer from "components/shared/Footer";
import { getCommunities, getLanding } from "lib/community/content";
import { getUpcomingEvents } from "lib/community/events";
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

const OFFERS = [
  {
    icon: Building2,
    title: "Alojá una meetup",
    body: "Prestá tu espacio una noche: un lugar con proyector, sillas y wifi. Muchas meetups de la comunidad se hacen en oficinas de empresas que abren sus puertas.",
    href: issueFormUrl("ofrecer-espacio"),
    cta: "Ofrecer tu espacio",
    primary: true,
  },
  {
    icon: Sparkles,
    title: "Patrociná OWU CONF",
    body: "La conferencia anual de la comunidad. Los paquetes y sus beneficios están en la página de sponsors.",
    href: `${CONF_URL}/sponsors`,
    cta: "Ver paquetes",
  },
  {
    icon: Briefcase,
    title: "Publicá búsquedas",
    body: `En el canal #${SLACK_CHANNELS.jobs} del Slack, siguiendo sus reglas. Es gratis.`,
    href: "#jobs",
    cta: "Ver las reglas",
  },
];

const JOB_RULES = [
  {
    title: "Rango salarial, siempre",
    body: "Mínimo y máximo, moneda y si es nominal o líquido. Sin rango no se publica.",
  },
  { title: "Modalidad", body: "Remoto, híbrido o presencial. Si es remoto, desde dónde se puede trabajar." },
  { title: "Ubicación y visa", body: "Dónde está el equipo y si patrocinan visa o reubicación." },
  {
    title: "Una búsqueda por mensaje",
    body: "Si cambia algo o se cubre el puesto, actualizalo en el hilo en vez de publicar de nuevo.",
  },
  {
    title: "Búsquedas concretas",
    body: "Nada de reclutadores sin un puesto real detrás ni “mandame tu CV por las dudas”.",
  },
];

/* Places that hosted community events, from the meetup feed and past editions */
const VENUES = ["Effectus Software", "Mimiquate", "Sinergia", "ISACA", "LATU", "Cubo Itaú"];

const formatCount = (value: number) => new Intl.NumberFormat("es-UY").format(value);

export default async function EmpresasPage() {
  const [landing, communities, events] = await Promise.all([getLanding(), getCommunities(), getUpcomingEvents()]);
  const stat = (title: string, subtitle: string) =>
    landing?.stats?.find((entry) => entry.title === title && entry.subtitle === subtitle)?.count ?? null;
  const people = stat("Personas", "conectadas");
  const daily = stat("Personas", "activas diariamente");

  const stats = [
    ...(people ? [{ value: `+${formatCount(people)}`, label: "Personas en el Slack" }] : []),
    ...(daily ? [{ value: `+${formatCount(daily)}`, label: "Activas por día" }] : []),
    { value: String(communities.length), label: "Comunidades" },
    { value: String(events.length), label: "Eventos en agenda" },
  ];

  return (
    <>
      <PageHeader
        actions={
          <>
            <ButtonLink arrow href={issueFormUrl("ofrecer-espacio")} utm="empresas-header">
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

      <Section bordered={false} eyebrow="La comunidad" title="A quién llegás">
        <StatStrip stats={stats} />
        <p className="mt-4 max-w-3xl font-terminal text-[11px] leading-relaxed text-zinc-600">
          Cómo medimos: las personas y la actividad diaria salen de las estadísticas del workspace de Slack de OWU y se
          cargan a mano en este sitio. Comunidades y eventos salen del directorio y de la agenda, que se actualizan
          solos.
        </p>
      </Section>

      <Section eyebrow="Cómo apoyar" title="Tres formas de sumarse">
        <Cells className="md:grid-cols-3">
          {OFFERS.map(({ icon: Icon, title, body, href, cta, primary }) => (
            <Cell key={title} className="group flex flex-col gap-5">
              <Icon aria-hidden className="size-5 text-zinc-500 transition-colors group-hover:text-yellow-400" />
              <div className="flex-1">
                <h3 className="text-lg font-semibold tracking-[-0.02em] text-zinc-50">{title}</h3>
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
        <div className="grid items-start gap-10 lg:grid-cols-[1.1fr_1fr]">
          <ol className="divide-y divide-line border-y border-line">
            {JOB_RULES.map(({ title, body }, index) => (
              <li key={title} className="flex gap-4 py-5">
                <span className="w-6 shrink-0 font-terminal text-[11px] leading-6 text-yellow-400">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div>
                  <p className="text-[15px] font-medium text-zinc-100">{title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-zinc-400">{body}</p>
                </div>
              </li>
            ))}
          </ol>

          <figure className="overflow-hidden rounded-xl border border-line bg-gradient-to-b from-white/[0.02] to-transparent lg:sticky lg:top-24">
            <figcaption className="flex items-center justify-between border-b border-line bg-white/[0.02] px-4 py-2.5">
              <span className="font-terminal text-[11px] text-zinc-500">#{SLACK_CHANNELS.jobs}</span>
              <span className="font-terminal text-[10px] tracking-[0.12em] text-zinc-600 uppercase">Plantilla</span>
            </figcaption>
            <div className="space-y-1.5 px-5 py-5 font-terminal text-[13px] leading-relaxed text-zinc-300 sm:px-6">
              <p className="text-zinc-50">
                <span className="text-zinc-500">[Empresa]</span> busca <span className="text-zinc-500">[Puesto]</span> (
                <span className="text-zinc-500">seniority</span>)
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
        </div>
      </Section>

      <Section
        description="Empresas e instituciones que ya recibieron eventos de la comunidad."
        eyebrow="Lugares"
        title="Ya prestaron su espacio"
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
      </Section>

      <Section eyebrow="Preguntas" title="Preguntas frecuentes">
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
                  grupo donde encaje: <a href={PAGES.darCharla.href}>te contamos cómo</a>.
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
        <div className="mt-14 flex flex-col gap-4 rounded-xl border border-dashed border-line-strong p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Eyebrow>¿Tu equipo quiere organizar algo más grande?</Eyebrow>
            <p className="mt-2 text-sm text-zinc-400">Un taller, una hackathon, una serie de charlas: lo charlamos.</p>
          </div>
          <ButtonLink arrow href={PAGES.organizar.href} size="sm" variant="secondary">
            Organizá con OWU
          </ButtonLink>
        </div>
      </Section>

      <Footer />
    </>
  );
}
