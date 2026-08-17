"use client";

import { useCallback, useEffect, useRef } from "react";

import { useRouter } from "next/navigation";

import { useRealtimeChannel } from "hooks/useRealtimeChannel";
import { eventChannel } from "lib/realtime/channels";

/**
 * Keeps the server-rendered agenda current: any board change broadcast on the
 * event's sync channel triggers a refresh. Refreshes are coalesced because a
 * single drag on the admin board emits several messages in a row.
 */
export function LiveAgenda({ eventId }: { eventId: string }) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleRefresh = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => router.refresh(), 400);
  }, [router]);

  const { isConnected } = useRealtimeChannel(eventChannel(eventId, "sync"), scheduleRefresh);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs text-zinc-500"
      title={isConnected ? "La grilla se actualiza sola" : "Reconectando…"}
    >
      <span
        aria-hidden
        className={`size-1.5 rounded-full ${isConnected ? "animate-pulse bg-emerald-400" : "bg-zinc-600"}`}
      />
      {isConnected ? "En vivo" : "Reconectando…"}
    </span>
  );
}
