import { cacheLife } from "next/cache";
import Link from "next/link";
import { MonitorPlay, PencilRuler, Users } from "lucide-react";

import OpenSpaceMap from "components/Meetups/2024/OpenSpace/Map";
import { INTERNAL_ROUTES } from "app/lib/constants";
import type { Room } from "lib/orpc";
import { publicCaller } from "lib/orpc/server";
import { getEventBySlugs } from "lib/tenant-server";

import { OPEN_SPACE_TIMES, TALKS } from "../talks";
import LiveGrid from "./LiveGrid";
import PreAnswer from "./PreAnswer";
import { buildBoardRooms } from "./board";

/** Last edition's real board (La Meetup III): what a filled grid looks like, before this one exists. */
const EXAMPLE = { communitySlug: "owu", eventSlug: "la-meetup-2025" } as const;

async function exampleBoard() {
  "use cache";
  // A finished board: it doesn't change
  cacheLife("days");

  const resolved = await getEventBySlugs(EXAMPLE.communitySlug, EXAMPLE.eventSlug);
  if (!resolved) return null;
  const [rooms, schedules, tracks] = await Promise.all([
    publicCaller.rooms.getByOpenSpace({ openSpaceId: resolved.event.id }),
    publicCaller.schedules.getByOpenSpace({ openSpaceId: resolved.event.id }),
    publicCaller.tracks.list({ openSpaceId: resolved.event.id }),
  ]);

  return tracks.length > 0 ? { rooms: rooms.filter((room) => room.isActive), schedules, tracks } : null;
}

const AFTERNOON = [
  {
    time: OPEN_SPACE_TIMES.bienvenida.start,
    title: "Bienvenida",
    text: "Quince minutos para entender la tarde: qué es un open space y cómo se participa.",
  },
  {
    time: OPEN_SPACE_TIMES.mercado.start,
    title: "Mercado de ideas",
    text: "Quien tiene un tema lo cuenta al micrófono y cuelga su card en la grilla. Esta página la muestra llenándose.",
  },
  {
    time: OPEN_SPACE_TIMES.sesiones.start,
    title: "Sesiones",
    text: "Cinco espacios a la vez, en bloques de 25 minutos. Acá vas a ver qué hay en cada sala y cuánto le queda.",
  },
  {
    time: OPEN_SPACE_TIMES.coffee.start,
    title: "Coffee y pasillo",
    text: `La conversación sigue afuera. A las ${TALKS[0].start} arrancan las charlas.`,
  },
];

const eyebrow = "font-display text-xs leading-none font-semibold tracking-[0.18em] text-[#FBF5E7]/75 uppercase";

/**
 * conf.owu.uy/openspace before the day: the page is shareable long before the board exists, and
 * a first-timer reading it on a laptop should leave knowing how the afternoon runs, where the
 * spaces are and what a full grid looks like. On the day it turns into the live board by itself.
 */
