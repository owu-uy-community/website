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

/**
 * OBS queue state per rig instance (1 = admin screen, 2 = standalone app).
 * Global like the launchpad: the rigs are OWU's own hardware, not per-tenant.
 * Publishers and subscribers must share this name — they used to disagree.
 */
export function obsQueueChannel(instanceId: number): string {
  return `obs_queue_listener_${instanceId}`;
}
