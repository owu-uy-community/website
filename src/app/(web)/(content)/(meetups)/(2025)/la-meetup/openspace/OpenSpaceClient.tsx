"use client";

import { memo, useMemo } from "react";
import Starfield from "react-starfield";

import Footer from "components/shared/Footer";
import OpenSpaceMap from "components/Meetups/2024/OpenSpace/Map";
import { TimeGridKiosk } from "components/Meetups/OpenSpace/organisms/TimeGridKiosk";
import { TimeGridKioskSkeleton } from "components/Meetups/OpenSpace/organisms/TimeGridKioskSkeleton";
import { SessionInfoCard } from "components/Meetups/OpenSpace/molecules/SessionInfoCard";
import { CountdownSection } from "components/Meetups/OpenSpace/molecules/CountdownSection";
import { NOTE_COLORS, MAP_KIOSK_CONFIG, DEFAULT_OPENSPACE_ID } from "components/Meetups/OpenSpace/utils/constants";
import { useCountdownEndtime } from "hooks/useCountdownEndtime";
import { useLocationCycling } from "hooks/useLocationCycling";
import { useMapKioskData } from "hooks/useMapKioskData";
import { useOpenSpaceNotesORPC } from "hooks/useOpenSpaceNotesORPC";
import { useOpenSpaceSetup } from "hooks/useOpenSpaceSetup";
import { useManualSelection } from "hooks/useManualSelection";
import type { Room, Schedule, StickyNote, TrackWithRelations } from "lib/orpc";

const MemoizedMap = memo(OpenSpaceMap, (prev, next) => {
  return (
    prev.event?.location === next.event?.location &&
    prev.events === next.events &&
    prev.scene === next.scene &&
    prev.onRoomClick === next.onRoomClick
  );
});

MemoizedMap.displayName = "MemoizedMap";

interface OpenSpaceClientProps {
  initialOpenSpaceData?: {
    notes: StickyNote[];
    rooms: Room[];
    schedules: Schedule[];
    highlightedTracks: TrackWithRelations[];
  };
}

