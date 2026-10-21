import { Ban, Check, Mail, MessageCircle, Phone, ShieldCheck } from "lucide-react";

import { Reveal } from "components/community/motion";
import {
  ButtonLink,
  Card,
  cardClassName,
  Cell,
  Cells,
  Container,
  Eyebrow,
  Freshness,
  headingClassName,
  PageHeader,
  Section,
} from "components/community/ui";
import Footer from "components/shared/Footer";
import { pageMetadata } from "lib/community/metadata";
import { CONDUCT_EMAIL, PAGES, sourceUrl } from "lib/community/site";

export const metadata = pageMetadata({
  title: "Código de conducta",
  description:
    "Cómo nos tratamos en OWU: qué esperamos, qué no aceptamos, cómo reportar algo y qué pasa después. Aplica en el Slack, las meetups y OWU CONF.",
  path: PAGES.codigo.href,
});

const REPORT_HREF = `mailto:${CONDUCT_EMAIL}?subject=${encodeURIComponent("Reporte de conducta")}`;

const EXPECTED = [
  "Tratá a todas las personas con respeto y cortesía, aunque no estés de acuerdo con ellas.",
  "Escuchá antes de responder y asumí buena intención: muchas veces es un malentendido.",
  "Hacé lugar a quien está empezando. Todas las preguntas valen.",
  "Pedí permiso antes de sacar fotos de alguien o de compartir lo que te contó en privado.",
  "Si ves que algo está mal, avisá. No hace falta ser la persona afectada.",
];

const UNACCEPTABLE = [
  "Comentarios ofensivos o despectivos, chistes y lenguaje discriminatorio.",
  "Acoso, intimidación o persecución, en persona o por mensajes.",
  "Contacto físico o atención sexual no deseados.",
  "Publicar información personal de otras personas sin su consentimiento.",
  "Interrumpir de forma reiterada charlas, eventos o conversaciones.",
  "Spam o promoción no deseada, incluidas búsquedas laborales fuera de su canal.",
];

const PROTOCOL = [
  { title: "Recibimos y confirmamos", body: "Te respondemos en menos de 48 horas para avisarte que lo leímos." },
  { title: "Escuchamos a las partes", body: "Hablamos con quien reportó y con las personas involucradas, con cuidado." },
  { title: "Decidimos", body: "El equipo que recibe reportes define una acción proporcional a lo que pasó." },
  { title: "Te contamos", body: "Te avisamos qué decidimos. Tu identidad no se comparte sin tu permiso." },
];

const LADDER = [
  { step: "Aviso privado", body: "Una conversación para que la persona entienda el problema." },
  { step: "Advertencia formal", body: "Queda registrada; si se repite, la siguiente medida es más seria." },
  { step: "Suspensión temporal", body: "Del Slack, de los eventos o de ambos, por un tiempo definido." },
  { step: "Expulsión", body: "De todos los espacios de OWU, de forma permanente." },
];

