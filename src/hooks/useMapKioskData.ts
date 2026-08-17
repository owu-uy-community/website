import { useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { client } from "lib/orpc";
import { useRealtimeBroadcast } from "hooks/useRealtimeBroadcast";
import { MAP_KIOSK_CONFIG } from "components/Meetups/OpenSpace/utils/constants";
import { eventChannel } from "lib/realtime/channels";
import { roomColorFor } from "lib/rooms/palette";
import type { TrackWithRelations } from "lib/orpc/sticky-notes/services/get-by-open-space";

export interface LocationConfig {
  name: string;
  color: string;
}

interface Event {
  since: string;
  till: string;
  location: string;
  locationColor: string;
  title: string;
  channelUuid: string;
  speaker: string;
  scheduleId: string;
  highlightInKiosk: boolean;
}

/**
 * Query key for highlighted tracks
 */

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
    location: track.room.name.toUpperCase(),
    locationColor: roomColorFor(track.room.id, track.room.color),
    title: track.title,
    channelUuid: track.roomId,
    speaker: track.speaker || "",
    scheduleId: track.scheduleId,
    highlightInKiosk: track.schedule.highlightInKiosk,
  };
};

interface UseMapKioskDataOptions {
  initialData?: TrackWithRelations[];
  /** Required: kiosk data is always scoped to one event. */
  eventId: string;
}

/**
 * Hook to fetch and transform highlighted openspace tracks for map kiosk
 * Accepts initial data from server-side fetch (ISR) and manages client-side updates via React Query
 */
export const useMapKioskData = (options: UseMapKioskDataOptions) => {
  const eventId = options.eventId;
  // Fetch highlighted tracks using React Query
  const {
    data: tracks = [],
    isLoading,
    isFetching,
    isError,
    error,
  } = useQuery({
    queryKey: ["tracks", "highlighted", eventId],
    queryFn: async () => {
      const result = await client.tracks.getByOpenSpace({
        openSpaceId: eventId,
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
    channelName: eventChannel(eventId, "highlights"),
    eventHandlers: [
      {
        event: "highlight_changed",
        onReceive: () => {
          invalidate(["tracks", "highlighted", eventId]);
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
    const firstScheduleId = Array.from(scheduleIds)[0];
    const relevantEvents = scheduleIds.size > 1 ? events.filter((e) => e.scheduleId === firstScheduleId) : events;

    const seen = new Map<string, LocationConfig>();
    for (const event of relevantEvents) {
      if (!seen.has(event.location)) {
        seen.set(event.location, { name: event.location, color: event.locationColor });
      }
    }

    return Array.from(seen.values());
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
