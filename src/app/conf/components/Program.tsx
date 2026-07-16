"use client";

import classNames from "classnames";
import { m } from "motion/react";
import { useState } from "react";

import OrigamiIcon, { type OrigamiIconName } from "./OrigamiIcons";
import Reveal, { EASE_OUT } from "./Reveal";
import SectionHeader from "./SectionHeader";

type Session = {
  time: string;
  title: string;
  description: string;
  icon: OrigamiIconName;
};

const SESSIONS: Session[] = [
  {
    time: "09:00",
    title: "Acreditación y desayuno",
    description:
      "Llegada, registro y entrega de credenciales. Café, té y algo rico para arrancar el día con buena energía, romper el hielo y prepararte para la jornada.",
    icon: "teacup",
  },
  {
    time: "10:00",
    title: "Apertura",
    description:
      "Bienvenida oficial a la primera edición de OWU CONF: cómo funciona la jornada y por qué esta conferencia es de la comunidad.",
    icon: "wave",
  },
  {
    time: "10:15",
    title: "Open Space · Mercado de Ideas",
    description:
      "El facilitador explica la mecánica del espacio y cada asistente puede proponer temas, que se organizan en un tablero de anuncios. La agenda de la mañana la construye la comunidad.",
    icon: "bulb",
  },
  {
    time: "10:45",
    title: "Open Space · Sesiones de discusión",
    description:
      "Conversaciones autogestionadas en múltiples espacios en simultáneo. Desde tecnología hasta desarrollo profesional: vos elegís.",
    icon: "chat",
  },
  {
    time: "13:30",
    title: "Almuerzo",
    description:
      "El almuerzo no está incluido: podés traer tu propia comida o aprovechar las opciones cercanas a Sinergia Faro. Excelente ocasión para seguir conversando y hacer networking.",
    icon: "pizza",
  },
  {
    time: "15:00",
    title: "Bloque de charlas",
    description:
      "Historias de tecnología, comunidad y open source contadas por gente de la comunidad. La grilla de speakers se anuncia pronto.",
    icon: "mic",
  },
  {
    time: "16:30",
    title: "Pausa para el café",
    description:
      "Recargá energías con café, té y snacks. Momento ideal para reflexionar sobre las charlas y seguir haciendo networking antes del cierre.",
    icon: "coffee",
  },
  {
    time: "17:00",
    title: "Bloque de charlas",
    description:
      "Última tanda de charlas para cerrar la jornada a pura tecnología. ¿Tenés algo para contar? Postulá tu charla en el call for speakers.",
    icon: "mic",
  },
  {
    time: "18:00",
    title: "Cierre y agradecimientos",
    description: "Agradecimientos a speakers, sponsors y colaboradores que hacen posible OWU CONF.",
    icon: "heart",
  },
  {
    time: "18:30",
    title: "After",
    description: "Seguimos en un ambiente relajado, ideal para profundizar las conexiones generadas durante el día.",
    icon: "beer",
  },
];

export default function Program() {
  const [openSession, setOpenSession] = useState(0);

  return (
    <section className="w-full scroll-mt-24 bg-[#0162C8]" id="programa">
      <div className="mx-auto w-full max-w-[1440px] px-8 pb-16 pt-[37px]">
        <SectionHeader eyebrow="PROGRAMA" eyebrowClassName="text-white" title="PROGRAMACIÓN" />

        <Reveal delay={0.15} y={20}>
          <p className="mt-6 max-w-[620px] text-base leading-relaxed text-white/80 min-[1440px]:text-lg">
            Programa tentativo de la primera OWU CONF, en una sola jornada: open space por la mañana y charlas por la
            tarde. La grilla definitiva se anuncia junto a los speakers.
          </p>
        </Reveal>

        <ol className="mt-8 border-t border-white/20">
          {SESSIONS.map(({ time, title, description, icon }, i) => {
            const isOpen = openSession === i;

            return (
              <m.li
                key={`${time}-${title}`}
                className="border-b border-white/20"
                initial={{ opacity: 0, x: -40 }}
                transition={{ duration: 0.55, delay: (i % SESSIONS.length) * 0.05, ease: EASE_OUT }}
                viewport={{ amount: 0.4, once: true }}
                whileInView={{ opacity: 1, x: 0 }}
              >
                <button
                  aria-expanded={isOpen}
                  className="group grid w-full grid-cols-[40px_56px_1fr_14px] items-center gap-4 py-5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-[#F5BB03] sm:grid-cols-[44px_72px_1fr_16px] sm:gap-6 min-[1440px]:grid-cols-[48px_88px_1fr_16px]"
                  type="button"
                  onClick={() => setOpenSession(isOpen ? -1 : i)}
                >
                  <OrigamiIcon
                    className={classNames(
                      "h-[40px] w-[40px] transition-transform duration-300 sm:h-[44px] sm:w-[44px] min-[1440px]:h-[48px] min-[1440px]:w-[48px]",
                      isOpen ? "scale-110" : "group-hover:-translate-y-1"
                    )}
                    name={icon}
                  />
                  <span className="font-display text-lg font-bold leading-none tabular-nums text-[#F5BB03] min-[1440px]:text-xl">
                    {time}
                  </span>
                  <span
                    className={classNames(
                      "text-lg font-medium leading-snug tracking-[-0.01em] transition-colors sm:text-xl min-[1440px]:text-2xl",
                      isOpen ? "text-[#F5BB03]" : "text-white group-hover:text-[#F5BB03]"
                    )}
                  >
                    {title}
                  </span>
                  <svg
                    aria-hidden="true"
                    className={classNames(
                      "h-[16px] w-[10px] transition-transform duration-300",
                      isOpen && "-rotate-90"
                    )}
                    fill="none"
                    viewBox="0 0 10 16"
                  >
                    <polygon fill="#F5BB03" points="10,0 10,16 0,8" />
                  </svg>
                </button>

                <div
                  className={classNames(
                    "grid transition-[grid-template-rows] duration-300 ease-out",
                    isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                  )}
                >
                  <div className="overflow-hidden">
                    <p className="max-w-[720px] pb-7 pl-[56px] pr-4 text-base leading-7 text-white/90 sm:pl-[164px] min-[1440px]:pl-[184px]">
                      {description}
                    </p>
                  </div>
                </div>
              </m.li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
