import { cacheLife } from "next/cache";
import {
  Building2,
  CalendarCheck,
  CalendarDays,
  ClipboardCheck,
  Flag,
  HeartHandshake,
  LayoutGrid,
  Megaphone,
  MessagesSquare,
  QrCode,
  ShieldCheck,
  Ticket,
} from "lucide-react";
import Link from "next/link";

import { SOCIAL_LINKS } from "app/lib/constants";
import { Reveal } from "components/community/reveal";
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
} from "components/community/ui";
import Footer from "components/shared/Footer";
import { getCommunities, getLanding } from "lib/community/content";
import { ORGANIZAR_ON, RESOURCES_ON } from "lib/community/flags";
import { pageMetadata } from "lib/community/metadata";
import { issueFormUrl, PAGES, SLACK_CHANNELS } from "lib/community/site";
import { HOLD_DAYS } from "lib/organizar/rules";

export const metadata = pageMetadata({
  title: "Organizá con OWU",
  description:
    "Qué le da OWU a una comunidad que organiza meetups: un panel para armar cada evento, de la fecha a la puerta, el calendario compartido, espacios que reciben meetups y difusión. Qué le pide, cómo sumarse y el programa de comunidades aliadas de OWU CONF.",
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
    body: "Tus eventos en /eventos, en el inicio, en el calendario al que la gente se suscribe y cada lunes en #anuncios.",
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
    title: "Espacios que reciben meetups",
    body: ORGANIZAR_ON
      ? "Las empresas que prestan su espacio, con capacidad y lo que tienen. Les pedís lugar desde el panel y te contestan por mail."
      : `Las empresas que reciben meetups, para que no arranques de cero: preguntá en #${SLACK_CHANNELS.organizers}.`,
  },
  {
    icon: LayoutGrid,
    title: "La herramienta de open space",
    body: "La misma que usa OWU CONF: grilla en vivo, salas, pantallas y carga de propuestas desde el celular.",
  },
  {
    icon: Megaphone,
    title: "Difusión",
    body: RESOURCES_ON
      ? "Tus eventos en el Semanario de los lunes y en las redes de OWU."
      : "Tus eventos en la agenda de OWU y en sus redes.",
    href: RESOURCES_ON ? PAGES.semanario.href : PAGES.eventos.href,
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
    body: "Si pasan seis meses sin eventos, marcamos la comunidad como “en pausa” hasta que vuelva a arrancar.",
  },
  {
    icon: HeartHandshake,
    title: "Avisá si dejás de organizar",
    body: "Así buscamos entre todos quién siga, en vez de que la comunidad se apague sin que nadie se entere.",
  },
];

/** What the organizer panel does today, in the order a meetup needs it. Only what's built. */
const PANEL = [
  {
    icon: Flag,
    title: "Reclamá o proponé tu comunidad",
    body: "Buscala entre las comunidades de OWU y pedí organizarla. ¿No está? Proponela desde el mismo lugar. El staff confirma y te avisa por mail.",
  },
  {
    icon: CalendarDays,
    title: "Reservá la fecha",
    body: `El calendario muestra los eventos y las reservas de todas las comunidades, los feriados y lo que anuncian en Meetup, y te sugiere días que no chocan. Una reserva dura ${HOLD_DAYS} días y todas la ven. Para un evento con otras comunidades, votan la fecha juntas.`,
  },
  {
    icon: Building2,
    title: "Pedí espacio",
    body: "Elegí entre los espacios que reciben meetups y mandá el pedido con tus fechas. La empresa contesta desde un link, sin crear cuenta.",
  },
  {
    icon: Ticket,
    title: "Publicá",
    body: "La página del evento en owu.uy, con inscripción: cupo, lista de espera y recordatorios dos días y dos horas antes. También en Eventbrite, si lo conectás, y los textos listos para copiar a Meetup.",
  },
  {
    icon: QrCode,
    title: "La puerta",
    body: "Cada persona anotada tiene su entrada con QR. La escaneás con el celular, o le pasás un link a quien te ayude en la puerta, sin cuenta. Si se cae la señal, sigue andando.",
  },
  {
    icon: ClipboardCheck,
    title: "Después",
    body: "Si abrís la encuesta, les llega sola a los anotados. En la página del evento quedan las slides y la grabación.",
  },
];

const JOIN = ORGANIZAR_ON
  ? [
      {
        title: "Entrá con el Slack de OWU",
        body: "Con tu cuenta del Slack de OWU: el rol de quien organiza va con esa cuenta.",
      },
      {
        title: "Buscá tu comunidad",
        body: "Si ya está en OWU, pedí organizarla. Si no, proponela: nombre, dónde se la ve y de qué temas.",
      },
      {
        title: "Lo confirmamos",
        body: "El staff de OWU la revisa y te avisa por mail. Desde ese momento tenés el panel para armar tus eventos.",
      },
    ]
  : [
      {
        title: "Completá el formulario",
        body: "Nombre, logo, de qué se trata, dónde se juntan y quién organiza. Es un formulario de GitHub, sin código.",
      },
      { title: "Lo revisamos", body: "Alguien del staff sube tu ficha al directorio y te avisa." },
      {
        title: "Arrancá",
        body: "Si tu comunidad está en Meetup.com, la sumamos al bot de la agenda (o abrís vos un PR a su repo) y tus eventos aparecen solos.",
      },
    ];

