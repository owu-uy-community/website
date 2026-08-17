/**
 * Wire protocol shared by the browser client, the Vercel WebSocket route and
 * the local dev sidecar. One multiplexed connection carries many channels.
 */

export type ClientFrame =
  | { t: "sub"; ch: string }
  | { t: "unsub"; ch: string }
  | { t: "pub"; ch: string; ev: string; pl: unknown; sid?: string }
  | { t: "ping" };

export type ServerFrame =
  | { t: "msg"; ch: string; ev: string; pl: unknown; sid?: string }
  | { t: "ok"; ch: string }
  | { t: "err"; msg: string; ch?: string }
  | { t: "pong" };

export function parseFrame<T>(raw: unknown): T | null {
  if (typeof raw !== "string") return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && "t" in parsed) return parsed as T;
  } catch {
    // fallthrough
  }

  return null;
}

/** Channels that unauthenticated connections may subscribe to (public displays). */
export function isPublicChannel(channel: string): boolean {
  return !channel.startsWith("private:");
}
