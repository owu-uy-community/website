"use client";

import * as React from "react";
import { useMemo, memo } from "react";
import OpenSpaceMap from "components/Meetups/2024/OpenSpace/Map";
import { useCountdownState } from "hooks/useCountdownState";
import { useMapKioskData } from "hooks/useMapKioskData";
import { useLocationCycling } from "hooks/useLocationCycling";
import { MAP_KIOSK_CONFIG } from "components/Meetups/OpenSpace/utils/constants";
import { LoadingSpinner } from "components/Meetups/OpenSpace/atoms/LoadingSpinner";
import { MapHeader } from "components/Meetups/OpenSpace/molecules/MapHeader";
import { EmptyMapState } from "components/Meetups/OpenSpace/molecules/EmptyMapState";
import { LocationArrow } from "components/Meetups/OpenSpace/atoms/LocationArrow";
import { LogoCorner } from "components/Meetups/OpenSpace/atoms/LogoCorner";

// Memoized Map wrapper to prevent unnecessary re-renders
const MemoizedMap = memo(OpenSpaceMap, (prevProps, nextProps) => {
  return (
    prevProps.event?.location === nextProps.event?.location &&
    prevProps.events === nextProps.events &&
    prevProps.scene === nextProps.scene
  );
});

MemoizedMap.displayName = "MemoizedMap";

/**
 * MapKioskClient Component
 * Displays an auto-cycling map of openspace locations with highlighted talks
 * Only shows locations that have highlighted talks
 */
export default function MapKioskClient() {
  const { state: countdownState } = useCountdownState({ enableRealtime: true });

  // Fetch highlighted tracks and active locations
  const { events, activeLocations, isLoading } = useMapKioskData();

  // Handle location cycling
  const { currentLocation } = useLocationCycling({ activeLocations, isLoading });

  // Compute derived data
  const eventProp = useMemo(() => {
    return currentLocation ? { location: currentLocation.name } : null;
  }, [currentLocation]);

  const currentEvent = useMemo(() => {
    if (!currentLocation) return null;
    return events.find((e) => e.location === currentLocation.name) || null;
  }, [currentLocation, events]);

  // Empty state - no highlighted locations (only when not loading)
  if (activeLocations.length === 0 && !isLoading) {
    return <EmptyMapState scene={MAP_KIOSK_CONFIG.SCENE} />;
  }

  return (
    <div className="relative h-screen w-full overflow-hidden bg-transparent">
      {/* Header Bar with title and countdown */}
      <MapHeader
        title={currentEvent?.title || "OPENSPACE"}
        color={currentLocation?.color || "#FF9933"}
        remainingSeconds={countdownState.remainingSeconds}
      />

      {/* Map Container */}
      <div className="absolute bottom-0 left-0 right-0 top-[120px] z-10 flex flex-col items-center justify-start p-4 sm:top-[150px] sm:p-6 md:p-8">
        <MemoizedMap event={eventProp} events={events} scene={MAP_KIOSK_CONFIG.SCENE} />
      </div>

      {/* Right Side Location Label with Arrow */}
      {currentLocation && <LocationArrow color={currentLocation.color} locationName={currentLocation.name} />}

      {/* Bottom Right Logo */}
      <LogoCorner />
    </div>
  );
}
