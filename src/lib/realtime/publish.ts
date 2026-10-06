import "server-only";

import { hub } from "./hub";

/**
 * Where WebSocket connections live when they aren't on this process: the
 * sidecar from scripts/dev-realtime.mjs. `next dev` and `next start` can't
 * upgrade sockets, so dev always uses it and the e2e suite points at its own
 * via REALTIME_SIDECAR_URL. Production leaves it unset.
 */
function sidecarUrl(): string | undefined {
  return (
    process.env.REALTIME_SIDECAR_URL ?? (process.env.NODE_ENV === "development" ? "http://127.0.0.1:3199" : undefined)
  );
}

/**
 * Publish a realtime event from server code (oRPC services). In production the
 * fan-out is local + Redis backplane; with a sidecar, the event is also
 * forwarded there over HTTP.
 */
export async function publishServer(channel: string, event: string, payload: unknown): Promise<void> {
  await hub.publish(channel, event, payload);

  const sidecar = sidecarUrl();
  if (sidecar) {
    await fetch(`${sidecar}/publish`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ch: channel, ev: event, pl: payload }),
    }).catch(() => {
      // Sidecar not running — realtime is best-effort in dev.
    });
  }
}
