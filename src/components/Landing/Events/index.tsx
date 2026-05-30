"use client";

import { SectionKey } from "components/shared/Navbar/navSections";
import { useNavigationContext } from "components/shared/Navbar/navigationProvider";
import Event from "components/Landing/Event";
import SectionHeading from "components/Landing/SectionHeading";

type Event = {
  id: number;
  name: string;
  title: string;
  datetime: string;
  end_datetime: string;
  event_url: string;
};

type EventsProps = {
  events?: Event[];
};

export default function Events({ events }: EventsProps) {
  const { sectionsRefs } = useNavigationContext();

  return (
    <section
      ref={sectionsRefs[SectionKey.Events]}
      className="relative flex min-h-[500px] w-full flex-col items-center gap-12 self-center pb-12 pt-24 text-white sm:pt-28 lg:pt-32"
      id={SectionKey.Events}
    >
      <SectionHeading subtitle="¡Listado de próximos eventos!" title="Eventos de la comunidad" />
      {!!events?.length ? (
        <ol className="flex w-full flex-col items-center justify-center gap-3">
          {events.map(({ id, name, title, datetime, end_datetime, event_url }) => (
            <Event
              key={id}
              datetime={datetime}
              end_datetime={end_datetime}
              event_url={event_url}
              id={id}
              name={name}
              title={title}
            />
          ))}
        </ol>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-5">
          <img alt="Calendario Triste" className="w-full max-w-[300px]" src="/icons/sad_calendar.svg" />
          <span className="flex flex-col items-center justify-center">
            <h2 className="text-center text-lg font-semibold">¡Lo sentimos!</h2>
            <h3 className="text-center text-lg">No se han encontrado eventos</h3>
          </span>
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 z-[-1] mx-auto hidden w-full max-w-[1200px] flex-row items-end justify-between xl:flex">
        <img alt="Ilustración de una mujer" className="block max-h-[380px]" src="/icons/girl.svg" />
        <img alt="Ilustración de un hombre" className="block max-h-[380px]" src="/icons/man.svg" />
      </div>
    </section>
  );
}
