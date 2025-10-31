import { Diamond, Square, Pentagon, Circle, Triangle } from "lucide-react";

type IconSize = "mobile" | "desktop" | "small" | "medium" | "large";

const SIZE_CLASSES: Record<IconSize, string> = {
  mobile: "h-6 w-6 sm:h-7 sm:w-7",
  desktop: "h-8 w-8",
  small: "h-4 w-4",
  medium: "h-6 w-6",
  large: "h-10 w-10",
};

/**
 * Get the appropriate icon component for a room based on its name
 *
 * @param room - Room name (case-insensitive)
 * @param color - Icon fill and stroke color
 * @param size - Predefined size variant or custom className
 * @returns React icon component
 *
 * @example
 * getRoomIcon("Lobby", "#FF9933", "mobile")
 * getRoomIcon("ventana", "#00FF00", "desktop")
 */
export function getRoomIcon(room: string, color: string, size: IconSize | string = "desktop") {
  const sizeClass = size in SIZE_CLASSES ? SIZE_CLASSES[size as IconSize] : size;
  const iconProps = {
    className: sizeClass,
    style: { fill: color, color },
  };

  const roomLower = room.toLowerCase();

  switch (roomLower) {
    case "lobby":
      return <Diamond {...iconProps} />;
    case "ventana":
      return <Square {...iconProps} />;
    case "cueva":
      return <Pentagon {...iconProps} />;
    case "centro":
      return <Circle {...iconProps} />;
    case "rincon":
    case "rincón":
      return <Triangle {...iconProps} />;
    default:
      return <Square {...iconProps} />;
  }
}

/**
 * Get room icon name as a string (useful for serialization)
 */
export function getRoomIconName(room: string): string {
  const roomLower = room.toLowerCase();

  switch (roomLower) {
    case "lobby":
      return "diamond";
    case "ventana":
      return "square";
    case "cueva":
      return "pentagon";
    case "centro":
      return "circle";
    case "rincon":
    case "rincón":
      return "triangle";
    default:
      return "square";
  }
}




