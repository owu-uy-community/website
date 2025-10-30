import { useState, useEffect, useMemo } from "react";
import { MAP_KIOSK_CONFIG } from "components/Meetups/OpenSpace/utils/constants";
import type { LocationConfig } from "components/Meetups/OpenSpace/utils/constants";

interface UseLocationCyclingProps {
  activeLocations: LocationConfig[];
  isLoading: boolean;
}

interface UseLocationCyclingReturn {
  currentLocationIndex: number;
  currentLocation: LocationConfig | null;
}

/**
 * Hook to handle auto-cycling through active locations
 * Shows map initially, then cycles through each location with highlights
 * With server-side data (ISR), show first location immediately without delay
 */
export const useLocationCycling = ({
  activeLocations,
  isLoading,
}: UseLocationCyclingProps): UseLocationCyclingReturn => {
  // Always initialize to -1 to avoid hydration mismatches
  // (server and client must have same initial value)
  const [currentLocationIndex, setCurrentLocationIndex] = useState<number>(-1);

  // Immediately set to first location on mount if we have data (ISR)
  // Use layout effect to run synchronously before paint
  useEffect(() => {
    if (activeLocations.length === 0) {
      if (currentLocationIndex !== -1) {
        setCurrentLocationIndex(-1);
      }
    } else if (currentLocationIndex === -1 && !isLoading) {
      setCurrentLocationIndex(0);
    }
  }, [activeLocations.length, isLoading, currentLocationIndex]);

  // Location cycling logic
  useEffect(() => {
    if (currentLocationIndex === -1 || activeLocations.length === 0) return;

    const cycleInterval = setInterval(() => {
      setCurrentLocationIndex((prev) => (prev + 1) % activeLocations.length);
    }, MAP_KIOSK_CONFIG.LOCATION_DURATION);

    return () => clearInterval(cycleInterval);
  }, [currentLocationIndex, activeLocations.length]);

  // Get current location
  const currentLocation = useMemo(() => {
    return currentLocationIndex >= 0 ? activeLocations[currentLocationIndex] : null;
  }, [currentLocationIndex, activeLocations]);

  return {
    currentLocationIndex,
    currentLocation,
  };
};

