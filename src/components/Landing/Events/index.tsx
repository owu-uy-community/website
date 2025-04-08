"use client";

import { SectionKey } from "components/shared/Navbar/navSections";
import { useNavigationContext } from "components/shared/Navbar/navigationProvider";
import Event from "components/Landing/Event";

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
      className="relative flex min-h-[500px] w-full flex-col items-center gap-8 self-center pt-20 text-white"
      id={SectionKey.Events}
    >
      <span className="flex flex-col gap-1">
        <h2 className="text-center text-3xl font-bold sm:text-4xl">Eventos de la comunidad</h2>
        <h3 className="text-center text-zinc-400">¡Listado de próximos eventos!</h3>
      </span>
      {!!events?.length ? (
        <ol className="flex w-full flex-col items-center justify-center gap-4 pb-4">
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
          <img alt="Calendario Triste" className="w-full max-w-[300px]" src="/sad_calendar.svg" />
          <span className="flex flex-col items-center justify-center">
            <h2 className="text-center text-lg font-semibold">¡Lo sentimos!</h2>
            <h3 className="text-center text-lg">No se han encontrado eventos</h3>
          </span>
        </div>
      )}
      <div className="position absolute bottom-1 z-[-1] hidden w-full max-w-[1200px] flex-row items-end justify-between self-center xl:flex">
        <img alt="Ilustración de una mujer" className="max-h-[380px]" src="/girl.svg" />
        <img alt="Ilustración de un hombre" className="max-h-[380px]" src="/man.svg" />
      </div>
    </section>
  );
}
