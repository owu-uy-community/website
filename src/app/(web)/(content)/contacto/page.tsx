import { MessagesSquare } from "lucide-react";

import { SOCIAL_LINKS } from "app/lib/constants";
import { Reveal } from "components/community/reveal";
import { ButtonLink, Card, Container, Eyebrow, Freshness, PageHeader, SmartLink } from "components/community/ui";
import Footer from "components/shared/Footer";
import { pageMetadata } from "lib/community/metadata";
import {
  CONDUCT_EMAIL,
  CONF_URL,
  PAGES,
  PRIVACY_EMAIL,
  REPO_URL,
  SLACK_CHANNELS,
  SOCIALS,
  sourceUrl,
} from "lib/community/site";

export const metadata = pageMetadata({
  title: "Contacto",
  description:
    "Cómo hablar con OWU, la comunidad tech de Uruguay: el Slack para casi todo, emails para conducta y privacidad, y dónde van empresas, organizadores y errores del sitio.",
  path: PAGES.contacto.href,
});

const LINK = "font-medium text-zinc-200 underline decoration-white/20 underline-offset-4 hover:text-yellow-400";

const TOPICS = [
  {
    topic: "Una pregunta, una idea o una mano",
    how: `En el Slack: #${SLACK_CHANNELS.ayuda} para consultas técnicas o de carrera, #${SLACK_CHANNELS.general} para todo lo demás. Ahí está la comunidad y ahí respondemos más rápido.`,
    href: SOCIAL_LINKS.slack,
    cta: "Entrar al Slack",
  },
  {
    topic: "Un problema de conducta",
    how: `Escribinos a ${CONDUCT_EMAIL}, o por DM a alguien del staff en el Slack. Respondemos en menos de 48 horas y todo reporte es confidencial.`,
    href: `${PAGES.codigo.href}#reportar`,
    cta: "Cómo reportar",
  },
  {
    topic: "Tus datos",
    how: `Para saber qué datos tuyos tenemos, corregirlos o borrarlos, escribí a ${PRIVACY_EMAIL}. Respondemos en menos de 5 días hábiles.`,
    href: PAGES.privacidad.href,
    cta: "Qué guardamos",
  },
  {
    topic: "Organizás una comunidad o una meetup",
    how: `Escribinos en #${SLACK_CHANNELS.organizers}. Sumar tu comunidad o publicar un evento se hace con un formulario en GitHub; si no lo usás, lo cargamos por vos.`,
    href: PAGES.organizar.href,
    cta: "Organizá con OWU",
  },
  {
    topic: "Sos de una empresa",
    how: `Prestar tu espacio para una meetup, patrocinar OWU CONF o publicar búsquedas en #${SLACK_CHANNELS.jobs}: está todo en la página para empresas.`,
    href: PAGES.empresas.href,
    cta: "Para empresas",
  },
  {
    topic: "OWU CONF",
    how: "Entradas, agenda, charlas y sponsors de la conferencia anual están en su propia web.",
    href: CONF_URL,
    cta: "conf.owu.uy",
  },
  {
    topic: "Spam o un problema con el Slack",
    how: `Avisá en #${SLACK_CHANNELS.admin}. Es un Slack abierto: verificá con quién hablás antes de pasar datos.`,
    href: SOCIAL_LINKS.slack,
    cta: "Ir al Slack",
  },
  {
    topic: "Un error en este sitio",
    how: "El sitio es open source: abrí un issue en GitHub o, si sabés cómo arreglarlo, mandá un pull request.",
    href: `${REPO_URL}/issues`,
    cta: "Abrir un issue",
  },
];

/** Where to reach OWU, by what you need: a volunteer community answers in the Slack, not a contact form */
export default function ContactPage() {
  return (
    <>
      <PageHeader
        actions={
          <ButtonLink href={SOCIAL_LINKS.slack} utm="contacto" variant="primary">
            <MessagesSquare aria-hidden className="size-4" />
            Escribinos en el Slack
          </ButtonLink>
        }
        description="OWU es una comunidad de voluntarios, sin oficina ni mesa de ayuda. Según lo que necesites, este es el mejor lugar para escribirnos."
        eyebrow="Contacto"
        title="Hablemos"
      />

      <section className="py-16 sm:py-24">
        <Container>
          <Reveal className="flex max-w-2xl flex-col gap-12">
            <Card>
              <Eyebrow>En corto</Eyebrow>
              <p className="mt-3 font-title text-xl leading-relaxed font-semibold text-white">
                Para casi todo, el Slack. Para un reporte de conducta o algo sobre tus datos, un email al equipo de OWU.
              </p>
            </Card>

            <Block title="Según lo que necesites">
              <dl className="flex flex-col gap-6">
                {TOPICS.map(({ topic, how, href, cta }) => (
                  <div key={topic} className="flex flex-col gap-1">
                    <dt className="font-semibold text-white">{topic}</dt>
                    <dd>{how}</dd>
                    <dd>
                      <SmartLink className={LINK} href={href} utm="contacto">
                        {cta}
                      </SmartLink>
                    </dd>
                  </div>
                ))}
              </dl>
            </Block>

            <Block title="Por email">
              <ul className="flex list-disc flex-col gap-2 pl-5 marker:text-zinc-600">
                <li>
                  Conducta:{" "}
                  <a className={LINK} href={`mailto:${CONDUCT_EMAIL}`}>
                    {CONDUCT_EMAIL}
                  </a>
                </li>
                <li>
                  Privacidad y datos personales:{" "}
                  <a className={LINK} href={`mailto:${PRIVACY_EMAIL}`}>
                    {PRIVACY_EMAIL}
                  </a>
                </li>
              </ul>
              <p>Para todo lo demás, escribinos en el Slack y te respondemos ahí.</p>
            </Block>

            <Block title="En las redes">
              <p>Novedades, charlas grabadas y anuncios de meetups. Si necesitás una respuesta, mejor el Slack.</p>
              <ul className="flex flex-wrap gap-x-6 gap-y-2">
                {SOCIALS.map(({ key, label, href }) => (
                  <li key={key}>
                    <SmartLink className={LINK} href={href} utm="contacto">
                      {label}
                    </SmartLink>
                  </li>
                ))}
              </ul>
            </Block>
          </Reveal>
          <Freshness className="mt-12">
            Última revisión: octubre de 2026 ·{" "}
            <a
              className="text-zinc-400 underline decoration-white/20 underline-offset-4 hover:text-zinc-100"
              href={sourceUrl("src/app/(web)/(content)/contacto/page.tsx")}
              rel="noopener"
              target="_blank"
            >
              Historial en GitHub
            </a>
          </Freshness>
        </Container>
      </section>

      <Footer />
    </>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="font-title text-2xl leading-tight font-bold tracking-[-0.02em] text-white">{title}</h2>
      <div className="flex flex-col gap-4 text-[15px] leading-relaxed text-zinc-400">{children}</div>
    </section>
  );
}
