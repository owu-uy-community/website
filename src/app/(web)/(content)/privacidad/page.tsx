import { Mail } from "lucide-react";

import { Reveal } from "components/community/reveal";
import { ButtonLink, Card, Container, Eyebrow, Freshness, PageHeader } from "components/community/ui";
import Footer from "components/shared/Footer";
import { pageMetadata } from "lib/community/metadata";
import { PAGES, PRIVACY_EMAIL, sourceUrl } from "lib/community/site";

export const metadata = pageMetadata({
  title: "Privacidad",
  description:
    "Qué datos guarda OWU cuando te anotás a un evento, organizás una comunidad o recibís una meetup: quién los ve, cuánto tiempo y cómo pedir que los borremos.",
  path: PAGES.privacidad.href,
});

const ASK_HREF = `mailto:${PRIVACY_EMAIL}?subject=${encodeURIComponent("Mis datos en OWU")}`;

const DATA = [
  {
    who: "Si te anotás a un evento",
    what: "Tu nombre, tu email, lo que respondas en el formulario, si traés acompañantes y si llegaste (el escaneo de tu entrada).",
    why: "Para guardarte el lugar, mandarte la entrada y los recordatorios, y que la comunidad sepa cuánta gente viene.",
  },
  {
    who: "Si entrás con Slack o con un código por email",
    what: "Tu nombre, tu email y, con Slack, tu foto e identificador.",
    why: "Para que no tengas que escribir tus datos cada vez y puedas ver tus eventos en Mis eventos.",
  },
  {
    who: "Si seguís una comunidad",
    what: "Que la seguís.",
    why: "Para avisarte por email cuando publica un evento.",
  },
  {
    who: "Si organizás una comunidad",
    what: "Tu nombre, tu email, tu rol y lo que hacés en el panel (publicar, cancelar, pedir un espacio).",
    why: "Para que tu equipo sepa quién hizo qué y para hablar con los espacios que piden.",
  },
  {
    who: "Si tu empresa ofrece un espacio",
    what: "El nombre y el email de la persona de contacto, con su consentimiento y la fecha en que lo dio.",
    why: "Para mandarle los pedidos de las comunidades. Solo el equipo de OWU ve ese contacto.",
  },
];

const RECIPIENTS = [
  "Las personas que organizan el evento (admins de la comunidad) y el equipo de OWU ven nombre, email y respuestas.",
  "Quien acredita en la puerta ve tu nombre cuando escanea tu entrada.",
  "En la página pública del evento solo se ve cuánta gente va. Tu nombre aparece en «quiénes van» solo si lo elegís.",
  "Si una empresa acepta recibir una meetup, ve el email de quien organiza; el suyo solo si lo permite.",
  "Si la comunidad publica el evento en Eventbrite y te anotás ahí, Eventbrite nos pasa tu nombre y email con sus propias reglas.",
];

const PROCESSORS = [
  { name: "Vercel", role: "aloja el sitio y mide visitas sin cookies" },
  { name: "Neon", role: "guarda la base de datos" },
  { name: "Resend", role: "manda los emails" },
  { name: "Upstash", role: "dispara las tareas programadas (sin datos personales)" },
  { name: "Sentry", role: "registra errores del sitio" },
  { name: "Slack", role: "si entrás con Slack" },
];

const RETENTION = [
  "Los emails que te mandamos se borran a los 180 días.",
  "Un año después de cada evento, las inscripciones de OWU pierden nombre, email y respuestas. Queda solo el conteo.",
  "Si borrás tu cuenta (desde Mis eventos), borramos tu cuenta, tus sesiones y las comunidades que seguís, y tus inscripciones dejan de decir quién eras.",
];

const RIGHTS = [
  "Saber qué datos tuyos tenemos, corregirlos o pedir que los borremos (Ley 18.331, artículos 14 a 16).",
  "Dejar de recibir recordatorios o avisos de comunidades con el link «Dejá de recibirlos» de cada email.",
  "Darte de baja de un evento con «No puedo ir», desde la entrada o desde Mis eventos.",
  "Borrar tu cuenta desde Mis eventos.",
];

/** What Organizá keeps about people and why (Ley 18.331 and Decreto 64/020). */
export default function PrivacyPage() {
  return (
    <>
      <PageHeader
        actions={
          <ButtonLink href={ASK_HREF} variant="primary">
            <Mail aria-hidden className="size-4" />
            Preguntar por mis datos
          </ButtonLink>
        }
        description="Qué guardamos cuando te anotás a un evento, organizás una comunidad o recibís una meetup, y cómo pedir que lo borremos."
        eyebrow="Privacidad"
        title="Tus datos en OWU"
      />

      <section className="py-16 sm:py-24">
        <Container>
          <Reveal className="flex max-w-2xl flex-col gap-12">
            <Card>
              <Eyebrow>En corto</Eyebrow>
              <p className="mt-3 font-title text-xl leading-relaxed font-semibold text-white">
                Guardamos lo justo para que los eventos funcionen. No vendemos datos ni los usamos para publicidad.
                Podés pedir que los borremos cuando quieras.
              </p>
            </Card>

            <Block title="Qué guardamos y para qué">
              <dl className="flex flex-col gap-6">
                {DATA.map(({ who, what, why }) => (
                  <div key={who} className="flex flex-col gap-1">
                    <dt className="font-semibold text-white">{who}</dt>
                    <dd>{what}</dd>
                    <dd className="text-zinc-500">{why}</dd>
                  </div>
                ))}
              </dl>
            </Block>

            <Block title="Quién los ve">
              <List items={RECIPIENTS} />
            </Block>

            <Block title="Servicios que usamos">
              <p>
                Estos servicios procesan datos por nosotros. Varios están en Estados Unidos, así que tus datos pueden
                guardarse fuera de Uruguay.
              </p>
              <List items={PROCESSORS.map(({ name, role }) => `${name}: ${role}.`)} />
            </Block>

            <Block title="Cuánto tiempo">
              <List items={RETENTION} />
            </Block>

            <Block title="Lo que podés hacer">
              <List items={RIGHTS} />
              <p>
                Para todo lo demás, escribinos a <span className="font-semibold text-white">{PRIVACY_EMAIL}</span>.
                Respondemos en menos de 5 días hábiles. Si no quedás conforme, podés reclamar ante la Unidad Reguladora
                y de Control de Datos Personales (URCDP).
              </p>
            </Block>

            <Block title="Si algo sale mal">
              <p>
                Si hubiera un acceso indebido a los datos, avisamos a la URCDP y a las personas afectadas dentro de las
                72 horas de saberlo, como pide el Decreto 64/020.
              </p>
            </Block>
          </Reveal>
          <Freshness className="mt-12">
            Última revisión: octubre de 2026 ·{" "}
            <a
              className="text-zinc-400 underline decoration-white/20 underline-offset-4 hover:text-zinc-100"
              href={sourceUrl("src/app/(web)/(content)/privacidad/page.tsx")}
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

function List({ items }: { items: string[] }) {
  return (
    <ul className="flex list-disc flex-col gap-2 pl-5 marker:text-zinc-600">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}
