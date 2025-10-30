import { NextResponse } from "next/server";
import { prisma } from "lib/prisma";

/**
 * GET /api/openspace/epg
 * Returns Electronic Program Guide data for the kiosk map display
 * Fetches all tracks with their schedules and rooms, optionally filtering by schedule.highlightInKiosk
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const highlightedOnly = searchParams.get("highlighted") === "true";

    // Fetch tracks with their relations, filtering by schedule highlight if needed
    const tracks = await prisma.track.findMany({
      where: highlightedOnly ? { schedule: { highlightInKiosk: true } } : {},
      include: {
        room: true,
        schedule: true,
      },
      orderBy: [{ schedule: { date: "asc" } }, { schedule: { startTime: "asc" } }],
    });

    // Transform to EPG format
    const events = tracks.map((track) => {
      // Parse schedule date and times
      const scheduleDate = track.schedule.date.toISOString().split("T")[0];
      const startDateTime = `${scheduleDate}T${track.schedule.startTime}`;
      const endDateTime = `${scheduleDate}T${track.schedule.endTime}`;

      // Normalize room names to match the expected format in MapKioskClient
      const normalizeRoomName = (name: string): string => {
        const normalized = name.toLowerCase();
        const roomMap: Record<string, string> = {
          ventana: "VENTANA",
          lobby: "LOBBY",
          centro: "CENTRO",
          cueva: "CUEVA",
          rincon: "RINCÓN",
          rincón: "RINCÓN",
        };
        return roomMap[normalized] || name.toUpperCase();
      };

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
    });

    return NextResponse.json(events);
  } catch (error) {
    console.error("Failed to fetch EPG data:", error);
    return NextResponse.json({ error: "Failed to fetch EPG data" }, { status: 500 });
  }
}
