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
    <li className="group flex w-full min-w-0 cursor-pointer gap-3 rounded-md bg-white/10 text-xs text-white sm:max-w-[550px] sm:text-base">
      <Link className="w-full" href={addUtmParams(event_url)} target="_blank">
        <div className="flex min-w-0 flex-1 flex-col justify-between gap-3 rounded-md bg-[#36393e] p-4 group-hover:bg-[#000214]/10">
          <span className="flex flex-row items-center justify-between">
            <span className="flex flex-col truncate">
              <span className="truncate">{title}</span>
              <span className="truncate text-xs text-zinc-400">{name}</span>
            </span>
            <p>
              <time
                className="hidden flex-col items-center justify-center rounded-xl border border-zinc-400 text-center text-xs capitalize sm:flex sm:min-h-[55px] sm:min-w-[55px] sm:text-sm"
                dateTime={datetime}
              >
                {format(parseISO(datetime), "MMM", { locale: es })}
                <br />
                {format(parseISO(datetime), "dd", {
                  locale: es,
                })}
              </time>
            </p>
          </span>
        </div>
      </Link>
    </li>
  );
}
