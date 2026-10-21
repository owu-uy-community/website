import { Download, EyeOff, FileCode2, Fingerprint, Lock, Users } from "lucide-react";
import { headers } from "next/headers";
import Link from "next/link";

import { auth } from "app/lib/auth";
import { SOCIAL_LINKS } from "app/lib/constants";
import { Badge, ButtonLink, Cell, Cells, Eyebrow, Faq, PageHeader, Section, StatStrip } from "components/community/ui";
import Footer from "components/shared/Footer";
import { pageMetadata } from "lib/community/metadata";
import { PAGES, REPO_URL, SLACK_CHANNELS } from "lib/community/site";
import { dateParts } from "lib/community/time";
import type { Survey } from "lib/orpc/salary-survey/schemas";
import { caller } from "lib/orpc/server";
import { MIN_GROUP_SIZE } from "lib/salary-survey/questions";
import { DATASET_DICTIONARY } from "lib/salary-survey/stats";

import Results from "./Results";
import SurveyForm from "./SurveyForm";

export const metadata = pageMetadata({
  title: "Encuesta de sueldos Uruguay",
  description:
    "Datos abiertos sobre cuánto se gana en tech en Uruguay. Anónima, hecha por la comunidad y con el dataset publicado.",
  path: "/encuesta-sueldos",
});

const STATUS = {
  open: { label: "Abierta", tone: "accent" },
  closed: { label: "Cerrada", tone: "neutral" },
  published: { label: "Publicada", tone: "green" },
} as const;

const formatDate = (iso: string | null) => {
  if (!iso) return null;
  const { long } = dateParts(iso);

  return long;
};

const shortDate = (iso: string | null) => {
  if (!iso) return null;
  const { day, month } = dateParts(iso);

  return `${day} ${month} ${iso.slice(0, 4)}`;
};

const PRIVACY = [
  {
    icon: EyeOff,
    title: "Sin nombre, email ni empresa",
    body: "No te preguntamos quién sos ni dónde trabajás. Todas las preguntas, salvo el monto, son de opciones cerradas.",
  },
  {
    icon: Fingerprint,
    title: "Tu respuesta no lleva tu usuario",
    body: "Entrás con Slack solo para responder una vez. Guardamos aparte una huella cifrada que no permite saber qué respondiste.",
  },
  {
    icon: Users,
    title: `Grupos de ${MIN_GROUP_SIZE} o más`,
    body: `Ningún resultado muestra un grupo con menos de ${MIN_GROUP_SIZE} respuestas. Esos grupos se cuentan pero no se publican.`,
  },
  {
    icon: Lock,
    title: "Dataset sin texto libre",
    body: "El archivo abierto redondea los montos, junta las categorías poco frecuentes en “otro” y usa Montevideo o interior en vez del departamento.",
  },
  {
    icon: FileCode2,
    title: "El análisis es código abierto",
    body: (
      <>
        Cómo calculamos todo está en{" "}
        <a href={`${REPO_URL}/tree/main/src/lib/salary-survey`} rel="noopener" target="_blank">
          el repo del sitio
        </a>
        . Si algo no te cierra, abrí un issue.
      </>
    ),
  },
];

const FAQ = [
  {
    question: "¿Por qué tengo que entrar con Slack?",
    answer:
      "Para que cada persona responda una sola vez. La marca de que ya respondiste se guarda separada de tu respuesta y no permite volver a juntarlas.",
  },
  {
    question: "¿Pongo el sueldo nominal o el líquido?",
    answer:
      "El nominal mensual, antes de aportes e impuestos. Si facturás, el promedio que facturás por mes. Sin aguinaldo ni bonos.",
  },
  {
    question: "Cobro en dólares, ¿lo paso a pesos?",
    answer: "No. Elegí la moneda en la que cobrás: los resultados de pesos y de dólares se muestran por separado, sin convertir.",
  },
  {
    question: "¿Puedo cambiar mi respuesta?",
    answer:
      "No, porque no sabemos cuál es tuya. Si te equivocaste en algo grave, escribinos en el Slack y vemos cómo detectar el dato raro sin identificarte.",
  },
  {
    question: "¿Quién ve las respuestas?",
    answer:
      "Nadie las ve una por una en el sitio: el panel de administración solo muestra cuántas hay. Lo que se publica son agregados y el dataset anonimizado.",
  },
];

