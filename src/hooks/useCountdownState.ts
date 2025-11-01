import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../app/lib/supabase";
import { orpc } from "../lib/orpc/client";
import type { CountdownState } from "../lib/orpc/countdown/schemas";

const COUNTDOWN_CHANNEL = "countdown-state";
const BROADCAST_TIMEOUT_MS = 3000; // Consider disconnected if no broadcast for 3 seconds
const FALLBACK_INTERVAL_MS = 1000; // Client-side fallback interval

const DEFAULT_STATE: CountdownState = {
  isRunning: false,
  remainingSeconds: 0,
  totalSeconds: 0,
  lastUpdated: new Date().toISOString(),
  soundEnabled: false,
};

interface UseCountdownStateOptions {
  enableRealtime?: boolean;
}

/**
 * Hook for countdown state management with admin control functions
 *
 * Primary: Receives state broadcasts from server every second
 * Fallback: If no broadcasts received, calculates locally from targetTime
 */
export function useCountdownState(options: UseCountdownStateOptions = {}) {
  const { enableRealtime = true } = options;
  const queryClient = useQueryClient();
  const [state, setState] = useState<CountdownState>(DEFAULT_STATE);
  const [usingFallback, setUsingFallback] = useState(false);

  const lastBroadcastRef = useRef<number>(Date.now());
  const fallbackIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch countdown state using oRPC + Tanstack Query (only when needed)
  const {
    data: serverState,
    isLoading: loading,
    error: queryError,
    refetch,
  } = useQuery(
    orpc.countdown.getState.queryOptions({
      enabled: state.remainingSeconds === 0 && !state.isRunning, // Only fetch if we have no meaningful state
      staleTime: Infinity, // We rely on broadcasts
      gcTime: Infinity,
      refetchOnMount: false, // Don't fetch on mount - use broadcasts
      refetchOnWindowFocus: false, // Broadcasts keep us in sync
      refetchOnReconnect: true, // Fetch on reconnect to ensure sync
      refetchInterval: false, // No polling - broadcasts only
    })
  );

  // Initialize state from server
  useEffect(() => {
    if (serverState) {
      setState(serverState);
      lastBroadcastRef.current = Date.now();
    }
  }, [serverState]);

  /**
   * Calculate remaining seconds from targetTime
   * Used as fallback when WebSocket is disconnected
   */
  const calculateRemainingSeconds = useCallback((currentState: CountdownState): number => {
    if (currentState.targetTime) {
      return Math.max(0, Math.floor((new Date(currentState.targetTime).getTime() - Date.now()) / 1000));
    }
    return currentState.remainingSeconds;
  }, []);

  /**
   * Client-side fallback ticker when WebSocket fails
   */
  useEffect(() => {
    if (!state.isRunning || !usingFallback) {
      if (fallbackIntervalRef.current) {
        clearInterval(fallbackIntervalRef.current);
        fallbackIntervalRef.current = null;
      }
      return;
    }

    console.log("⚠️ [Countdown] Using client-side fallback calculation");

    fallbackIntervalRef.current = setInterval(() => {
      setState((prev) => {
        if (!prev.isRunning) return prev;

        const remaining = calculateRemainingSeconds(prev);

        if (remaining === 0) {
          return {
            ...prev,
            isRunning: false,
            remainingSeconds: 0,
            targetTime: undefined,
          };
        }

        return {
          ...prev,
          remainingSeconds: remaining,
          lastUpdated: new Date().toISOString(),
        };
      });
    }, FALLBACK_INTERVAL_MS);

    return () => {
      if (fallbackIntervalRef.current) {
        clearInterval(fallbackIntervalRef.current);
        fallbackIntervalRef.current = null;
      }
    };
  }, [usingFallback, state.isRunning, calculateRemainingSeconds]);

  /**
   * Monitor WebSocket connection health
   */
  useEffect(() => {
    if (!enableRealtime) return;

    const checkInterval = setInterval(() => {
      const timeSinceLastBroadcast = Date.now() - lastBroadcastRef.current;

      if (timeSinceLastBroadcast > BROADCAST_TIMEOUT_MS) {
        if (!usingFallback) {
          console.warn("⚠️ [Countdown] No broadcasts received, switching to fallback mode");
          setUsingFallback(true);
        }
      } else {
        if (usingFallback) {
          console.log("✅ [Countdown] Broadcasts resumed, switching back to broadcast mode");
          setUsingFallback(false);
        }
      }
    }, 1000);

    return () => clearInterval(checkInterval);
  }, [enableRealtime, usingFallback]);

  // Update countdown state mutation using oRPC + Tanstack Query
  const updateMutation = useMutation(
    orpc.countdown.updateState.mutationOptions({
      onSuccess: (result) => {
        console.log("⏱️ [Countdown] State updated via oRPC");
        setState(result);
        queryClient.setQueryData(orpc.countdown.getState.queryKey(), result);
        // Server-side broadcast service will handle broadcasting to all clients
      },
      onError: (err) => {
        console.error("❌ [Countdown] Failed to update state:", err);
      },
    })
  );

  const updateState = useCallback(
    async (
      action: "start" | "pause" | "reset" | "setDuration" | "toggleSound" | "setTargetTime",
      durationSeconds?: number,
      targetTime?: string
    ) => {
      // Backend calculates targetTime automatically on "start"
      return updateMutation.mutateAsync({
        action,
        durationSeconds,
        targetTime,
      });
    },
    [updateMutation]
  );

  // Subscribe to countdown broadcasts from server (every second)
  useEffect(() => {
    if (!enableRealtime) return;

    console.log("⏱️ [Countdown] Subscribing to countdown broadcasts");

    const channel = supabase.channel(COUNTDOWN_CHANNEL);

    channel
      .on("broadcast", { event: "countdown_tick" }, ({ payload }: { payload: CountdownState }) => {
        // Server sends the fully calculated state every second
        setState(payload);
        queryClient.setQueryData(orpc.countdown.getState.queryKey(), payload);
        lastBroadcastRef.current = Date.now();

        // If we were using fallback, we're back online
        if (usingFallback) {
          console.log("✅ [Countdown] Broadcast received, exiting fallback mode");
          setUsingFallback(false);
        }
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          console.log("✅ [Countdown] Subscribed to countdown broadcasts");
          lastBroadcastRef.current = Date.now();
        } else if (status === "CHANNEL_ERROR") {
          console.error("❌ [Countdown] Failed to subscribe, will use fallback");
          setUsingFallback(true);
        } else if (status === "CLOSED") {
          console.warn("⚠️ [Countdown] Channel closed, will use fallback");
          setUsingFallback(true);
        }
      });

    return () => {
      console.log("🔌 [Countdown] Unsubscribing from countdown broadcasts");
      supabase.removeChannel(channel);
    };
  }, [enableRealtime, queryClient, usingFallback]);

  /**
   * Handle page visibility changes (tab switch, phone lock/unlock)
   * Refetch state when page becomes visible again to ensure sync
   */
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        console.log("👀 [Countdown] Page visible again, refreshing state");
        // Refetch from server to ensure we have latest state
        refetch();
        // Reset broadcast tracking
        lastBroadcastRef.current = Date.now();
      } else {
        console.log("🙈 [Countdown] Page hidden");
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [refetch]);

  return {
    state,
    loading: loading && state.remainingSeconds === 0, // Only show loading during initial fetch
    error: queryError ? String(queryError) : null,
    usingFallback, // Whether we're using client-side fallback
    updateState,
    refetch,
  };
}
