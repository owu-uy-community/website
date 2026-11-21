import { and, eq } from "drizzle-orm";
import { Effect } from "effect";

import { eventLiveState, events, tracks } from "../../db/schema";
import { eventChannel } from "../../realtime/channels";
import { query } from "../db";
import { NotFound } from "../errors";
import { Realtime } from "../services";
import { toStickyNote } from "../tracks/service";
import type { CastState } from "./schemas";

const eventNotFound = new NotFound({ entity: "event", message: "Ese evento no existe" });

const nothingCast: CastState = { trackId: null, note: null };

/** A talk of this event as the screens show it. */
const castable = (eventId: string, trackId: string) =>
  query((db) =>
    db.query.tracks.findFirst({
      where: and(eq(tracks.id, trackId), eq(tracks.openSpaceId, eventId)),
      with: { room: true, schedule: true },
    })
  );

/** What an event's screens show (persisted, so a reloaded screen comes back to it). */
export const getCast = (eventId: string) =>
  Effect.gen(function* () {
    const [row] = yield* query((db) =>
      db
        .select({ trackId: eventLiveState.highlightedTrackId })
        .from(events)
        .leftJoin(eventLiveState, eq(eventLiveState.eventId, events.id))
        .where(eq(events.id, eventId))
    );
    if (!row) return yield* eventNotFound;
    if (!row.trackId) return nothingCast;
    const track = yield* castable(eventId, row.trackId);

    return track ? { trackId: track.id, note: toStickyNote(track) } : nothingCast;
  });

/** Put one of the event's talks on its screens, or clear them. */
export const cast = ({ eventId, trackId }: { eventId: string; trackId: string | null }) =>
  Effect.gen(function* () {
    const track = trackId ? yield* castable(eventId, trackId) : undefined;
    if (trackId && !track) {
      return yield* new NotFound({ entity: "track", message: "Esa charla no es de este evento" });
    }

    yield* query((db) =>
      db
        .insert(eventLiveState)
        .values({ eventId, highlightedTrackId: trackId })
        .onConflictDoUpdate({ target: eventLiveState.eventId, set: { highlightedTrackId: trackId } })
    ).pipe(Effect.catchTag("ForeignKeyViolation", () => Effect.fail(eventNotFound)));

    const state: CastState = track ? { trackId: track.id, note: toStickyNote(track) } : nothingCast;
    const realtime = yield* Realtime;
    yield* realtime.publish(eventChannel(eventId, "cast"), "note_highlighted", { note: state.note });

    return state;
  });
