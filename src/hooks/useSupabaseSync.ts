/**
 * Realtime sync hook for OpenSpace cards (WebSocket transport behind the
 * legacy supabase-shaped facade). Works alongside oRPC/React Query: remote
 * events patch the cache surgically so consumers animate moves instead of
 * refetching the whole list.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { v4 as uuidv4 } from "uuid";
import { supabase, type RealtimeChannel } from "../app/lib/supabase";
import { eventChannel } from "../lib/realtime/channels";
import { orpc } from "../lib/orpc";
import type { StickyNote } from "../lib/orpc";

interface OpenSpaceRealtimeEvent {
  type: "CARD_UPDATE" | "CARD_SWAP" | "CARD_CREATE" | "CARD_DELETE";
  payload: {
    openSpaceId: string;
    cardId?: string;
    cardIds?: [string, string]; // For swaps
    updatedCard?: StickyNote;
    timestamp: string;
    sessionId: string; // To prevent echo from same session
  };
}

interface UseSupabaseSyncOptions {
  openSpaceId: string;
  enabled?: boolean;
}

const RECENT_UPDATE_PULSE_MS = 1600;

export const useSupabaseSync = ({ openSpaceId, enabled = true }: UseSupabaseSyncOptions) => {
  const queryClient = useQueryClient();
  const sessionIdRef = useRef(uuidv4()); // Unique session ID
  const isLocalUpdateRef = useRef(false);
  const channelRef = useRef<RealtimeChannel | null>(null); // Store channel reference for broadcasting
  const isSubscribedRef = useRef(false); // Track subscription status
  const lastProcessedEventRef = useRef<{ id: string; timestamp: number } | null>(null); // Deduplicate events

  const [isConnected, setIsConnected] = useState(false);

  // Ids of cards touched by a remote update in the last moment, so cards can
  // pulse in place (state-driven; the old version poked classes into the DOM
  // and never worked on surfaces without data-note-id, like the kiosk).
  const [recentlyUpdatedIds, setRecentlyUpdatedIds] = useState<ReadonlySet<string>>(new Set());
  const pulseTimeoutsRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const markUpdated = useCallback((cardId: string) => {
    setRecentlyUpdatedIds((prev) => {
      const next = new Set(prev);
      next.add(cardId);
      return next;
    });

    const existing = pulseTimeoutsRef.current.get(cardId);
    if (existing) clearTimeout(existing);
    pulseTimeoutsRef.current.set(
      cardId,
      setTimeout(() => {
        pulseTimeoutsRef.current.delete(cardId);
        setRecentlyUpdatedIds((prev) => {
          const next = new Set(prev);
          next.delete(cardId);
          return next;
        });
      }, RECENT_UPDATE_PULSE_MS)
    );
  }, []);

  useEffect(() => {
    const timeouts = pulseTimeoutsRef.current;
    return () => {
      timeouts.forEach((t) => clearTimeout(t));
      timeouts.clear();
    };
  }, []);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    // Subscribe to OpenSpace realtime events
    const channel = supabase
      .channel(eventChannel(openSpaceId, "sync"))
      .on("broadcast", { event: "card_change" }, (payload: { payload: OpenSpaceRealtimeEvent }) => {
        const event = payload.payload;

        // Ignore events from same session to prevent loops
        if (event.payload.sessionId === sessionIdRef.current) {
          return;
        }

        // Prevent local updates from triggering sync
        if (isLocalUpdateRef.current) {
          return;
        }

        // Deduplicate: Ignore if same event was processed in last 500ms
        const eventId = `${event.type}-${event.payload.cardId || event.payload.cardIds?.join("-")}-${event.payload.timestamp}`;
        const now = Date.now();
        if (
          lastProcessedEventRef.current &&
          lastProcessedEventRef.current.id === eventId &&
          now - lastProcessedEventRef.current.timestamp < 500
        ) {
          return;
        }
        lastProcessedEventRef.current = { id: eventId, timestamp: now };

        // Trigger visual activity indicator
        window.dispatchEvent(new CustomEvent("openspace:realtime-activity"));

        const listKey = orpc.tracks.list.queryKey({ input: { openSpaceId } });
        const invalidateHighlighted = () =>
          queryClient.invalidateQueries({ queryKey: ["tracks", "highlighted", openSpaceId] });

        // Update React Query cache based on event type
        switch (event.type) {
          case "CARD_UPDATE":
            if (event.payload.updatedCard) {
              queryClient.setQueryData<StickyNote[]>(listKey, (oldNotes = []) =>
                oldNotes.map((note) => (note.id === event.payload.cardId ? event.payload.updatedCard! : note))
              );
              invalidateHighlighted();
              if (event.payload.cardId) markUpdated(event.payload.cardId);
            }
            break;

          case "CARD_SWAP":
            if (event.payload.cardIds) {
              const [aId, bId] = event.payload.cardIds;
              let patched = false;
              queryClient.setQueryData<StickyNote[]>(listKey, (oldNotes = []) => {
                const a = oldNotes.find((n) => n.id === aId);
                const b = oldNotes.find((n) => n.id === bId);
                if (!a || !b) return oldNotes;
                patched = true;
                return oldNotes.map((note) =>
                  note.id === aId
                    ? { ...note, room: b.room, timeSlot: b.timeSlot }
                    : note.id === bId
                      ? { ...note, room: a.room, timeSlot: a.timeSlot }
                      : note
                );
              });
              // Unknown cards (e.g. this client missed a create) → resync.
              if (!patched) {
                queryClient.invalidateQueries({ queryKey: orpc.tracks.list.key({ input: { openSpaceId } }) });
              }
              invalidateHighlighted();
            }
            break;

          case "CARD_CREATE":
            if (event.payload.updatedCard) {
              queryClient.setQueryData<StickyNote[]>(listKey, (oldNotes = []) => {
                if (oldNotes.some((note) => note.id === event.payload.cardId)) return oldNotes;
                return [...oldNotes, event.payload.updatedCard!];
              });
              invalidateHighlighted();
            }
            break;

          case "CARD_DELETE":
            if (event.payload.cardId) {
              queryClient.setQueryData<StickyNote[]>(listKey, (oldNotes = []) =>
                oldNotes.filter((note) => note.id !== event.payload.cardId)
              );
              invalidateHighlighted();
            }
            break;
        }
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          isSubscribedRef.current = true;
          setIsConnected(true);
        } else {
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            console.error(`[Sync] Realtime channel ${status}`);
          }
          isSubscribedRef.current = false;
          setIsConnected(false);
        }
      });

    // Store channel reference for broadcasting
    channelRef.current = channel;

    return () => {
      isSubscribedRef.current = false;
      channelRef.current = null;
      setIsConnected(false);
      supabase.removeChannel(channel);
    };
  }, [openSpaceId, enabled, queryClient, markUpdated]);

  const broadcast = useCallback(
    async (event: OpenSpaceRealtimeEvent) => {
      if (!enabled || !channelRef.current || !isSubscribedRef.current) {
        return;
      }

      isLocalUpdateRef.current = true;

      await channelRef.current.send({
        type: "broadcast",
        event: "card_change",
        payload: event,
      });

      // Reset flag after short delay to allow for the broadcast
      setTimeout(() => {
        isLocalUpdateRef.current = false;
      }, 100);
    },
    [enabled]
  );

  const broadcastCardUpdate = useCallback(
    (card: StickyNote) =>
      broadcast({
        type: "CARD_UPDATE",
        payload: {
          openSpaceId,
          cardId: card.id,
          updatedCard: card,
          timestamp: new Date().toISOString(),
          sessionId: sessionIdRef.current,
        },
      }),
    [broadcast, openSpaceId]
  );

  const broadcastCardSwap = useCallback(
    (cardAId: string, cardBId: string) =>
      broadcast({
        type: "CARD_SWAP",
        payload: {
          openSpaceId,
          cardIds: [cardAId, cardBId],
          timestamp: new Date().toISOString(),
          sessionId: sessionIdRef.current,
        },
      }),
    [broadcast, openSpaceId]
  );

  const broadcastCardCreate = useCallback(
    (card: StickyNote) =>
      broadcast({
        type: "CARD_CREATE",
        payload: {
          openSpaceId,
          cardId: card.id,
          updatedCard: card,
          timestamp: new Date().toISOString(),
          sessionId: sessionIdRef.current,
        },
      }),
    [broadcast, openSpaceId]
  );

  const broadcastCardDelete = useCallback(
    (cardId: string) =>
      broadcast({
        type: "CARD_DELETE",
        payload: {
          openSpaceId,
          cardId,
          timestamp: new Date().toISOString(),
          sessionId: sessionIdRef.current,
        },
      }),
    [broadcast, openSpaceId]
  );

  return {
    broadcastCardUpdate,
    broadcastCardSwap,
    broadcastCardCreate,
    broadcastCardDelete,
    isConnected,
    recentlyUpdatedIds,
    sessionId: sessionIdRef.current,
  };
};
