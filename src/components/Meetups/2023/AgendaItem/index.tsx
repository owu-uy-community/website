import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";

type AgendaItemProps = {
  title: string;
  startTime: string;
  endTime: string;
  description: string;
};

export default function AgendaItem({ title, startTime, endTime, description }: AgendaItemProps) {
  return (
    <article className="bg-gray relative flex w-full max-w-[800px] cursor-pointer flex-row items-center gap-x-4 rounded-lg border-[1.5px] border-gray-400 px-8 py-4 transition hover:scale-105">
      <span className="flex w-2/6 items-center justify-center text-center text-base font-bold text-white sm:text-xl">
        {format(parseISO(startTime), "HH:mm", { locale: es })} -{" "}
        {format(parseISO(endTime), "HH:mm", {
          locale: es,
        })}
      </span>
      <div className="flex w-full flex-col justify-center">
        <strong className="overflow-hidden text-left text-base leading-tight font-bold break-words text-yellow-400">
          {title}
        </strong>
        <span className="text-sm text-white">{description}</span>
      </div>
    </article>
  );
}
