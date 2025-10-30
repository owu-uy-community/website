import { prisma } from "../../../prisma";
import { getSummary } from "../../eventbrite/services/get-summary";
import type { DashboardStats } from "../schemas";

const DEFAULT_OPENSPACE_ID = "default-openspace";

/**
 * Get dashboard statistics aggregating data from multiple sources
 */
export const getDashboardStats = async (): Promise<DashboardStats> => {
  try {
    // Fetch all data in parallel for better performance
    const [tracks, rooms, openSpace, eventbriteSummary] = await Promise.all([
      // Get all tracks/sessions
      prisma.track.findMany({
        where: {
          openSpaceId: DEFAULT_OPENSPACE_ID,
        },
      }),

      // Get all rooms for the OpenSpace
      prisma.room.findMany({
        where: {
          openSpaceId: DEFAULT_OPENSPACE_ID,
        },
      }),

      // Get OpenSpace details
      prisma.openSpace.findUnique({
        where: {
          id: DEFAULT_OPENSPACE_ID,
        },
      }),

      // Get Eventbrite summary (with error handling)
      getSummary().catch(() => null),
    ]);

    // Determine OpenSpace status
    let openSpaceStatus: "active" | "inactive" | "upcoming" = "inactive";
    if (openSpace) {
      const now = new Date();
      const startDate = openSpace.startDate ? new Date(openSpace.startDate) : null;
      const endDate = openSpace.endDate ? new Date(openSpace.endDate) : null;

      if (startDate && endDate) {
        if (now >= startDate && now <= endDate) {
          openSpaceStatus = "active";
        } else if (now < startDate) {
          openSpaceStatus = "upcoming";
        }
      }
    }

    return {
      totalSessions: tracks.length,
      activeRooms: rooms.length,
      totalParticipants: eventbriteSummary?.summary.total_attendees ?? 0,
      checkedInParticipants: eventbriteSummary?.summary.checked_in ?? 0,
      openSpaceStatus,
      eventName: eventbriteSummary?.event.name,
    };
  } catch (error) {
    console.error("Failed to fetch dashboard stats:", error);

    // Return default values on error
    return {
      totalSessions: 0,
      activeRooms: 0,
      totalParticipants: 0,
      checkedInParticipants: 0,
      openSpaceStatus: "inactive",
    };
  }
};
