import type { Track, StickyNote } from "../schemas";
import type { RoomRow, ScheduleRow, TrackRow } from "../../../db/schema";

/**
 * Transform database track to API format
 */
export const transformTrack = (track: TrackRow): Track => ({
  ...track,
  speaker: track.speaker || undefined,
  description: track.description || undefined,
  createdAt: track.createdAt.toISOString(),
  updatedAt: track.updatedAt.toISOString(),
});

/**
 * Transform database track to StickyNote format for UI
 * Converts foreign keys to readable strings (room name and time slot) for display
 */
export const transformTrackForStickyNote = (
  track: TrackRow & {
    room?: RoomRow | null;
    schedule?: ScheduleRow | null;
  }
): StickyNote => ({
  id: track.id,
  title: track.title,
  speaker: track.speaker || undefined,
  description: track.description || undefined,
  needsTV: track.needsTV,
  needsWhiteboard: track.needsWhiteboard,
  openSpaceId: track.openSpaceId,
  scheduleId: track.scheduleId,
  roomId: track.roomId,
  // Convert foreign keys to readable strings for UI display
  room: track.room?.name || track.roomId,
  timeSlot: track.schedule ? `${track.schedule.startTime} - ${track.schedule.endTime}` : track.scheduleId,
  createdAt: track.createdAt.toISOString(),
  updatedAt: track.updatedAt.toISOString(),
});