export default function ConductPage() {
  return (
    <>
      <PageHeader
        actions={
          <>
            <ButtonLink href={REPORT_HREF} variant="primary">
              <Mail aria-hidden className="size-4" />
              Reportar algo
            </ButtonLink>
            <ButtonLink href="#el-codigo" variant="secondary">
              Leer el código
            </ButtonLink>
          </>
        }
        description="Aplica en el Slack, las meetups, OWU CONF y cualquier espacio de OWU, online o presencial."
        eyebrow="Código de conducta"
        title="Cómo nos tratamos"
      />

      <section className="scroll-mt-24 py-16 sm:py-24" id="el-codigo">
        <Container>
          <div className="grid items-start gap-12 lg:grid-cols-[1fr_360px]">
            <Reveal className="flex max-w-2xl flex-col gap-12">
              <Card>
                <Eyebrow>En corto</Eyebrow>
                <p className="mt-3 font-title text-xl leading-relaxed font-semibold text-white">
                  Tratá a todas las personas con respeto. No toleramos acoso de ningún tipo. Si ves o vivís algo,
                  avisanos: lo tomamos en serio y es confidencial.
                </p>
              </Card>

              <Block title="Nuestro compromiso">
                <p>
                  Queremos que OWU sea un espacio amigable, respetuoso e inclusivo para todas las personas,
                  independientemente de su género, identidad y expresión de género, orientación sexual, discapacidad,
                  apariencia física, tamaño corporal, origen, edad, religión o nivel de experiencia.
                </p>
              </Block>

              <Block title="Qué esperamos">
                <List icon={Check} items={EXPECTED} />
              </Block>

              <Block title="Qué no aceptamos">
                <List icon={Ban} items={UNACCEPTABLE} />
              </Block>

              <Block title="Dónde aplica">
                <p>
                  En el Slack y el Telegram de OWU, en las meetups de las comunidades que forman parte de OWU, en OWU
                  CONF y en cualquier evento o espacio online que organicemos. Aplica a todas las personas: asistentes,
                  speakers, sponsors, organizadores y staff.
                </p>
                <p>Al participar en un espacio de OWU, aceptás este código y las decisiones de quienes lo cuidan.</p>
              </Block>
            </Reveal>

            <Reveal className="flex scroll-mt-24 flex-col gap-4 lg:sticky lg:top-24" delay={0.1}>
              <aside className="flex flex-col gap-4" id="reportar">
                <Card className="p-6">
                  <div className="flex items-center gap-4">
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-yellow-400/10 text-yellow-400">
                      <ShieldCheck aria-hidden className="size-5" />
                    </span>
                    <h2 className={headingClassName.h3}>Cómo reportar</h2>
                  </div>
                  <p className="mt-5 text-[15px] leading-relaxed text-zinc-300">
                    Escribinos a <span className="font-semibold text-white">{CONDUCT_EMAIL}</span>. Contanos qué pasó,
                    cuándo y dónde; si podés, sumá capturas o nombres de testigos.
                  </p>
                  <ButtonLink className="mt-5 w-full" href={REPORT_HREF}>
                    <Mail aria-hidden className="size-4" />
                    Escribir a {CONDUCT_EMAIL}
                  </ButtonLink>
                  <div className="mt-5 flex gap-3 border-t border-white/[0.07] pt-5 text-sm leading-relaxed text-zinc-400">
                    <MessageCircle aria-hidden className="mt-0.5 size-4 shrink-0 text-zinc-500" />
                    <p>
                      También podés escribirle por DM a alguien del staff en el Slack, o hablar con cualquier
                      organizador durante un evento.
                    </p>
                  </div>
                  <p className="mt-4 text-xs text-zinc-500">Respondemos en menos de 48 h. Todo reporte es confidencial.</p>
                </Card>
                <div className="flex gap-3 rounded-2xl border border-dashed border-white/15 p-5 text-sm leading-relaxed text-zinc-400">
                  <Phone aria-hidden className="mt-0.5 size-4 shrink-0 text-zinc-500" />
                  <p>
                    Si estás en peligro o alguien corre riesgo, llamá al{" "}
                    <span className="font-semibold text-white">911</span> primero. Después avisanos.
                  </p>
                </div>
              </aside>
            </Reveal>
          </div>
        </Container>
      </section>

      <Section
        description="Cada reporte sigue el mismo camino, para que nadie dependa de a quién le escribió."
        eyebrow="Protocolo"
        title="Qué pasa después de un reporte"
      >
        <Cells className="sm:grid-cols-2 lg:grid-cols-4">
          {PROTOCOL.map(({ title, body }, index) => (
            <Cell key={title} className="gap-6">
              <span className="flex size-11 items-center justify-center rounded-xl bg-yellow-400/10 font-title text-base font-bold text-yellow-400">
                {index + 1}
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
        description="Las medidas van de menor a mayor. Los casos graves pueden saltar pasos e ir directo a la expulsión."
        eyebrow="Consecuencias"
        title="Qué puede pasar"
      >
        <Reveal>
          <ol className="flex max-w-3xl flex-col gap-3">
            {LADDER.map(({ step, body }, index) => (
              <li
                key={step}
                className={cardClassName(false, "flex items-start gap-5 px-5 py-4 sm:items-center")}
                style={{ marginLeft: `min(${index * 1.5}rem, ${index * 4}vw)` }}
              >
                <span className="w-8 shrink-0 font-title text-2xl font-extrabold text-yellow-400 tabular-nums">
                  {index + 1}
                </span>
                <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-4">
                  <span className="shrink-0 font-title text-base font-semibold text-white sm:w-44">{step}</span>
                  <span className="text-sm text-zinc-400">{body}</span>
                </div>
              </li>
            ))}
          </ol>
        </Reveal>
        <Freshness className="mt-12">
          Última revisión: octubre de 2026 · Basado en el código de La Meetup 2023 ·{" "}
          <a
            className="text-zinc-400 underline decoration-white/20 underline-offset-4 hover:text-zinc-100"
            href={sourceUrl("src/app/(web)/(content)/codigo-de-conducta/page.tsx")}
            rel="noopener"
            target="_blank"
          >
            Historial en GitHub
          </a>
        </Freshness>
      </Section>

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

function List({ icon: Icon, items }: { icon: typeof Check; items: string[] }) {
  return (
    <ul className="flex flex-col gap-3">
      {items.map((item) => (
        <li key={item} className="flex gap-3">
          <Icon aria-hidden className="mt-1 size-4 shrink-0 text-zinc-500" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}
