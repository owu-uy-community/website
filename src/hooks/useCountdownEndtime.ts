import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../app/lib/supabase";
import { orpc } from "../lib/orpc/client";
import type { CountdownEndtime } from "../lib/orpc/countdown/schemas";

const COUNTDOWN_CHANNEL = "countdown-state";

interface UseCountdownEndtimeOptions {
  enableRealtime?: boolean;
}

/**
 * Lightweight hook that only fetches and tracks the countdown endtime (targetTime)
 * Used for openspace displays that only need to know when the countdown ends
 */
export function useCountdownEndtime(options: UseCountdownEndtimeOptions = {}) {
  const { enableRealtime = true } = options;

  // Fetch countdown endtime using oRPC + Tanstack Query
  const {
    data: endtimeData,
    isLoading: loading,
    error: queryError,
    refetch,
  } = useQuery<CountdownEndtime>(
    orpc.countdown.getEndtime.queryOptions({
      staleTime: 5000, // Consider data fresh for 5 seconds
      gcTime: 30000, // Keep in cache for 30 seconds
      refetchOnMount: "always",
      refetchOnWindowFocus: true, // Refetch when user returns (phone unlock, tab switch)
      refetchOnReconnect: true, // Refetch when internet reconnects
      refetchInterval: false, // No polling - use realtime for sync
    })
  );

  const [localEndtime, setLocalEndtime] = useState<string | null>(null);

  // Initialize local state from server data
  useEffect(() => {
    if (endtimeData) {
      setLocalEndtime(endtimeData.targetTime);
    }
  }, [endtimeData]);

  // Calculate remaining seconds from targetTime
  const remainingSeconds = useMemo(() => {
    const currentEndtime = localEndtime ?? endtimeData?.targetTime;
    if (!currentEndtime) return 0;
    return Math.max(0, Math.floor((new Date(currentEndtime).getTime() - Date.now()) / 1000));
  }, [localEndtime, endtimeData]);

  // Subscribe to realtime updates for countdown changes
  useEffect(() => {
    if (!enableRealtime) return;

    const channel = supabase.channel(COUNTDOWN_CHANNEL);

    channel
      .on(
        "broadcast",
        { event: "countdown_endtime_update" },
        ({ payload }: { payload: { targetTime: string | null } }) => {
          console.log("⏱️ [CountdownEndtime] Received endtime update:", payload);

          // Payload only contains targetTime (optimized)
          setLocalEndtime(payload.targetTime);
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          console.log("✅ [CountdownEndtime] Subscribed to countdown endtime updates");
        }
      });

    return () => {
      console.log("🔌 [CountdownEndtime] Unsubscribing from countdown channel");
      supabase.removeChannel(channel);
    };
  }, [enableRealtime]);

  return {
    targetTime: localEndtime ?? endtimeData?.targetTime ?? null,
    remainingSeconds,
    loading,
    error: queryError,
    refetch,
  };
}
