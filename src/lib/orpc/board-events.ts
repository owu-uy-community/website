import { Effect } from "effect";

import { eventChannel } from "../realtime/channels";
import { Realtime } from "./services";
import type { StickyNote } from "./sticky-notes/schemas";

export type CardChangeType = "CARD_UPDATE" | "CARD_SWAP" | "CARD_CREATE" | "CARD_DELETE";

/** Marks server-originated events; clients skip echoes by their own sender id. */
const SESSION_ID = "owu-server";

/**
 * Tell an event's board screens (grid admin, kiosk) that cards changed. The
 * payload is what the client hooks already emit and apply
 * (src/hooks/useSupabaseSync.ts), so server- and client-sent events are
 * interchangeable; applying one twice is harmless.
 */
export const cardChanged = (change: {
  type: CardChangeType;
  openSpaceId: string;
  cardId?: string;
  cardIds?: [string, string];
  updatedCard?: StickyNote;
}) =>
  Effect.gen(function* () {
    const realtime = yield* Realtime;
    yield* realtime.publish(eventChannel(change.openSpaceId, "sync"), "card_change", {
      type: change.type,
      payload: {
        openSpaceId: change.openSpaceId,
        ...(change.cardId ? { cardId: change.cardId } : {}),
        ...(change.cardIds ? { cardIds: change.cardIds } : {}),
        ...(change.updatedCard ? { updatedCard: change.updatedCard } : {}),
        timestamp: new Date().toISOString(),
        sessionId: SESSION_ID,
      },
    });
  });

/** Cards that vanished with a deleted room or slot: one CARD_DELETE each. */
export const cardsDeleted = (openSpaceId: string, cardIds: readonly string[]) =>
  Effect.forEach(cardIds, (cardId) => cardChanged({ type: "CARD_DELETE", openSpaceId, cardId }), { discard: true });
