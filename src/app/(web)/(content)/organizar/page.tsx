import { Building2, CalendarDays, LayoutGrid, Megaphone, MessagesSquare, ShieldCheck } from "lucide-react";
import Link from "next/link";

import { SOCIAL_LINKS } from "app/lib/constants";
import {
  Badge,
  ButtonLink,
  Cell,
  Cells,
  CommunityLogo,
  Eyebrow,
  Faq,
  PageHeader,
  Section,
  SmartLink,
} from "components/community/ui";
import Footer from "components/shared/Footer";
import { getCommunities, getLanding } from "lib/community/content";
import { pageMetadata } from "lib/community/metadata";
import { CONF_URL, issueFormUrl, PAGES, SLACK_CHANNELS } from "lib/community/site";

export const metadata = pageMetadata({
  title: "Organizá con OWU",
  description:
    "Qué le da OWU a un grupo que organiza meetups, qué le pide, cómo sumarse al directorio y el programa de comunidades aliadas de OWU CONF.",
  path: "/organizar",
});

const GIVES = [
  {
    icon: MessagesSquare,
    title: "Un canal en el Slack",
    body: "Tu propio canal dentro del Slack de la comunidad, donde ya está la gente que querés convocar.",
  },
  {
    icon: CalendarDays,
    title: "Lugar en la agenda",
    body: "Tus eventos en /eventos, en el inicio y en el calendario al que la gente se suscribe.",
    href: PAGES.eventos.href,
  },
  {
    icon: ShieldCheck,
    title: "Código de conducta listo",
    body: "Uno para todo OWU, con a quién reportar y qué pasa después. No tenés que escribir el tuyo.",
    href: PAGES.codigo.href,
  },
  {
    icon: Building2,
    title: "Contactos de lugares",
    body: "Empresas que ya prestaron su espacio para meetups, para que no arranques de cero.",
  },
  {
    icon: LayoutGrid,
    title: "La herramienta de open space",
    body: "La misma que usa OWU CONF: grilla en vivo, salas, pantallas y carga de propuestas desde el celular.",
  },
  {
    icon: Megaphone,
    title: "Difusión",
    body: "Tus eventos en el Semanario de los lunes y en las redes de OWU.",
    href: PAGES.semanario.href,
  },
];

const ASKS = [
  {
    title: "Aplicá el código de conducta",
    body: "En tus eventos y en tu canal, con el mismo criterio que el resto de OWU.",
  },
  {
    title: "Mantené tu ficha al día",
    body: "Si pasan seis meses sin eventos, marcamos el grupo como “en pausa” hasta que vuelva a arrancar.",
  },
  {
    title: "Avisá si dejás de organizar",
    body: "Así buscamos entre todos quién siga, en vez de que el grupo se apague sin que nadie se entere.",
  },
];

const JOIN = [
  {
    title: "Completá el formulario",
    body: "Nombre, logo, de qué se trata, dónde se juntan y quién organiza. Es un formulario de GitHub, sin código.",
  },
  { title: "Lo revisamos", body: "Alguien del staff sube tu ficha al directorio y te avisa." },
  { title: "Arrancá", body: "Te creamos el canal y tus eventos empiezan a aparecer en la agenda." },
];

