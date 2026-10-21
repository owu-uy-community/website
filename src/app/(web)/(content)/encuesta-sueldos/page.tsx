import { Braces, Download, EyeOff, FileCode2, Fingerprint, Lock, Users } from "lucide-react";
import { headers } from "next/headers";
import Link from "next/link";

import { auth } from "app/lib/auth";
import { SOCIAL_LINKS } from "app/lib/constants";
import { cn } from "app/lib/utils";
import CopyField from "components/community/CopyField";
import { CountUp, Reveal } from "components/community/motion";
import {
  Badge,
  ButtonLink,
  buttonClassName,
  Card,
  Cell,
  Cells,
  Eyebrow,
  Faq,
  headingClassName,
  PageHeader,
  Section,
} from "components/community/ui";
import Footer from "components/shared/Footer";
import { pageMetadata } from "lib/community/metadata";
import { PAGES, REPO_URL, SITE_URL, SLACK_CHANNELS } from "lib/community/site";
import { dateParts } from "lib/community/time";
import type { Survey } from "lib/orpc/salary-survey/schemas";
import { caller } from "lib/orpc/server";
import { MIN_GROUP_SIZE } from "lib/salary-survey/questions";
import { DATASET_DICTIONARY } from "lib/salary-survey/stats";

import Explorer from "./Explorer";
import Profile from "./Profile";
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
  published: { label: "Publicada", tone: "neutral" },
} as const;

const formatDate = (iso: string | null) => (iso ? dateParts(iso).long : null);

const shortDate = (iso: string | null) => {
  if (!iso) return null;
  const { day, month } = dateParts(iso);

  return `${day} ${month} ${iso.slice(0, 4)}`;
};

