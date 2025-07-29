"use client";

import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { Clock, Coffee, Mic, MessageCircle, PartyPopper, Beer } from "lucide-react";
import { useState } from "react";

import { Avatar, AvatarImage } from "components/shared/ui/avatar";
import ReactMarkdown from "react-markdown";

type AgendaProps = {
  title?: string;
  subtitle?: string;
  lastUpdate?: string;
  agenda?: readonly {
    readonly id: number;
    readonly title: string;
    readonly description: string;
    readonly extendedDescription?: string;
    readonly icon?: string;
    readonly startTime: Date;
    readonly endTime: Date;
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
  const [selectedItem, setSelectedItem] = useState<number | null>(null);

  const iconMap = {
    Coffee,
    Mic,
    MessageCircle,
    PartyPopper,
    Beer,
    Clock
  };

  const getIconComponent = (iconName?: string) => {
    if (!iconName || !(iconName in iconMap)) {
      return Mic; // Default fallback
    }
    return iconMap[iconName as keyof typeof iconMap];
  };

  const isVacanteSpeaker = (title: string) => title.toLowerCase().startsWith("vacante");

  const getCleanTitle = (title: string) => 
    title.toLowerCase().startsWith("vacante - ") 
      ? title.substring(10) 
      : title;

  return (
    <section id="agenda" className="mt-16 w-full">
      <div className="mb-8 text-center">
        <h2 className="mb-4 text-4xl font-bold text-white md:text-5xl">Agenda</h2>
        <p className="mx-auto max-w-2xl text-lg text-gray-400">¡Conocé el cronograma de actividades y charlas!</p>
        {lastUpdate ? (
          <p className="mt-2 text-center text-xs text-gray-400">
            Última actualización: {format(parseISO(lastUpdate), "dd/MM/yyyy HH:mm:ss", { locale: es })}
          </p>
        ) : null}
      </div>

      {/* Responsive interactive timeline */}
      <div className="relative">
        {/* Background gradient */}
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-gray-900/20 to-transparent"></div>

        <div className="relative space-y-3">
          {agenda?.map((item, index) => {
            const { id, startTime, endTime, presenter, title, location, description, extendedDescription, icon } = item;
            const IconComponent = getIconComponent(icon);
            const isSelected = selectedItem === index;
            const isVacante = isVacanteSpeaker(title);
            const cleanTitle = getCleanTitle(title);
            const hasExtendedDescription = extendedDescription && extendedDescription.trim().length > 0 && extendedDescription !== description;

            return (
              <div
                key={id}
                className={`group relative cursor-pointer transition-all duration-300 ${
                  isSelected ? "z-10 scale-[1.02]" : "hover:scale-[1.01]"
                }`}
                onClick={() => setSelectedItem(isSelected ? null : index)}
              >
                <div
                  className={`relative overflow-hidden rounded-2xl border transition-all duration-300 ${
                    isSelected
                      ? "border-yellow-400/50 bg-gradient-to-r from-gray-900/50 to-gray-800/80 shadow-2xl shadow-yellow-400/10"
                      : "border-gray-800 bg-gray-900/50 hover:border-gray-700 hover:bg-gray-900/70"
                  }`}
                >
                  {/* Time indicator line */}
                  <div className="absolute bottom-0 left-0 top-0 w-1 bg-gradient-to-b from-yellow-400 to-yellow-500"></div>

                  {/* Desktop Layout */}
                  <div className="hidden items-center gap-4 p-5 md:flex">
                    {/* Time */}
                    <div className="flex min-w-[110px] items-center text-yellow-400">
                      <Clock className="mr-2 h-4 w-4" />
                      <span className="font-mono text-xl font-bold">{format(startTime, "HH:mm")}</span>
                    </div>

                    {/* Icon */}
                    <div
                      className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border-2 transition-all duration-300 ${
                        isSelected
                          ? "border-yellow-300 bg-gradient-to-r from-yellow-400 to-yellow-500 shadow-lg"
                          : "bg-gray-700/30 border-gray-700 group-hover:border-yellow-400/50"
                      }`}
                    >
                      <IconComponent
                        className={`h-5 w-5 transition-colors duration-300 ${
                          isSelected ? "text-black" : "text-yellow-400"
                        }`}
                      />
                    </div>

                    {/* Content */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex-1">
                          <div className="mb-1 flex items-center gap-2">
                            <h3 className="text-base font-bold text-white transition-colors group-hover:text-yellow-400">
                              {cleanTitle}
                            </h3>
                          </div>
                          <p
                            className={`text-sm text-gray-400 transition-all duration-300 ${isSelected ? "text-gray-300" : ""}`}
                          >
                            {description}
                          </p>
                        </div>

                        {/* Speaker info - only show when there's a presenter or it's vacant */}
                        {(isVacante || presenter) && (
                          <div className="flex flex-shrink-0 items-center gap-2">
                            <div className="text-right">
                              {isVacante ? (
                                <>
                                  <p className="text-sm font-medium text-orange-400">Vacante</p>
                                  <p className="text-xs text-gray-400">Próximamente</p>
                                </>
                              ) : presenter ? (
                                <>
                                  <p className="text-sm font-medium text-white">{`${presenter.firstname} ${presenter.lastname ?? ""}`}</p>
                                  <p className="text-xs text-gray-400">Speaker</p>
                                </>
                              ) : null}
                            </div>
                            {isVacante ? (
                              <div className="h-10 w-10 rounded-full border-2 border-orange-400/50 bg-orange-400/10 flex items-center justify-center">
                                <span className="text-orange-400 font-bold text-sm">?</span>
                              </div>
                            ) : presenter ? (
                              <Avatar className="h-10 w-10">
                                <AvatarImage src={presenter.picture?.url ?? "/carpincho.png"} />
                              </Avatar>
                            ) : null}
                          </div>
                        )}
                      </div>

                      {/* Extended description */}
                      {isSelected && hasExtendedDescription && (
                        <div className="mt-4 border-t border-gray-700 pt-4 duration-300 animate-in slide-in-from-top-2">
                          <div className="text-gray-300 text-sm leading-relaxed">
                            <ReactMarkdown
                              components={{
                                p: ({ children }) => <p className="mb-1 last:mb-0">{children}</p>,
                                strong: ({ children }) => <strong className="font-semibold text-yellow-400">{children}</strong>,
                              }}
                            >
                              {extendedDescription}
                            </ReactMarkdown>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Expand indicator */}
                    <div
                      className={`flex h-6 w-6 items-center justify-center rounded-full transition-all duration-300 ${
                        isSelected
                          ? "rotate-180 bg-yellow-400 text-black"
                          : "bg-gray-800 text-gray-400 group-hover:bg-gray-700"
                      }`}
                    >
                      <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>

                  {/* Mobile Layout */}
                  <div className="px-3 py-4 md:hidden">
                    {/* Header row */}
                    <div className="mb-2 flex items-start gap-3">
                      {/* Icon */}
                      <div
                        className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border-2 transition-all duration-300 ${
                          isSelected
                            ? "border-yellow-300 bg-gradient-to-r from-yellow-400 to-yellow-500 shadow-lg"
                            : "bg-gray-700/30 border-gray-700 group-hover:border-yellow-400/50"
                        }`}
                      >
                        <IconComponent
                          className={`h-4 w-4 transition-colors duration-300 ${
                            isSelected ? "text-black" : "text-yellow-400"
                          }`}
                        />
                      </div>

                      {/* Content */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1">
                          <Clock className="h-4 w-4 text-yellow-400" />
                          <span className="font-mono text-[16px] font-bold text-yellow-400">
                            {format(startTime, "HH:mm")}
                          </span>
                        </div>
                        <h3 className="mb-1 text-base font-bold text-white transition-colors group-hover:text-yellow-400">
                          {cleanTitle}
                        </h3>
                        <p
                          className={`text-sm text-gray-400 transition-all duration-300 ${
                            isSelected ? "text-gray-300" : ""
                          }`}
                        >
                          {description}
                        </p>
                      </div>

                      {/* Expand indicator */}
                      <div
                        className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full transition-all duration-300 ${
                          isSelected
                            ? "rotate-180 bg-yellow-400 text-black"
                            : "bg-gray-800 text-gray-400 group-hover:bg-gray-700"
                        }`}
                      >
                        <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </div>

                    {/* Speaker info - Mobile - only show when there's a presenter or it's vacant */}
                    {(isVacante || presenter) && (
                      <div className="mb-2 ml-12 flex items-center gap-2">
                        {isVacante ? (
                          <>
                            <div className="h-8 w-8 rounded-full border-2 border-orange-400/50 bg-orange-400/10 flex items-center justify-center">
                              <span className="text-orange-400 font-bold text-xs">?</span>
                            </div>
                            <div>
                              <p className="text-sm font-medium text-orange-400">Vacante</p>
                              <p className="text-xs text-gray-400">Próximamente</p>
                            </div>
                          </>
                        ) : presenter ? (
                          <>
                            <Avatar className="h-8 w-8">
                              <AvatarImage src={presenter.picture?.url ?? "/carpincho.png"} />
                            </Avatar>
                            <div>
                              <p className="text-sm font-medium text-white">{`${presenter.firstname} ${presenter.lastname ?? ""}`}</p>
                              <p className="text-xs text-gray-400">Speaker</p>
                            </div>
                          </>
                        ) : null}
                      </div>
                    )}

                    {/* Extended description - Mobile */}
                    {isSelected && hasExtendedDescription && (
                      <div className="mt-3 border-t border-gray-700 pt-3 duration-300 animate-in slide-in-from-top-2">
                        <div className="text-gray-300 text-sm leading-relaxed">
                          <ReactMarkdown
                            components={{
                              p: ({ children }) => <p className="mb-1 last:mb-0">{children}</p>,
                              strong: ({ children }) => <strong className="font-semibold text-yellow-400">{children}</strong>,
                            }}
                          >
                            {extendedDescription}
                          </ReactMarkdown>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
