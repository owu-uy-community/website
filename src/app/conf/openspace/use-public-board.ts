"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { withCreatedCard } from "hooks/board-cache";
import { useRealtimeChannel } from "hooks/useRealtimeChannel";
import { orpc, type Room, type Schedule, type StickyNote } from "lib/orpc";
import { eventChannel } from "lib/realtime/channels";

type Board = { rooms: Room[]; schedules: Schedule[]; tracks: StickyNote[] };

/** A `card_change` on the event's sync channel (lib/orpc/board-events.ts): the cards where they ended up. */
export type CardChange = {
  type: "CARD_UPDATE" | "CARD_SWAP" | "CARD_CREATE" | "CARD_DELETE";
  payload: { cardId?: string; updatedCard?: StickyNote; updatedCards?: StickyNote[] };
};

/**
 * The cards after a change. Null when it names a card this screen never got (it missed a create):
 * only a re-read can tell where things are then. Applying a change twice is harmless.
 */
export function applyCardChange(tracks: StickyNote[], { type, payload }: CardChange): StickyNote[] | null {
  const known = (id: string) => tracks.some((track) => track.id === id);

  switch (type) {
    case "CARD_CREATE":
      return payload.updatedCard ? withCreatedCard(tracks, payload.updatedCard) : tracks;
    case "CARD_DELETE":
      return tracks.filter((track) => track.id !== payload.cardId);
    case "CARD_UPDATE": {
      const card = payload.updatedCard;
      if (!card) return tracks;

      return known(card.id) ? tracks.map((track) => (track.id === card.id ? card : track)) : null;
    }
    case "CARD_SWAP": {
      const moved = new Map((payload.updatedCards ?? []).map((card) => [card.id, card]));
      if (![...moved.keys()].every(known)) return null;

      return tracks.map((track) => moved.get(track.id) ?? track);
    }
  }
}

/**
 * A room full of phones hears the same ping: their re-reads spread over a moment, which also lets
 * the write that sent it expire the cached board first (it does when its request ends).
 */
const RESYNC_MIN_MS = 300;
const RESYNC_SPREAD_MS = 1_500;
const PULSE_MS = 1_600;

/**
 * The public board, kept current by the WebSocket instead of polling: cards change in place from
 * the payloads they arrive with, and only a structure ping (a room or block changed) or a socket
 * that (re)opens — it may have missed something — reads it again. Every read is
 * `openSpaces.board`, served from the shared cache, so none of this costs the database a query
 * unless the board actually changed.
 */
export function usePublicBoard(eventId: string, initialData: Board) {
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => orpc.openSpaces.board.queryKey({ input: { openSpaceId: eventId } }), [eventId]);
  const { data } = useQuery(
    orpc.openSpaces.board.queryOptions({ input: { openSpaceId: eventId }, initialData, staleTime: 30_000 })
  );

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resync = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(
      () => void queryClient.invalidateQueries({ queryKey }),
      RESYNC_MIN_MS + Math.random() * RESYNC_SPREAD_MS
    );
  }, [queryClient, queryKey]);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  // Cards a change moved or rewrote pulse for a moment
  const [pulsing, setPulsing] = useState<ReadonlySet<string>>(() => new Set());
  const pulse = useCallback((id: string) => {
    setPulsing((ids) => new Set(ids).add(id));
    setTimeout(
      () =>
        setPulsing((ids) => {
          const next = new Set(ids);
          next.delete(id);
          return next;
        }),
      PULSE_MS
    );
  }, []);

  const onMessage = useCallback(
    (event: string, message: unknown) => {
      if (event === "structure_change") return resync();
      if (event !== "card_change") return;

      const change = message as CardChange;
      const board = queryClient.getQueryData<Board>(queryKey);
      const tracks = board ? applyCardChange(board.tracks, change) : null;
      if (!board || !tracks) return resync();
      queryClient.setQueryData<Board>(queryKey, { ...board, tracks });

      // Every screen hears every change, its own echoes too: only a card that now reads differently pulses
      const card = change.type === "CARD_UPDATE" ? change.payload.updatedCard : undefined;
      const before = card && board.tracks.find((track) => track.id === card.id);
      if (
        card &&
        before &&
        (before.title !== card.title ||
          before.speaker !== card.speaker ||
          before.room !== card.room ||
          before.timeSlot !== card.timeSlot)
      ) {
        pulse(card.id);
      }
    },
    [queryClient, queryKey, resync, pulse]
  );

  const { isConnected } = useRealtimeChannel(eventChannel(eventId, "sync"), onMessage);
  // Whatever changed before the socket opened (or while it was down) never arrives over it
  useEffect(() => {
    if (isConnected) resync();
  }, [isConnected, resync]);

  return { ...data, isConnected, pulsing };
}
