import { and, count, eq } from "drizzle-orm";

import { EVENTBRITE_API_KEY, EVENTBRITE_API_URL, EVENTBRITE_EVENT_ID, EXTERNAL_SERVICES } from "app/lib/constants";
import type { EventbriteAttendeesResponse } from "lib/eventbrite/types";

import { db } from "../../../db";
import { owyStageState, rooms, tracks } from "../../../db/schema";
import {
  DEFAULT_STAGE_STATE,
  OWY_STAGE_CHANNEL,
  isSceneId,
  parseSceneParams,
  type StageState,
} from "../../../owy-stage/scenes";
import { publishServer } from "../../../realtime/publish";
import type { FireEffectInput, SetFaceInput, SetSceneInput } from "../schemas";

const ROW_ID = "global";

/**
 * What the wall is showing right now (persisted, so a freshly opened OBS
 * browser source starts on the right scene before any broadcast arrives).
 */
export async function getStageState(): Promise<StageState> {
  const [row] = await db.select().from(owyStageState).where(eq(owyStageState.id, ROW_ID)).limit(1);
  if (!row || !isSceneId(row.scene)) return DEFAULT_STAGE_STATE;

  return { scene: row.scene, params: row.params, eventId: row.eventId };
}

/** Persist the active scene (params validated against the scene's schema) and tell every stage. */
export async function setScene(input: SetSceneInput): Promise<StageState> {
  const params = parseSceneParams(input.scene, input.params) as Record<string, unknown>;
  const eventId = input.eventId === undefined ? (await getStageState()).eventId : input.eventId;
  const state: StageState = { scene: input.scene, params, eventId };

  await db
    .insert(owyStageState)
    .values({ id: ROW_ID, ...state })
    .onConflictDoUpdate({ target: owyStageState.id, set: { scene: state.scene, params, eventId } });

  await publishServer(OWY_STAGE_CHANNEL, "scene", state);

  return state;
}

/** One-shot overlay (confetti, flash, caption…) — broadcast only, nothing to persist. */
export async function fireEffect(input: FireEffectInput): Promise<FireEffectInput> {
  await publishServer(OWY_STAGE_CHANNEL, "effect", input);

  return input;
}

/**
 * Owy's face state + running transcript, pushed by the companion bridge (or the
 * admin simulator) so the wall's Owy mirrors whoever is talking to it.
 */
export async function setFace(input: SetFaceInput): Promise<SetFaceInput> {
  await publishServer(OWY_STAGE_CHANNEL, "face", input);

  return input;
}

// ---------------------------------------------------------------------------
// Public reads for the data-driven scenes
// ---------------------------------------------------------------------------

export type StagePulse = {
  /** Aggregates only — never attendee data. `null` when Eventbrite isn't configured. */
  tickets: { checkedIn: number; active: number; capacity: number | null } | null;
  board: { ideas: number; rooms: number } | null;
};

/** Walks every attendee page and counts; Eventbrite caps pages at 100 rows. */
async function countTickets(): Promise<StagePulse["tickets"]> {
  if (!EVENTBRITE_API_KEY || !EVENTBRITE_EVENT_ID) return null;
  const headers = { Authorization: `Bearer ${EVENTBRITE_API_KEY}` };
  const eventResponse = await fetch(`${EVENTBRITE_API_URL}/events/${EVENTBRITE_EVENT_ID}/`, {
    headers,
    next: { revalidate: 300 },
  });
  const event = eventResponse.ok ? ((await eventResponse.json()) as { capacity?: number }) : {};

  let checkedIn = 0;
  let active = 0;
  for (let page = 1; page <= 30; page++) {
    const response = await fetch(
      `${EVENTBRITE_API_URL}/events/${EVENTBRITE_EVENT_ID}/attendees/?page_size=100&page=${page}`,
      { headers, next: { revalidate: 60 } }
    );
    if (!response.ok) break;
    const data = (await response.json()) as EventbriteAttendeesResponse;
    for (const attendee of data.attendees) {
      if (attendee.cancelled || attendee.refunded) continue;
      active++;
      if (attendee.checked_in) checkedIn++;
    }
    if (!data.pagination.has_more_items) break;
  }

  return { checkedIn, active, capacity: event.capacity ?? null };
}

export async function getStagePulse(eventId?: string | null): Promise<StagePulse> {
  const [tickets, board] = await Promise.all([
    countTickets().catch((error) => {
      console.error("[stage] eventbrite pulse", error);
      return null;
    }),
    eventId
      ? Promise.all([
          db.select({ count: count() }).from(tracks).where(eq(tracks.openSpaceId, eventId)),
          db
            .select({ count: count() })
            .from(rooms)
            .where(and(eq(rooms.openSpaceId, eventId), eq(rooms.isActive, true))),
        ]).then(([[ideas], [activeRooms]]) => ({ ideas: ideas.count, rooms: activeRooms.count }))
      : Promise.resolve(null),
  ]);

  return { tickets, board };
}

export type StageMeetup = { name: string; title: string; datetime: string; venue: string | null; url: string };

/** The community calendar (meetup-bot feed); the browser can't read it directly (no CORS). */
export async function getStageMeetups(): Promise<StageMeetup[]> {
  const response = await fetch(EXTERNAL_SERVICES.meetupBot, { next: { revalidate: 1800 } });
  if (!response.ok) return [];
  const { meetups } = (await response.json()) as {
    meetups: { name: string; title: string; datetime: string; venue?: string | null; event_url: string }[];
  };
  const now = Date.now();

  return meetups
    .filter((meetup) => new Date(meetup.datetime).getTime() > now - 3_600_000)
    .sort((a, b) => a.datetime.localeCompare(b.datetime))
    .slice(0, 8)
    .map((meetup) => ({
      name: meetup.name,
      title: meetup.title,
      datetime: meetup.datetime,
      venue: meetup.venue ?? null,
      url: meetup.event_url,
    }));
}
