import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../app/lib/supabase";
import { orpc } from "../lib/orpc/client";
import type { CountdownState } from "../lib/orpc/countdown/schemas";

const COUNTDOWN_CHANNEL = "countdown-state";

interface UseCountdownStateOptions {
  enableRealtime?: boolean;
}

export function useCountdownState(options: UseCountdownStateOptions = {}) {
  const { enableRealtime = true } = options;
  const queryClient = useQueryClient();

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastTickRef = useRef<number>(Date.now());

  // Fetch countdown state using oRPC + Tanstack Query
  // Fetch ONCE on mount to get initial state, then rely on client-side ticking + realtime
  const {
    data: serverState,
    isLoading: loading,
    error: queryError,
    refetch,
  } = useQuery(
    orpc.countdown.getState.queryOptions({
      staleTime: 5000, // Consider stale after 5 seconds so visibility changes trigger refetch
      gcTime: Infinity, // Keep in cache forever
      refetchOnMount: "always", // Fetch when component mounts
      refetchOnWindowFocus: true, // Refetch when user returns (phone unlock, tab switch)
      refetchOnReconnect: true, // Refetch when internet reconnects
      refetchInterval: false, // No polling - use realtime for sync
    })
  );

  // Client-side state - we only need to track if countdown is running and target time
  // Each client calculates remainingSeconds independently from targetTime
  const [localState, setLocalState] = useState<CountdownState | null>(null);

  // Initialize local state from server state when it arrives or updates
  // This will sync when user returns from phone lock (due to refetchOnWindowFocus)
  useEffect(() => {
    if (serverState) {
      setLocalState(serverState);
      lastTickRef.current = Date.now(); // Reset tick reference
    }
  }, [serverState]);

  // Calculate remainingSeconds from targetTime (if set) or use stored value
  // This way all clients calculate independently from the same end time
  const calculateRemainingSeconds = (stateToUse: CountdownState): number => {
    if (stateToUse.targetTime) {
      return Math.max(0, Math.floor((new Date(stateToUse.targetTime).getTime() - Date.now()) / 1000));
    }
    return stateToUse.remainingSeconds;
  };

  // IMPORTANT: Wait for server state before showing countdown
  // Use localState if available, otherwise use fresh serverState
  // Default to 00:00 while loading (better UX than showing 05:00)
  const baseState: CountdownState = localState ||
    serverState || {
      isRunning: false,
      remainingSeconds: 0,
      totalSeconds: 0,
      lastUpdated: new Date().toISOString(),
      soundEnabled: false,
      targetTime: undefined,
    };

  // Calculate current remaining seconds from targetTime
  const state: CountdownState = {
    ...baseState,
    remainingSeconds: calculateRemainingSeconds(baseState),
    lastUpdated: new Date().toISOString(),
  };

  // If we're still loading initial state, indicate it
  const isInitializing = loading && !localState && !serverState;

  // Update countdown state mutation using oRPC + Tanstack Query
  const updateMutation = useMutation(
    orpc.countdown.updateState.mutationOptions({
      onSuccess: (result) => {
        console.log("⏱️ [Countdown] State updated via oRPC");
        setLocalState(result);
        queryClient.setQueryData(orpc.countdown.getState.queryKey(), result);
        lastTickRef.current = Date.now(); // Reset tick reference

        // Broadcast the update via Supabase realtime for other devices
        if (enableRealtime) {
          const channel = supabase.channel(COUNTDOWN_CHANNEL);

          // Send full state update for admin/control listeners
          channel
            .send({
              type: "broadcast",
              event: "countdown_state_update",
              payload: result,
            })
            .catch(console.error);

          // Send lightweight endtime update for display listeners
          channel
            .send({
              type: "broadcast",
              event: "countdown_endtime_update",
              payload: { targetTime: result.targetTime ?? null },
            })
            .catch(console.error);
        }
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

  // Local tick logic for smooth countdown (client-side only)
  // Since we calculate from targetTime, we just need to trigger re-renders
  useEffect(() => {
    if (!state.isRunning || !localState) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    // Trigger re-render every second to recalculate remainingSeconds from targetTime
    intervalRef.current = setInterval(() => {
      // Force re-render by updating a dummy timestamp
      setLocalState((prev) => {
        if (!prev) return prev;

        // If we have targetTime, we're calculating from it automatically
        // Just return the same state to trigger re-render
        if (prev.targetTime) {
          return { ...prev, lastUpdated: new Date().toISOString() };
        }

        // Fallback: if no targetTime, decrement manually (shouldn't happen)
        const newRemaining = Math.max(0, prev.remainingSeconds - 1);
        return {
          ...prev,
          remainingSeconds: newRemaining,
          lastUpdated: new Date().toISOString(),
        };
      });
    }, 1000); // Update every second

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [state.isRunning, localState]);

  // Subscribe to realtime updates
  useEffect(() => {
    if (!enableRealtime) return;

    const channel = supabase
      .channel(COUNTDOWN_CHANNEL)
      .on("broadcast", { event: "countdown_state_update" }, ({ payload }) => {
        if (payload) {
          console.log("📡 [Countdown] Received full state update");
          setLocalState(payload as CountdownState);
          queryClient.setQueryData(orpc.countdown.getState.queryKey(), payload);
          lastTickRef.current = Date.now();
        }
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          console.log("✅ [Countdown] Realtime connected");
        } else if (status === "CHANNEL_ERROR") {
          console.error("❌ [Countdown] Failed to connect to realtime");
        }
      });

    return () => {
      channel.unsubscribe();
    };
  }, [enableRealtime, queryClient]);

  return {
    state,
    loading: isInitializing, // Only show loading during initial fetch from server
    error: queryError ? String(queryError) : null,
    updateState,
    refetch,
  };
}
