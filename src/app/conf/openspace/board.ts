import { ROOM_COLORS } from "app/lib/constants";
import type { Room, StickyNote } from "lib/orpc";
import { assignMapZones, type MapZone } from "lib/rooms/map-zones";
import { roomColorFor } from "lib/rooms/palette";

export type BoardRoom = Room & {
  /** Floorplan zone this room occupies, or null when it is off the map. */
  zone: MapZone | null;
  color: string;
};

/**
 * Rooms in board order, each carrying its floorplan zone and the one colour
 * this page uses for it everywhere — map, legend and grid.
 *
 * A room that appears on the floorplan takes the zone's colour, because the
 * SVG paints those five zones from a fixed palette and a legend that disagreed
 * with the map would be worse than ignoring `rooms.color`. Rooms off the map
 * fall back to the usual per-id palette.
 */
export function buildBoardRooms(rooms: readonly Room[]): BoardRoom[] {
  const active = rooms.filter((room) => room.isActive);
  const zones = assignMapZones(active.map(({ id, name, sortOrder }) => ({ id, name, sortOrder })));

  return [...active]
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
    .map((room) => {
      const zone = zones.get(room.id) ?? null;

      return { ...room, zone, color: zone ? ROOM_COLORS[zone] : roomColorFor(room.id, room.color) };
    });
}

/** The talk booked in a room for a given block, if anyone claimed it. */
export function trackAt(
  tracks: readonly StickyNote[],
  roomId: string,
  scheduleId: string | undefined
): StickyNote | null {
  if (!scheduleId) return null;

  return tracks.find((track) => track.roomId === roomId && track.scheduleId === scheduleId) ?? null;
}
