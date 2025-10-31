import { fetchOpenSpaceData } from "lib/orpc/server";
import { DEFAULT_OPENSPACE_ID } from "components/Meetups/OpenSpace/utils/constants";

import OpenSpaceClient from "./OpenSpaceClient";

// Force dynamic rendering to prevent caching issues with countdown
export const dynamic = "force-dynamic";

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
