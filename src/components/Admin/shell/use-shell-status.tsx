"use client";

import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import { skipToken, useQuery, useQueryClient } from "@tanstack/react-query";

import { useRealtimeStatus } from "components/Admin/ui/status";
import { useRealtimeChannel } from "hooks/useRealtimeChannel";
import { orpc } from "lib/orpc";
import type { ShellStatus } from "lib/orpc/shell/schemas";
import { eventChannel } from "lib/realtime/channels";

import { useSelectedEvent, type AdminEvent, type EventScope } from "./use-selected-event";

type ShellContext = {
  status: ShellStatus | undefined;
  selected: AdminEvent | null;
  /** Where event links point (see useSelectedEvent). */
  scope: EventScope | null;
  isError: boolean;
  /** When the status was read, for "how old is this" hints. */
  updatedAt: number;
  refresh: () => void;
};

const Context = createContext<ShellContext | null>(null);

/**
 * The selected event's shell status (phase, clock, nav counts, live rigs), read once for the
 * whole admin. Refreshed every 30 s and on every ops or staff ping, so the sidebar is never a
 * minute stale on the day.
 */
export function ShellStatusProvider({ children }: { children: ReactNode }) {
  const { selected, scope } = useSelectedEvent();
  const queryClient = useQueryClient();
  useCatchUpAfterReconnect();
  const eventId = selected?.id ?? null;

  const query = useQuery(
    orpc.shell.status.queryOptions({
      input: eventId ? { eventId } : skipToken,
      staleTime: 15_000,
      refetchInterval: 30_000,
    })
  );

  const refresh = () => {
    if (eventId) void queryClient.invalidateQueries({ queryKey: orpc.shell.status.key({ input: { eventId } }) });
  };
  useRealtimeChannel(eventId ? eventChannel(eventId, "ops") : null, refresh);
  useRealtimeChannel(eventId ? eventChannel(eventId, "staff") : null, refresh);

  return (
    <Context.Provider
      value={{
        status: query.data,
        selected,
        scope,
        isError: query.isError,
        updatedAt: query.dataUpdatedAt,
        refresh,
      }}
    >
      {children}
    </Context.Provider>
  );
}

export function useShell(): ShellContext {
  const context = useContext(Context);
  if (!context) throw new Error("useShell must be used inside the admin shell");
  return context;
}

/**
 * Pages refresh on realtime pings, and a ping sent while this device's socket was down is lost:
 * a GO, an incident or a check-in from another device stayed invisible until the next one. Once
 * the socket is back, every query on the page refetches.
 */
function useCatchUpAfterReconnect() {
  const queryClient = useQueryClient();
  const status = useRealtimeStatus();
  const wasOpen = useRef(false);
  const dropped = useRef(false);

  useEffect(() => {
    if (status === "open") {
      if (dropped.current) void queryClient.invalidateQueries();
      wasOpen.current = true;
      dropped.current = false;
    } else if (wasOpen.current) {
      dropped.current = true;
    }
  }, [status, queryClient]);
}
