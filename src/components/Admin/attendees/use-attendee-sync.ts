"use client";

import { skipToken, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { orpc } from "lib/orpc";

/**
 * The attendee mirror's poll. Any page that shows attendance mounts this: while it is open,
 * Eventbrite is read every 30 s (the server throttles per event, so many open screens still
 * read it once). Eventbrite's webhooks are said to stop after sales close; this doesn't.
 * Changes come back to every screen as an ops ping ("checkins").
 */
export function useAttendeeSync(eventId: string | null) {
  const queryClient = useQueryClient();
  const state = useQuery(
    orpc.attendees.sync.queryOptions({
      input: eventId ? { eventId } : skipToken,
      refetchInterval: 30_000,
      staleTime: 25_000,
      retry: false,
    })
  );
  const now = useMutation(
    orpc.attendees.sync.mutationOptions({
      onSuccess: (data) => {
        if (eventId) queryClient.setQueryData(orpc.attendees.sync.queryKey({ input: { eventId } }), data);
      },
    })
  );

  return {
    state,
    /** "Sincronizar ahora": skips the 30 s wait. */
    syncNow: () => {
      if (eventId) now.mutate({ eventId, force: true });
    },
    syncing: now.isPending,
  };
}