export default function OpenSpaceClient({ initialOpenSpaceData }: OpenSpaceClientProps) {
  // Countdown endtime - lightweight endpoint that only fetches targetTime
  const { remainingSeconds } = useCountdownEndtime({
    enableRealtime: true,
  });

  // Map data with highlighted tracks
  const {
    events,
    activeLocations,
    isLoading: mapLoading,
  } = useMapKioskData({
    initialData: initialOpenSpaceData?.highlightedTracks,
  });

  // Auto-cycling location
  const { currentLocation: autoLocation } = useLocationCycling({
    activeLocations,
    isLoading: mapLoading,
  });

  // Manual selection with auto-expiry
  const { currentLocation, selectLocation } = useManualSelection({
    activeLocations,
    autoLocation,
    selectionDuration: 60000, // 1 minute
  });

  // OpenSpace notes with realtime sync
  const { notes, loading: notesLoading } = useOpenSpaceNotesORPC({
    openSpaceId: DEFAULT_OPENSPACE_ID,
    enableRealtime: true,
    initialData: initialOpenSpaceData?.notes,
  });

  // Rooms and schedules setup
  const {
    rooms,
    timeSlots,
    isLoading: setupLoading,
  } = useOpenSpaceSetup(DEFAULT_OPENSPACE_ID, {
    initialRooms: initialOpenSpaceData?.rooms,
    initialSchedules: initialOpenSpaceData?.schedules,
  });

  // Memoized values
  const getNotesForCell = useMemo(
    () =>
      (room: string, timeSlot: string): StickyNote[] =>
        notes.filter((note) => note.room === room && note.timeSlot === timeSlot),
    [notes]
  );

  const mapEventProp = useMemo(() => (currentLocation ? { location: currentLocation.name } : null), [currentLocation]);

  const highlightedEvent = useMemo(() => {
    if (!currentLocation) return null;
    return events.find((event) => event.location === currentLocation.name) ?? null;
  }, [currentLocation, events]);

  // Derived state
  const scheduleLoading = notesLoading || setupLoading;
  const hasScheduleData = rooms.length > 0 && timeSlots.length > 0;
  const nextLocationColor = currentLocation?.color ?? "#FF9933";
  const countdownSeconds = mapLoading && activeLocations.length === 0 ? 0 : remainingSeconds;

  return (
    <>
      <Starfield speedFactor={0.05} starColor={[255, 255, 255]} starCount={1000} />
      <div className="relative z-50 flex w-full flex-col items-center justify-center text-white">
        {/* Hero Section */}
        <section className="w-full pb-8 pt-12 sm:pb-12 sm:pt-16 lg:pb-12 lg:pt-20">
          <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            {/* Title and Description */}
            <div className="flex flex-col gap-4 text-center">
              <span className="text-sm font-semibold uppercase tracking-[0.4em] text-yellow-400">Open Space</span>
              <h1 className="mb-4 text-4xl font-bold text-white md:text-5xl">Mercado de ideas</h1>
              <p className="mx-auto max-w-3xl text-balance text-base leading-relaxed text-gray-300 lg:text-lg">
                Sumate al mercado de ideas, descubrí qué conversaciones están ocurriendo en cada sala y seguí la agenda
                en tiempo real.
              </p>
            </div>
          </div>
        </section>

        {/* Desktop: Map + Info Side by Side | Mobile: Stacked */}
        <section className="w-full pb-12 sm:pb-4">
          <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            {/* Mobile Layout - Stacked */}
            <div className="flex flex-col gap-8 lg:hidden">
              {/* Current Track Info - Mobile */}
              <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-6">
                <CountdownSection
                  seconds={countdownSeconds}
                  color={currentLocation ? nextLocationColor : "#6B7280"}
                  variant="mobile"
                />

                <SessionInfoCard
                  currentLocation={currentLocation}
                  highlightedEvent={highlightedEvent}
                  isLoading={mapLoading && activeLocations.length === 0}
                  variant="mobile"
                />
              </div>

              {/* Map - Mobile */}
              <div className="relative">
                {activeLocations.length === 0 && !mapLoading ? (
                  <div className="flex h-full w-full items-center justify-center py-12">
                    <p className="max-w-sm text-center text-base text-gray-400">
                      Todavía no hay horarios destacados. Una vez que el equipo marque un bloque como destacado
                      aparecerá aquí el recorrido automático.
                    </p>
                  </div>
                ) : (
                  <MemoizedMap
                    event={mapEventProp}
                    events={events}
                    scene={MAP_KIOSK_CONFIG.SCENE}
                    onRoomClick={selectLocation}
                  />
                )}
              </div>
            </div>

            {/* Desktop Layout - Side by Side */}
            <div className="hidden lg:grid lg:grid-cols-[2fr,1fr] lg:gap-6">
              {/* Left: Map (takes 2/3 of space) */}
              <div className="relative h-[600px]">
                {activeLocations.length === 0 && !mapLoading ? (
                  <div className="flex h-full w-full items-center justify-center">
                    <p className="max-w-sm text-center text-base text-gray-400">
                      Todavía no hay horarios destacados. Una vez que el equipo marque un bloque como destacado
                      aparecerá aquí el recorrido automático.
                    </p>
                  </div>
                ) : (
                  <div className="relative flex h-full w-full items-center justify-center">
                    <MemoizedMap
                      event={mapEventProp}
                      events={events}
                      scene={MAP_KIOSK_CONFIG.SCENE}
                      onRoomClick={selectLocation}
                    />
                  </div>
                )}
              </div>

              {/* Right: Session Info (takes 1/3 of space) */}
              <div className="flex h-[600px] flex-col items-center justify-center gap-2 px-4">
                <CountdownSection
                  seconds={countdownSeconds}
                  color={currentLocation ? nextLocationColor : "#6B7280"}
                  variant="desktop"
                />

                <SessionInfoCard
                  currentLocation={currentLocation}
                  highlightedEvent={highlightedEvent}
                  isLoading={mapLoading && activeLocations.length === 0}
                  variant="desktop"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Schedule Section */}
        <section id="agenda" className="w-full pb-16">
          <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mb-8 text-center">
              <h2 className="mb-4 text-4xl font-bold text-white md:text-5xl">Agenda del Open Space</h2>
              <p className="mx-auto mt-2 max-w-3xl text-balance text-base leading-relaxed text-gray-300 lg:text-lg">
                La grilla se actualiza en tiempo real a medida que las personas agregan nuevas sesiones en el tablero
                físico.
              </p>
            </div>

            {scheduleLoading ? (
              <div className="relative w-full overflow-hidden rounded-2xl bg-gray-900/30 lg:max-h-[800px] lg:border lg:border-gray-800">
                <TimeGridKioskSkeleton />
              </div>
            ) : !hasScheduleData ? (
              <div className="flex h-64 flex-col items-center justify-center gap-2 rounded-2xl bg-gray-900/30 text-center text-gray-400 lg:border lg:border-gray-800">
                <p className="text-lg font-semibold text-white">Aún no hay salas u horarios configurados</p>
                <p className="max-w-xl text-base text-gray-400">
                  Cuando el equipo de facilitación habilite las salas y bloques horarios, la agenda se mostrará
                  automáticamente aquí.
                </p>
              </div>
            ) : (
              <div className="relative w-full overflow-auto rounded-2xl bg-gray-900/30 lg:max-h-[800px] lg:border lg:border-gray-800 [&_.openspace-time-grid-kiosk_.relative.h-full]:!min-h-[60px] [&_.openspace-time-grid-kiosk_.relative>div]:!p-2 [&_.openspace-time-grid-kiosk_h3]:!text-xs [&_.openspace-time-grid-kiosk_h3]:!leading-tight [&_.openspace-time-grid-kiosk_p]:!text-[10px]">
                <TimeGridKiosk
                  rooms={rooms}
                  timeSlots={timeSlots}
                  noteColors={NOTE_COLORS}
                  getNotesForCell={getNotesForCell}
                />
              </div>
            )}
          </div>
        </section>
        <Footer />
      </div>
    </>
  );
}
