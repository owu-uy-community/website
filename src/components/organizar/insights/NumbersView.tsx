"use client";

import type { ReactNode } from "react";
import { CalendarDays, ChartColumn, Mic, Repeat } from "lucide-react";

import { ColumnChart } from "components/Admin/ui/charts";
import { Meter, MicroLabel, Panel, PanelHead } from "components/Admin/ui/page";
import { EmptyState } from "components/Admin/ui/states";
import { shortWhen } from "lib/community/time";
import { plural } from "lib/organizar/words";
import type { Insights, OwuInsights } from "lib/orpc/insights/schemas";

type Numbers = OwuInsights["owu"] & { organizers?: Insights["organizers"] };

/** One number with what it counts: "2 de 3", its line, a meter when it's a part of a whole. */
function Tile({
  label,
  value,
  hint,
  part,
}: {
  label: string;
  value: ReactNode;
  hint: string;
  part?: { value: number; of: number; label: string };
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5 rounded-lg border border-border bg-card p-3.5 shadow-edge">
      <MicroLabel>{label}</MicroLabel>
      <p className="font-display text-[22px] leading-7 font-semibold text-foreground tabular-nums">{value}</p>
      {part ? <Meter label={part.label} max={Math.max(1, part.of)} value={part.value} /> : null}
      <p className="text-meta text-muted-foreground">{hint}</p>
    </div>
  );
}

/**
 * A community's numbers (or OWU's): when it last met, whether newcomers come back, how many came
 * to each event and who gave talks. Every rate shows its counts; never a person.
 */
export function NumbersView({ numbers, empty }: { numbers: Numbers; empty?: ReactNode }) {
  if (numbers.events.length === 0) {
    return (
      empty ?? (
        <EmptyState
          description="Cuando pase el primer evento, acá ves cuántos vinieron, cuántos eran nuevos y cuántos vuelven."
          icon={ChartColumn}
          title="Todavía no hay números"
        />
      )
    );
  }
  const { secondVisit, returning, showRate, speakers } = numbers;
  const quarterTotal = numbers.quarters.reduce((sum, quarter) => sum + quarter.events, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile
          hint={numbers.lastEventAt ? shortWhen(numbers.lastEventAt) : "Todavía ninguno"}
          label="Último evento"
          value={
            numbers.daysSinceLastEvent === null ? "—" : `Hace ${plural(numbers.daysSinceLastEvent, "día", "días")}`
          }
        />
        <Tile
          hint="personas nuevas en 6 meses volvieron a otro evento"
          label="Segunda visita"
          part={{ value: secondVisit.returned, of: secondVisit.firstTimers, label: "Segunda visita" }}
          value={`${secondVisit.returned} de ${secondVisit.firstTimers}`}
        />
        <Tile
          hint="de quienes vinieron en 6 meses ya habían venido antes"
          label="Vuelven"
          part={{ value: returning.before, of: returning.people, label: "Vuelven" }}
          value={`${returning.before} de ${returning.people}`}
        />
        {numbers.organizers ? (
          <Tile
            hint="del equipo usaron el panel en 90 días"
            label="Organizan"
            part={{ value: numbers.organizers.active, of: numbers.organizers.total, label: "Organizan" }}
            value={`${numbers.organizers.active} de ${numbers.organizers.total}`}
          />
        ) : (
          <Tile hint="personas siguen a alguna comunidad" label="Seguidores" value={numbers.followers} />
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <Panel>
          <PanelHead icon={CalendarDays} meta={plural(quarterTotal, "evento", "eventos")} title="Por trimestre" />
          <div className="p-3.5">
            <ColumnChart
              bars={numbers.quarters.map((quarter) => ({ label: quarter.label, value: quarter.events }))}
              height={120}
              label="Eventos que pasaron, por trimestre"
            />
            <p className="mt-3 text-meta text-muted-foreground">Los que ya pasaron, en los últimos 2 años.</p>
          </div>
        </Panel>

        <Panel>
          <PanelHead
            icon={Repeat}
            meta={plural(numbers.events.length, "evento", "eventos")}
            title="Los últimos eventos"
          />
          <p className="border-b border-border px-3.5 py-2.5 text-meta text-muted-foreground">
            {showRate.events > 0
              ? `En ${plural(showRate.events, "evento", "eventos")} con puerta entraron ${showRate.came} de ${showRate.seated} anotados.`
              : "Ninguno usó la puerta: sin ella no sabemos quiénes vinieron, contamos a quienes tenían lugar."}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-ui">
              <thead className="text-meta text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="px-3.5 py-2 font-medium" scope="col">
                    Evento
                  </th>
                  <th className="px-3.5 py-2 font-medium" scope="col">
                    Entraron
                  </th>
                  <th className="px-3.5 py-2 font-medium" scope="col">
                    Primera vez
                  </th>
                  <th className="px-3.5 py-2 font-medium" scope="col">
                    Encuesta
                  </th>
                </tr>
              </thead>
              <tbody>
                {numbers.events.map((event) => (
                  <tr key={event.id} className="border-b border-border last:border-0">
                    <th className="max-w-56 px-3.5 py-2.5 font-normal" scope="row">
                      <span className="block truncate text-foreground">{event.name}</span>
                      <span className="block font-terminal text-meta text-muted-foreground tabular-nums">
                        {shortWhen(event.startDate)}
                      </span>
                    </th>
                    <td className="min-w-36 px-3.5 py-2.5 tabular-nums">
                      {event.came === null ? (
                        <span className="text-muted-foreground">{`${event.seated} anotados · sin puerta`}</span>
                      ) : (
                        <>
                          <span>{`${event.came} de ${event.seated}`}</span>
                          <Meter
                            className="mt-1.5"
                            label={`Entraron, ${event.name}`}
                            max={Math.max(1, event.seated)}
                            tone="success"
                            value={event.came}
                          />
                        </>
                      )}
                    </td>
                    <td className="px-3.5 py-2.5 tabular-nums">{`${event.firstTimers.part} de ${event.firstTimers.of}`}</td>
                    <td className="px-3.5 py-2.5 text-muted-foreground tabular-nums">
                      {event.nps === null
                        ? "—"
                        : `NPS ${event.nps} · ${plural(event.responses, "respuesta", "respuestas")}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>

      <Panel>
        <PanelHead icon={Mic} meta="12 meses" title="Charlas" />
        <p className="px-3.5 py-3 text-ui text-foreground">
          {speakers.speakers === 0
            ? "Ningún evento con charlas cargadas en el último año."
            : `${plural(speakers.speakers, "persona dio", "personas dieron")} charlas: ${speakers.new} por primera vez y ${speakers.repeat} que repiten.`}
        </p>
      </Panel>
    </div>
  );
}
