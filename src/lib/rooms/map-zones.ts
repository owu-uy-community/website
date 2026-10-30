/**
 * Binds an event's DB rooms to the five zones drawn in the venue floorplan SVG
 * (`components/Meetups/2024/OpenSpace/Map`). The SVG selects a zone by literal
 * name, but room names are per-event data — so match by name where it lands
 * (accent- and case-insensitive: the seed says "rincon", the SVG says "RINCÓN")
 * and fall back to board order for rooms named anything else.
 *
 * The map has exactly five zones. Rooms past the fifth get no zone and are
 * simply not drawn on the floorplan; they still appear in the grid.
 */

export const MAP_ZONES = ["LOBBY", "CENTRO", "VENTANA", "CUEVA", "RINCÓN"] as const;

export type MapZone = (typeof MAP_ZONES)[number];

type ZoneRoom = { id: string; name: string; sortOrder: number };

/** Case-, accent- and whitespace-insensitive key for comparing room names. */
function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toUpperCase();
}

const ZONE_BY_FOLDED_NAME = new Map<string, MapZone>(MAP_ZONES.map((zone) => [fold(zone), zone]));

/**
 * Zone per room id, in board order. Name matches are claimed first so that a
 * room actually called "Cueva" keeps the cave no matter where it sits in the
 * board, and positional fallback then fills whatever zones are left over.
 */
export function assignMapZones(rooms: readonly ZoneRoom[]): Map<string, MapZone> {
  const ordered = [...rooms].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  const assigned = new Map<string, MapZone>();
  const taken = new Set<MapZone>();

  for (const room of ordered) {
    const zone = ZONE_BY_FOLDED_NAME.get(fold(room.name));
    if (zone && !taken.has(zone)) {
      assigned.set(room.id, zone);
      taken.add(zone);
    }
  }

  const free = MAP_ZONES.filter((zone) => !taken.has(zone));
  for (const room of ordered) {
    if (assigned.has(room.id)) continue;
    const zone = free.shift();
    if (!zone) break;
    assigned.set(room.id, zone);
  }

  return assigned;
}
