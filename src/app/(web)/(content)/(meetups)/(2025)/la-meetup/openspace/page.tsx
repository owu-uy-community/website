import { fetchOpenSpaceData } from "lib/orpc/server";
import { DEFAULT_OPENSPACE_ID } from "components/Meetups/OpenSpace/utils/constants";

import OpenSpaceClient from "./OpenSpaceClient";

// Enable ISR with 30 second revalidation
// Static page that's updated via on-demand revalidation when data changes
// Countdown is always fetched client-side for real-time updates
export const revalidate = 30;

export default async function LaMeetup2025OpenSpacePage() {
  let initialOpenSpaceData;
  try {
    initialOpenSpaceData = await fetchOpenSpaceData(DEFAULT_OPENSPACE_ID);
  } catch (error) {
    console.error(" Server  ❌ [Server] Failed to fetch OpenSpace data:", error);

    initialOpenSpaceData = {
      notes: [],
      rooms: [],
      schedules: [],
      highlightedTracks: [],
    };
  }

  return <OpenSpaceClient initialOpenSpaceData={initialOpenSpaceData} />;
}
