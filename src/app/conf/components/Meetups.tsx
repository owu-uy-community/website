import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import Link from "next/link";

import { addUtmParams } from "app/lib/utils";

import Reveal from "./Reveal";
import SectionHeader from "./SectionHeader";

type MeetupEvent = {
  id: number;
  name: string;
  title: string;
  datetime: string;
  end_datetime: string;
  event_url: string;
};

type MeetupsProps = {
  events: MeetupEvent[];
};

function EventCard({ title, name, datetime, event_url, index }: MeetupEvent & { index: number }) {
  const date = parseISO(datetime);

  return (
    <li>
      <Reveal amount={0.4} delay={index * 0.09} x={-32} y={0}>
      <Link
        className="group flex items-center gap-5 border-2 border-[#FBF5E7]/15 p-4 transition-colors hover:border-[#F5BB03] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#F5BB03] sm:gap-6 sm:p-5"
        href={addUtmParams(event_url)}
        rel="noopener"
        target="_blank"
      >
        <time
          className="flex h-16 w-16 shrink-0 flex-col items-center justify-center bg-[#F5BB03] text-black"
          dateTime={datetime}
        >
          <span className="font-display text-2xl font-extrabold leading-none">{format(date, "dd")}</span>
          <span className="mt-1 font-display text-xs font-bold uppercase tracking-[0.14em]">
            {format(date, "MMM", { locale: es })}
          </span>
        </time>

        <span className="min-w-0 flex-1">
          <span className="block truncate font-display text-base font-semibold leading-snug text-[#FBF5E7] transition-colors group-hover:text-[#F5BB03] sm:text-lg">
            {title}
          </span>
          <span className="mt-1 block truncate text-sm text-[#FBF5E7]/60">{name}</span>
        </span>

        <span
          aria-hidden="true"
          className="hidden text-xl text-[#FBF5E7]/40 transition-all group-hover:translate-x-1 group-hover:text-[#F5BB03] sm:block"
        >
          →
        </span>
      </Link>
      </Reveal>
    </li>
  );
}

export default function Meetups({ events }: MeetupsProps) {
  return (
    <section className="relative mt-16 w-full scroll-mt-24 pb-[35px] sm:mt-[96px]" id="agenda">
      <div className="mx-auto w-full max-w-[1440px] px-8">
        <SectionHeader
          eyebrow="MEETUPS"
          eyebrowClassName="text-[#F5BB03]"
          title="NOS VEMOS ANTES?"
          titleClassName="text-[#F5BB03]"
        />

        <Reveal delay={0.12} y={22}>
          <p className="mt-6 max-w-[640px] text-pretty text-lg leading-relaxed text-[#FBF5E7]/90">
            Sumate a alguna de las meetups que forman parte de nuestra comunidad, así entrás en clima.
          </p>
        </Reveal>

        <div className="mx-auto mt-10 w-full max-w-[860px]">
          {events.length ? (
            <ol className="flex flex-col gap-4">
              {events.slice(0, 4).map((event, i) => (
                <EventCard key={event.id} {...event} index={i} />
              ))}
            </ol>
          ) : (
            <Reveal y={20}>
              <p className="border-2 border-dashed border-[#FBF5E7]/20 px-6 py-10 text-center text-base text-[#FBF5E7]/60">
                No encontramos eventos próximos, ¡volvé a chequear pronto!
              </p>
            </Reveal>
          )}
        </div>
      </div>
    </section>
  );
}
