import { Gift, Languages, UserRoundPlus } from "lucide-react";
import Link from "next/link";

import { SOCIAL_LINKS } from "app/lib/constants";
import { ButtonLink, Cell, Cells, Faq, PageHeader, Section, Terminal } from "components/community/ui";
import Footer from "components/shared/Footer";
import { getUpcomingEvents } from "lib/community/events";
import { pageMetadata } from "lib/community/metadata";
import { PAGES, SLACK_CHANNELS } from "lib/community/site";
import { dateParts } from "lib/community/time";

// The terminal card shows the next real event from the feed
export const revalidate = 3600;

export const metadata = pageMetadata({
  title: "¿Primera vez?",
  description:
    "Qué esperar de tu primera meetup en Uruguay, cómo usar el Slack de OWU y las preguntas que todo el mundo se hace antes de ir.",
  path: PAGES.primeraVez.href,
});

const PROMISES = [
  {
    icon: Gift,
    title: "Gratis y abiertas",
    body: "Las meetups de las comunidades no cuestan nada. Anotate en la página del evento así el lugar sabe cuántas personas esperar.",
  },
  {
    icon: UserRoundPlus,
    title: "Vení aunque no conozcas a nadie",
    body: "Es lo más común. Antes y después de las charlas hay un rato para conversar, y la gente está para eso.",
  },
  {
    icon: Languages,
    title: "Charlas en español",
    body: "Casi todas son en español. Si alguna es en inglés, se avisa en la descripción del evento.",
  },
];

const EVENING = [
  { time: "19:00", title: "Llegás y te acomodás", body: "Es el mejor momento para conocer gente: nadie está apurado." },
  { time: "19:30", title: "Charlas", body: "Dos o tres, de 20 a 30 minutos cada una, con preguntas al final." },
  { time: "21:00", title: "Charla libre y cierre", body: "La conversación sigue un rato más. Te podés ir cuando quieras." },
];

const linkClass = "text-zinc-200 underline decoration-white/20 underline-offset-4 hover:decoration-yellow-400";

