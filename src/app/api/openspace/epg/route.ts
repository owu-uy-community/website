import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "lib/db";
import { rooms, schedules, tracks } from "lib/db/schema";

/**
 * GET /api/openspace/epg
 * Returns Electronic Program Guide data for the kiosk map display
 * Fetches all tracks with their schedules and rooms, optionally filtering by schedule.highlightInKiosk
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const highlightedOnly = searchParams.get("highlighted") === "true";

    // Fetch tracks joined with their schedule and room. Filtering/ordering by
    // schedule columns requires an explicit join (relational queries cannot do it).
    const rows = await db
      .select()
      .from(tracks)
      .innerJoin(rooms, eq(tracks.roomId, rooms.id))
      .innerJoin(schedules, eq(tracks.scheduleId, schedules.id))
      .where(highlightedOnly ? eq(schedules.highlightInKiosk, true) : undefined)
      .orderBy(asc(schedules.date), asc(schedules.startTime));

    // Transform to EPG format
    const events = rows.map(({ tracks: track, rooms: room, schedules: schedule }) => {
      // Parse schedule date and times
      const scheduleDate = schedule.date.toISOString().split("T")[0];
      const startDateTime = `${scheduleDate}T${schedule.startTime}`;
      const endDateTime = `${scheduleDate}T${schedule.endTime}`;

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
        location: normalizeRoomName(room.name),
        title: track.title,
        channelUuid: track.roomId,
        speaker: track.speaker || "",
        scheduleId: track.scheduleId,
        highlightInKiosk: schedule.highlightInKiosk,
      };
    });

    return NextResponse.json(events);
  } catch (error) {
    console.error("Failed to fetch EPG data:", error);
    return NextResponse.json({ error: "Failed to fetch EPG data" }, { status: 500 });
  }
}
