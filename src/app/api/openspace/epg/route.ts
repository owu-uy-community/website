import { LEGACY_EVENT_ID } from "lib/tenant";
import { callerFor } from "lib/orpc/server";

/**
 * GET /api/openspace/epg?eventId=...&highlighted=true
 *
 * The board as an Electronic Program Guide for TV apps and the kiosk map:
 * one entry per talk with local start/end times. Without ?eventId it serves
 * the original OWU event, so devices configured before multi-tenancy keep
 * working.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const talks = await callerFor(request.headers).tracks.getByOpenSpace({
    openSpaceId: searchParams.get("eventId") ?? LEGACY_EVENT_ID,
    highlightedOnly: searchParams.get("highlighted") === "true",
  });

  return Response.json(
    talks.map((talk) => {
      const day = talk.schedule.date.slice(0, 10);

      return {
        since: `${day}T${talk.schedule.startTime}`,
        till: `${day}T${talk.schedule.endTime}`,
        location: talk.room.name.toUpperCase(),
        title: talk.title,
        channelUuid: talk.roomId,
        speaker: talk.speaker ?? "",
        scheduleId: talk.scheduleId,
        highlightInKiosk: talk.schedule.highlightInKiosk,
      };
    })
  );
}
