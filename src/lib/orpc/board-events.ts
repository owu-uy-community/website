import { Effect } from "effect";

import { eventChannel } from "../realtime/channels";
import { Realtime } from "./services";
import type { StickyNote } from "./tracks/schemas";

export type CardChangeType = "CARD_UPDATE" | "CARD_SWAP" | "CARD_CREATE" | "CARD_DELETE";

/** Marks server-originated events; clients skip echoes by their own sender id. */
const SESSION_ID = "owu-server";

/**
 * Tell an event's board screens (grid admin, kiosk) that cards changed. The
 * payload is what the client hooks already emit and apply
 * (src/hooks/useSupabaseSync.ts), so server- and client-sent events are
 * interchangeable; applying one twice is harmless. That is why a swap carries
 * both cards where they ended up: "trade places" applied twice — the screen
 * that made the swap hears it back — trades them straight back.
 */
export const cardChanged = (change: {
  type: CardChangeType;
  openSpaceId: string;
  cardId?: string;
  cardIds?: [string, string];
  updatedCard?: StickyNote;
  updatedCards?: StickyNote[];
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
        ...(change.updatedCards ? { updatedCards: change.updatedCards } : {}),
        timestamp: new Date().toISOString(),
        sessionId: SESSION_ID,
      },
    });
  });

/** Cards that vanished with a deleted room or slot: one CARD_DELETE each. */
export const cardsDeleted = (openSpaceId: string, cardIds: readonly string[]) =>
  Effect.forEach(cardIds, (cardId) => cardChanged({ type: "CARD_DELETE", openSpaceId, cardId }), { discard: true });

/**
 * An event's rooms or slots changed (created, edited, deleted, reordered).
 * Screens re-read the grid's axes — and the talks, whose room and slot labels
 * come from them. The payload is a ping on purpose: the channel is public.
 */
export const structureChanged = (openSpaceId: string) =>
  Effect.gen(function* () {
    const realtime = yield* Realtime;
    yield* realtime.publish(eventChannel(openSpaceId, "sync"), "structure_change", { openSpaceId });
  });
