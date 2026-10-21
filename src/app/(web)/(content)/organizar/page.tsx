import {
  Building2,
  CalendarCheck,
  CalendarDays,
  HeartHandshake,
  LayoutGrid,
  Megaphone,
  MessagesSquare,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";

import { SOCIAL_LINKS } from "app/lib/constants";
import { Reveal } from "components/community/motion";
import {
  ButtonLink,
  Card,
  cardClassName,
  Cell,
  Cells,
  CommunityLogo,
  Eyebrow,
  Faq,
  headingClassName,
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
    icon: ShieldCheck,
    title: "Aplicá el código de conducta",
    body: "En tus eventos y en tu canal, con el mismo criterio que el resto de OWU.",
  },
  {
    icon: CalendarCheck,
    title: "Mantené tu ficha al día",
    body: "Si pasan seis meses sin eventos, marcamos el grupo como “en pausa” hasta que vuelva a arrancar.",
  },
  {
    icon: HeartHandshake,
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

      <Section eyebrow="Lo que te da OWU" title="Todo lo que no es organizar la charla">
        <Cells className="sm:grid-cols-2 lg:grid-cols-3">
          {GIVES.map(({ icon: Icon, title, body, href }) => (
            <div key={title} className={cardClassName(Boolean(href), "group flex flex-col gap-5 p-6 sm:p-7")}>
              <span className="flex size-11 items-center justify-center rounded-xl bg-yellow-400/10 text-yellow-400">
                <Icon aria-hidden className="size-5" />
              </span>
              <div>
                <h3 className={headingClassName.h3}>
                  {href ? (
                    <Link
                      className="after:absolute after:inset-0 after:content-[''] group-hover:text-yellow-400"
                      href={href}
                    >
                      {title}
                    </Link>
                  ) : (
                    title
                  )}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-400">{body}</p>
              </div>
            </div>
          ))}
        </Cells>
      </Section>

      <Section eyebrow="Lo que te pedimos" title="Tres cosas, nada más">
        <Cells className="md:grid-cols-3">
          {ASKS.map(({ icon: Icon, title, body }, index) => (
            <Cell key={title} className="gap-7">
              <div className="flex items-start justify-between">
                <span className="flex size-11 items-center justify-center rounded-xl bg-yellow-400/10 text-yellow-400">
                  <Icon aria-hidden className="size-5" />
                </span>
                <span className="font-title text-3xl leading-none font-extrabold text-white/[0.08]">0{index + 1}</span>
              </div>
              <div>
                <h3 className={headingClassName.h3}>{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-400">{body}</p>
              </div>
            </Cell>
          ))}
        </Cells>
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
        <Reveal>
          <ol className="grid gap-8 md:grid-cols-3 md:gap-6">
            {JOIN.map(({ title, body }, index) => (
              <li key={title} className="flex gap-4 md:flex-col md:gap-5">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white/[0.06] font-title text-sm font-bold text-white">
                  {index + 1}
                </span>
                <div>
                  <h3 className="font-title text-base font-semibold text-white">{title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">{body}</p>
                </div>
              </li>
            ))}
          </ol>
        </Reveal>
      </Section>

      <Section
        description="Un programa para que las comunidades y la conferencia se potencien: ustedes llevan a su gente a OWU CONF y la conferencia les da lugar a ustedes."
        eyebrow="OWU CONF"
        id="aliadas"
        title="Comunidades aliadas de OWU CONF"
      >
        <div className="grid gap-6 lg:grid-cols-2">
          <Cells>
            <Cell className="gap-4">
              <h3 className={headingClassName.h3}>Qué reciben</h3>
              <ul className="flex list-disc flex-col gap-3 pl-5 text-[15px] leading-relaxed text-zinc-300 marker:text-zinc-500">
                <li>Su logo en conf.owu.uy y el sello “Aliada OWU CONF” en el directorio.</li>
                <li>Un espacio breve en la conferencia para presentar la comunidad.</li>
                <li>Mención en la comunicación de la conferencia.</li>
              </ul>
            </Cell>
            <Cell className="gap-4">
              <h3 className={headingClassName.h3}>Qué hacen</h3>
              <ul className="flex list-disc flex-col gap-3 pl-5 text-[15px] leading-relaxed text-zinc-300 marker:text-zinc-500">
                <li>Difunden la conferencia en sus canales: Meetup, redes y su canal del Slack.</li>
                <li>Invitan a su gente a proponer sesiones en el open space.</li>
              </ul>
            </Cell>
          </Cells>

          <Reveal className="flex" delay={0.1}>
            <Card className="flex w-full flex-col">
              <Eyebrow>Aliadas de la próxima edición</Eyebrow>
              {partners.length > 0 ? (
                <ul className="mt-6 grid gap-3 sm:grid-cols-2">
                  {partners.map((community) => (
                    <li key={community.slug}>
                      <Link
                        className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 transition-colors hover:bg-white/[0.07]"
                        href={`/comunidades#${community.slug}`}
                      >
                        <CommunityLogo logo={community.logo} name={community.name} size="sm" />
                        <span className="text-sm text-zinc-200">{community.name}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="mt-6 flex flex-1 flex-col items-start justify-center gap-4 rounded-2xl border border-dashed border-white/15 p-6">
                  <p className="font-title text-[17px] font-semibold text-white">Todavía no hay aliadas.</p>
                  <p className="text-sm leading-relaxed text-zinc-400">
                    ¿Tu comunidad quiere ser la primera? Escribinos en #{SLACK_CHANNELS.organizers} y lo charlamos.
                  </p>
                  <ButtonLink arrow href={SOCIAL_LINKS.slack} size="sm" utm="organizar-aliadas" variant="secondary">
                    Ir al Slack
                  </ButtonLink>
                </div>
              )}
              <p className="mt-6 text-xs leading-relaxed text-zinc-500">
                Inspirado en el programa de comunidades de{" "}
                <SmartLink
                  className="underline underline-offset-4 transition-colors hover:text-zinc-300"
                  href="https://nerdearla.com/communities/"
                  utm="organizar-aliadas"
                >
                  Nerdearla
                </SmartLink>
                . Más sobre la conferencia en{" "}
                <SmartLink
                  className="underline underline-offset-4 transition-colors hover:text-zinc-300"
                  href={CONF_URL}
                  utm="organizar-aliadas"
                >
                  conf.owu.uy
                </SmartLink>
                .
              </p>
            </Card>
          </Reveal>
        </div>
      </Section>

      <Section eyebrow="Preguntas" title="Preguntas frecuentes">
        <Reveal>
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
        </Reveal>
      </Section>

      <Footer />
    </>
  );
}
