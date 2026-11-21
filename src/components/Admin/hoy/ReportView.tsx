"use client";

import Link from "next/link";
import { ArrowUpRight, Clapperboard, Copy, ListVideo, Siren, Users } from "lucide-react";

import { cn } from "app/lib/utils";
import { ColumnChart } from "components/Admin/ui/charts";
import { PageHeader, Panel, PanelHead } from "components/Admin/ui/page";
import { EmptyState } from "components/Admin/ui/states";
import { formatClock } from "components/Admin/ui/time";
import { Badge } from "components/shared/ui/badge";
import { Button } from "components/shared/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "components/shared/ui/table";
import { toast } from "components/shared/ui/toast-utils";
import type { Today } from "lib/orpc/dashboard/today-schemas";

import { CATEGORY, Kpi } from "./parts";

/** After the day: the record of how it went, from what was logged while it ran. */
export function ReportView({ data, href }: { data: Today; href: (path: string) => string }) {
  const { event, report } = data;
  const tz = event.timezone;
  if (!report) return null;

  const showUp = report.attending > 0 ? Math.round((report.checkedIn / report.attending) * 100) : null;
  const drifts = report.drift.map((row) => row.driftMin).filter((value): value is number => value !== null);
  const averageDrift = drifts.length ? Math.round(drifts.reduce((sum, value) => sum + value, 0) / drifts.length) : null;
  const worstDrift = drifts.length ? Math.max(...drifts) : null;

  const copyChapters = async () => {
    if (!report.chapters) return;
    try {
      await navigator.clipboard.writeText(report.chapters);
      toast.success("Capítulos copiados", "Pegalos en la descripción del video de YouTube.");
    } catch {
      // A browser can refuse the clipboard (permissions, an insecure origin): say so instead of nothing.
      toast.error("No se pudieron copiar", "Seleccioná los capítulos de abajo y copialos a mano.");
    }
  };

  return (
    <>
      <PageHeader
        actions={
          <>
            <Button disabled={!report.chapters} variant="outline" onClick={copyChapters}>
              <Copy />
              Copiar capítulos
            </Button>
            <Button asChild>
              <Link href={href("/admin/comunicacion")}>
                Encuesta y agradecimientos
                <ArrowUpRight />
              </Link>
            </Button>
          </>
        }
        description="Cómo salió el día, armado con lo que se registró mientras pasaba: acreditaciones, guion, incidentes y staff."
        meta={
          <>
            <Badge variant="secondary">Terminó</Badge>
            <span className="font-terminal text-meta text-muted-foreground">
              {new Intl.DateTimeFormat("es-UY", { weekday: "short", day: "numeric", month: "short", timeZone: tz })
                .format(new Date(event.startDate))
                .replace(/\./g, "")
                .replace(",", "")}
            </span>
          </>
        }
        title="Informe"
      />

      <Panel className="grid grid-cols-2 divide-border max-lg:divide-y lg:grid-cols-5 lg:divide-x">
        <Kpi label="Asistencia" of={`/ ${report.attending}`} value={report.checkedIn}>
          <p className="mt-2.5 text-meta text-muted-foreground">
            {showUp !== null ? `${showUp}% de los inscriptos` : "Sin datos de Eventbrite"}
          </p>
        </Kpi>
        <Kpi
          label="Atraso del guion"
          value={averageDrift !== null ? `${averageDrift > 0 ? "+" : ""}${averageDrift}′` : "—"}
        >
          <p className="mt-2.5 text-meta text-muted-foreground">
            {worstDrift !== null
              ? `máximo ${worstDrift > 0 ? "+" : ""}${worstDrift} min`
              : "El guion no registró horarios"}
          </p>
        </Kpi>
        <Kpi label="Incidentes" value={report.incidents.total}>
          <p className="mt-2.5 text-meta text-muted-foreground">
            {report.incidents.avgResolveMin !== null
              ? `se resolvieron en ${report.incidents.avgResolveMin} min promedio`
              : "ninguno resuelto"}
          </p>
        </Kpi>
        <Kpi label="Staff" of={`/ ${report.staff.expected}`} value={report.staff.arrived}>
          <p
            className={cn(
              "mt-2.5 text-meta",
              report.staff.noShows ? "text-warning-foreground" : "text-muted-foreground"
            )}
          >
            {report.staff.noShows ? `${report.staff.noShows} ausencias en turnos` : "nadie faltó a su turno"}
          </p>
        </Kpi>
        <Kpi className="max-lg:col-span-2" label="NPS" value={report.survey?.nps ?? "—"}>
          <p className="mt-2.5 text-meta text-muted-foreground">
            {report.survey ? `${report.survey.responses} respuestas a la encuesta` : "Sin encuesta"}
          </p>
        </Kpi>
      </Panel>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Panel>
          <PanelHead icon={Users} meta="cada 10 minutos" title="Llegada de asistentes" />
          <div className="p-4 pt-8">
            {report.arrival.length ? (
              <ColumnChart
                bars={report.arrival.map((bucket) => ({ label: bucket.at, value: bucket.count }))}
                label="Acreditaciones cada 10 minutos"
              />
            ) : (
              <EmptyState compact icon={Users} title="No hubo acreditaciones registradas" />
            )}
          </div>
        </Panel>

        <Panel className="flex flex-col">
          <PanelHead icon={ListVideo} meta="planificado vs. real" title="Guion del día" />
          <div className="max-h-[320px] scrollbar-thin overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Momento</TableHead>
                  <TableHead className="text-right">Plan</TableHead>
                  <TableHead className="text-right">Real</TableHead>
                  <TableHead className="text-right">Desvío</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.drift.map((row) => (
                  <TableRow key={`${row.plannedStart}-${row.title}`}>
                    <TableCell className="max-w-0 truncate max-sm:whitespace-normal">{row.title}</TableCell>
                    <TableCell className="text-right font-terminal text-muted-foreground tabular-nums">
                      {row.plannedStart}
                    </TableCell>
                    <TableCell className="text-right font-terminal tabular-nums">
                      {row.actualStart ? formatClock(new Date(row.actualStart), tz) : "—"}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right font-terminal tabular-nums",
                        row.driftMin === null
                          ? "text-faint"
                          : row.driftMin > 5
                            ? "text-warning-foreground"
                            : "text-subtle"
                      )}
                    >
                      {row.driftMin === null ? "—" : `${row.driftMin > 0 ? "+" : ""}${row.driftMin}′`}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Panel>

        <Panel>
          <PanelHead icon={Siren} meta={`${report.incidents.total} en total`} title="Incidentes por tipo" />
          {report.incidents.byCategory.length ? (
            <ul className="divide-y divide-border">
              {report.incidents.byCategory.map((row) => {
                const category = CATEGORY[row.category] ?? CATEGORY.other;
                return (
                  <li key={row.category} className="flex items-center gap-3 px-4 py-2.5 text-ui">
                    <category.icon aria-hidden className="size-4 text-muted-foreground" />
                    <span className="flex-1">{category.label}</span>
                    <span className="font-terminal text-subtle tabular-nums">{row.count}</span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState compact owy title="Ni un incidente" />
          )}
        </Panel>

        <Panel>
          <PanelHead
            actions={
              <Button disabled={!report.chapters} size="sm" variant="ghost" onClick={copyChapters}>
                <Copy />
                Copiar
              </Button>
            }
            icon={Clapperboard}
            meta="desde los horarios reales del guion"
            title="Capítulos para YouTube"
          />
          {report.chapters ? (
            <pre className="max-h-[260px] scrollbar-thin overflow-auto px-4 py-3 font-terminal text-meta leading-6 whitespace-pre text-subtle">
              {report.chapters}
            </pre>
          ) : (
            <EmptyState
              compact
              icon={Clapperboard}
              title="Sin horarios reales"
              description="Los capítulos salen de los GO del guion del día."
            />
          )}
        </Panel>
      </div>
    </>
  );
}