const number = new Intl.NumberFormat("es-UY");

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
    question: "¿De dónde salen los datos?",
    answer:
      "De la gente de la comunidad, que responde una vez por edición entrando con el Slack de OWU. No usamos ofertas de trabajo, empresas ni consultoras: cada número viene de alguien que cobra ese sueldo.",
  },
  {
    question: "¿Son confiables?",
    answer:
      "Son sueldos declarados, no verificados. Para que un dato raro no distorsione nada, descartamos montos fuera de un rango razonable, usamos medianas y cuartiles en vez de promedios, y no publicamos grupos con menos de 10 respuestas. Cuantas más personas respondan, mejor representan a la comunidad.",
  },
  {
    question: "¿Por qué mediana y no promedio?",
    answer:
      "Porque unos pocos sueldos muy altos suben el promedio sin que nadie cobre eso. La mediana es lo que cobra la persona del medio; el 50% central (del percentil 25 al 75) muestra el rango donde está la mitad del grupo.",
  },
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
    answer:
      "No. Elegí la moneda en la que cobrás: los resultados de pesos y de dólares se muestran por separado, sin convertir.",
  },
  {
    question: "¿Puedo usar los datos en mi web o en un análisis?",
    answer:
      "Sí. El dataset y la API son públicos con licencia CC BY 4.0: podés usarlos y publicarlos citando “Encuesta de sueldos OWU” con un link a esta página.",
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

/** The edition's key facts under the title: the count in yellow, the rest in white */
function Facts({ survey, status }: { survey: Survey; status: { label: string } | null }) {
  const facts = [
    { label: "Respuestas", value: <CountUp value={survey.responseCount} />, accent: true },
    survey.status === "open"
      ? { label: "Cierra", value: shortDate(survey.closesAt) ?? "Sin fecha" }
      : { label: "Estado", value: status?.label ?? "" },
    { label: "Respuestas por grupo publicado", value: `${MIN_GROUP_SIZE}+` },
  ];

  return (
    <dl
      className="owu-rise mt-10 grid max-w-3xl grid-cols-1 gap-6 sm:grid-cols-3"
      style={{ "--d": "320ms" } as React.CSSProperties}
    >
      {facts.map(({ label, value, accent }) => (
        <div key={label} className="flex flex-col-reverse gap-1.5">
          <dt className="text-sm text-zinc-400">{label}</dt>
          <dd
            className={cn(
              "font-title text-3xl font-bold tracking-[-0.02em] tabular-nums sm:text-4xl",
              accent ? "text-yellow-400" : "text-zinc-50"
            )}
          >
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function Timeline({ survey }: { survey: Survey | null }) {
  const steps = [
    { title: "Abre", detail: formatDate(survey?.opensAt ?? null) ?? "En OWU CONF" },
    { title: "Cierra", detail: formatDate(survey?.closesAt ?? null) ?? "Unas seis semanas después" },
    { title: "Resultados", detail: "Al cerrar: agregados, gráficos, un explorador para compararte y el dataset abierto" },
  ];

  return (
    <Cells className="sm:grid-cols-3">
      {steps.map(({ title, detail }, index) => (
        <Cell key={title} className="gap-6">
          <span className="font-title text-3xl leading-none font-bold text-white/[0.08]">0{index + 1}</span>
          <div>
            <h3 className={headingClassName.h3}>{title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-zinc-400 first-letter:uppercase">{detail}</p>
          </div>
        </Cell>
      ))}
    </Cells>
  );
}

/** Where to read the numbers from outside the site */
function OpenData({ slug, datasetHref }: { slug: string; datasetHref: string }) {
  const endpoints = [
    { method: "GET", path: `/api/v1/salary-survey/${slug}/results`, what: "Agregados: medianas, cuartiles, perfil y conformidad" },
    { method: "GET", path: `/api/v1/salary-survey/${slug}/rows`, what: "El dataset, fila por fila, en JSON" },
    { method: "GET", path: "/api/v1/salary-survey/editions", what: "Las ediciones publicadas" },
  ];

  return (
    <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
      <Card className="flex flex-col gap-5">
        <div className="flex items-start gap-4">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-yellow-400/10 text-yellow-400">
            <Braces aria-hidden className="size-5" />
          </span>
          <div>
            <h3 className="font-title text-[17px] font-semibold text-zinc-50">Una API sin registro</h3>
            <p className="mt-1 text-sm leading-relaxed text-zinc-400">
              Los mismos números que ves acá, en JSON. Sin claves ni límites raros; solo pedimos la atribución.
            </p>
          </div>
        </div>
        <ul className="divide-y divide-white/[0.07] overflow-hidden rounded-xl border border-white/[0.07]">
          {endpoints.map(({ method, path, what }) => (
            <li key={path} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
              <code className="shrink-0 font-terminal text-[12.5px] text-zinc-100">
                <span className="text-yellow-400">{method}</span> {path}
              </code>
              <span className="text-[13px] text-zinc-500 sm:ml-auto sm:text-right">{what}</span>
            </li>
          ))}
        </ul>
      </Card>
      <Card className="flex flex-col gap-5">
        <div>
          <h3 className="font-title text-[17px] font-semibold text-zinc-50">Descargá el dataset</h3>
          <p className="mt-1 text-sm leading-relaxed text-zinc-400">
            Una fila por respuesta, con las columnas de la tabla de abajo. Licencia CC BY 4.0.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a className={buttonClassName("primary", "sm")} download href={datasetHref}>
            <Download aria-hidden className="size-4" />
            CSV
          </a>
          <a className={buttonClassName("secondary", "sm")} href={`/encuesta-sueldos/datos.json?edicion=${slug}`}>
            JSON
          </a>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-zinc-500">Cómo citarlo</span>
          <CopyField label="la atribución" value={`Encuesta de sueldos OWU ${slug} · ${SITE_URL}/encuesta-sueldos · CC BY 4.0`} />
        </div>
      </Card>
    </div>
  );
}

export default async function SalarySurveyPage({ searchParams }: { searchParams: Promise<{ edicion?: string }> }) {
  const [{ survey: current, answered }, editions, session, { edicion }] = await Promise.all([
    caller.salarySurvey.current(),
    caller.salarySurvey.editions(),
    auth.api.getSession({ headers: await headers() }),
    searchParams,
  ]);
  // A past edition can be read at ?edicion=2027; otherwise the current one
  const survey = (edicion && editions.find((edition) => edition.slug === edicion)) || current;
  const results = survey?.status === "published" ? await caller.salarySurvey.results({ slug: survey.slug }) : null;
  const status = survey ? STATUS[survey.status as keyof typeof STATUS] : null;
  const datasetHref = survey ? `/encuesta-sueldos/datos.csv?edicion=${survey.slug}` : "#";
  const defaultCurrency = results && results.currencies.USD.n > results.currencies.UYU.n ? "USD" : "UYU";

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
              <ButtonLink arrow href="#comparar" size="lg">
                Compará tu sueldo
              </ButtonLink>
              <a className={buttonClassName("secondary", "lg")} download href={datasetHref}>
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
            ? "Cuánto cobra la gente de la comunidad, por seniority, rol, stack y para quién trabaja. Compará tu sueldo con el de perfiles como el tuyo y llevate el dataset."
            : "Datos abiertos sobre cuánto se gana en tech en Uruguay. Anónima, de unos 8 minutos y hecha por la comunidad, para la comunidad."
        }
        eyebrow={
          <div className="flex flex-wrap items-center gap-3">
            <Eyebrow>{survey ? `Encuesta de sueldos ${survey.slug}` : "Encuesta de sueldos"}</Eyebrow>
            {status ? <Badge tone={status.tone}>{status.label}</Badge> : <Badge>Próximamente</Badge>}
          </div>
        }
        title="Cuánto se gana en tech en Uruguay"
      >
        {survey && survey.status !== "draft" ? <Facts status={status} survey={survey} /> : null}
        {editions.length > 1 ? (
          <nav aria-label="Ediciones" className="owu-rise mt-8 flex flex-wrap items-center gap-2" style={{ "--d": "400ms" } as React.CSSProperties}>
            <span className="text-xs font-medium text-zinc-500">Ediciones</span>
            {editions.map((edition) => (
              <Link
                key={edition.slug}
                className={cn(
                  "h-8 rounded-full border px-3 text-[13px] font-medium leading-8 transition-colors",
                  edition.slug === survey?.slug
                    ? "border-yellow-400 bg-yellow-400 text-zinc-950"
                    : "border-white/10 bg-white/[0.04] text-zinc-300 hover:bg-white/[0.08] hover:text-white"
                )}
                href={edition.slug === current?.slug ? "/encuesta-sueldos" : `/encuesta-sueldos?edicion=${edition.slug}`}
              >
                {edition.slug}
              </Link>
            ))}
          </nav>
        ) : null}
      </PageHeader>

      {survey?.status === "open" ? (
        <Section
          description={
            answered
              ? "Tu respuesta ya está guardada, sin tu usuario. Los resultados se publican acá cuando cierre la encuesta."
              : "Cinco pasos cortos. Podés volver atrás y revisar todo antes de enviar."
          }
          id="formulario"
          title={answered ? "¡Gracias por responder!" : "Tu respuesta"}
        >
          <SurveyForm answered={answered} signedIn={Boolean(session)} slug={survey.slug} />
        </Section>
      ) : null}

      {results ? (
        <>
          <Section
            description={`Mediana y rango del 50% central del sueldo nominal mensual. Pesos y dólares van por separado; los grupos con menos de ${results.threshold} respuestas no se muestran.`}
            id="resultados"
            title={`Lo que respondieron ${number.format(results.survey.responseCount)} personas`}
          >
            <Results results={results} />
          </Section>

          <Section
            description="Elegí lo que te describe y mirá qué cobra ese grupo. Si ponés tu sueldo, te decimos en qué percentil estás. Todo pasa en tu navegador, sobre el dataset abierto: no guardamos nada."
            id="comparar"
            title="Compará tu perfil"
          >
            <Reveal>
              <Explorer defaultCurrency={defaultCurrency} edition={results.survey.slug} threshold={results.threshold} />
            </Reveal>
          </Section>

          <Section
            description={`Quiénes respondieron, pregunta por pregunta. Las opciones con menos de ${results.threshold} respuestas se juntan en “Otros”.`}
            id="perfil"
            title="Quiénes respondieron"
          >
            <Profile dimensions={results.profile} />
          </Section>
        </>
      ) : null}

      {survey?.status === "closed" ? (
        <Section title="Estamos procesando los resultados">
          <p className="max-w-2xl text-[17px] leading-relaxed text-zinc-400">
            Gracias a las {number.format(survey.responseCount)} personas que respondieron. Los resultados y el dataset se
            publican acá; te avisamos en el Slack y en el{" "}
            <Link
              className="text-zinc-200 underline decoration-white/30 underline-offset-4 hover:decoration-yellow-400"
              href={PAGES.semanario.href}
            >
              Semanario
            </Link>
            .
          </p>
        </Section>
      ) : null}

      {survey?.status !== "published" ? (
        <Section
          description="En Uruguay no hay datos abiertos y al día sobre sueldos de desarrollo: los últimos públicos son de alrededor de 2021. En Argentina, sysarmy hace su encuesta dos veces por año, con miles de respuestas y el dataset publicado; en España, sueldos.dev junta cientos de sueldos anónimos de la comunidad. Queremos tener lo mismo acá, hecho entre todos."
          title="Sin datos, cada negociación arranca a ciegas"
        >
          <Timeline survey={survey} />
        </Section>
      ) : null}

      <Section
        description="Reglas fijas, publicadas antes de abrir la encuesta. No cambian después de ver los datos."
        id="privacidad"
        title="Cómo cuidamos tus datos"
      >
        <Cells className="sm:grid-cols-2 lg:grid-cols-3">
          {PRIVACY.map(({ icon: Icon, title, body }) => (
            <Cell key={title} className="gap-6">
              <span className="flex size-11 items-center justify-center rounded-xl bg-yellow-400/10 text-yellow-400">
                <Icon aria-hidden className="size-5" />
              </span>
              <div>
                <h3 className="font-title text-[17px] leading-snug font-semibold text-zinc-50">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-400 [&_a]:text-zinc-200 [&_a]:underline [&_a]:decoration-white/30 [&_a]:underline-offset-4 [&_a:hover]:decoration-yellow-400">
                  {body}
                </p>
              </div>
            </Cell>
          ))}
          <div className="flex flex-col justify-between gap-5 rounded-2xl border border-dashed border-white/15 p-6">
            <p className="text-sm leading-relaxed text-zinc-400">
              ¿Dudas o una idea para la próxima edición? Escribinos en{" "}
              <span className="font-medium text-zinc-200">#{SLACK_CHANNELS.general}</span>.
            </p>
            <ButtonLink arrow className="self-start" href={SOCIAL_LINKS.slack} size="sm" utm="encuesta" variant="secondary">
              Ir al Slack
            </ButtonLink>
          </div>
        </Cells>
      </Section>

      {results ? (
        <Section
          description="Los números son de todos. Usalos para tu análisis, tu charla o tu negociación; solo pedimos que cites la fuente."
          id="datos"
          title="Datos abiertos y API"
        >
          <div className="flex flex-col gap-10">
            <Reveal>
              <OpenData datasetHref={datasetHref} slug={results.survey.slug} />
            </Reveal>
            <Reveal>
              <Card className="overflow-x-auto p-0 sm:p-0">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="border-b border-white/[0.07] text-xs font-semibold tracking-[0.1em] text-zinc-500 uppercase">
                    <tr>
                      <th className="px-5 py-3.5 font-semibold" scope="col">
                        Columna
                      </th>
                      <th className="px-5 py-3.5 font-semibold" scope="col">
                        Qué es
                      </th>
                      <th className="px-5 py-3.5 font-semibold" scope="col">
                        Valores
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.07]">
                    {DATASET_DICTIONARY.map(({ column, description, options }) => (
                      <tr key={column} className="align-top">
                        <td className="px-5 py-3.5 font-terminal text-[12.5px] whitespace-nowrap text-zinc-100">{column}</td>
                        <td className="px-5 py-3.5 text-zinc-400">{description}</td>
                        <td className="px-5 py-3.5 font-terminal text-[11.5px] leading-relaxed text-zinc-500">
                          {options ? [...new Set([...options.map((option) => option.value), "otro"])].join(", ") : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            </Reveal>
          </div>
        </Section>
      ) : null}

      <Section id="preguntas" title="Lo que más nos preguntan">
        <div className="max-w-3xl">
          <Faq items={FAQ} name="encuesta-faq" />
        </div>
      </Section>

      <Footer />
    </>
  );
}