/** Where "Sumá tu comunidad" leads: the panel's proposal form, or the GitHub form before Organizá launches */
const JOIN_HREF = ORGANIZAR_ON ? "/organizar/panel/reclamar?proponer" : issueFormUrl("sumar-comunidad");

export default async function OrganizarPage() {
  "use cache";
  // The communities and their counts come from the directory; an hour is fresh enough
  cacheLife("hours");

  const [communities, landing] = await Promise.all([getCommunities(), getLanding()]);
  const partners = communities.filter((community) => community.confPartner);
  const people = landing?.stats?.find((stat) => stat.title === "Personas" && stat.subtitle === "conectadas")?.count;

  return (
    <>
      <PageHeader
        actions={
          <>
            {ORGANIZAR_ON ? (
              <ButtonLink arrow href="/organizar/panel">
                Abrí el panel
              </ButtonLink>
            ) : null}
            <ButtonLink arrow href={JOIN_HREF} utm="organizar-header" variant={ORGANIZAR_ON ? "secondary" : "primary"}>
              Sumá tu comunidad
            </ButtonLink>
            <ButtonLink href={SOCIAL_LINKS.slack} utm="organizar-header" variant="secondary">
              Escribinos en el Slack
            </ButtonLink>
          </>
        }
        description={`¿Tenés una comunidad o querés arrancar una? OWU no te cobra ni te pide que cambies nada: tu comunidad sigue siendo tuya. Te damos canal, agenda y una comunidad${people ? ` de más de ${new Intl.NumberFormat("es-UY").format(people)} personas` : ""} para que tus meetups se llenen.`}
        eyebrow="Organizá"
        title="Organizá con OWU"
      />

      {ORGANIZAR_ON ? (
        <Section
          description="Un panel para cada comunidad, gratis, que acompaña el meetup de la fecha a la puerta."
          eyebrow="El panel de Organizá"
          id="panel"
          title="De la fecha a la puerta, en un solo lugar"
        >
          <Reveal>
            <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {PANEL.map(({ icon: Icon, title, body }, index) => (
                <li key={title} className={cardClassName(false, "flex flex-col gap-5 p-6 sm:p-7")}>
                  <div className="flex items-start justify-between">
                    <span className="flex size-11 items-center justify-center rounded-xl bg-yellow-400/10 text-yellow-400">
                      <Icon aria-hidden className="size-5" />
                    </span>
                    <span aria-hidden className="font-title text-3xl leading-none font-extrabold text-white/[0.08]">
                      {index + 1}
                    </span>
                  </div>
                  <div>
                    <h3 className={headingClassName.h3}>{title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-zinc-400">{body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Reveal>
        </Section>
      ) : null}

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
                      className="group-hover:text-yellow-400 after:absolute after:inset-0 after:content-['']"
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
          <ButtonLink arrow href={JOIN_HREF} size="sm" utm="organizar-sumar">
            {ORGANIZAR_ON ? "Sumá tu comunidad" : "Abrir el formulario"}
          </ButtonLink>
        }
        description={
          ORGANIZAR_ON
            ? `¿Dudas? Escribinos en #${SLACK_CHANNELS.organizers}.`
            : `¿No usás GitHub? Escribinos en #${SLACK_CHANNELS.organizers} y lo cargamos por vos.`
        }
        eyebrow="Sumá tu comunidad"
        id="sumar"
        title={ORGANIZAR_ON ? "Cómo sumar tu comunidad" : "Cómo entrar al directorio"}
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
        description="Un programa para que las comunidades y la conferencia se potencien: ustedes llevan a su gente a OWU CONF y el directorio de owu.uy las muestra como aliadas."
        eyebrow="OWU CONF"
        id="aliadas"
        title="Comunidades aliadas de OWU CONF"
      >
        <div className="grid gap-6 lg:grid-cols-2">
          <Cells>
            <Cell className="gap-4">
              <h3 className={headingClassName.h3}>Qué reciben</h3>
              <ul className="flex list-disc flex-col gap-3 pl-5 text-[15px] leading-relaxed text-zinc-300 marker:text-zinc-500">
                <li>El sello “Aliada OWU CONF” en el directorio de comunidades de owu.uy.</li>
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
                        href={`/comunidad/${community.slug}`}
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
                answer: "No. Ni para la comunidad ni para la gente que va a sus eventos.",
              },
              {
                question: "¿Tengo que cambiar el nombre o la marca de mi comunidad?",
                answer: "No. Tu comunidad sigue siendo tuya, con su nombre, su página y su forma de organizarse.",
              },
              {
                question: "¿Y si mi comunidad es chica o recién arranca?",
                answer:
                  "Mejor: es cuando más sirve tener un canal y un lugar en la agenda. Una comunidad puede arrancar con una meetup chica.",
              },
              {
                question: "¿Puedo usar la herramienta de open space en mi evento?",
                answer: (
                  <>
                    Sí. Cada comunidad puede tener su espacio en el panel de OWU. Pedilo en #{SLACK_CHANNELS.organizers}
                    .
                  </>
                ),
              },
              {
                question: "¿Qué pasa si mi comunidad deja de hacer eventos?",
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
