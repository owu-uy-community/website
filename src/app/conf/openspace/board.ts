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
 * this page uses for it everywhere — map, legend and grid: `rooms.color`, the
 * same colour the venue signage, kiosks and stage read.
 */
export function buildBoardRooms(rooms: readonly Room[]): BoardRoom[] {
  const active = rooms.filter((room) => room.isActive);
  const zones = assignMapZones(active.map(({ id, name, sortOrder }) => ({ id, name, sortOrder })));

  return [...active]
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
    .map((room) => {
      const zone = zones.get(room.id) ?? null;

      return { ...room, zone, color: roomColorFor(room.id, room.color) };
    });
}

/** Each mapped zone's fill on the floorplan: its room's colour. */
export function zoneColors(rooms: readonly BoardRoom[]): Record<string, string> {
  return Object.fromEntries(rooms.flatMap((room) => (room.zone ? [[room.zone, room.color]] : [])));
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
