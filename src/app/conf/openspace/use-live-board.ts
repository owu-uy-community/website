"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useRouter } from "next/navigation";

import { useRealtimeChannel } from "hooks/useRealtimeChannel";
import type { Schedule, StickyNote } from "lib/orpc";
import { resolveNowNext, type NowNext } from "lib/openspace/now-next";
import { eventChannel } from "lib/realtime/channels";

export type FeedEntry = {
  key: string;
  title: string;
  speaker?: string;
  roomId: string;
  timeSlot: string;
};

const FEED_LIMIT = 6;
/** A single drag on the admin board emits several messages; coalesce them. */
const REFRESH_DEBOUNCE_MS = 400;

type CardChange = {
  type?: string;
  payload?: { updatedCard?: StickyNote };
};

/**
 * One subscription to the event's sync channel drives everything the live page
 * needs from it: the server-rendered board is refreshed in place, and newly
 * created cards are buffered for the "recién propuesto" ticker.
 *
 * Now/next is recomputed locally every second rather than pushed, so the
 * header keeps counting down even if the socket drops.
 */
export function useLiveBoard({
  eventId,
  schedules,
  timezone,
  initialNowNext,
}: {
  eventId: string;
  schedules: Schedule[];
  timezone: string;
  /**
   * The server's own derivation. Seeding state with it keeps the first client
   * render byte-identical to the SSR output — deriving from `new Date()` here
   * instead would differ by however long hydration took and tear the tree.
   * The interval below corrects it on the next tick.
   */
  initialNowNext: NowNext<Schedule>;
}): { nowNext: NowNext<Schedule>; feed: FeedEntry[]; isConnected: boolean } {
  const router = useRouter();
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [feed, setFeed] = useState<FeedEntry[]>([]);
  const [nowNext, setNowNext] = useState<NowNext<Schedule>>(initialNowNext);

  useEffect(() => {
    const tick = () => setNowNext(resolveNowNext(schedules, timezone));

    tick();
    const interval = setInterval(tick, 1_000);

    return () => clearInterval(interval);
  }, [schedules, timezone]);

  const onMessage = useCallback(
    (event: string, payload: unknown) => {
      if (event !== "card_change") return;

      const change = payload as CardChange;
      const card = change?.payload?.updatedCard;

      if (change?.type === "CARD_CREATE" && card) {
        setFeed((current) => [
          // The id is stable but a re-created card could repeat it; the timestamp keys the row.
          { key: `${card.id}-${Date.now()}`, title: card.title, speaker: card.speaker, roomId: card.roomId, timeSlot: card.timeSlot },
          ...current,
        ].slice(0, FEED_LIMIT));
      }

      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(() => router.refresh(), REFRESH_DEBOUNCE_MS);
    },
    [router]
  );

  const { isConnected } = useRealtimeChannel(eventChannel(eventId, "sync"), onMessage);

  useEffect(() => {
    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    };
  }, []);

  return { nowNext, feed, isConnected };
}
