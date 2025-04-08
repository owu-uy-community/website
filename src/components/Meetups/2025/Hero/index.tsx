"use client";

import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import Link from "next/link";
import { FaCalendarAlt, FaMapMarkerAlt } from "react-icons/fa";
import { FaHeart } from "react-icons/fa6";

import TicketHome from "components/Meetups/2024/TicketHome";

type HeroProps = {
  sponsors?: readonly {
    readonly name: string;
    readonly image: string;
    readonly website?: string;
  }[];
};

export default function Hero({ sponsors }: HeroProps) {
  return (
    <section
      className="relative flex min-h-[calc(100dvh-300px)] w-full flex-1 flex-col items-center justify-center"
      id="inicio"
    >
      <div className="flex w-full flex-row flex-wrap-reverse items-center justify-center gap-8 xl:flex-nowrap">
        <div className="flex min-h-[calc(100dvh-56px)] w-full max-w-[650px] flex-col items-center justify-center lg:min-h-[calc(100dvh-165px)]">
          <h1 className="mb-12 text-center text-7xl font-black uppercase italic leading-none text-primary text-yellow-400 xl:mb-2 xl:text-[80px]">
            LA
            <span className="block text-7xl uppercase lg:text-8xl xl:text-9xl">MEETUP</span>
          </h1>
          <div className="flex w-full flex-col gap-2">
            <span className="flex w-full flex-col items-center justify-center">
              <h2 className="animate-fadeIn animate-delay-200 text-center text-3xl font-extrabold text-white md:text-4xl lg:text-5xl">
                {format(parseISO(new Date("2025-11-01 00:00:00").toISOString()), "d 'de' MMMM yyyy", {
                  locale: es,
                })}
              </h2>
              <Link href="https://maps.app.goo.gl/PWsJEYZGZdzGkmaRA" rel="noopener" target="_blank">
                <h3 className="animate-fadeIn animate-delay-200 md:underline-transition mt-2 flex w-fit flex-row items-center justify-center pb-2 text-center text-sm font-[600] text-white transition-all duration-300 ease-in-out motion-reduce:transition-none lg:text-lg">
                  <FaMapMarkerAlt className="mr-2 hidden md:inline-block" />
                  Sinergia Faro, Víctor Soliño 349, Montevideo
                </h3>
              </Link>
            </span>

            <span className="flex-column flex w-full flex-wrap items-center justify-center gap-x-8 gap-y-4">
              <Link className="hidden xl:block" href="/la-meetup/interes">
                <TicketHome sponsors={sponsors} />
              </Link>
              <Link
                className="inline-flex w-full max-w-[280px] skew-x-[-21deg] cursor-pointer items-center justify-center border-2 border-white px-5 py-2.5 text-base font-semibold uppercase text-white ease-in before:absolute before:-inset-0.5 before:origin-right before:scale-x-0 before:bg-white hover:scale-110 hover:text-black hover:before:origin-left hover:before:scale-x-100 aria-disabled:pointer-events-none aria-disabled:border-[#666] aria-disabled:bg-[#666] aria-disabled:text-[#111] motion-safe:transition-[color,transform] motion-safe:before:transition-transform motion-safe:before:duration-300 motion-safe:before:ease-in motion-safe:hover:delay-100 motion-safe:hover:ease-out motion-safe:hover:before:delay-100 motion-safe:hover:before:ease-out"
                href="https://calendar.google.com/calendar/render?action=TEMPLATE&dates=20251101%2F20251102&details=Tercera%20edici%C3%B3n%20de%20La%20Meetup%2C%20el%20encuentro%20anual%20que%20re%C3%BAne%20a%20las%20comunidades%20tecnol%C3%B3gicas%20de%20Uruguay%20para%20estrechar%20lazos%2C%20colaborar%20e%20impulsar%20la%20cultura%20del%20software.%0A%0A-%20Ma%C3%B1ana%20%28Open%E2%80%AFSpace%29%3A%20los%20asistentes%20proponen%20y%20facilitan%20sesiones%20sobre%20tecnolog%C3%ADa%20y%20experiencias%20de%20desarrollo.%0A-%20Tarde%3A%203%20charlas%20curadas%20%28%7E40%E2%80%AFmin%20c%2Fu%29%20por%20speakers%20seleccionados.%0A-%20Networking%20y%20espacio%20com%C3%BAn%20durante%20todo%20el%20d%C3%ADa.%0A-%20Catering%20incluido%20%28caf%C3%A9%2C%20bebidas%2C%20snacks%29%20y%20descuentos%20en%20restaurantes%20cercanos%20para%20el%20almuerzo.%0A%0AEntrada%20gratuita%20con%20inscripci%C3%B3n%20previa.%0AM%C3%A1s%20informaci%C3%B3n%20y%20registro%3A%20https%3A%2F%2Fwww.owu.uy%2Fla-meetup&location=Sinergia%20Faro%2C%20V%C3%ADctor%20Soli%C3%B1o%20349%2C%2011300%20Montevideo%2C%20Departamento%20de%20Montevideo%2C%20Uruguay&text=La%20Meetup%202025%20%7C%20OWU%20Uruguay"
                target="_blank"
              >
                <span className="inline-flex skew-x-[21deg] items-center justify-center text-center">
                  <FaCalendarAlt className="mr-1.5 inline-block" />
                  AGREGAR AL CALENDARIO
                </span>
              </Link>
              <Link
                className="inline-flex w-full max-w-[280px] skew-x-[-21deg] cursor-pointer items-center justify-center border-2 border-white px-5 py-2.5 text-base font-semibold uppercase text-white ease-in before:absolute before:-inset-0.5 before:origin-right before:scale-x-0 before:bg-white hover:scale-110 hover:text-black hover:before:origin-left hover:before:scale-x-100 aria-disabled:pointer-events-none aria-disabled:border-[#666] aria-disabled:bg-[#666] aria-disabled:text-[#111] motion-safe:transition-[color,transform] motion-safe:before:transition-transform motion-safe:before:duration-300 motion-safe:before:ease-in motion-safe:hover:delay-100 motion-safe:hover:ease-out motion-safe:hover:before:delay-100 motion-safe:hover:before:ease-out"
                href="/la-meetup/sponsors"
              >
                <span className="inline-flex skew-x-[21deg] items-center justify-center text-center">
                  <FaHeart className="mr-1.5 inline-block text-base" />
                  ¡QUIERO SER SPONSOR!
                </span>
              </Link>
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
