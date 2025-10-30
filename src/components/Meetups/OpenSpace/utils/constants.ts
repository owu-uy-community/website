import type { StickyNote } from "../../../../lib/orpc";

// OpenSpace ID used across the application
export const DEFAULT_OPENSPACE_ID = "default-openspace";

export const DEFAULT_TIME_SLOTS = ["11:00 - 11:30", "11:30 - 12:00", "12:00 - 12:30", "12:30 - 13:00", "13:00 - 13:30"];

export const DEFAULT_ROOMS = ["lobby", "centro", "cueva", "ventana", "rincon"];

export const NOTE_COLORS = {
  workshop: "border-orange-500/50 text-white shadow-lg",
  keynote: "border-pink-500/50 text-white shadow-lg",
  panel: "border-blue-500/50 text-white shadow-lg",
  break: "border-green-500/50 text-white shadow-lg",
} as const;

// Pre-computed styles for better performance (used by both cards and drag preview)
export const NOTE_STYLES = {
  workshop: {
    background: "linear-gradient(135deg, #fb923c, #ea580c)",
    borderColor: "#c2410c",
  },
  keynote: {
    background: "linear-gradient(135deg, #f472b6, #ec4899)",
    borderColor: "#be185d",
  },
  panel: {
    background: "linear-gradient(135deg, #60a5fa, #3b82f6)",
    borderColor: "#1d4ed8",
  },
  break: {
    background: "linear-gradient(135deg, #4ade80, #22c55e)",
    borderColor: "#15803d",
  },
} as const;

// Style aliases
export const CARD_STYLES = NOTE_STYLES;
export const DRAG_STYLES = NOTE_STYLES;

// Room-based styles (cards now follow room colors instead of note types)
export const ROOM_STYLES = {
  lobby: {
    background: "linear-gradient(135deg, #60a5fa, #3b82f6)", // Blue
    borderColor: "#1e40af",
  },
  ventana: {
    background: "linear-gradient(135deg, #fb923c, #ea580c)", // Orange
    borderColor: "#c2410c",
  },
  cueva: {
    background: "linear-gradient(135deg, #4ade80, #22c55e)", // Green
    borderColor: "#15803d",
  },
  centro: {
    background: "linear-gradient(135deg, #fbbf24, #f59e0b)", // Yellow
    borderColor: "#d97706",
  },
  rincon: {
    background: "linear-gradient(135deg, #f87171, #dc2626)", // Red
    borderColor: "#b91c1c",
  },
} as const;

export const ROOM_BOX_SHADOWS = {
  normal: "0 6px 12px rgba(0, 0, 0, 0.25), 0 3px 6px rgba(0, 0, 0, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.3)",
  dragged: "0 2px 4px rgba(0, 0, 0, 0.1), 0 1px 2px rgba(0, 0, 0, 0.05)",
  swapTarget: {
    lobby: "0 8px 16px rgba(30, 64, 175, 0.4), 0 4px 8px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.3)",
    ventana: "0 8px 16px rgba(194, 65, 12, 0.4), 0 4px 8px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.3)",
    cueva: "0 8px 16px rgba(21, 128, 61, 0.4), 0 4px 8px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.3)",
    centro: "0 8px 16px rgba(217, 119, 6, 0.4), 0 4px 8px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.3)",
    rincon: "0 8px 16px rgba(185, 28, 28, 0.4), 0 4px 8px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.3)",
  },
} as const;

export const CARD_BOX_SHADOWS = {
  normal: "0 6px 12px rgba(0, 0, 0, 0.25), 0 3px 6px rgba(0, 0, 0, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.3)",
  dragged: "0 2px 4px rgba(0, 0, 0, 0.1), 0 1px 2px rgba(0, 0, 0, 0.05)",
  swapTarget: {
    workshop: "0 8px 16px rgba(194, 65, 12, 0.4), 0 4px 8px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.3)",
    keynote: "0 8px 16px rgba(190, 24, 93, 0.4), 0 4px 8px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.3)",
    panel: "0 8px 16px rgba(29, 78, 216, 0.4), 0 4px 8px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.3)",
    break: "0 8px 16px rgba(21, 128, 61, 0.4), 0 4px 8px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.3)",
  },
} as const;

export const DRAG_BOX_SHADOW =
  "0 12px 24px rgba(0, 0, 0, 0.3), 0 6px 12px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.3)";

// Layout constants
export const MOBILE_BREAKPOINT = 768;
export const MOBILE_TIME_COLUMN_WIDTH = 100;
export const DESKTOP_TIME_COLUMN_WIDTH = 120;
export const MOBILE_CELL_HEIGHT = 112; // Updated from 80 to match h-28
export const DESKTOP_CELL_HEIGHT = 128; // Updated from 96 to match h-32
export const MOBILE_HEADER_HEIGHT = 64;
export const DESKTOP_HEADER_HEIGHT = 80;

// Interaction constants
export const CLICK_THRESHOLD_PX = 15;
export const RECENTLY_MOVED_TIMEOUT = 1000;

// Sample notes for initial state
export const SAMPLE_NOTES: StickyNote[] = [
  {
    id: "1",
    title: "No Se Todos NextJS",
    openSpaceId: "sample-openspace-id",
    scheduleId: "sample-schedule-id-1",
    roomId: "sample-room-id-lobby",
    room: "lobby",
    timeSlot: "11:00 - 11:30",
    speaker: "Santiago Cano",
    needsTV: false,
    needsWhiteboard: false,
  },
  {
    id: "2",
    title: "Metodología Forense",
    speaker: "Agustín Tornielli",
    openSpaceId: "sample-openspace-id",
    scheduleId: "sample-schedule-id-2",
    roomId: "sample-room-id-centro",
    room: "centro",
    timeSlot: "11:30 - 12:00",
    needsTV: false,
    needsWhiteboard: false,
  },
  {
    id: "3",
    title: "Lambdas - Hype or Value?",
    openSpaceId: "sample-openspace-id",
    scheduleId: "sample-schedule-id-3",
    roomId: "sample-room-id-cueva",
    room: "cueva",
    timeSlot: "12:00 - 12:30",
    speaker: "Juan Pablo De la torre",
    needsTV: false,
    needsWhiteboard: false,
  },
];

// Map Kiosk Configuration
export interface LocationConfig {
  name: string;
  color: string;
}

export const MAP_LOCATIONS: LocationConfig[] = [
  { name: "VENTANA", color: "#FF9800" },
  { name: "LOBBY", color: "#03A9F4" },
  { name: "CENTRO", color: "#FFEB3B" },
  { name: "CUEVA", color: "#74B276" },
  { name: "RINCÓN", color: "#CD363C" },
];

export const MAP_KIOSK_CONFIG = {
  LOCATION_DURATION: 3000, // 3 seconds per location
  INITIAL_DELAY: 2000, // 2 seconds showing map before cycling starts
  REFETCH_INTERVAL: 10000, // Refetch data every 10 seconds
  SCENE: 1,
  OPENSPACE_ID: DEFAULT_OPENSPACE_ID,
  STALE_TIME: 5000, // Consider data stale after 5 seconds
  RETRY_COUNT: 3,
} as const;

// Room name normalization map
export const ROOM_NAME_MAP: Record<string, string> = {
  ventana: "VENTANA",
  lobby: "LOBBY",
  centro: "CENTRO",
  cueva: "CUEVA",
  rincon: "RINCÓN",
  rincón: "RINCÓN",
};
