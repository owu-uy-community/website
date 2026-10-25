import type { ReactNode } from "react";

import { cardClassName, Section } from "components/community/ui";
import { cn } from "app/lib/utils";
import { getTimelineStats, type TimelineStats } from "lib/timeline/stats";

import { BiggestList, ColumnBars, Heatmap, LazyChart, RankBars } from "./Visuals";

/*
 * "En números": what the history says about when, where, what about and how many. Every headline
 * is computed from the same aggregates the charts draw, so the copy can't drift from the data.
 */

const number = new Intl.NumberFormat("es-UY");
const pct = (part: number, whole: number) => Math.round((part / whole) * 100);
const MONTH_NAMES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "setiembre",
  "octubre",
  "noviembre",
  "diciembre",
];
const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const WEEKDAY_NAMES = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];
/** The boom before the pandemic and the years since the return */
const BOOM = [2014, 2019] as const;
const RETURN = 2022;

/** "15", or "entre 27 y 38" */
const span = (values: number[]) => {
  const min = Math.min(...values);
  const max = Math.max(...values);
  return min === max ? number.format(min) : `entre ${number.format(min)} y ${number.format(max)}`;
};

function Card({
  title,
  headline,
  note,
  children,
  className,
}: {
  title: string;
  headline: ReactNode;
  note?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <article className={cardClassName(false, cn("flex min-w-0 flex-col gap-5 p-5 sm:p-6", className))}>
      <header>
        <h3 className="font-title text-lg font-semibold text-zinc-50">{title}</h3>
        <p className="mt-1.5 max-w-2xl text-[15px] leading-relaxed text-zinc-300">{headline}</p>
      </header>
      {children}
      {note ? <p className="text-xs leading-relaxed text-zinc-400">{note}</p> : null}
    </article>
  );
}