function Timeline({ survey }: { survey: Survey | null }) {
  const steps = [
    { title: "Abre", detail: formatDate(survey?.opensAt ?? null) ?? "En OWU CONF" },
    { title: "Cierra", detail: formatDate(survey?.closesAt ?? null) ?? "Unas seis semanas después" },
    { title: "Resultados", detail: "Al cerrar: agregados, gráficos y el dataset abierto" },
  ];

  return (
    <ol className="grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-3">
      {steps.map(({ title, detail }, index) => (
        <li key={title} className="flex flex-col gap-2 bg-ink p-5 sm:p-6">
          <span className="font-terminal text-[11px] tracking-[0.12em] text-zinc-600">0{index + 1}</span>
          <span className="text-lg font-semibold tracking-[-0.02em] text-zinc-50">{title}</span>
          <span className="text-sm text-zinc-400 first-letter:uppercase">{detail}</span>
        </li>
      ))}
    </ol>
  );
}

export default async function SalarySurveyPage() {
  const [{ survey, answered }, session] = await Promise.all([
    caller.salarySurvey.current(),
    auth.api.getSession({ headers: await headers() }),
  ]);
  const results = survey?.status === "published" ? await caller.salarySurvey.results({ slug: survey.slug }) : null;
  const status = survey ? STATUS[survey.status as keyof typeof STATUS] : null;
  const datasetHref = survey ? `/encuesta-sueldos/datos.csv?edicion=${survey.slug}` : "#";

  return (
    <>
      <PageHeader
        actions={
          survey?.status === "open" ? (
            <ButtonLink arrow href="#formulario" size="lg" variant={answered ? "secondary" : "primary"}>
              {answered ? "Pasale el link a tu equipo" : "Responder ahora"}
            </ButtonLink>
          ) : results ? (
            <>
              <ButtonLink arrow href="#resultados" size="lg">
                Ver resultados
              </ButtonLink>
              <a className="group/button inline-flex h-12 items-center gap-2 rounded-md border border-line-strong bg-white/[0.02] px-5 text-[15px] font-medium text-zinc-100 transition-colors hover:border-white/25 hover:bg-white/[0.06]" download href={datasetHref}>
                <Download aria-hidden className="size-4" />
                Descargar datos
              </a>
            </>
          ) : (
            <>
              <ButtonLink arrow href={SOCIAL_LINKS.slack} size="lg" utm="encuesta">
                Avisame por Slack
              </ButtonLink>
              <ButtonLink href={PAGES.semanario.href} size="lg" variant="secondary">
                Seguí el Semanario
              </ButtonLink>
            </>
          )
        }
        description={
          results
            ? "Datos abiertos sobre cuánto se gana en tech en Uruguay, con el dataset para que hagas tu propio análisis. Hecha por la comunidad, para la comunidad."
            : "Datos abiertos sobre cuánto se gana en tech en Uruguay. Anónima, de unos 8 minutos y hecha por la comunidad, para la comunidad."
        }
        eyebrow={
          <div className="flex flex-wrap items-center gap-3">
            <Eyebrow dot>{survey ? `Encuesta de sueldos ${survey.slug}` : "Encuesta de sueldos"}</Eyebrow>
            {status ? <Badge tone={status.tone}>{status.label}</Badge> : <Badge>Próximamente</Badge>}
          </div>
        }
        title="Cuánto se gana en tech en Uruguay"
      >
        {survey && survey.status !== "draft" ? (
          <StatStrip
            className="mt-10 max-w-3xl grid-cols-1 sm:grid-cols-3"
            stats={[
              { value: new Intl.NumberFormat("es-UY").format(survey.responseCount), label: "Respuestas" },
              {
                value: survey.status === "open" ? (shortDate(survey.closesAt) ?? "Sin fecha") : status?.label ?? "",
                label: survey.status === "open" ? "Cierra" : "Estado",
              },
              { value: `${MIN_GROUP_SIZE}+`, label: "Respuestas por grupo publicado" },
            ]}
          />
        ) : null}
      </PageHeader>

      {survey?.status === "open" ? (
        <Section
          description={
            answered
              ? "Tu respuesta ya está guardada, sin tu usuario. Los resultados se publican acá cuando cierre la encuesta."
              : "Cinco pasos cortos. Podés volver atrás y revisar todo antes de enviar."
          }
          eyebrow="Responder"
          id="formulario"
          title={answered ? "¡Gracias por responder!" : "Tu respuesta"}
        >
          <SurveyForm answered={answered} signedIn={Boolean(session)} slug={survey.slug} />
        </Section>
      ) : null}

      {results ? (
        <Section
          description={`Mediana y rango del 50% central del sueldo nominal mensual. Pesos y dólares van por separado; los grupos con menos de ${results.threshold} respuestas no se muestran.`}
          eyebrow="Resultados"
          id="resultados"
          title={`Lo que respondieron ${new Intl.NumberFormat("es-UY").format(results.survey.responseCount)} personas`}
        >
          <Results results={results} />
        </Section>
      ) : null}

      {survey?.status === "closed" ? (
        <Section eyebrow="Cerrada" title="Estamos procesando los resultados">
          <p className="max-w-2xl text-zinc-400">
            Gracias a las {new Intl.NumberFormat("es-UY").format(survey.responseCount)} personas que respondieron. Los
            resultados y el dataset se publican acá; te avisamos en el Slack y en el{" "}
            <Link className="text-zinc-200 underline decoration-white/30 underline-offset-4 hover:decoration-yellow-400" href={PAGES.semanario.href}>
              Semanario
            </Link>
            .
          </p>
        </Section>
      ) : null}

      {survey?.status !== "published" ? (
        <Section
          description="En Uruguay no hay datos abiertos y al día sobre sueldos de desarrollo: los últimos públicos son de alrededor de 2021. En Argentina, sysarmy hace su encuesta dos veces por año, con miles de respuestas y el dataset publicado. Queremos tener lo mismo acá, hecho entre todos."
          eyebrow="Por qué"
          title="Sin datos, cada negociación arranca a ciegas"
        >
          <Timeline survey={survey} />
        </Section>
      ) : null}

      <Section
        description="Reglas fijas, publicadas antes de abrir la encuesta. No cambian después de ver los datos."
        eyebrow="Privacidad"
        title="Cómo cuidamos tus datos"
      >
        <Cells className="sm:grid-cols-2 lg:grid-cols-3">
          {PRIVACY.map(({ icon: Icon, title, body }) => (
            <Cell key={title} className="flex flex-col gap-4">
              <Icon aria-hidden className="size-5 text-yellow-400" />
              <div>
                <h3 className="text-[15px] font-semibold text-zinc-50">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-400 [&_a]:text-zinc-200 [&_a]:underline [&_a]:decoration-white/30 [&_a]:underline-offset-4">
                  {body}
                </p>
              </div>
            </Cell>
          ))}
          <Cell className="flex flex-col justify-between gap-4 bg-ink-elev">
            <p className="text-sm leading-relaxed text-zinc-400">
              ¿Dudas o una idea para la próxima edición? Escribinos en{" "}
              <span className="font-terminal text-zinc-200">#{SLACK_CHANNELS.general}</span>.
            </p>
            <ButtonLink arrow className="self-start" href={SOCIAL_LINKS.slack} size="sm" utm="encuesta" variant="secondary">
              Ir al Slack
            </ButtonLink>
          </Cell>
        </Cells>
      </Section>

      {results ? (
        <Section
          actions={
            <a className="group/button inline-flex h-8 items-center gap-1.5 rounded-md border border-line-strong bg-white/[0.02] px-3 text-[13px] font-medium text-zinc-100 transition-colors hover:border-white/25 hover:bg-white/[0.06]" download href={datasetHref}>
              <Download aria-hidden className="size-3.5" />
              Descargar CSV
            </a>
          }
          description="Una fila por respuesta, con las columnas de abajo. Licencia CC BY 4.0: usalo citando “Encuesta de sueldos OWU”."
          eyebrow="Datos abiertos"
          id="datos"
          title="El dataset"
        >
          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-line bg-white/[0.02] font-terminal text-[11px] tracking-[0.08em] text-zinc-500 uppercase">
                <tr>
                  <th className="px-4 py-3 font-medium" scope="col">
                    Columna
                  </th>
                  <th className="px-4 py-3 font-medium" scope="col">
                    Qué es
                  </th>
                  <th className="px-4 py-3 font-medium" scope="col">
                    Valores
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {DATASET_DICTIONARY.map(({ column, description, options }) => (
                  <tr key={column} className="align-top">
                    <td className="px-4 py-3 font-terminal text-[12.5px] whitespace-nowrap text-zinc-200">{column}</td>
                    <td className="px-4 py-3 text-zinc-400">{description}</td>
                    <td className="px-4 py-3 font-terminal text-[11.5px] text-zinc-500">
                      {options ? [...new Set([...options.map((option) => option.value), "otro"])].join(", ") : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      ) : null}

      <Section eyebrow="Preguntas" title="Lo que más nos preguntan">
        <div className="max-w-3xl">
          <Faq items={FAQ} name="encuesta-faq" />
        </div>
      </Section>

      <Footer />
    </>
  );
}
