import {
  Circle,
  Cloud,
  Club,
  Diamond,
  Flame,
  Heart,
  Hexagon,
  Leaf,
  Moon,
  Pentagon,
  Spade,
  Square,
  Star,
  Sun,
  Triangle,
  Zap,
  type LucideIcon,
} from "lucide-react";

/**
 * Fillable shapes a room can be tagged with, picked by the admin in the rooms
 * editor. The key is what `rooms.icon` stores; the set is shared by the picker
 * and every surface that renders room headers (board, kiosk, public agenda) so
 * they can never disagree.
 */
export const ROOM_ICONS = {
  circle: Circle,
  square: Square,
  triangle: Triangle,
  diamond: Diamond,
  pentagon: Pentagon,
  hexagon: Hexagon,
  star: Star,
  heart: Heart,
  spade: Spade,
  club: Club,
  zap: Zap,
  sun: Sun,
  moon: Moon,
  cloud: Cloud,
  flame: Flame,
  leaf: Leaf,
} as const satisfies Record<string, LucideIcon>;

export type RoomIconKey = keyof typeof ROOM_ICONS;

export const ROOM_ICON_KEYS = Object.keys(ROOM_ICONS) as RoomIconKey[];

/** Component for a stored icon key, or null when unset/unknown (renders nothing). */
export function roomIconFor(key: string | null | undefined): LucideIcon | null {
  if (!key) return null;

  return key in ROOM_ICONS ? ROOM_ICONS[key as RoomIconKey] : null;
}
