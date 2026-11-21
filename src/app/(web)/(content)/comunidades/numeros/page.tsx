import { cacheLife } from "next/cache";

import { ButtonLink, cardClassName, Container, Freshness, PageHeader, StatStrip } from "components/community/ui";
import Footer from "components/shared/Footer";
import { pageMetadata } from "lib/community/metadata";
import { PAGES } from "lib/community/site";
import { publicCaller } from "lib/orpc/server";

export const metadata = pageMetadata({
  title: "Los números de OWU",
  description:
    "Cuántos eventos organizan las comunidades tech de Uruguay y cuánta gente viene, año a año. Solo totales, nunca quién.",
  path: `${PAGES.comunidades.href}/numeros`,
});

const number = new Intl.NumberFormat("es-UY");

/**
 * OWU's impact page: yearly totals for every community together, and for each one that chose to
 * show its own. Aggregates only, for hosts and sponsors.
 */
export default async function ImpactPage() {
  "use cache";
  cacheLife("hours");

  const impact = await publicCaller.insights.impact();
  const [current] = impact.years;

  return (
    <>
      <main>
        <PageHeader
          actions={
            <ButtonLink href={PAGES.comunidades.href} variant="secondary">
              Ver las comunidades
            </ButtonLink>
          }
          description="Cuántos eventos organizan las comunidades de OWU y cuánta gente viene, año a año. Solo totales: nunca quién."
          eyebrow="Impacto"
          title="Lo que mueve la comunidad tech de Uruguay"
        />

        <section className="pb-12 sm:pb-16">
          <Container className="flex flex-col gap-14">
            {impact.years.map((year) => (
              <div key={year.year} className="flex flex-col gap-6">
                <h2 className="font-title text-2xl font-semibold text-white">
                  {year.year === current.year ? `${year.year}, hasta hoy` : year.year}
                </h2>
                <StatStrip
                  stats={[
                    { value: number.format(year.events), label: year.events === 1 ? "evento" : "eventos" },
                    { value: number.format(year.people), label: "personas distintas vinieron" },
                    { value: number.format(year.firstTimers), label: "vinieron por primera vez a OWU" },
                    {
                      value: number.format(year.communities),
                      label: year.communities === 1 ? "comunidad" : "comunidades",
                    },
                  ]}
                />
              </div>
            ))}

            <div className="flex flex-col gap-4">
              <h2 className="font-title text-2xl font-semibold text-white">Por comunidad</h2>
              {impact.communities.length === 0 ? (
                <p className="max-w-2xl text-[15px] leading-relaxed text-zinc-400">
                  Todavía ninguna comunidad eligió mostrar sus números. Cada una lo activa desde su panel de Organizá.
                </p>
              ) : (
                <div className={cardClassName(false, "overflow-x-auto")}>
                  <table className="w-full text-left text-[15px] text-zinc-300">
                    <caption className="sr-only">Eventos, personas y primera vez por comunidad y año</caption>
                    <thead className="text-[13px] text-zinc-400">
                      <tr className="border-b border-white/10">
                        <th className="px-5 py-3 font-medium" scope="col">
                          Comunidad
                        </th>
                        {impact.years.map((year) => (
                          <th key={year.year} className="px-5 py-3 font-medium" scope="col">
                            {year.year}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {impact.communities.map((community) => (
                        <tr key={community.slug} className="border-b border-white/[0.06] last:border-0">
                          <th className="px-5 py-3 font-medium text-white" scope="row">
                            <a className="hover:text-yellow-400" href={`/comunidad/${community.slug}`}>
                              {community.name}
                            </a>
                          </th>
                          {community.years.map((year) => (
                            <td key={year.year} className="px-5 py-3 tabular-nums">
                              {year.events === 0
                                ? "—"
                                : `${year.events === 1 ? "1 evento" : `${year.events} eventos`} · ${year.people === 1 ? "1 persona" : `${number.format(year.people)} personas`} · ${year.firstTimers} por primera vez`}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <Freshness className="text-zinc-400">
              Personas: quienes entraron por la puerta, o tenían lugar si el evento no la usó. Primera vez: su primer
              evento en OWU (en la tabla, en esa comunidad). Se actualiza cada hora.
            </Freshness>
          </Container>
        </section>
      </main>

      <Footer />
    </>
  );
}
