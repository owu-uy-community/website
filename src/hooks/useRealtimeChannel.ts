"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { getRealtimeClient, type RealtimeStatus } from "lib/realtime/client";

type MessageHandler = (event: string, payload: unknown) => void;

/**
 * Subscribe to a realtime channel over the native WebSocket transport.
 * Pass `channel: null` to keep the hook idle (e.g. while an id resolves).
 * Own publishes are not echoed back unless `receiveSelf` is true.
 */
export function useRealtimeChannel(
  channel: string | null,
  onMessage: MessageHandler,
  options: { receiveSelf?: boolean } = {}
) {
  const { receiveSelf = false } = options;
  const [status, setStatus] = useState<RealtimeStatus>(() => getRealtimeClient().getStatus());
  const handlerRef = useRef<MessageHandler>(onMessage);

  useEffect(() => {
    handlerRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    const client = getRealtimeClient();
    const offStatus = client.onStatusChange(setStatus);
    if (!channel) return offStatus;

    const unsubscribe = client.subscribe(channel, (event, payload, senderId) => {
      if (!receiveSelf && senderId === client.senderId) return;
      handlerRef.current(event, payload);
    });

    return () => {
      offStatus();
      unsubscribe();
    };
  }, [channel, receiveSelf]);

  const publish = useCallback(
    (event: string, payload: unknown) => {
      if (!channel) return;
      getRealtimeClient().publish(channel, event, payload);
    },
    [channel]
  );

  return { publish, status, isConnected: status === "open" };
}
