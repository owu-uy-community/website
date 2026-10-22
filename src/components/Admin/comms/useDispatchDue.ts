"use client";

import { skipToken, useQuery } from "@tanstack/react-query";

import { orpc } from "lib/orpc";

/**
 * Keeps scheduled messages moving: while mounted, asks the server every minute to send whatever
 * came due. Any number of open admins may call it; the server sends each message once.
 * ponytail: there is no cron, so mount it where admins keep the page open (Comunicación, Hoy).
 */
export function useDispatchDue(eventId: string | null) {
  useQuery(
    orpc.comms.dispatchDue.queryOptions({
      input: eventId ? { eventId } : skipToken,
      refetchInterval: 60_000,
      refetchIntervalInBackground: true,
      staleTime: 0,
      retry: false,
    })
  );
}
