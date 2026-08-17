export const DRAG_BOX_SHADOW =
  "0 12px 24px rgba(0, 0, 0, 0.3), 0 6px 12px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.3)";

// Shared ease for board/kiosk motion (owu entrance curve).
export const BOARD_EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

// Map Kiosk Configuration
export const MAP_KIOSK_CONFIG = {
  LOCATION_DURATION: 3000, // 3 seconds per location
  SCENE: 1,
  STALE_TIME: 5000, // Consider data stale after 5 seconds
  RETRY_COUNT: 3,
} as const;
