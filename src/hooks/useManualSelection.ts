import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import type { LocationWithColor, ManualSelection } from "../types/openspace";

interface UseManualSelectionOptions {
  activeLocations: LocationWithColor[];
  autoLocation: LocationWithColor | null;
  selectionDuration?: number; // Duration in milliseconds
}

/**
 * Custom hook to manage manual location selection with auto-expiry
 *
 * Allows user to manually select a location, which takes precedence over
 * automatic location cycling. The manual selection expires after a set duration.
 *
 * @param options Configuration for manual selection behavior
 * @returns Current location and selection handler
 */
export function useManualSelection({
  activeLocations,
  autoLocation,
  selectionDuration = 60000, // Default 1 minute
}: UseManualSelectionOptions) {
  const [manualSelection, setManualSelection] = useState<ManualSelection | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * Determine current location (manual or auto)
   */
  const currentLocation = useMemo((): LocationWithColor | null => {
    if (manualSelection) {
      // Check if manual selection has expired
      const now = Date.now();
      if (now - manualSelection.timestamp < selectionDuration) {
        // Return manual selection location even if not in active locations
        const found = activeLocations.find((loc) => loc.name === manualSelection.location);
        if (found) {
          return found;
        }
        // Create a placeholder location object for rooms without active sessions
        return {
          name: manualSelection.location,
          color: "#FF9933",
        };
      }
    }
    return autoLocation;
  }, [manualSelection, activeLocations, autoLocation, selectionDuration]);

  /**
   * Handle manual location selection
   */
  const selectLocation = useCallback(
    (location: string) => {
      setManualSelection({ location, timestamp: Date.now() });

      // Clear existing timer
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }

      // Set timer to clear manual selection after duration
      timerRef.current = setTimeout(() => {
        setManualSelection(null);
      }, selectionDuration);
    },
    [selectionDuration]
  );

  /**
   * Clear manual selection immediately
   */
  const clearSelection = useCallback(() => {
    setManualSelection(null);
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  /**
   * Check if manual selection is active
   */
  const isManuallySelected = useMemo(() => {
    if (!manualSelection) return false;
    const now = Date.now();
    return now - manualSelection.timestamp < selectionDuration;
  }, [manualSelection, selectionDuration]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  return {
    currentLocation,
    selectLocation,
    clearSelection,
    isManuallySelected,
    manualSelection,
  };
}



