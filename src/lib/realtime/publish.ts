import "server-only";

import { hub } from "./hub";

const isDev = process.env.NODE_ENV === "development";

function sidecarUrl(): string {
  return process.env.REALTIME_SIDECAR_URL ?? "http://127.0.0.1:3199";
}

/**
 * Publish a realtime event from server code (oRPC services). In production the
 * fan-out is local + Redis backplane; in dev, WebSocket connections live on
 * the sidecar process, so the event is forwarded there over HTTP.
 */
export async function publishServer(channel: string, event: string, payload: unknown): Promise<void> {
  await hub.publish(channel, event, payload);

  if (isDev) {
    await fetch(`${sidecarUrl()}/publish`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ch: channel, ev: event, pl: payload }),
    }).catch(() => {
      // Sidecar not running — realtime is best-effort in dev.
    });
  }
}
