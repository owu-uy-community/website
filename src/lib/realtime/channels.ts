/**
 * Realtime channel naming. Event-scoped channels carry a topic suffix so one
 * subscription key never leaks across tenants.
 */

/**
 * `ops` carries content-free pings about the event day (incidents, rooms, check-ins, the run of
 * show, screens, activity): it is public, so the data always comes from guarded reads.
 */
export type EventChannelTopic = "sync" | "countdown" | "highlights" | "cast" | "staff" | "ops";

export function eventChannel(eventId: string, topic: EventChannelTopic): string {
  return `event:${eventId}:${topic}`;
}

/** Site-ops channels that intentionally stay global (OWU's physical rigs). */
export const GLOBAL_CHANNELS = {
  launchpad: "launchpad-sounds",
  /** Owy Stage: what the video wall shows + Owy face events (see src/lib/owy-stage). */
  owyStage: "owy-stage",
  /** Venue screens: "identify" / "reload" for one screen id (harmless, server-sent only). */
  screens: "screens",
} as const;

/** Who has the admin open for an event, and on which page. Admin sessions only. */
export function presenceChannel(eventId: string): string {
  return `private:presence:${eventId}`;
}

/**
 * OBS queue state per rig instance (1 = admin screen, 2 = standalone app).
 * Global like the launchpad: the rigs are OWU's own hardware, not per-tenant.
 * Publishers and subscribers must share this name — they used to disagree.
 */
export function obsQueueChannel(instanceId: number): string {
  return `obs_queue_listener_${instanceId}`;
}

/**
 * OBS control bus per rig: commands for the executor tab and the status it
 * reports back (see src/lib/orpc/obs-control). `private:` — admin sessions
 * only, since anyone on it could take the stream down.
 */
export function obsControlChannel(instanceId: number): string {
  return `private:obs:${instanceId}`;
}
