import "server-only";

import { obsQueueChannel } from "./channels";
import { publishServer } from "./publish";

/**
 * Domain broadcast helpers fired from the oRPC write services, so EVERY API
 * writer — the admin UI, the Owy bot (/owy), a script — notifies the connected
 * screens (grid admin, kiosk, OBS pages) instead of only the browser that
 * happened to make the change.
 *
 * Payloads match what the client hooks already emit and apply
 * (`src/hooks/useSupabaseSync.ts`, `src/hooks/useObsQueue.ts`), so
 * client- and server-sent events are interchangeable. Applying an event twice
 * is harmless: the sync handlers are idempotent.
 *
 * Best-effort — a failed broadcast never fails the mutation.
 */

/** Notify the OBS control screens that a rig's queue state changed. */
export async function broadcastOBSStateChange(instanceId: number, version: number): Promise<void> {
  await publishServer(obsQueueChannel(instanceId), "state_update", {
    instanceId,
    version,
    timestamp: Date.now(),
    type: "full_state" as const,
  }).catch((error) => {
    console.error("❌ [Realtime] Failed to broadcast OBS state change:", error);
  });
}
