import { useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { client } from "lib/orpc";
import { useRealtimeBroadcast } from "hooks/useRealtimeBroadcast";
import { MAP_KIOSK_CONFIG, MAP_LOCATIONS, ROOM_NAME_MAP } from "components/Meetups/OpenSpace/utils/constants";
import type { TrackWithRelations } from "lib/orpc/sticky-notes/services/get-by-open-space";
import type { LocationConfig } from "components/Meetups/OpenSpace/utils/constants";

interface Event {
  since: string;
  till: string;
  location: string;
  title: string;
  channelUuid: string;
  speaker: string;
  scheduleId: string;
  highlightInKiosk: boolean;
}

/**
 * Query key for highlighted tracks
 */
const HIGHLIGHTED_TRACKS_KEY = ["tracks", "highlighted", MAP_KIOSK_CONFIG.OPENSPACE_ID];

/**
 * Normalize room names to match the expected format
 */
const normalizeRoomName = (name: string): string => {
  const normalized = name.toLowerCase();
  return ROOM_NAME_MAP[normalized] || name.toUpperCase();
};

/**
 * Transform track data to event format
 */
const transformTrackToEvent = (track: TrackWithRelations): Event => {
  // Parse schedule date and times
  const scheduleDate = track.schedule.date.split("T")[0];
  const startDateTime = `${scheduleDate}T${track.schedule.startTime}`;
  const endDateTime = `${scheduleDate}T${track.schedule.endTime}`;

  return {
    since: startDateTime,
    till: endDateTime,
    location: normalizeRoomName(track.room.name),
    title: track.title,
    channelUuid: track.roomId,
    speaker: track.speaker || "",
    scheduleId: track.scheduleId,
    highlightInKiosk: track.schedule.highlightInKiosk,
  };
};

interface UseMapKioskDataOptions {
  initialData?: TrackWithRelations[];
}

/**
 * Hook to fetch and transform highlighted openspace tracks for map kiosk
 * Accepts initial data from server-side fetch (ISR) and manages client-side updates via React Query
 */
export const useMapKioskData = (options?: UseMapKioskDataOptions) => {
  // Fetch highlighted tracks using React Query
  const {
    data: tracks = [],
    isLoading,
    isFetching,
    isError,
    error,
  } = useQuery({
    queryKey: HIGHLIGHTED_TRACKS_KEY,
    queryFn: async () => {
      const result = await client.tracks.getByOpenSpace({
        openSpaceId: MAP_KIOSK_CONFIG.OPENSPACE_ID,
        highlightedOnly: true,
      });
      return result;
    },
    // Use server-side data as initial data for instant first render (ISR)
    initialData: options?.initialData,
    // No cache - always fresh
    staleTime: 0, // No cache - always fresh
    refetchOnMount: true, // Always refetch when component mounts
    refetchOnWindowFocus: true, // Refetch when user returns to tab
    retry: MAP_KIOSK_CONFIG.RETRY_COUNT,
  });

  // When we have initial data, we should never show loading state on first render
  // isLoading is true only when there's no data AND it's fetching
  // With initialData, there IS data from the start, so isLoading should be false
  const hasInitialData = Boolean(options?.initialData);
  const shouldShowLoading = isLoading && !hasInitialData;

  // Transform tracks to events
  const events = useMemo(() => {
    return tracks.map(transformTrackToEvent);
  }, [tracks]);

  // Listen for real-time schedule highlight changes
  // Note: This is disabled on the display page - only admin needs this
  // The display page gets updates via the tracks query invalidation
  const { invalidate } = useRealtimeBroadcast({
    channelName: "openspace-schedule-highlights",
    eventHandlers: [
      {
        event: "highlight_changed",
        onReceive: () => {
          invalidate(HIGHLIGHTED_TRACKS_KEY);
        },
      },
    ],
    receiveSelf: false,
    debug: false, // Disable debug logs to reduce noise
  });

  // Get unique locations from highlighted events (should only be one time slot)
  const activeLocations = useMemo((): LocationConfig[] => {
    if (events.length === 0) {
      return [];
    }

    // Group events by scheduleId to find the highlighted time slot
    const scheduleIds = new Set(events.map((e) => e.scheduleId));

    // If there are multiple schedules somehow, just take the first one
    if (scheduleIds.size > 1) {
      const firstScheduleId = Array.from(scheduleIds)[0];
      const filteredEvents = events.filter((e) => e.scheduleId === firstScheduleId);
      const uniqueLocations = new Set(filteredEvents.map((e) => e.location));
      return MAP_LOCATIONS.filter((loc) => uniqueLocations.has(loc.name));
    }

    const uniqueLocations = new Set(events.map((e) => e.location));
    return MAP_LOCATIONS.filter((loc) => uniqueLocations.has(loc.name));
  }, [events]);

  if (isError) {
    console.error("❌ [MapKiosk] Failed to fetch tracks:", error);
  }

  return {
    events,
    activeLocations,
    isLoading: shouldShowLoading,
    isFetching,
    isError,
    error,
  };
};
