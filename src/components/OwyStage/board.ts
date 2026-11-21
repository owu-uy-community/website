"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { applyCardChange, type CardChange } from "app/conf/openspace/use-public-board";
import { useRealtimeChannel } from "hooks/useRealtimeChannel";
import { client, orpc, type Room, type Schedule, type StickyNote } from "lib/orpc";
import { eventChannel } from "lib/realtime/channels";

// The live data scenes share. Not a scene file: OwyFace and the rest import it without loading
// each other (see scenes/loading.test.ts).

type Board = { rooms: Room[]; schedules: Schedule[]; tracks: StickyNote[] };

/** Re-reads spread over a moment: every screen hears the same ping, and the write that sent it expires the cache first. */
const RESYNC_MIN_MS = 300;
const RESYNC_SPREAD_MS = 1_500;

/**
 * The event's board for every scene that shows it, the way conf.owu.uy/openspace reads it: one
 * read of the shared, tag-revalidated cache (openSpaces.board), cards patched in place from the
 * payloads the WebSocket brings, and a re-read only when the structure changes or the socket
 * (re)opens (it may have missed something). Scenes on one page share the query.
 */
export function useBoard(eventId: string | null, preview: boolean): Board | null {
  const queryClient = useQueryClient();
  const input = useMemo(() => ({ openSpaceId: eventId ?? "" }), [eventId]);
  const queryKey = useMemo(() => orpc.openSpaces.board.queryKey({ input }), [input]);
  const { data } = useQuery(
    orpc.openSpaces.board.queryOptions({ input, enabled: Boolean(eventId), staleTime: 30_000 })
  );

  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const resync = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(
      () => void queryClient.invalidateQueries({ queryKey }),
      RESYNC_MIN_MS + Math.random() * RESYNC_SPREAD_MS
    );
  }, [queryClient, queryKey]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const { isConnected } = useRealtimeChannel(
    eventId && !preview ? eventChannel(eventId, "sync") : null,
    (event, payload) => {
      if (event === "structure_change") return resync();
      if (event !== "card_change") return;
      const board = queryClient.getQueryData<Board>(queryKey);
      const tracks = board ? applyCardChange(board.tracks, payload as CardChange) : null;
      if (!board || !tracks) return resync();
      queryClient.setQueryData<Board>(queryKey, { ...board, tracks });
    }
  );
  useEffect(() => {
    if (isConnected) resync();
  }, [isConnected, resync]);

  return eventId ? (data ?? null) : null;
}

/** The talk cast from the open space admin, kept in step over the WebSocket (and re-read when it reconnects). */
export function useCast(eventId: string | null, preview: boolean) {
  const [note, setNote] = useState<StickyNote | null>(null);
  const load = useCallback(() => {
    if (!eventId) return;
    client.cast
      .getState({ eventId })
      .then((state) => setNote(state.note))
      .catch((error) => console.error("[stage] cast", error));
  }, [eventId]);
  useEffect(load, [load]);
  const { isConnected } = useRealtimeChannel(
    eventId && !preview ? eventChannel(eventId, "cast") : null,
    (event, payload) => {
      if (event === "note_highlighted") setNote((payload as { note: StickyNote | null }).note);
    }
  );
  useEffect(() => {
    if (isConnected) load();
  }, [isConnected, load]);

  return note;
}
