"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useRealtimeChannel } from "hooks/useRealtimeChannel";
import { orpc } from "lib/orpc";
import {
  BridgeStatusSchema,
  SettingRowSchema,
  type CompanionState,
  type SettingChange,
  type SettingRow,
} from "lib/orpc/companion/schemas";
import { COMPANION_CHANNEL } from "lib/realtime/channels";

import { CommandResultSchema } from "../../../../owy/companion/bridge/src/web/contract";

import { useCommands } from "./commands";
import { isOnline, mergeRows, OFFLINE_AFTER_MS, rollbackRows } from "./model";
import type { OnSet } from "./SettingField";

const RowsSchema = SettingRowSchema.array();

/**
 * Whether the bridge reported in the last 45 s, flipping to offline on time without a report.
 * ponytail: the site's clock (`seenAt`) against this browser's; a clock far ahead reads offline.
 */
function useOnline(seenAt: string | null | undefined) {
  const [now, setNow] = useState(() => Date.now());
  const online = isOnline(seenAt, now);
  useEffect(() => {
    if (!online || !seenAt) return;
    const timer = setTimeout(() => setNow(Date.now()), Date.parse(seenAt) + OFFLINE_AFTER_MS - Date.now() + 100);
    return () => clearTimeout(timer);
  }, [online, seenAt]);

  return online;
}

/**
 * The companion as the panels see it (Ajustes de Owy, the ops page): the stored settings and the
 * bridge's last report, kept live on the companion channel (a read every 15 s covers a dropped
 * socket), one optimistic write that bounces back when the site says no, and the commands with
 * their results.
 */
export function useCompanionState() {
  const queryClient = useQueryClient();
  const queryKey = orpc.companion.state.queryKey();
  const query = useQuery({ ...orpc.companion.state.queryOptions(), refetchInterval: 15_000 });
  const commands = useCommands();
  const [error, setError] = useState<string | null>(null);
  const update = (change: (state: CompanionState) => CompanionState) =>
    queryClient.setQueryData<CompanionState>(queryKey, (state) => (state ? change(state) : state));

  useRealtimeChannel(COMPANION_CHANNEL, (event, payload) => {
    const data = payload as Record<string, unknown> | null;
    if (event === "status") {
      const status = BridgeStatusSchema.safeParse(data?.status);
      if (status.success && typeof data?.seenAt === "string")
        update((state) => ({ ...state, status: status.data, seenAt: data.seenAt as string }));
    } else if (event === "rows") {
      const rows = RowsSchema.safeParse(data?.rows);
      if (rows.success) update((state) => ({ ...state, rows: mergeRows(state.rows, rows.data) }));
    } else if (event === "result") {
      const result = CommandResultSchema.safeParse(data);
      if (result.success) commands.settle(result.data);
    }
  });

  // Shown at once, put back if the site says no; the reply is what got stored.
  const set = useMutation(
    orpc.companion.set.mutationOptions({
      onMutate: async ({ changes }) => {
        await queryClient.cancelQueries({ queryKey });
        const before = queryClient.getQueryData<CompanionState>(queryKey)?.rows ?? [];
        const setAt = new Date().toISOString();
        update((state) => ({
          ...state,
          rows: mergeRows(
            state.rows,
            changes.map((change): SettingRow => ({
              ...change,
              value: change.value as SettingRow["value"],
              setBy: "admin:vos",
              setAt,
            }))
          ),
        }));
        return { before };
      },
      onError: (failure, { changes }, context) => {
        update((state) => ({ ...state, rows: rollbackRows(state.rows, context?.before ?? [], changes) }));
        setError(failure.message);
      },
      onSuccess: ({ rows }) => {
        setError(null);
        update((state) => ({ ...state, rows: mergeRows(state.rows, rows) }));
      },
    })
  );
  // The controls only offer registry values; the site checks each one anyway.
  const onSet: OnSet = (changes) => set.mutate({ changes: changes as SettingChange[] });

  const state = query.data;
  const online = useOnline(state?.seenAt);

  return { state, query, online, onSet, error, setError, send: commands.send };
}

export type CompanionPanel = ReturnType<typeof useCompanionState>;
