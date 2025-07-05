import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import Link from "next/link";

import { addUtmParams } from "app/lib/utils";

type HeroProps = {
  title: string;
  subtitle: string;
  date: string;
  location: string;
  locationHref: string;
};

export default function Hero({ title, subtitle, date, location, locationHref }: HeroProps) {
  return (
    <section
      className="relative flex min-h-[calc(100dvh-56px)] w-full flex-1 flex-col items-center justify-center gap-4"
      id="inicio"
    >
      <h1 className="mb-12 -rotate-[10deg] text-center text-6xl font-black uppercase italic leading-none text-primary text-yellow-400 xl:text-[80px]">
        {title}
        <span className="block text-6xl uppercase lg:text-8xl xl:text-9xl">{subtitle}</span>
      </h1>
      <div>
        <h2 className="animate-fadeIn animate-delay-200 text-center text-4xl font-extrabold text-white lg:text-5xl">
          {format(parseISO(date), "dd 'de' MMMM yyyy", {
            locale: es,
          })}
        </h2>
        <Link href={addUtmParams("https://maps.app.goo.gl/PWsJEYZGZdzGkmaRA")} rel="noopener" target="_blank">
          <h3 className="animate-fadeIn animate-delay-200 mt-2 text-center text-lg font-[600] text-white lg:text-lg">
            {location}
          </h3>
        </Link>
      </div>
      <p className="text-md absolute bottom-1 animate-bounce cursor-pointer p-2 font-bold text-white">
        <Link href={addUtmParams(locationHref)}>╲╱</Link>
      </p>
    </section>
  );
}