export default async function BeforeTheBoard({ rooms = [] }: { rooms?: Room[] }) {
  const example = await exampleBoard();

  return (
    <div className="mx-auto w-full max-w-[1440px] px-5 pb-24 sm:px-8">
      <section className="grid items-center gap-8 border-t border-[#FBF5E7]/12 pt-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,560px)] lg:gap-14">
        <div>
          <p className="font-display text-2xl leading-tight font-extrabold tracking-[-0.01em] text-[#F5BB03] uppercase sm:text-3xl">
            El sábado 7 de noviembre, desde las {OPEN_SPACE_TIMES.mercado.start}, esta página es la grilla en vivo
          </p>
          <p className="mt-5 max-w-[620px] text-base leading-relaxed text-pretty text-[#FBF5E7]/85 sm:text-lg">
            El open space no tiene agenda hasta que llegás: las charlas las propone la gente que está en la sala, ese
            mismo día. Mientras se arma la grilla vas a verla llenarse acá, y durante las sesiones, qué se está hablando
            en cada espacio, qué viene después y dónde queda.
          </p>
        </div>
        <figure className="relative">
          <img
            alt="Gente mirando la grilla del open space en una pantalla, en La Meetup III"
            className="aspect-[3/2] w-full object-cover"
            height={1067}
            src="/images/conf/openspace/grilla-pantalla.webp"
            width={1600}
          />
          <figcaption className="mt-2 text-xs text-[#FBF5E7]/65">
            La grilla en las pantallas del venue, en La Meetup III.
          </figcaption>
        </figure>
      </section>

      <section aria-labelledby="tarde-title" className="mt-14">
        <h2 className={eyebrow} id="tarde-title">
          Cómo va a ser la tarde
        </h2>
        <ol className="mt-5 grid gap-px border border-[#FBF5E7]/12 bg-[#FBF5E7]/12 sm:grid-cols-2 lg:grid-cols-4">
          {AFTERNOON.map((step) => (
            <li key={step.title} className="bg-black p-5">
              <p className="font-display text-2xl leading-none font-extrabold text-[#F5BB03] tabular-nums">
                {step.time}
              </p>
              <p className="mt-3 font-display text-base leading-tight font-extrabold tracking-[-0.01em] text-[#FBF5E7] uppercase">
                {step.title}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-[#FBF5E7]/80">{step.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-14 grid gap-8 xl:grid-cols-12 xl:gap-10">
        <div className="xl:col-span-7">
          <h2 className={eyebrow}>Los cinco espacios</h2>
          <div className="mt-5 border border-[#FBF5E7]/12 bg-[#FBF5E7]/[0.02] px-3 py-6 sm:px-6">
            <div className="mx-auto aspect-[1315/654] w-full max-w-[720px]">
              <OpenSpaceMap event={null} />
            </div>
          </div>
          {rooms.length > 0 ? (
            <ul className="grid grid-cols-1 gap-px border-x border-b border-[#FBF5E7]/12 bg-[#FBF5E7]/12 sm:grid-cols-2 sm:[&>li:last-child:nth-child(odd)]:col-span-2">
              {buildBoardRooms(rooms).map((room) => (
                <li key={room.id} className="flex items-center gap-3 bg-black px-4 py-3">
                  <span
                    aria-hidden="true"
                    className="h-2.5 w-2.5 shrink-0 rotate-45"
                    style={{ backgroundColor: room.color }}
                  />
                  <span className="font-display text-xs font-bold tracking-[0.12em] text-[#FBF5E7] uppercase">
                    {room.name}
                  </span>
                  <span className="ml-auto flex items-center gap-3 text-xs text-[#FBF5E7]/70">
                    {room.capacity ? (
                      <span className="inline-flex items-center gap-1">
                        <Users aria-hidden="true" className="h-3.5 w-3.5" /> {room.capacity}
                      </span>
                    ) : null}
                    {room.hasTV ? <MonitorPlay aria-label="Pantalla" className="h-3.5 w-3.5" role="img" /> : null}
                    {room.hasWhiteboard ? (
                      <PencilRuler aria-label="Pizarra" className="h-3.5 w-3.5" role="img" />
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="flex flex-col gap-6 xl:col-span-5">
          <h2 className={eyebrow}>Para llegar con algo</h2>
          <ul className="grid gap-5 text-base leading-relaxed text-[#FBF5E7]/85">
            <li>
              <strong className="font-semibold text-[#FBF5E7]">¿Querés proponer?</strong> No hace falta ser experto ni
              preparar nada: un título que entre en una card y treinta segundos de micrófono. «Quiero aprender X,
              ¿alguien me cuenta?» también vale, y suelen ser de las que mejor funcionan.
            </li>
            <li>
              <strong className="font-semibold text-[#FBF5E7]">¿Solo querés participar?</strong> No tenés que hacer nada
              antes. Entrás a la sesión que te interese, y si no te está sirviendo, te vas a otra: es la ley de los dos
              pies.
            </li>
          </ul>
          <PreAnswer />
          <Link
            className="inline-flex items-center gap-2 self-start bg-[#FBF5E7] px-6 py-3.5 font-display text-sm leading-none font-bold text-black uppercase transition-colors hover:bg-[#F5BB03] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#F5BB03]"
            href={`${INTERNAL_ROUTES.conf.current}#open-space`}
          >
            Cómo funciona un open space <span aria-hidden="true">→</span>
          </Link>
        </div>
      </section>

      {example ? (
        <section aria-labelledby="ejemplo-title" className="mt-16">
          <p className="inline-block bg-[#FBF5E7] px-2 py-1 font-display text-[11px] leading-none font-bold tracking-[0.14em] text-black uppercase">
            Ejemplo
          </p>
          <h2
            className="mt-3 font-display text-xl leading-none font-extrabold tracking-[-0.02em] text-[#FBF5E7] uppercase sm:text-2xl"
            id="ejemplo-title"
          >
            Así se llenó la grilla en La Meetup III
          </h2>
          <p className="mt-2 mb-5 max-w-[640px] text-sm text-[#FBF5E7]/75">
            {example.tracks.length} charlas propuestas por la sala la edición pasada. La de este año se arma el mismo
            día: nadie la conoce todavía.
          </p>
          <div className="opacity-90">
            <LiveGrid
              currentScheduleId={null}
              nextScheduleId={null}
              rooms={buildBoardRooms(example.rooms)}
              schedules={example.schedules}
              tracks={example.tracks}
            />
          </div>
        </section>
      ) : null}
    </div>
  );
}
