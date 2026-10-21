import { Mail, MessageCircle, Phone, ShieldCheck } from "lucide-react";

import { ButtonLink, Cell, Cells, Container, Eyebrow, Freshness, PageHeader, Section } from "components/community/ui";
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

      <section className="scroll-mt-20 py-16 sm:py-20" id="el-codigo">
        <Container>
          <div className="grid items-start gap-12 lg:grid-cols-[1fr_360px]">
            <div className="flex max-w-2xl flex-col gap-12">
              <div className="rounded-r-xl border-l-2 border-yellow-400 bg-yellow-400/[0.05] px-6 py-5">
                <Eyebrow>En corto</Eyebrow>
                <p className="mt-3 text-lg leading-relaxed text-zinc-100">
                  Tratá a todas las personas con respeto. No toleramos acoso de ningún tipo. Si ves o vivís algo,
                  avisanos: lo tomamos en serio y es confidencial.
                </p>
              </div>

              <Block title="Nuestro compromiso">
                <p>
                  Queremos que OWU sea un espacio amigable, respetuoso e inclusivo para todas las personas,
                  independientemente de su género, identidad y expresión de género, orientación sexual, discapacidad,
                  apariencia física, tamaño corporal, origen, edad, religión o nivel de experiencia.
                </p>
              </Block>

              <Block title="Qué esperamos">
                <List items={EXPECTED} />
              </Block>

              <Block title="Qué no aceptamos">
                <List items={UNACCEPTABLE} />
              </Block>

              <Block title="Dónde aplica">
                <p>
                  En el Slack y el Telegram de OWU, en las meetups de las comunidades que forman parte de OWU, en OWU
                  CONF y en cualquier evento o espacio online que organicemos. Aplica a todas las personas: asistentes,
                  speakers, sponsors, organizadores y staff.
                </p>
                <p>Al participar en un espacio de OWU, aceptás este código y las decisiones de quienes lo cuidan.</p>
              </Block>
            </div>

            <aside className="flex flex-col gap-4 lg:sticky lg:top-20" id="reportar">
              <div className="rounded-xl border border-yellow-400/30 bg-ink-elev/80 p-6">
                <div className="flex items-center gap-2">
                  <ShieldCheck aria-hidden className="size-4 text-yellow-400" />
                  <Eyebrow>Cómo reportar</Eyebrow>
                </div>
                <p className="mt-4 text-[15px] leading-relaxed text-zinc-300">
                  Escribinos a <span className="font-medium text-zinc-50">{CONDUCT_EMAIL}</span>. Contanos qué pasó,
                  cuándo y dónde; si podés, sumá capturas o nombres de testigos.
                </p>
                <ButtonLink className="mt-5 w-full" href={REPORT_HREF}>
                  <Mail aria-hidden className="size-4" />
                  Escribir a {CONDUCT_EMAIL}
                </ButtonLink>
                <div className="mt-5 flex gap-3 border-t border-line pt-5 text-sm leading-relaxed text-zinc-400">
                  <MessageCircle aria-hidden className="mt-0.5 size-4 shrink-0 text-zinc-500" />
                  <p>
                    También podés escribirle por DM a alguien del staff en el Slack, o hablar con cualquier organizador
                    durante un evento.
                  </p>
                </div>
                <p className="mt-4 font-terminal text-[11px] text-zinc-500">
                  Respondemos en menos de 48 h. Todo reporte es confidencial.
                </p>
              </div>
              <div className="flex gap-3 rounded-xl border border-line p-5 text-sm leading-relaxed text-zinc-400">
                <Phone aria-hidden className="mt-0.5 size-4 shrink-0 text-zinc-500" />
                <p>
                  Si estás en peligro o alguien corre riesgo, llamá al <span className="font-medium text-zinc-100">911</span>{" "}
                  primero. Después avisanos.
                </p>
              </div>
            </aside>
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
            <Cell key={title} className="flex flex-col gap-4">
              <span className="font-terminal text-[11px] tracking-[0.12em] text-zinc-600">0{index + 1}</span>
              <div>
                <h3 className="text-lg font-semibold tracking-[-0.02em] text-zinc-50">{title}</h3>
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
        <ol className="flex max-w-3xl flex-col gap-2">
          {LADDER.map(({ step, body }, index) => (
            <li
              key={step}
              className="flex flex-col gap-1 rounded-lg border border-yellow-400/20 px-5 py-4 sm:flex-row sm:items-baseline sm:gap-6"
              style={{
                marginLeft: `min(${index * 1.5}rem, ${index * 4}vw)`,
                backgroundColor: `rgb(250 204 21 / ${0.03 + index * 0.035})`,
              }}
            >
              <span className="shrink-0 font-terminal text-[11px] tracking-[0.12em] text-yellow-400/80 uppercase sm:w-44">
                {index + 1} · {step}
              </span>
              <span className="text-sm text-zinc-300">{body}</span>
            </li>
          ))}
        </ol>
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
      <h2 className="text-2xl leading-tight font-semibold tracking-[-0.03em] text-zinc-50">{title}</h2>
      <div className="flex flex-col gap-4 text-[15px] leading-relaxed text-zinc-400">{children}</div>
    </section>
  );
}

function List({ items }: { items: string[] }) {
  return (
    <ul className="flex flex-col gap-3">
      {items.map((item) => (
        <li key={item} className="flex gap-3">
          <span aria-hidden className="mt-[0.6em] size-1.5 shrink-0 rounded-full bg-yellow-400/70" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}
