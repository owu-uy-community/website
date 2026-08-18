import "server-only";

import type { StickyNote } from "../orpc/sticky-notes/schemas";
import { eventChannel, obsQueueChannel } from "./channels";
import { publishServer } from "./publish";

/**
 * Domain broadcast helpers fired from the oRPC write services, so EVERY API
 * writer — the admin UI, the Owy bot (/owy), a script — notifies the connected
 * screens (grid admin, kiosk, OBS pages) instead of only the browser that
 * happened to make the change.
 *
 * Payloads match what the client hooks already emit and apply
 * (`src/hooks/useSupabaseSync.ts`, `src/hooks/useOBSQueueStateHybrid.ts`), so
 * client- and server-sent events are interchangeable. Applying an event twice
 * is harmless: the sync handlers are idempotent.
 *
 * Best-effort — a failed broadcast never fails the mutation.
 */

/** Marks server-originated events; clients skip echoes by their own sender id. */
const SESSION_ID = "owu-server";

export type CardChangeType = "CARD_UPDATE" | "CARD_SWAP" | "CARD_CREATE" | "CARD_DELETE";

/** Notify an event's board screens (grid admin, kiosk) about a card change. */
export async function broadcastCardChange(options: {
  type: CardChangeType;
  openSpaceId: string;
  cardId?: string;
  cardIds?: [string, string];
  updatedCard?: StickyNote;
}): Promise<void> {
  await publishServer(eventChannel(options.openSpaceId, "sync"), "card_change", {
    type: options.type,
    payload: {
      openSpaceId: options.openSpaceId,
      ...(options.cardId ? { cardId: options.cardId } : {}),
      ...(options.cardIds ? { cardIds: options.cardIds } : {}),
      ...(options.updatedCard ? { updatedCard: options.updatedCard } : {}),
      timestamp: new Date().toISOString(),
      sessionId: SESSION_ID,
    },
  }).catch((error) => {
    console.error("❌ [Realtime] Failed to broadcast card change:", error);
  });
}

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