/** The data behind a visual, for screen readers */
function DataTable({ caption, head, rows }: { caption: string; head: string[]; rows: (string | number)[][] }) {
  return (
    <div className="sr-only">
      <table>
        <caption>{caption}</caption>
        <thead>
          <tr>
            {head.map((cell) => (
              <th key={cell} scope="col">
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(([first, ...rest]) => (
            <tr key={first}>
              <th scope="row">{first}</th>
              {rest.map((cell, i) => (
                <td key={i}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Which topic grew most and which shrank most, in share of events, from the boom to the return */
function topicShift(topics: TimelineStats["topics"]) {
  const share = (from: number, to: number) => {
    const rows = topics.rows.filter((row) => row.year >= from && row.year <= to);
    const total = rows.reduce((sum, row) => sum + topics.keys.reduce((s, key) => s + row[key], 0), 0);
    return Object.fromEntries(
      topics.keys.map((key) => [key, (rows.reduce((s, row) => s + row[key], 0) / total) * 100])
    );
  };
  const before = share(BOOM[0], BOOM[1]);
  const after = share(RETURN, Number.POSITIVE_INFINITY);
  const named = topics.keys.filter((key) => key !== "otros" && key !== "general");
  const byChange = named.toSorted((a, b) => after[b] - before[b] - (after[a] - before[a]));
  const [up, down] = [byChange[0], byChange.at(-1)!];
  return { up, down, before, after };
}

export default function StatsSection() {
  const stats = getTimelineStats();
  const total = stats.heatmap.reduce((sum, row) => sum + row.months.reduce((a, b) => a + b, 0), 0);

  // When
  const byMonth = Array.from({ length: 12 }, (_, m) => stats.heatmap.reduce((sum, row) => sum + row.months[m], 0));
  const busiest = byMonth.indexOf(Math.max(...byMonth));
  const quietest = byMonth.indexOf(Math.min(...byMonth));
  const topDay = stats.weekdays.indexOf(Math.max(...stats.weekdays));
  const midweek = stats.weekdays[1] + stats.weekdays[2] + stats.weekdays[3];
  const topHour = stats.hours.reduce((a, b) => (b.count > a.count ? b : a));

  // Where
  const placed = stats.places.reduce((sum, place) => sum + place.count, 0);
  const montevideo = stats.places.find((place) => place.name === "Montevideo")?.count ?? 0;

  // What about
  const shift = topicShift(stats.topics);
  const label = (key: string) => stats.topics.labels[key];

  // Communities: the busiest year, and the lowest after it
  const peak = stats.communities.reduce((a, b) => (b.active > a.active ? b : a));
  const trough = stats.communities
    .filter((row) => row.year > peak.year)
    .reduce((a, b) => (b.active < a.active ? b : a));

  // How many
  const early = stats.attendance.filter((row) => row.year >= BOOM[0] && row.year <= 2016).map((row) => row.median);
  const recent = stats.attendance.filter((row) => row.year >= RETURN).map((row) => row.median);

  return (
    <Section
      className="scroll-mt-36"
      description={
        <>
          Sobre los {number.format(total)} eventos presenciales que organizaron comunidades entre {stats.from} y{" "}
          {stats.to}: cuándo se juntan, dónde, de qué hablan y cuánta gente se anota.
        </>
      }
      eyebrow="En números"
      id="numeros"
      title="Lo que dicen los datos"
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <Card
          className="lg:col-span-2"
          headline={
            <>
              {MONTH_NAMES[busiest][0].toUpperCase() + MONTH_NAMES[busiest].slice(1)} es el mes más movido (
              {number.format(byMonth[busiest])} eventos en total) y {MONTH_NAMES[quietest]} el más tranquilo (
              {number.format(byMonth[quietest])}).
            </>
          }
          title="El calendario de la escena"
        >
          <Heatmap rows={stats.heatmap} />
          <DataTable
            caption="Eventos presenciales de comunidades por mes"
            head={["Año", ...MONTH_NAMES]}
            rows={stats.heatmap.map((row) => [row.year, ...row.months])}
          />
        </Card>

        <Card
          headline={
            <>
              El {WEEKDAY_NAMES[topDay]} es el día: {pct(stats.weekdays[topDay], stats.timed)}% de los eventos con hora,
              y {pct(midweek, stats.timed)}% cae entre martes y jueves. El {pct(topHour.count, stats.timed)}% arranca a
              las {topHour.hour}.
            </>
          }
          note={`Sobre ${number.format(stats.timed)} eventos con hora de inicio publicada, en hora de Montevideo.`}
          title="¿Cuándo se juntan?"
        >
          <div className="grid gap-8 sm:grid-cols-[2fr_3fr]">
            <div>
              <p className="mb-6 text-[13px] text-zinc-400">Día de la semana</p>
              <ColumnBars items={stats.weekdays.map((value, i) => ({ label: WEEKDAYS[i], value }))} />
            </div>
            <div>
              <p className="mb-6 text-[13px] text-zinc-400">Hora de inicio</p>
              <ColumnBars
                items={stats.hours.map(({ hour, count }) => ({ label: `${hour}`, value: count, tick: hour % 2 === 0 }))}
              />
            </div>
          </div>
          <DataTable
            caption="Eventos por día de la semana"
            head={["Día", "Eventos"]}
            rows={stats.weekdays.map((value, i) => [WEEKDAY_NAMES[i], value])}
          />
          <DataTable
            caption="Eventos por hora de inicio"
            head={["Hora", "Eventos"]}
            rows={stats.hours.map(({ hour, count }) => [`${hour} h`, count])}
          />
        </Card>

        <Card
          headline={
            <>
              {stats.venues[0].name} fue sede de {number.format(stats.venues[0].count)} eventos, más que ningún otro
              lugar. El {pct(montevideo, placed)}% fue en Montevideo.
            </>
          }
          note="Los nombres de un mismo lugar se unificaron (por ejemplo, «Oficina de Pyxis» y «Pyxis»)."
          title="¿Dónde?"
        >
          <div className="grid gap-8 sm:grid-cols-[3fr_2fr] lg:grid-cols-1 xl:grid-cols-[3fr_2fr]">
            <div>
              <p className="mb-3 text-[13px] text-zinc-400">Los lugares que más eventos recibieron</p>
              <RankBars items={stats.venues} />
            </div>
            <div>
              <p className="mb-3 text-[13px] text-zinc-400">Por departamento</p>
              <RankBars items={stats.places} />
            </div>
          </div>
        </Card>

        <Card
          className="lg:col-span-2"
          headline={
            <>
              Desde {RETURN}, {label(shift.up)} pasó del {Math.round(shift.before[shift.up])}% al{" "}
              {Math.round(shift.after[shift.up])}% de los eventos; {label(shift.down)}, del{" "}
              {Math.round(shift.before[shift.down])}% al {Math.round(shift.after[shift.down])}%.
            </>
          }
          note={`Por el tema principal de la comunidad que organiza; comparado con ${BOOM[0]}–${BOOM[1]}.`}
          title="¿De qué se habla?"
        >
          <LazyChart height={320} spec={{ kind: "topics", topics: stats.topics }} />
          <DataTable
            caption="Eventos por año según el tema de la comunidad"
            head={["Año", ...stats.topics.keys.map(label)]}
            rows={stats.topics.rows.map((row) => [row.year, ...stats.topics.keys.map((key) => row[key])])}
          />
        </Card>

        <Card
          headline={
            <>
              El pico fue {peak.year}: {number.format(peak.active)} comunidades se juntaron en persona. En {trough.year}
              , {number.format(trough.active)}.
            </>
          }
          note="«Primer evento»: comunidades que arrancaron ese año. «Último evento»: las que ya no se juntan, en el año de su última vez."
          title="Comunidades vivas"
        >
          <LazyChart height={260} spec={{ kind: "communities", rows: stats.communities }} />
          <DataTable
            caption="Comunidades por año"
            head={["Año", "Se juntaron", "Primer evento", "Último evento"]}
            rows={stats.communities.map((row) => [row.year, row.active, row.births, row.closures])}
          />
        </Card>

        <Card
          headline={
            <>
              La mediana de anotados por meetup fue de {span(early)} entre {BOOM[0]} y 2016, y de {span(recent)} desde{" "}
              {RETURN}.
            </>
          }
          note="Anotados en Meetup, no asistentes. La mediana evita que una noche enorme tire el número de todo el año."
          title="¿Cuánta gente?"
        >
          <LazyChart height={260} spec={{ kind: "attendance", rows: stats.attendance }} />
          <DataTable
            caption="Mediana de anotados por meetup"
            head={["Año", "Mediana", "Meetups"]}
            rows={stats.attendance.map((row) => [row.year, row.median, row.meetups])}
          />
        </Card>

        <Card
          className="lg:col-span-2"
          headline="Los diez eventos presenciales de comunidades con más gente."
          note="Personas anotadas en Meetup o asistentes según el sitio de cada evento."
          title="Las más grandes"
        >
          <BiggestList items={stats.biggest} />
        </Card>
      </div>
    </Section>
  );
}
