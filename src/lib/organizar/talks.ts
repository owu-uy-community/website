import type { EventTalk } from "../db/schema";

/**
 * Talk rules shared by the API, the panel and the sweep. Pure, so the panel and tests read them too.
 */

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** A claim that holds the talk: at most one per proposal (a unique index enforces it). */
export const LIVE_CLAIM = ["claimed", "scheduled"] as const;

/** A community sees and may take an open proposal made to it, or to any of OWU (no communities named). */
export const addressedTo = (proposal: { status: string; communityIds: readonly string[] }, communityId: string) =>
  proposal.status === "open" && (proposal.communityIds.length === 0 || proposal.communityIds.includes(communityId));

/** Where a proposal stands for one community: free to take, already theirs, or held by another. */
export function claimState(
  live: { communityId: string; communityName: string } | null,
  communityId: string
): { kind: "free" } | { kind: "ours" } | { kind: "taken"; by: string } {
  if (!live) return { kind: "free" };

  return live.communityId === communityId ? { kind: "ours" } : { kind: "taken", by: live.communityName };
}

const same = (a: EventTalk, b: EventTalk) =>
  a.title.trim().toLowerCase() === b.title.trim().toLowerCase() &&
  a.speaker.trim().toLowerCase() === b.speaker.trim().toLowerCase();

/** The event's talks with this one at the end, once (assigning twice changes nothing). */
export const withTalk = (talks: readonly EventTalk[], talk: EventTalk) =>
  talks.some((item) => same(item, talk)) ? [...talks] : [...talks, talk];

/** The event's talks without this one (released, or moved to another event). */
export const withoutTalk = (talks: readonly EventTalk[], talk: EventTalk) => talks.filter((item) => !same(item, talk));

export type SpeakerEmail = "t14" | "t2" | "t1";

/**
 * Which speaker email is due now for a talk on an event: the confirmation and info pack up to two
 * weeks before, a nudge for the slides in the last two days, thanks a day after it ends (for a
 * week, in case the tick missed a day). The outbox dedupes each one.
 */
export function speakerEmailDue(event: { startDate: Date; endDate: Date }, now: number): SpeakerEmail | null {
  const toStart = event.startDate.getTime() - now;
  const sinceEnd = now - event.endDate.getTime();
  if (toStart > 2 * DAY && toStart <= 14 * DAY) return "t14";
  if (toStart > 0 && toStart <= 2 * DAY) return "t2";
  if (sinceEnd >= DAY && sinceEnd < 8 * DAY) return "t1";

  return null;
}
