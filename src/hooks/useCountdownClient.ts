import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../app/lib/supabase";
import { orpc } from "../lib/orpc/client";
import type { CountdownState } from "../lib/orpc/countdown/schemas";

const COUNTDOWN_CHANNEL = "countdown-state";

const DEFAULT_STATE: CountdownState = {
  isRunning: false,
  remainingSeconds: 0,
  totalSeconds: 0,
  lastUpdated: new Date().toISOString(),
  soundEnabled: false,
};

interface UseCountdownClientOptions {
  enableRealtime?: boolean;
}

/**
 * Pure client-side countdown with targetTime-based calculation
 *
 * Architecture:
 * - Server stores targetTime in DB (one-time write)
 * - Server broadcasts targetTime changes (not every second!)
 * - ALL clients calculate remainingSeconds independently
 *
 * Benefits:
 * - Zero ongoing server load
 * - Zero ongoing DB queries
 * - Survives server restarts
 * - Works in serverless/edge
 * - Infinitely scalable
 * - Perfect synchronization (all clients use same targetTime)
 */
export function useCountdownClient(options: UseCountdownClientOptions = {}) {
  const { enableRealtime = true } = options;
  const queryClient = useQueryClient();
  const [baseState, setBaseState] = useState<CountdownState>(DEFAULT_STATE);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch initial state (targetTime) - ALWAYS on first mount
  // This ensures users who join late get the current state
  const {
    data: serverState,
    isLoading: loading,
    error: queryError,
    refetch,
    isError,
  } = useQuery(
    orpc.countdown.getState.queryOptions({
      staleTime: Infinity,
      gcTime: Infinity,
      refetchOnMount: true, // ✅ Fetch on mount to get current state
      refetchOnWindowFocus: false, // Don't refetch on tab switch (broadcasts handle it)
      refetchOnReconnect: true, // Fetch on reconnect to ensure sync
      refetchInterval: false, // No polling
      retry: 3, // ✅ Retry 3 times on failure
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000), // Exponential backoff
    })
  );

  // Initialize state from server
  useEffect(() => {
    if (serverState) {
      setBaseState(serverState);
    }
  }, [serverState]);

  /**
   * Calculate remaining seconds from targetTime
   * This is the ONLY calculation - no server needed!
   */
  const calculateRemainingSeconds = useCallback((state: CountdownState): number => {
    if (state.targetTime) {
      return Math.max(0, Math.floor((new Date(state.targetTime).getTime() - Date.now()) / 1000));
    }
    return state.remainingSeconds;
  }, []);

  /**
   * Client-side ticker - updates display every second
   * Calculates from targetTime, not server broadcasts
   */
  useEffect(() => {
    if (!baseState.isRunning) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    // Update every second
    intervalRef.current = setInterval(() => {
      setBaseState((prev) => {
        const remaining = calculateRemainingSeconds(prev);

        // Auto-pause at zero
        if (remaining === 0 && prev.isRunning) {
          return {
            ...prev,
            isRunning: false,
            remainingSeconds: 0,
            targetTime: undefined,
            lastUpdated: new Date().toISOString(),
          };
        }

        // Just update timestamp to trigger re-render
        // remainingSeconds will be calculated from targetTime in the return value
        return {
          ...prev,
          lastUpdated: new Date().toISOString(),
        };
      });
    }, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [baseState.isRunning, calculateRemainingSeconds]);

  /**
   * Subscribe to state changes (targetTime updates from admin)
   * Server only broadcasts when admin changes something (start/pause/reset)
   * NOT every second!
   */
  useEffect(() => {
    if (!enableRealtime) return;

    console.log("⏱️ [CountdownClient] Subscribing to state changes");

    const channel = supabase.channel(COUNTDOWN_CHANNEL);

    channel
      .on(
        "broadcast",
        { event: "countdown_state_change" }, // Changed event name
        ({ payload }: { payload: CountdownState }) => {
          console.log("📡 [CountdownClient] Received state change:", payload);
          setBaseState(payload);
          queryClient.setQueryData(orpc.countdown.getState.queryKey(), payload);
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          console.log("✅ [CountdownClient] Subscribed");
        }
      });

    return () => {
      console.log("🔌 [CountdownClient] Unsubscribing");
      supabase.removeChannel(channel);
    };
  }, [enableRealtime, queryClient]);

  /**
   * Handle page visibility changes
   */
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        console.log("👀 [CountdownClient] Page visible, refreshing state");
        refetch();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [refetch]);

  // Calculate current state
  const currentState: CountdownState = {
    ...baseState,
    remainingSeconds: calculateRemainingSeconds(baseState),
    lastUpdated: new Date().toISOString(),
  };

  // Manual retry function with loading state
  const retry = useCallback(async () => {
    console.log("🔄 [CountdownClient] Manual retry requested");
    return refetch();
  }, [refetch]);

  return {
    // State
    isRunning: currentState.isRunning,
    remainingSeconds: currentState.remainingSeconds,
    totalSeconds: currentState.totalSeconds,
    soundEnabled: currentState.soundEnabled,
    targetTime: currentState.targetTime,
    lastUpdated: currentState.lastUpdated,

    // Full state object
    state: currentState,

    // Metadata
    loading: loading && currentState.remainingSeconds === 0,
    error: queryError ? String(queryError) : null,
    isError, // ✅ Flag to show error state
    canRetry: isError && !loading, // ✅ Can user retry?

    // Actions
    refresh: refetch,
    retry, // ✅ Manual retry function
  };
}
