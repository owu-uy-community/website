import { notFound } from "next/navigation";

import OpenSpaceKioskClient from "components/displays/OpenSpaceKioskClient";
import { getRoomsByOpenSpace } from "lib/orpc/rooms/services/get-by-open-space";
import { getSchedulesByOpenSpace } from "lib/orpc/schedules/services/get-by-open-space";
import { getTracksForEvent } from "lib/orpc/sticky-notes/services/get-all-tracks";
import { getEventBySlugs } from "lib/tenant-server";

export default async function EventKioskPage({
  params,
}: {
  params: Promise<{ communitySlug: string; eventSlug: string }>;
}) {
  const { communitySlug, eventSlug } = await params;
  const resolved = await getEventBySlugs(communitySlug, eventSlug);
  if (!resolved) notFound();

  // Server-fetched initial data: the wall paints the real grid on first
  // render instead of flashing a generic skeleton.
  const [rooms, schedules, tracks] = await Promise.all([
    getRoomsByOpenSpace({ openSpaceId: resolved.event.id }),
    getSchedulesByOpenSpace({ openSpaceId: resolved.event.id }),
    getTracksForEvent(resolved.event.id),
  ]);

  return (
    <OpenSpaceKioskClient
      initialNotes={tracks}
      initialRooms={rooms}
      initialSchedules={schedules}
      openSpaceId={resolved.event.id}
    />
  );
}
