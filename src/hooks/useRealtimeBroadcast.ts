import { useEffect, useCallback, useRef, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "app/lib/supabase";
import type { RealtimeChannel } from "@supabase/supabase-js";

/**
 * Event handler configuration
 */
interface EventHandler<T = any> {
  event: string;
  onReceive: (payload: T) => void;
}

/**
 * Configuration for useRealtimeBroadcast hook
 */
interface RealtimeBroadcastConfig {
  /** Unique channel name for this broadcast */
  channelName: string;
  /** Array of event handlers to listen to */
  eventHandlers: EventHandler[];
  /** Whether to receive own broadcasts (default: false) */
  receiveSelf?: boolean;
  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Return type for useRealtimeBroadcast hook
 */
interface RealtimeBroadcastReturn {
  /** Broadcast an event to all connected clients */
  broadcast: <T = any>(event: string, payload: T) => Promise<void>;
  /** Check if channel is connected */
  isConnected: boolean;
  /** Manually invalidate query keys */
  invalidate: (queryKey: any[]) => Promise<void>;
}

/**
 * Generic hook for managing Supabase real-time broadcasts
 * 
 * Handles channel creation, subscription, cleanup, and broadcasting
 * with automatic query invalidation support.
 * 
 * @example
 * ```tsx
 * const { broadcast, invalidate } = useRealtimeBroadcast({
 *   channelName: "my-feature",
 *   eventHandlers: [
 *     {
 *       event: "data_updated",
 *       onReceive: (payload) => {
 *         console.log("Received:", payload);
 *         invalidate(["myData", payload.id]);
 *       },
 *     },
 *   ],
 * });
 * 
 * // Broadcast an event
 * await broadcast("data_updated", { id: "123", value: "new" });
 * ```
 */
export function useRealtimeBroadcast({
  channelName,
  eventHandlers,
  receiveSelf = false,
  debug = false,
}: RealtimeBroadcastConfig): RealtimeBroadcastReturn {
  const queryClient = useQueryClient();
  const channelRef = useRef<RealtimeChannel | null>(null);
  const isConnectedRef = useRef(false);
  
  // Store event handlers in a ref to avoid re-subscribing on every render
  const eventHandlersRef = useRef(eventHandlers);
  useEffect(() => {
    eventHandlersRef.current = eventHandlers;
  }, [eventHandlers]);

  // Setup channel and event listeners
  useEffect(() => {
    if (debug) {
      console.log(`📡 [${channelName}] Setting up channel...`);
    }

    // Create channel with configuration
    const channel = supabase.channel(channelName, {
      config: {
        broadcast: { self: receiveSelf },
      },
    });

    // Register all event handlers using the ref
    eventHandlersRef.current.forEach(({ event, onReceive }) => {
      channel.on("broadcast", { event }, ({ payload }) => {
        if (debug) {
          console.log(`📡 [${channelName}] Received event "${event}":`, payload);
        }
        // Use the latest handler from the ref
        const currentHandler = eventHandlersRef.current.find(h => h.event === event);
        if (currentHandler) {
          currentHandler.onReceive(payload);
        }
      });
    });

    // Subscribe to channel
    channel.subscribe((status) => {
      isConnectedRef.current = status === "SUBSCRIBED";
      if (debug) {
        console.log(`📡 [${channelName}] Subscription status:`, status);
      }
    });

    channelRef.current = channel;

    // Cleanup on unmount
    return () => {
      if (debug) {
        console.log(`📡 [${channelName}] Cleaning up channel...`);
      }
      supabase.removeChannel(channel);
      channelRef.current = null;
      isConnectedRef.current = false;
    };
  }, [channelName, receiveSelf, debug]); // Removed eventHandlers from dependencies!

  /**
   * Broadcast an event to all connected clients
   */
  const broadcast = useCallback(
    async <T = any>(event: string, payload: T): Promise<void> => {
      try {
        if (!channelRef.current) {
          throw new Error(`Channel ${channelName} not initialized`);
        }

        if (debug) {
          console.log(`📡 [${channelName}] Broadcasting event "${event}":`, payload);
        }

        await channelRef.current.send({
          type: "broadcast",
          event,
          payload,
        });
      } catch (error) {
        console.error(`Failed to broadcast event "${event}" on channel ${channelName}:`, error);
        throw error;
      }
    },
    [channelName, debug]
  );

  /**
   * Invalidate query cache
   */
  const invalidate = useCallback(
    async (queryKey: any[]): Promise<void> => {
      if (debug) {
        console.log(`🔄 [${channelName}] Invalidating query:`, queryKey);
      }
      await queryClient.invalidateQueries({ queryKey });
    },
    [queryClient, channelName, debug]
  );

  return {
    broadcast,
    isConnected: isConnectedRef.current,
    invalidate,
  };
}

/**
 * Hook for broadcasting with automatic query invalidation
 * 
 * Simplifies the common pattern of broadcasting an event and invalidating queries.
 * 
 * @example
 * ```tsx
 * const { broadcastAndInvalidate } = useRealtimeBroadcastWithInvalidation({
 *   channelName: "openspace-updates",
 *   eventHandlers: [
 *     {
 *       event: "schedule_updated",
 *       queryKey: ["schedules"],
 *     },
 *   ],
 * });
 * 
 * // This will broadcast AND invalidate the query
 * await broadcastAndInvalidate("schedule_updated", { scheduleId: "123" });
 * ```
 */
interface BroadcastWithInvalidationConfig {
  channelName: string;
  eventHandlers: Array<{
    event: string;
    queryKey: any[] | ((payload: any) => any[]);
  }>;
  receiveSelf?: boolean;
  debug?: boolean;
}

export function useRealtimeBroadcastWithInvalidation({
  channelName,
  eventHandlers,
  receiveSelf = false,
  debug = false,
}: BroadcastWithInvalidationConfig) {
  const queryClient = useQueryClient();
  
  // Memoize the mapped event handlers to prevent re-subscribing
  const mappedEventHandlers = useMemo(() => 
    eventHandlers.map(({ event, queryKey }) => ({
      event,
      onReceive: async (payload: any) => {
        const key = typeof queryKey === "function" ? queryKey(payload) : queryKey;
        await queryClient.invalidateQueries({ queryKey: key });
      },
    })),
    [eventHandlers, queryClient]
  );

  const { broadcast, invalidate, isConnected } = useRealtimeBroadcast({
    channelName,
    receiveSelf,
    debug,
    eventHandlers: mappedEventHandlers,
  });

  /**
   * Broadcast an event and automatically invalidate the associated query
   */
  const broadcastAndInvalidate = useCallback(
    async <T = any>(event: string, payload: T): Promise<void> => {
      // Find the query key for this event
      const handler = eventHandlers.find((h) => h.event === event);
      
      if (handler) {
        const key = typeof handler.queryKey === "function" 
          ? handler.queryKey(payload) 
          : handler.queryKey;
        
        // Invalidate first (optimistic local update)
        await invalidate(key);
      }

      // Then broadcast to other clients
      await broadcast(event, payload);
    },
    [broadcast, invalidate, eventHandlers]
  );

  return {
    broadcast,
    broadcastAndInvalidate,
    invalidate,
    isConnected,
  };
}