export default async function FirstTimePage() {
  const [next] = await getUpcomingEvents();
  const when = next ? dateParts(next.start) : null;

  return (
    <>
      <PageHeader
        actions={
          <>
            <ButtonLink arrow href={SOCIAL_LINKS.slack} utm="primera-vez">
              Sumate al Slack
            </ButtonLink>
            <ButtonLink href={PAGES.eventos.href} variant="secondary">
              Ver la agenda
            </ButtonLink>
          </>
        }
        description="Todo lo que necesitás saber antes de tu primera meetup. Spoiler: no hace falta saber nada."
        eyebrow="Primera vez"
        title="¿Primera vez en OWU?"
      />

      <Section bordered={false} eyebrow="Lo básico" title="Tres cosas para saber">
        <Cells className="md:grid-cols-3">
          {PROMISES.map(({ icon: Icon, title, body }) => (
            <Cell key={title} className="flex flex-col gap-5">
              <Icon aria-hidden className="size-5 text-yellow-400" />
              <div>
                <h3 className="text-lg font-semibold tracking-[-0.02em] text-zinc-50">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-400">{body}</p>
              </div>
            </Cell>
          ))}
        </Cells>
      </Section>

      <Section
        description="Cada grupo tiene su estilo y sus horarios, pero una noche típica se ve más o menos así. El detalle de cada una está en la página del evento."
        eyebrow="Cómo es una meetup"
        title="Una noche típica"
      >
        <ol className="grid gap-px overflow-hidden rounded-xl border border-line bg-line md:grid-cols-3">
          {EVENING.map(({ time, title, body }, index) => (
            <li key={time} className="relative bg-ink p-6 sm:p-8">
              <div className="flex items-center gap-3">
                <span className="font-terminal text-sm text-yellow-400 tabular-nums">{time}</span>
                <span aria-hidden className="h-px flex-1 bg-line" />
                <span className="font-terminal text-[11px] text-zinc-600">0{index + 1}</span>
              </div>
              <h3 className="mt-5 text-lg font-semibold tracking-[-0.02em] text-zinc-50">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">{body}</p>
            </li>
          ))}
        </ol>
      </Section>

      <Section
        description="El Slack es donde la comunidad está todos los días: preguntas, novedades, búsquedas laborales y la previa de cada evento."
        eyebrow="El Slack"
        title="El Slack, en dos minutos"
      >
        <div className="grid items-start gap-10 lg:grid-cols-[1fr_1.1fr]">
          <ol className="flex flex-col gap-6">
            {[
              <>
                Entrá a{" "}
                <a className={linkClass} href={SOCIAL_LINKS.slack} rel="noopener" target="_blank">
                  slack.owu.uy
                </a>{" "}
                y creá tu cuenta con tu mail.
              </>,
              <>Completá tu perfil: con tu nombre y una foto es más fácil saludarte en persona.</>,
              <>
                Presentate en <Channel name={SLACK_CHANNELS.general} />: quién sos, a qué te dedicás o qué estás
                aprendiendo.
              </>,
              <>
                Buscá los canales de tus temas desde “Explorar canales”. Hay de lenguajes, de data, de seguridad
                y de cada comunidad.
              </>,
              <>
                Las búsquedas laborales van solo en <Channel name={SLACK_CHANNELS.jobs} />, siguiendo{" "}
                <Link className={linkClass} href="/empresas#jobs">
                  sus reglas
                </Link>
                .
              </>,
            ].map((step, index) => (
              <li key={index} className="flex gap-4">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-line-strong font-terminal text-[11px] text-zinc-400">
                  {index + 1}
                </span>
                <p className="pt-0.5 text-[15px] leading-relaxed text-zinc-300">{step}</p>
              </li>
            ))}
            <li className="pl-11 font-terminal text-[11px] leading-relaxed text-zinc-600">
              Los nombres de los canales pueden variar. Si no encontrás uno, preguntá en #{SLACK_CHANNELS.general}.
            </li>
          </ol>
          <Terminal
            lines={[
              { kind: "cmd", text: "owu join --slack" },
              { kind: "out", text: "✓ Cuenta creada en slack.owu.uy" },
              { kind: "cmd", text: `owu say "¡Hola! Soy Ana y hago frontend" --canal ${SLACK_CHANNELS.general}` },
              { kind: "out", text: "✓ Mensaje enviado. Ahora sos parte." },
              { kind: "cmd", text: "owu agenda --proximo" },
              {
                kind: "out",
                text:
                  next && when
                    ? `✓ ${next.title} · ${when.weekday} ${when.day} ${when.month} ${when.time}`
                    : "✓ Mirá owu.uy/eventos",
              },
              { kind: "cursor" },
            ]}
            title="~/primera-vez"
          />
        </div>
      </Section>

      <Section eyebrow="Preguntas frecuentes" id="preguntas" title="Lo que todo el mundo pregunta">
        <div className="max-w-3xl">
          <Faq
            items={[
              {
                question: "¿Tengo que saber programar para ir?",
                answer:
                  "No. Van estudiantes, gente que está cambiando de carrera, personas de diseño, testing y producto, y gente con muchos años de experiencia. Todas las preguntas valen.",
              },
              {
                question: "¿Cuánto sale?",
                answer:
                  "Las meetups de las comunidades son gratis. Algunas conferencias cobran entrada; lo vas a ver en la página de cada evento.",
              },
              {
                question: "¿Me tengo que anotar?",
                answer:
                  "Sí, cuando el evento lo pide: así el lugar sabe cuántas personas esperar. Si al final no podés ir, liberá tu lugar para que lo use otra persona.",
              },
              {
                question: "¿Puedo ir sin conocer a nadie?",
                answer: (
                  <>
                    Claro, es lo más común. Si querés, contá en #{SLACK_CHANNELS.general} que vas por primera vez: es
                    una buena forma de tener a quién saludar al llegar.
                  </>
                ),
              },
              {
                question: "¿Las charlas son en español?",
                answer: "Casi siempre. Si alguna es en inglés, se avisa en la descripción del evento.",
              },
              {
                question: "¿Puedo llevar a alguien?",
                answer: "Sí, siempre que también se anote.",
              },
              {
                question: "¿Puedo dar una charla?",
                answer: (
                  <>
                    Sí, y no hace falta ser experto. En <Link href={PAGES.darCharla.href}>Dá una charla</Link> te
                    contamos dónde proponerla y cómo prepararla.
                  </>
                ),
              },
              {
                question: "¿Hay código de conducta?",
                answer: (
                  <>
                    Sí. Aplica en el Slack, en las meetups y en OWU CONF. Leelo en{" "}
                    <Link href={PAGES.codigo.href}>Código de conducta</Link>, ahí también está cómo reportar algo.
                  </>
                ),
              },
            ]}
            name="primera-vez"
          />
        </div>
      </Section>

      <section className="relative overflow-hidden border-t border-line py-20 sm:py-28">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_50%_60%_at_50%_100%,rgba(250,204,21,0.08),transparent_70%)]"
        />
        <div className="relative mx-auto flex max-w-2xl flex-col items-center px-5 text-center">
          <h2 className="text-3xl leading-[1.05] font-semibold tracking-[-0.035em] text-balance text-zinc-50 sm:text-5xl">
            La primera es la más difícil. Después, ya conocés a alguien.
          </h2>
          <div className="mt-9 flex flex-wrap justify-center gap-3">
            <ButtonLink arrow href={PAGES.eventos.href} size="lg">
              Elegí tu primera meetup
            </ButtonLink>
            <ButtonLink href={PAGES.codigo.href} size="lg" variant="secondary">
              Código de conducta
            </ButtonLink>
          </div>
        </div>
      </section>

      <Footer />
    </>
  );
}

function Channel({ name }: { name: string }) {
  return <code className="rounded bg-white/[0.06] px-1.5 py-0.5 font-terminal text-[13px] text-zinc-100">#{name}</code>;
}
