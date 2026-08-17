/**
 * Realtime channel naming. Event-scoped channels carry a topic suffix so one
 * subscription key never leaks across tenants.
 */

export type EventChannelTopic = "sync" | "countdown" | "highlights" | "cast" | "staff";

export function eventChannel(eventId: string, topic: EventChannelTopic): string {
  return `event:${eventId}:${topic}`;
}

/** Site-ops channels that intentionally stay global (OWU's physical rigs). */
export const GLOBAL_CHANNELS = {
  launchpad: "launchpad-sounds",
} as const;
