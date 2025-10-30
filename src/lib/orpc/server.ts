import { getAllTracks } from "./sticky-notes/services/get-all-tracks";
import { getTracksByOpenSpace } from "./sticky-notes/services/get-by-open-space";
import { getRoomsByOpenSpace } from "./rooms/services/get-by-open-space";
import { getSchedulesByOpenSpace } from "./schedules/services/get-by-open-space";
import type { StickyNote } from "./sticky-notes/schemas";
import type { Room } from "./rooms/schemas";
import type { Schedule } from "./schedules/schemas";
import type { TrackWithRelations } from "./sticky-notes/services/get-by-open-space";

/**
 * Server-side OpenSpace data fetcher
 * Fetches all necessary data for the OpenSpace page in one call
 * Note: Countdown state is NOT included - it's always fetched client-side for live updates
 */
export async function fetchOpenSpaceData(openSpaceId: string) {
  try {
    // Fetch all data in parallel for better performance
    // Countdown is excluded - it needs to be fresh/live on client
    const [notes, rooms, schedules, highlightedTracks] = await Promise.all([
      getAllTracks(),
      getRoomsByOpenSpace({ openSpaceId }),
      getSchedulesByOpenSpace({ openSpaceId }),
      getTracksByOpenSpace({ openSpaceId, highlightedOnly: true }),
    ]);

    return {
      notes,
      rooms,
      schedules,
      highlightedTracks,
    };
  } catch (error) {
    console.error("Error fetching OpenSpace data on server:", error);
    throw error;
  }
}

/**
 * Individual server-side fetchers for more granular control
 */
export const serverOrpc = {
  tracks: {
    list: getAllTracks,
    getByOpenSpace: getTracksByOpenSpace,
  },
  rooms: {
    getByOpenSpace: getRoomsByOpenSpace,
  },
  schedules: {
    getByOpenSpace: getSchedulesByOpenSpace,
  },
} as const;

// Export types
export type { StickyNote, Room, Schedule, TrackWithRelations };
