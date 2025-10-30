import { User } from "lucide-react";
import { getRoomIcon } from "../../../../lib/utils/room-icons";

interface SessionEvent {
  title: string;
  speaker?: string;
}

interface SessionInfoCardProps {
  currentLocation: { name: string; color?: string } | null;
  highlightedEvent: SessionEvent | null;
  isLoading: boolean;
  variant?: "mobile" | "desktop";
}

/**
 * Displays information about the currently selected session
 * Used in both mobile and desktop layouts
 */
export function SessionInfoCard({
  currentLocation,
  highlightedEvent,
  isLoading,
  variant = "desktop",
}: SessionInfoCardProps) {
  const isMobile = variant === "mobile";
  const iconSize = isMobile ? "mobile" : "desktop";
  const roomNameSize = isMobile ? "text-3xl sm:text-4xl" : "text-4xl";
  const titleSize = isMobile ? "text-xl sm:text-2xl" : "text-2xl";
  const padding = isMobile ? "p-5 sm:p-6" : "px-6 py-8";
  const color = currentLocation?.color ?? "#FF9933";

  return (
    <div className="w-full overflow-hidden rounded-2xl border border-gray-800 bg-gray-900/50 shadow-xl">
      <div className={`flex w-full flex-col text-center ${padding}`}>
        <div className={`mb-${isMobile ? "4" : "6"} w-full border-b border-white/10 pb-${isMobile ? "3" : "4"}`}>
          <p className={`${isMobile ? "text-xs" : "text-sm"} font-bold uppercase tracking-[0.3em] text-yellow-400`}>
            Sesión seleccionada
          </p>
        </div>

        {isLoading ? (
          <div className="w-full animate-pulse space-y-4">
            <div className="flex items-center justify-center gap-2">
              <div className={`${isMobile ? "h-8 w-8" : "h-10 w-10"} rounded-full bg-gray-700`} />
              <div className={`${isMobile ? "h-8 w-32" : "h-10 w-40"} rounded bg-gray-700`} />
            </div>
            <div className="space-y-3">
              <div className={`mx-auto ${isMobile ? "h-6" : "h-7"} w-3/4 rounded bg-gray-700`} />
              <div className={`mx-auto ${isMobile ? "h-4" : "h-5"} w-1/2 rounded bg-gray-700`} />
            </div>
          </div>
        ) : currentLocation ? (
          <>
            <div className={`mb-${isMobile ? "4" : "6"} flex items-center justify-center gap-${isMobile ? "2" : "3"}`}>
              {getRoomIcon(currentLocation.name, color, iconSize)}
              <h2 className={`${roomNameSize} font-bold text-white`} style={{ color }}>
                {currentLocation.name}
              </h2>
            </div>

            {highlightedEvent ? (
              <div className={`space-y-${isMobile ? "3" : "4"}`}>
                <h3 className={`px-4 ${titleSize} font-semibold leading-tight text-white`}>
                  {highlightedEvent.title || "Explorando sesiones"}
                </h3>
                {highlightedEvent.speaker && (
                  <div
                    className={`inline-flex items-center gap-2 rounded-full bg-yellow-400/10 ${
                      isMobile ? "px-4 py-2 text-sm" : "px-5 py-2.5 text-base"
                    } font-medium text-gray-200`}
                  >
                    <User className={`${isMobile ? "h-3.5 w-3.5" : "h-4 w-4"} text-yellow-400`} />
                    <span className="font-semibold text-white">{highlightedEvent.speaker}</span>
                  </div>
                )}
              </div>
            ) : (
              <div className={`space-y-${isMobile ? "2" : "3"} py-2`}>
                <h3 className={`${isMobile ? "text-lg sm:text-xl" : "text-xl"} font-semibold text-gray-400`}>
                  Aún no hay sesiones asignadas
                </h3>
                <p className={`${isMobile ? "text-sm" : "px-4 text-sm leading-relaxed"} text-gray-500`}>
                  Esta sala todavía no tiene charlas programadas
                </p>
              </div>
            )}
          </>
        ) : (
          <div className={`space-y-${isMobile ? "2" : "3"} py-2`}>
            <h3 className={`${isMobile ? "text-lg sm:text-xl" : "text-xl"} font-semibold text-gray-400`}>
              Sin ubicación seleccionada
            </h3>
            <p className={`${isMobile ? "text-sm" : "px-4 text-sm leading-relaxed"} text-gray-500`}>
              Esperando datos...
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

