import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import Link from "next/link";
import { FaMapMarkerAlt } from "react-icons/fa";
import { FaBullhorn, FaTicket } from "react-icons/fa6";

import TicketHome from "components/Meetups/2024/TicketHome";
import classNames from "classnames";

type HeroProps = {
  sponsors?: readonly {
    readonly name: string;
    readonly image: string;
    readonly website?: string;
  }[];
};

export default function Hero({ sponsors }: HeroProps) {
  // Check if current date is past the deadline (July 31, 2025)
  const now = new Date();
  const deadline = new Date("2025-07-31T23:59:59"); // TODO: Move to a constant

  return (
    <section
      className={classNames("relative flex w-full flex-1 flex-col items-center justify-center", {
        "min-h-[calc(100dvh-126px)]": now < deadline,
        "min-h-[calc(100dvh-56px)]": now >= deadline,
      })}
      id="inicio"
    >
      <div className="flex w-full flex-row flex-wrap-reverse items-center justify-center gap-8 xl:flex-nowrap">
        <div className="flex w-full max-w-[650px] flex-col items-center justify-center lg:min-h-[calc(100dvh-165px)]">
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
                href="/la-meetup/interes"
              >
                <span className="inline-flex skew-x-[21deg] items-center justify-center text-center">
                  <FaTicket className="mr-1.5 inline-block" />
                  ¡ME INTERESA!
                </span>
              </Link>
              <Link
                className="inline-flex w-full max-w-[280px] skew-x-[-21deg] cursor-pointer items-center justify-center border-2 border-white px-5 py-2.5 text-base font-semibold uppercase text-white ease-in before:absolute before:-inset-0.5 before:origin-right before:scale-x-0 before:bg-white hover:scale-110 hover:text-black hover:before:origin-left hover:before:scale-x-100 aria-disabled:pointer-events-none aria-disabled:border-[#666] aria-disabled:bg-[#666] aria-disabled:text-[#111] motion-safe:transition-[color,transform] motion-safe:before:transition-transform motion-safe:before:duration-300 motion-safe:before:ease-in motion-safe:hover:delay-100 motion-safe:hover:ease-out motion-safe:hover:before:delay-100 motion-safe:hover:before:ease-out"
                href="/la-meetup/sponsors"
              >
                <span className="inline-flex skew-x-[21deg] items-center justify-center text-center">
                  <FaBullhorn className="mr-1.5 inline-block text-base" />
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
