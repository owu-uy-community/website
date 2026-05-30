import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import Link from "next/link";

import { addUtmParams } from "app/lib/utils";

type EventProps = {
  id: number;
  name: string;
  title: string;
  datetime: string;
  end_datetime: string;
  event_url: string;
};

export default function Event({ name, title, datetime, end_datetime, event_url }: EventProps) {
  return (
    <li className="group w-full min-w-0 sm:max-w-[620px]">
      <Link className="block" href={addUtmParams(event_url)} target="_blank">
        <div className="flex min-w-0 items-center justify-between gap-4 rounded-xl border border-white/10 bg-[#2f3236] p-4 transition duration-200 group-hover:-translate-y-0.5 group-hover:border-yellow-400/40 group-hover:bg-[#36393e]">
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-semibold sm:text-base">{title}</span>
            <span className="truncate text-xs text-zinc-400 sm:text-sm">{name}</span>
          </span>
          <time
            className="hidden shrink-0 flex-col items-center justify-center rounded-lg border border-zinc-600 px-2 py-1.5 text-center capitalize sm:flex sm:min-h-[56px] sm:min-w-[56px]"
            dateTime={datetime}
          >
            <span className="text-xs font-medium uppercase tracking-wide text-yellow-400">
              {format(parseISO(datetime), "MMM", { locale: es })}
            </span>
            <span className="text-lg font-bold leading-none">{format(parseISO(datetime), "dd", { locale: es })}</span>
          </time>
        </div>
      </Link>
    </li>
  );
}
