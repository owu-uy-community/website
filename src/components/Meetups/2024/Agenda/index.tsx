"use client";

import { FaMapMarkerAlt } from "react-icons/fa";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";

import { Avatar, AvatarImage } from "components/shared/ui/avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "components/shared/ui/tooltip";

type AgendaProps = {
  title?: string;
  subtitle?: string;
  lastUpdate?: string;
  agenda?: readonly {
    readonly id: number;
    readonly title: string;
    readonly description: string;
    readonly startTime: string;
    readonly endTime: string;
    readonly presenter?: {
      readonly firstname: string;
      readonly lastname?: string;
      readonly picture?: {
        readonly url: string;
      };
    };
    readonly location?: {
      readonly name: string;
    };
    readonly attendees?: readonly {
      readonly name: string;
      readonly image: string;
    }[];
  }[];
};

export default function Agenda({ lastUpdate, agenda }: AgendaProps) {
  return (
    <div className="flex w-full max-w-[1200px] flex-col items-center gap-5">
      <span>
        <h2 className="text-center text-5xl font-bold text-yellow-400">Agenda</h2>
        <p className="mt-2 text-center text-lg font-[400] text-white">
          ¡Conocé el cronograma de actividades y charlas!
        </p>
        {lastUpdate ? (
          <p className="mt-2 text-center text-xs text-gray-400">
            Última actualización: {format(parseISO(lastUpdate), "dd/MM/yyyy HH:mm:ss", { locale: es })}
          </p>
        ) : null}
      </span>
      <div className="flex w-full flex-row justify-center gap-5">
        <div className="w-full max-w-[1200px] text-white">
          <div className="flex min-h-[35px] flex-col gap-4">
            {agenda?.map(({ id, startTime, endTime, presenter, title, location, description }) => (
              <div
                key={id}
                className="flex w-full flex-row items-center justify-between gap-3 rounded-lg border-[1.5px] border-gray-400 px-4 py-5 text-sm md:px-8 md:text-lg"
              >
                <div className="flex flex-row items-center justify-between gap-3">
                  <span className="min-w-[6rem] text-yellow-400 sm:min-w-[7.5rem] md:mr-3">
                    {format(parseISO(startTime), "HH:mm", { locale: es })} - {format(parseISO(endTime), "HH:mm", { locale: es })}
                  </span>
                  {presenter ? (
                    <TooltipProvider delayDuration={0}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="flex flex-row items-center gap-2">
                            <Avatar>
                              <AvatarImage src={presenter.picture?.url ?? "/carpincho.png"} />
                            </Avatar>
                          </span>
                        </TooltipTrigger>
                        <TooltipContent className="mb-1 border-[1.5px] border-gray-400">
                          <p>{`${presenter.firstname} ${presenter.lastname ?? ""}`}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  ) : null}
                  <span className="flex flex-col gap-0.5">
                    <span className="text-left text-xs sm:text-sm lg:text-base">{title}</span>
                    <span className="text-left text-xs text-gray-400 sm:text-sm">{description}</span>
                  </span>
                </div>
                <span className="flex h-[30px] flex-row flex-wrap gap-4 md:h-[35px]">
                  <TooltipProvider delayDuration={0}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="hidden min-w-[150px] flex-row items-center justify-center gap-1 rounded-md bg-blue-600 px-5 text-center text-sm font-semibold lg:flex">
                          <FaMapMarkerAlt className="text-xs" /> {location?.name}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent className="mb-1 border-[1.5px] border-gray-400">
                        <p>Ubicación: {location?.name}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
