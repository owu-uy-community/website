import type { CSSProperties, ComponentType } from "react";
import { Cloud, Club, Flame, Heart, Leaf, Moon, Pentagon, Spade, Star, Sun, Zap } from "lucide-react";

type ShapeProps = {
  className?: string;
  style?: CSSProperties;
  strokeWidth?: number;
  "aria-hidden"?: boolean | "true" | "false";
};

type RoomShape = ComponentType<ShapeProps>;

/** A solid shape in a 100×100 box, sharp-cornered like the printed venue signs. */
function signage(d: string): RoomShape {
  return function SignageShape(props: ShapeProps) {
    return (
      <svg fill="currentColor" viewBox="0 0 100 100" {...props}>
        <path d={d} />
      </svg>
    );
  };
}

/**
 * Fillable shapes a room can be tagged with, picked by the admin in the rooms
 * editor. The key is what `rooms.icon` stores; the set is shared by the picker
 * and every surface that renders room headers (board, kiosk, public agenda) so
 * they can never disagree. The first five are the venue signage's shapes.
 */
export const ROOM_ICONS = {
  circle: signage("M50 5A45 45 0 1 1 50 95A45 45 0 1 1 50 5Z"),
  square: signage("M9 9H91V91H9Z"),
  triangle: signage("M50 9L98 92H2Z"),
  diamond: signage("M50 1L99 50L50 99L1 50Z"),
  pentagon: Pentagon,
  hexagon: signage("M2 50L26 8.4H74L98 50L74 91.6H26Z"),
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
} as const satisfies Record<string, RoomShape>;

export type RoomIconKey = keyof typeof ROOM_ICONS;

export const ROOM_ICON_KEYS = Object.keys(ROOM_ICONS) as RoomIconKey[];

/** Component for a stored icon key, or null when unset/unknown (renders nothing). */
export function roomIconFor(key: string | null | undefined): RoomShape | null {
  if (!key) return null;

  return key in ROOM_ICONS ? ROOM_ICONS[key as RoomIconKey] : null;
}

/** A room's mark next to its name: its shape (`rooms.icon`) in its colour, or a dot when it has none. */
export function RoomMark({ icon, color, className }: { icon?: string | null; color: string; className?: string }) {
  const Shape = roomIconFor(icon);

  return Shape ? (
    <Shape aria-hidden className={`shrink-0 ${className ?? ""}`} style={{ color, fill: color }} />
  ) : (
    <span aria-hidden className={`shrink-0 rounded-full ${className ?? ""}`} style={{ backgroundColor: color }} />
  );
}
