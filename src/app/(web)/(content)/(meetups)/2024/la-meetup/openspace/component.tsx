/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unnecessary-condition */
"use client";

import { useEffect, useState } from "react";

import OpenSpaceMap from "components/Meetups/2024/OpenSpace/Map";
import Footer from "components/shared/Footer";
import OpenSpaceAgenda from "components/Meetups/2024/OpenSpaceAgenda";

export default function OpenSpaceClient({ initialEpg }: { initialEpg: any[] }) {
  const [event, setEvent] = useState<{ name?: string; location?: string }>({
    name: undefined,
    location: undefined,
  });

  useEffect(() => {
    if (!!event.name || !!event.location) window.scrollTo({ top: 0, behavior: "smooth" });
  }, [event]);

  return (
    <div className="container flex w-full flex-col items-center justify-center gap-5 self-center">
      <div className="flex w-full max-w-[100vw] flex-row flex-wrap items-center justify-between gap-8 pb-8 md:flex-nowrap md:pb-0 md:pt-8">
        <div className="flex w-full max-w-[500px] flex-col gap-3">
          <h1 className="text-left text-3xl font-semibold text-white">Open Space</h1>
          <div className="flex flex-col gap-1.5 text-sm text-white">
            <p className="text-lg font-bold text-yellow-400">¿Qué es?</p>
            Es un formato de conferencia abierta donde la agenda se crea dinámicamente entre todos los participantes.
            ¡Tú decides los temas a tratar!
            <br />
            <br />
            <p className="text-lg font-bold text-yellow-400">¿En que consiste?</p>
            <ul className="list-disc space-y-2 pl-6">
              <li>
                <b>Apertura</b>: El facilitador explica la dinámica del Open Space. ¡La agenda comienza vacía!
              </li>
              <li>
                <b>Mercado de ideas</b>: Los participantes proponen temas en hasta 2 minutos, compartiendo lo que desean
                discutir o aprender. Al final, se eligen los temas de interés y se crea la agenda de la jornada.
              </li>
              <li>
                <b>Sesiones</b>: Se realizan las sesiones según los temas seleccionados.
              </li>
              <li>
                <b>Clausura</b>: Se agradece a los participantes y se cierra la actividad.
              </li>
            </ul>
          </div>
        </div>
        <span className="relative w-full">
          <OpenSpaceMap event={event} />
          <p className="absolute -bottom-10 w-full text-center text-[11px] text-gray-400 md:text-right md:text-xs">
            ¡Haz click en una de las temáticas para ver el lugar en el mapa!
          </p>
        </span>
      </div>
      <div className="mb-5 flex w-full flex-col gap-2">
        <h2 className="w-full text-left text-xl font-bold text-yellow-400 sm:text-2xl">Agenda de sesiones:</h2>
        <OpenSpaceAgenda isApp event={event} initialEpg={initialEpg} setEvent={setEvent} />
      </div>
      <Footer />
    </div>
  );
}
