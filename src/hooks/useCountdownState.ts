import { useCallback, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { orpc } from "../lib/orpc/client";
import type { CountdownAction, CountdownState } from "../lib/orpc/countdown/schemas";
import { eventChannel } from "../lib/realtime/channels";
import { useRealtimeChannel } from "./useRealtimeChannel";

const IDLE: CountdownState = {
  isRunning: false,
  remainingSeconds: 0,
  totalSeconds: 0,
  lastUpdated: new Date(0).toISOString(),
  soundEnabled: false,
};

/**
 * Keep the newer of two states. A read that was already on its way when an
 * admin acted lands after the change it predates, and must not undo it.
 */
const newer = (current: unknown, next: unknown) => {
  const [a, b] = [current as CountdownState | undefined, next as CountdownState];

  return a && a.lastUpdated > b.lastUpdated ? a : b;
};

/** A running countdown at `now`: the remaining time comes from its target, never from a ticker. */
function at(state: CountdownState, now: number): CountdownState {
  if (!state.targetTime) return state;
  const remainingSeconds = Math.max(0, Math.floor((new Date(state.targetTime).getTime() - now) / 1000));

  return remainingSeconds > 0
    ? { ...state, isRunning: true, remainingSeconds }
    : { ...state, isRunning: false, remainingSeconds: 0, targetTime: undefined };
}

/**
 * An event's countdown, plus the admin actions on it. The server only sends a
 * state when an admin changes it; between changes every screen ticks on its
 * own from `targetTime`, so they all agree without a server-side ticker.
 */
export function useCountdownState({ eventId, enableRealtime = true }: { eventId: string; enableRealtime?: boolean }) {
  const queryClient = useQueryClient();
  const queryKey = orpc.countdown.getState.queryKey({ input: { eventId } });

  const { data, isLoading } = useQuery(
    orpc.countdown.getState.queryOptions({
      input: { eventId },
      staleTime: Infinity, // changes arrive over realtime
      refetchOnWindowFocus: "always", // a screen that slept may have missed some
      structuralSharing: newer,
    })
  );

  useRealtimeChannel(enableRealtime ? eventChannel(eventId, "countdown") : null, (event, payload) => {
    if (event === "countdown_state_change") queryClient.setQueryData(queryKey, payload as CountdownState);
  });

  const [now, setNow] = useState(() => Date.now());
  const targetTime = data?.targetTime;
  useEffect(() => {
    if (!targetTime) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);

    return () => clearInterval(timer);
  }, [targetTime]);

  const { mutateAsync } = useMutation(
    orpc.countdown.updateState.mutationOptions({
      onSuccess: (result) => queryClient.setQueryData(queryKey, result),
    })
  );
  const updateState = useCallback(
    (action: CountdownAction) => mutateAsync({ ...action, eventId }),
    [mutateAsync, eventId]
  );

  return { state: data ? at(data, now) : IDLE, loading: isLoading, updateState };
}
