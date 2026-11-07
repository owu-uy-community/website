"use client";

import { m } from "motion/react";

import { cn } from "app/lib/utils";

/*
 * Events per year in plain HTML; the bars grow into view. One validated hue for event marks
 * (#b8860b on the ink surface, dataviz palette check), online told apart by
 * texture, never by color alone.
 */

export type YearCount = { year: number; inPerson: number; online: number };

const MARK = "#b8860b";
const HATCH = `repeating-linear-gradient(135deg, ${MARK} 0 2px, transparent 2px 5px)`;

export function YearBars({ years }: { years: YearCount[] }) {
  const max = Math.max(...years.map((y) => y.inPerson + y.online));
  const to = years.at(-1)?.year ?? 0;

  return (
    <figure>
      {/* A picture of the numbers (the table below says them); the year jumps live in the page nav and the archive */}
      <div aria-hidden className="flex h-44 items-end gap-[2px] sm:h-52">
        {years.map(({ year, inPerson, online }) => (
          <m.div
            key={year}
            className="group flex h-full flex-1 origin-bottom flex-col justify-end"
            initial={{ scaleY: 0 }}
            transition={{ delay: (year - years[0].year) * 0.03, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            viewport={{ once: true, amount: "some" }}
            whileInView={{ scaleY: 1 }}
            title={`${year}: ${inPerson} presenciales${online ? `, ${online} online` : ""}`}
          >
            {online ? (
              <span
                className="block rounded-t-[4px] opacity-80 transition-opacity group-hover:opacity-100"
                style={{ height: `${(online / max) * 100}%`, backgroundImage: HATCH }}
              />
            ) : null}
            {/* 2px surface gap between the stacked segments */}
            {inPerson ? (
              <span
                className={cn(
                  "block opacity-85 transition-opacity group-hover:opacity-100",
                  online ? "mt-[2px]" : "rounded-t-[4px]"
                )}
                style={{ height: `${(inPerson / max) * 100}%`, background: MARK }}
              />
            ) : null}
          </m.div>
        ))}
      </div>
      <div aria-hidden className="mt-2 flex gap-[2px] font-terminal text-[10px] text-zinc-400 tabular-nums">
        {years.map(({ year }) => (
          <span key={year} className="flex-1 text-center">
            {year % 2 === 0 || year === to ? `'${String(year).slice(2)}` : ""}
          </span>
        ))}
      </div>
      <figcaption className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-zinc-400">
        <span className="inline-flex items-center gap-2">
          <span className="size-3 rounded-[3px]" style={{ background: MARK }} /> Presenciales
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="size-3 rounded-[3px]" style={{ backgroundImage: HATCH }} /> Online
        </span>
        <span className="text-zinc-400">Eventos por año, solo los que organizan comunidades.</span>
      </figcaption>
      <div className="sr-only">
        <table>
          <caption>Eventos de comunidades por año</caption>
          <thead>
            <tr>
              <th scope="col">Año</th>
              <th scope="col">Presenciales</th>
              <th scope="col">Online</th>
            </tr>
          </thead>
          <tbody>
            {years.map(({ year, inPerson, online }) => (
              <tr key={year}>
                <th scope="row">{year}</th>
                <td>{inPerson}</td>
                <td>{online}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
