import { eq } from "drizzle-orm";

import { db } from "../../../db";
import { eventLiveState, tracks } from "../../../db/schema";
import { eventChannel } from "../../../realtime/channels";
import { publishServer } from "../../../realtime/publish";
import type { StickyNote } from "../../sticky-notes/schemas";
import { transformTrackForStickyNote } from "../../sticky-notes/services/transforms";
import type { SetHighlightedNoteInput } from "../schemas";

// TODO(multi-tenant): becomes a required eventId input once the frontend threads event ids.
const LEGACY_EVENT_ID = "default-openspace";

export type CastState = {
  trackId: string | null;
  note: StickyNote | null;
};

/**
 * Current "cast to screen" state for an event (persisted, so displays survive reloads).
 */
export async function getCastState(eventId: string = LEGACY_EVENT_ID): Promise<CastState> {
  const [state] = await db.select().from(eventLiveState).where(eq(eventLiveState.eventId, eventId)).limit(1);
  if (!state?.highlightedTrackId) return { trackId: null, note: null };

  const track = await db.query.tracks.findFirst({
    where: eq(tracks.id, state.highlightedTrackId),
    with: { room: true, schedule: true },
  });
  if (!track) return { trackId: null, note: null };

  return { trackId: track.id, note: transformTrackForStickyNote(track) };
}

/**
 * Persist the highlighted track (or clear it) and broadcast to displays.
 */
export async function setHighlightedNote(input: SetHighlightedNoteInput): Promise<CastState> {
  const eventId = input.eventId ?? LEGACY_EVENT_ID;

  let note: StickyNote | null = null;
  if (input.trackId) {
    const track = await db.query.tracks.findFirst({
      where: eq(tracks.id, input.trackId),
      with: { room: true, schedule: true },
    });
    if (!track || track.openSpaceId !== eventId) {
      throw new Error("Track not found in this event");
    }
    note = transformTrackForStickyNote(track);
  }

  await db
    .insert(eventLiveState)
    .values({ eventId, highlightedTrackId: input.trackId })
    .onConflictDoUpdate({ target: eventLiveState.eventId, set: { highlightedTrackId: input.trackId } });

  await publishServer(eventChannel(eventId, "cast"), "note_highlighted", { note });

  return { trackId: input.trackId, note };
}
