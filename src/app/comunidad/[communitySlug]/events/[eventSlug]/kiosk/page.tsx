import { notFound } from "next/navigation";

import { ScreenBeacon } from "components/Admin/screens/ScreenBeacon";
import OpenSpaceKioskClient from "components/displays/OpenSpaceKioskClient";
import { caller } from "lib/orpc/server";
import { getEventBySlugs } from "lib/tenant-server";

// A live screen at the venue: rendered per request, allowed to block (Cache Components)
export const instant = false;

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
    caller.rooms.getByOpenSpace({ openSpaceId: resolved.event.id }),
    caller.schedules.getByOpenSpace({ openSpaceId: resolved.event.id }),
    caller.tracks.list({ openSpaceId: resolved.event.id }),
  ]);

  return (
    <>
      <ScreenBeacon eventId={resolved.event.id} />
      <OpenSpaceKioskClient
        initialNotes={tracks}
        initialRooms={rooms}
        initialSchedules={schedules}
        openSpaceId={resolved.event.id}
      />
    </>
  );
}