export default async function OrganizarPage() {
  const [communities, landing] = await Promise.all([getCommunities(), getLanding()]);
  const partners = communities.filter((community) => community.confPartner);
  const people = landing?.stats?.find((stat) => stat.title === "Personas" && stat.subtitle === "conectadas")?.count;

  return (
    <>
      <PageHeader
        actions={
          <>
            <ButtonLink arrow href={issueFormUrl("sumar-comunidad")} utm="organizar-header">
              Sumá tu comunidad
            </ButtonLink>
            <ButtonLink href={SOCIAL_LINKS.slack} utm="organizar-header" variant="secondary">
              Escribinos en el Slack
            </ButtonLink>
          </>
        }
        description={`¿Tenés un grupo o querés arrancar uno? OWU no te cobra ni te pide que cambies nada: tu grupo sigue siendo tuyo. Te damos canal, agenda y una comunidad${people ? ` de más de ${new Intl.NumberFormat("es-UY").format(people)} personas` : ""} para que tus meetups se llenen.`}
        eyebrow="Organizá"
        title="Organizá con OWU"
      />

      <Section bordered={false} eyebrow="Lo que te da OWU" title="Todo lo que no es organizar la charla">
        <Cells className="sm:grid-cols-2 lg:grid-cols-3">
          {GIVES.map(({ icon: Icon, title, body, href }) => (
            <Cell key={title} className="group flex flex-col gap-4">
              <Icon aria-hidden className="size-5 text-zinc-500 transition-colors group-hover:text-yellow-400" />
              <div>
                <h3 className="text-lg font-semibold tracking-[-0.02em] text-zinc-50">
                  {href ? (
                    <Link className="after:absolute after:inset-0 after:content-[''] hover:text-yellow-400" href={href}>
                      {title}
                    </Link>
                  ) : (
                    title
                  )}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-400">{body}</p>
              </div>
            </Cell>
          ))}
        </Cells>
      </Section>

      <Section eyebrow="Lo que te pedimos" title="Tres cosas, nada más">
        <ol className="grid gap-px overflow-hidden rounded-xl border border-line bg-line md:grid-cols-3">
          {ASKS.map(({ title, body }, index) => (
            <li key={title} className="flex flex-col gap-3 bg-ink p-6 sm:p-8">
              <span className="font-terminal text-[11px] tracking-[0.12em] text-yellow-400">0{index + 1}</span>
              <h3 className="text-lg font-semibold tracking-[-0.02em] text-zinc-50">{title}</h3>
              <p className="text-sm leading-relaxed text-zinc-400">{body}</p>
            </li>
          ))}
        </ol>
      </Section>

      <Section
        actions={
          <ButtonLink arrow href={issueFormUrl("sumar-comunidad")} size="sm" utm="organizar-sumar">
            Abrir el formulario
          </ButtonLink>
        }
        description={`¿No usás GitHub? Escribinos en #${SLACK_CHANNELS.organizers} y lo cargamos por vos.`}
        eyebrow="Sumá tu grupo"
        id="sumar"
        title="Cómo entrar al directorio"
      >
        <ol className="relative grid gap-8 md:grid-cols-3 md:gap-6">
          {JOIN.map(({ title, body }, index) => (
            <li key={title} className="relative flex gap-4 md:flex-col">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-line-strong bg-ink font-terminal text-xs text-zinc-300">
                {index + 1}
              </span>
              <div>
                <h3 className="text-base font-semibold text-zinc-100">{title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">{body}</p>
              </div>
            </li>
          ))}
        </ol>
      </Section>

      <Section
        description="Un programa para que las comunidades y la conferencia se potencien: ustedes llevan a su gente a OWU CONF y la conferencia les da lugar a ustedes."
        eyebrow="OWU CONF"
        id="aliadas"
        title="Comunidades aliadas de OWU CONF"
      >
        <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
          <Cells>
            <Cell className="flex flex-col gap-4">
              <Badge tone="accent" className="self-start">
                Qué reciben
              </Badge>
              <ul className="flex list-disc flex-col gap-3 pl-5 text-[15px] leading-relaxed text-zinc-300 marker:text-yellow-400/70">
                <li>Su logo en conf.owu.uy y el sello “Aliada OWU CONF” en el directorio.</li>
                <li>Un espacio breve en la conferencia para presentar la comunidad.</li>
                <li>Mención en la comunicación de la conferencia.</li>
              </ul>
            </Cell>
            <Cell className="flex flex-col gap-4">
              <Badge className="self-start">Qué hacen</Badge>
              <ul className="flex list-disc flex-col gap-3 pl-5 text-[15px] leading-relaxed text-zinc-300 marker:text-yellow-400/70">
                <li>Difunden la conferencia en sus canales: Meetup, redes y su canal del Slack.</li>
                <li>Invitan a su gente a proponer sesiones en el open space.</li>
              </ul>
            </Cell>
          </Cells>

          <div className="flex flex-col rounded-xl border border-line bg-ink-elev/60 p-6 sm:p-8">
            <Eyebrow>Aliadas de la próxima edición</Eyebrow>
            {partners.length > 0 ? (
              <ul className="mt-6 grid gap-3 sm:grid-cols-2">
                {partners.map((community) => (
                  <li key={community.slug}>
                    <Link
                      className="flex items-center gap-3 rounded-lg border border-line p-3 transition-colors hover:border-line-strong hover:bg-white/[0.03]"
                      href={`/comunidades#${community.slug}`}
                    >
                      <CommunityLogo logo={community.logo} name={community.name} size="sm" />
                      <span className="text-sm text-zinc-200">{community.name}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="mt-6 flex flex-1 flex-col items-start justify-center gap-4 rounded-lg border border-dashed border-line-strong p-6">
                <p className="text-lg font-semibold tracking-[-0.02em] text-zinc-100">Todavía no hay aliadas.</p>
                <p className="text-sm leading-relaxed text-zinc-400">
                  ¿Tu comunidad quiere ser la primera? Escribinos en #{SLACK_CHANNELS.organizers} y lo charlamos.
                </p>
                <ButtonLink arrow href={SOCIAL_LINKS.slack} size="sm" utm="organizar-aliadas" variant="secondary">
                  Ir al Slack
                </ButtonLink>
              </div>
            )}
            <p className="mt-6 font-terminal text-[11px] text-zinc-600">
              Inspirado en el programa de comunidades de{" "}
              <SmartLink
                className="underline underline-offset-4 hover:text-zinc-300"
                href="https://nerdearla.com/communities/"
                utm="organizar-aliadas"
              >
                Nerdearla
              </SmartLink>
              . Más sobre la conferencia en{" "}
              <SmartLink
                className="underline underline-offset-4 hover:text-zinc-300"
                href={CONF_URL}
                utm="organizar-aliadas"
              >
                conf.owu.uy
              </SmartLink>
              .
            </p>
          </div>
        </div>
      </Section>

      <Section eyebrow="Preguntas" title="Preguntas frecuentes">
        <Faq
          items={[
            {
              question: "¿Sumarse cuesta algo?",
              answer: "No. Ni para el grupo ni para la gente que va a sus eventos.",
            },
            {
              question: "¿Tengo que cambiar el nombre o la marca de mi grupo?",
              answer: "No. Tu grupo sigue siendo tuyo, con su nombre, su página y su forma de organizarse.",
            },
            {
              question: "¿Y si mi grupo es chico o recién arranca?",
              answer:
                "Mejor: es cuando más sirve tener un canal y un lugar en la agenda. Un grupo puede arrancar con una meetup chica.",
            },
            {
              question: "¿Puedo usar la herramienta de open space en mi evento?",
              answer: (
                <>
                  Sí. Cada comunidad puede tener su espacio en el panel de OWU. Pedilo en #{SLACK_CHANNELS.organizers}.
                </>
              ),
            },
            {
              question: "¿Qué pasa si mi grupo deja de hacer eventos?",
              answer:
                "Después de seis meses sin eventos lo marcamos como “en pausa” en el directorio. Si vuelve a arrancar, se saca la marca.",
            },
          ]}
          name="organizar-faq"
        />
      </Section>

      <Footer />
    </>
  );
}
