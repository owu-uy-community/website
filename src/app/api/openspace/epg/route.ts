import { and, asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "lib/db";
import { rooms, schedules, tracks } from "lib/db/schema";
import { LEGACY_EVENT_ID } from "lib/tenant";

/**
 * GET /api/openspace/epg?eventId=...&highlighted=true
 * Returns Electronic Program Guide data for the kiosk map display.
 * Always event-scoped; without ?eventId it serves the legacy OWU event so
 * existing consumers (TV apps) keep working.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const highlightedOnly = searchParams.get("highlighted") === "true";
    const eventId = searchParams.get("eventId") ?? LEGACY_EVENT_ID;

    // Fetch tracks joined with their schedule and room. Filtering/ordering by
    // schedule columns requires an explicit join (relational queries cannot do it).
    const rows = await db
      .select()
      .from(tracks)
      .innerJoin(rooms, eq(tracks.roomId, rooms.id))
      .innerJoin(schedules, eq(tracks.scheduleId, schedules.id))
      .where(
        highlightedOnly
          ? and(eq(tracks.openSpaceId, eventId), eq(schedules.highlightInKiosk, true))
          : eq(tracks.openSpaceId, eventId)
      )
      .orderBy(asc(schedules.date), asc(schedules.startTime));

    // Transform to EPG format
    const events = rows.map(({ tracks: track, rooms: room, schedules: schedule }) => {
      // Parse schedule date and times
      const scheduleDate = schedule.date.toISOString().split("T")[0];
      const startDateTime = `${scheduleDate}T${schedule.startTime}`;
      const endDateTime = `${scheduleDate}T${schedule.endTime}`;

      return {
        since: startDateTime,
        till: endDateTime,
        location: room.name.toUpperCase(),
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
