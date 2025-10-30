/**
 * OpenSpace domain types
 * Centralized type definitions for OpenSpace features
 */

import type { StickyNote } from "../lib/orpc";
import type { TrackWithRelations } from "../lib/orpc/sticky-notes/services/get-by-open-space";

/**
 * Facilitator information
 */
export interface Facilitator {
  firstname: string;
  lastname: string;
  jobTitle?: string;
  picture?: { url: string };
  github?: string;
  linkedin?: string;
  x?: string;
}

/**
 * Room configuration
 */
export interface Room {
  id: string;
  name: string;
  description?: string;
  capacity?: number;
  isActive: boolean;
  openSpaceId: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Schedule/Time slot configuration
 */
export interface Schedule {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  date: string;
  isActive: boolean;
  highlightInKiosk: boolean;
  openSpaceId: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Highlighted track for map display
 */
export interface HighlightedTrack {
  id: string;
  title: string;
  speaker?: string;
  location: string;
  color?: string;
  scheduleId: string;
  roomId: string;
}

/**
 * Location with associated color for cycling
 */
export interface LocationWithColor {
  name: string;
  color: string;
}

/**
 * Manual selection state
 */
export interface ManualSelection {
  location: string;
  timestamp: number;
}
