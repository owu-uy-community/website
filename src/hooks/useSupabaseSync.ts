/**
 * Supabase realtime sync hook for OpenSpace cards
 * This works alongside oRPC/React Query for multi-device sync
 */

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "../app/lib/supabase";
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

// Cross-browser UUID generator fallback
const generateUUID = (): string => {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  // Fallback for environments without crypto.randomUUID
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

export const useSupabaseSync = ({ openSpaceId, enabled = true }: UseSupabaseSyncOptions) => {
  const queryClient = useQueryClient();
  const sessionIdRef = useRef(generateUUID()); // Unique session ID with fallback
  const isLocalUpdateRef = useRef(false);
  const channelRef = useRef<RealtimeChannel | null>(null); // Store channel reference for broadcasting
  const isSubscribedRef = useRef(false); // Track subscription status
  const lastProcessedEventRef = useRef<{ id: string; timestamp: number } | null>(null); // Deduplicate events

  useEffect(() => {
    if (!enabled) {
      return;
    }

    console.log("🔌 [Sync] Subscribing to realtime channel:", `openspace:${openSpaceId}`);

    // Subscribe to OpenSpace realtime events
    const channel = supabase
      .channel(`openspace:${openSpaceId}`)
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
          console.log("⏭️ [Sync] Skipping duplicate event");
          return;
        }
        lastProcessedEventRef.current = { id: eventId, timestamp: now };

        console.log("📡 [Sync] Processing event:", event.type, event.payload.cardId);

        // Trigger visual activity indicator
        window.dispatchEvent(new CustomEvent("openspace:realtime-activity"));

        // Update React Query cache based on event type
        switch (event.type) {
          case "CARD_UPDATE":
            if (event.payload.updatedCard) {
              // Update the main tracks list cache
              queryClient.setQueryData<StickyNote[]>(orpc.tracks.list.queryKey(), (oldNotes = []) => {
                return oldNotes.map((note) => 
                  note.id === event.payload.cardId ? event.payload.updatedCard! : note
                );
              });

              // Also invalidate highlighted tracks query (used by map kiosk "Sesión seleccionada")
              queryClient.invalidateQueries({
                queryKey: ["tracks", "highlighted", openSpaceId],
              });
              
              console.log("✅ [Sync] Updated sticky notes + highlighted tracks");

              // Add visual highlight to the updated card
              setTimeout(() => {
                const cardElement = document.querySelector(`[data-note-id="${event.payload.cardId}"]`);
                if (cardElement) {
                  cardElement.classList.add("realtime-updated");
                  setTimeout(() => {
                    cardElement.classList.remove("realtime-updated");
                  }, 2000);
                }
              }, 100);
            }
            break;

          case "CARD_SWAP":
            if (event.payload.cardIds) {
              // Refresh the entire list for swaps to ensure consistency
              queryClient.invalidateQueries({
                queryKey: orpc.tracks.list.key(),
              });
              // Also invalidate highlighted tracks
              queryClient.invalidateQueries({
                queryKey: ["tracks", "highlighted", openSpaceId],
              });
              console.log("✅ [Sync] Swapped notes + invalidated highlighted tracks");
            }
            break;

          case "CARD_CREATE":
            if (event.payload.updatedCard) {
              queryClient.setQueryData<StickyNote[]>(orpc.tracks.list.queryKey(), (oldNotes = []) => [
                ...oldNotes,
                event.payload.updatedCard!,
              ]);
              // Also invalidate highlighted tracks
              queryClient.invalidateQueries({
                queryKey: ["tracks", "highlighted", openSpaceId],
              });
              console.log("✅ [Sync] Created note + invalidated highlighted tracks");
            }
            break;

          case "CARD_DELETE":
            if (event.payload.cardId) {
              queryClient.setQueryData<StickyNote[]>(orpc.tracks.list.queryKey(), (oldNotes = []) =>
                oldNotes.filter((note) => note.id !== event.payload.cardId)
              );
              // Also invalidate highlighted tracks
              queryClient.invalidateQueries({
                queryKey: ["tracks", "highlighted", openSpaceId],
              });
              console.log("✅ [Sync] Deleted note + invalidated highlighted tracks");
            }
            break;
        }
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          isSubscribedRef.current = true;
          console.log("✅ [Sync] Channel subscribed and ready");
        } else if (status === "CHANNEL_ERROR") {
          console.error("❌ [Sync] Channel subscription error!");
          isSubscribedRef.current = false;
        } else if (status === "TIMED_OUT") {
          console.error("⏱️ [Sync] Channel subscription timed out!");
          isSubscribedRef.current = false;
        } else if (status === "CLOSED") {
          console.log("🔌 [Sync] Channel closed");
          isSubscribedRef.current = false;
        }
      });

    // Store channel reference for broadcasting
    channelRef.current = channel;

    return () => {
      console.log("🔌 [Sync] Unsubscribing from channel:", `openspace:${openSpaceId}`);
      isSubscribedRef.current = false;
      channelRef.current = null;
      supabase.removeChannel(channel);
    };
  }, [openSpaceId, enabled, queryClient]);

  // Broadcasting functions
  const broadcastCardUpdate = async (card: StickyNote) => {
    if (!enabled || !channelRef.current || !isSubscribedRef.current) {
      console.error("❌ [Sync] Broadcast skipped: not ready");
      return;
    }

    isLocalUpdateRef.current = true;

    const event: OpenSpaceRealtimeEvent = {
      type: "CARD_UPDATE",
      payload: {
        openSpaceId,
        cardId: card.id,
        updatedCard: card,
        timestamp: new Date().toISOString(),
        sessionId: sessionIdRef.current,
      },
    };

    console.log("📤 [Sync] Broadcasting CARD_UPDATE:", card.id);
    
    await channelRef.current.send({
      type: "broadcast",
      event: "card_change",
      payload: event,
    });

    // Reset flag after short delay to allow for the broadcast
    setTimeout(() => {
      isLocalUpdateRef.current = false;
    }, 100);
  };

  const broadcastCardSwap = async (cardAId: string, cardBId: string) => {
    if (!enabled || !channelRef.current || !isSubscribedRef.current) {
      return;
    }

    isLocalUpdateRef.current = true;

    const event: OpenSpaceRealtimeEvent = {
      type: "CARD_SWAP",
      payload: {
        openSpaceId,
        cardIds: [cardAId, cardBId],
        timestamp: new Date().toISOString(),
        sessionId: sessionIdRef.current,
      },
    };

    console.log("📤 [Sync] Broadcasting CARD_SWAP:", cardAId, cardBId);

    await channelRef.current.send({
      type: "broadcast",
      event: "card_change",
      payload: event,
    });

    // Reset flag after short delay
    setTimeout(() => {
      isLocalUpdateRef.current = false;
    }, 100);
  };

  const broadcastCardCreate = async (card: StickyNote) => {
    if (!enabled || !channelRef.current || !isSubscribedRef.current) {
      return;
    }

    isLocalUpdateRef.current = true;

    const event: OpenSpaceRealtimeEvent = {
      type: "CARD_CREATE",
      payload: {
        openSpaceId,
        cardId: card.id,
        updatedCard: card,
        timestamp: new Date().toISOString(),
        sessionId: sessionIdRef.current,
      },
    };

    console.log("📤 [Sync] Broadcasting CARD_CREATE:", card.id);

    await channelRef.current.send({
      type: "broadcast",
      event: "card_change",
      payload: event,
    });

    setTimeout(() => {
      isLocalUpdateRef.current = false;
    }, 100);
  };

  const broadcastCardDelete = async (cardId: string) => {
    if (!enabled || !channelRef.current || !isSubscribedRef.current) {
      return;
    }

    isLocalUpdateRef.current = true;

    const event: OpenSpaceRealtimeEvent = {
      type: "CARD_DELETE",
      payload: {
        openSpaceId,
        cardId,
        timestamp: new Date().toISOString(),
        sessionId: sessionIdRef.current,
      },
    };

    console.log("📤 [Sync] Broadcasting CARD_DELETE:", cardId);

    await channelRef.current.send({
      type: "broadcast",
      event: "card_change",
      payload: event,
    });

    setTimeout(() => {
      isLocalUpdateRef.current = false;
    }, 100);
  };

  return {
    broadcastCardUpdate,
    broadcastCardSwap,
    broadcastCardCreate,
    broadcastCardDelete,
    sessionId: sessionIdRef.current,
  };
};
