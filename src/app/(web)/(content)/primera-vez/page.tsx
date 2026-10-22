import { Gift, Languages, UserRoundPlus } from "lucide-react";
import Link from "next/link";

import { SOCIAL_LINKS } from "app/lib/constants";
import { cn } from "app/lib/utils";
import { Reveal } from "components/community/motion";
import {
  ButtonLink,
  Card,
  Cell,
  Cells,
  Container,
  Faq,
  headingClassName,
  PageHeader,
  Section,
  Terminal,
  TitleBar,
} from "components/community/ui";
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

/* The channels every member ends up using, from the pinned "Listado de canales" in #general */
const BASICS: { name: string; body: string }[] = [
  { name: SLACK_CHANNELS.anuncios, body: "Meetups y eventos, tu charla o tu proyecto open source." },
  { name: SLACK_CHANNELS.ayuda, body: "Consultas técnicas y no tanto." },
  { name: SLACK_CHANNELS.jobs, body: "Búsquedas laborales, remotas o en Uruguay." },
  { name: SLACK_CHANNELS.forHire, body: "Tu perfil o tu CV, si estás buscando trabajo." },
  { name: SLACK_CHANNELS.autobombo, body: "Proyectos personales, para crecer en conjunto." },
  { name: SLACK_CHANNELS.marketplace, body: "Compra y venta de cosas." },
  { name: SLACK_CHANNELS.random, body: "Charla de pasillo y memes." },
  { name: SLACK_CHANNELS.general, body: "Avisos e información útil." },
];

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
  {
    time: "21:00",
    title: "Charla libre y cierre",
    body: "La conversación sigue un rato más. Te podés ir cuando quieras.",
  },
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

      <Section eyebrow="Lo básico" title="Tres cosas para saber">
        <Cells className="md:grid-cols-3">
          {PROMISES.map(({ icon: Icon, title, body }) => (
            <Cell key={title} className="gap-6">
              <span className="flex size-11 items-center justify-center rounded-xl bg-yellow-400/10 text-yellow-400">
                <Icon aria-hidden className="size-5" />
              </span>
              <div>
                <h3 className={headingClassName.h3}>{title}</h3>
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
        <Cells className="md:grid-cols-3">
          {EVENING.map(({ time, title, body }, index) => (
            <Card key={time} className="flex flex-col gap-6">
              <div className="flex items-start justify-between">
                <span className="font-title text-3xl font-bold text-yellow-400 tabular-nums">{time}</span>
                <span className="font-title text-3xl leading-none font-extrabold text-white/[0.08]">0{index + 1}</span>
              </div>
              <div>
                <h3 className={headingClassName.h3}>{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-400">{body}</p>
              </div>
            </Card>
          ))}
        </Cells>
      </Section>

      <Section
        description="El Slack es donde la comunidad está todos los días: preguntas, novedades, búsquedas laborales y la previa de cada evento."
        eyebrow="El Slack"
        title="El Slack, en dos minutos"
      >
        <Reveal className="grid items-start gap-10 lg:grid-cols-[1fr_1.1fr]">
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
                Sumate a los canales de tus temas desde “Explorar canales”: hay más de cien, de cada lenguaje, de data,
                de seguridad y de cada comunidad. Los más concurridos son <Channel name="javascript" />,{" "}
                <Channel name="react" /> y <Channel name="python" />.
              </>,
              <>
                ¿Una duda? Preguntá en <Channel name={SLACK_CHANNELS.ayuda} />, o en el canal de esa tecnología si es
                algo puntual.
              </>,
              <>
                Las búsquedas laborales van solo en <Channel name={SLACK_CHANNELS.jobs} />, siguiendo{" "}
                <Link className={linkClass} href="/empresas#jobs">
                  sus reglas
                </Link>
                . Si buscás trabajo, compartí tu perfil en <Channel name={SLACK_CHANNELS.forHire} />.
              </>,
            ].map((step, index) => (
              <li key={index} className="flex gap-4">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white/[0.06] font-title text-sm font-semibold text-white">
                  {index + 1}
                </span>
                <p className="pt-1 text-[15px] leading-relaxed text-zinc-300">{step}</p>
              </li>
            ))}
            <li className="pl-12 text-xs leading-relaxed text-zinc-500">
              Es un Slack abierto: verificá con quién hablás y avisá del spam en #{SLACK_CHANNELS.admin}. En el plan
              gratuito, los mensajes de más de 90 días se ocultan, así que un canal tranquilo puede tener más historia
              de la que se ve.
            </li>
          </ol>
          <Terminal
            lines={[
              { kind: "cmd", text: "owu join --slack" },
              { kind: "out", text: "✓ Cuenta creada en slack.owu.uy" },
              { kind: "cmd", text: `owu join --canal javascript --canal ${SLACK_CHANNELS.ayuda}` },
              { kind: "out", text: `✓ Ya estás en #javascript y #${SLACK_CHANNELS.ayuda}. Ahora sos parte.` },
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
        </Reveal>
        <Reveal className="mt-14">
          <h3 className={headingClassName.h3}>Los canales de siempre</h3>
          <ul className="mt-5 grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
            {BASICS.map(({ name, body }) => (
              <li key={name} className="flex flex-col gap-1.5">
                <span>
                  <Channel name={name} />
                </span>
                <span className="text-sm leading-relaxed text-zinc-400">{body}</span>
              </li>
            ))}
          </ul>
        </Reveal>
      </Section>

      <Section eyebrow="Preguntas frecuentes" id="preguntas" title="Lo que todo el mundo pregunta">
        <Reveal className="max-w-3xl">
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
                    Claro, es lo más común. Si querés, contá en el canal de esa comunidad que vas por primera vez: es
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
        </Reveal>
      </Section>

      <section className="relative overflow-hidden py-20 sm:py-28">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_50%_60%_at_50%_100%,rgba(250,204,21,0.08),transparent_70%)]"
        />
        <Container className="relative">
          <Reveal className="mx-auto flex max-w-2xl flex-col items-center text-center">
            <h2 className={cn(headingClassName.h2, "sm:text-5xl")}>
              La primera es la más difícil. Después, ya conocés a alguien.
            </h2>
            <TitleBar className="mt-7" />
            <div className="mt-9 flex flex-wrap justify-center gap-3">
              <ButtonLink arrow href={PAGES.eventos.href} size="lg">
                Elegí tu primera meetup
              </ButtonLink>
              <ButtonLink href={PAGES.codigo.href} size="lg" variant="secondary">
                Código de conducta
              </ButtonLink>
            </div>
          </Reveal>
        </Container>
      </section>

      <Footer />
    </>
  );
}

function Channel({ name }: { name: string }) {
  return (
    <code className="rounded-md bg-white/[0.06] px-1.5 py-0.5 font-terminal text-[13px] text-zinc-100">#{name}</code>
  );
}
