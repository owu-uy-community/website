"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";

import { Notice } from "components/Admin/panel";
import { PageContainer, PageHeader } from "components/Admin/ui/page";
import { Button } from "components/shared/ui/button";
import { Skeleton } from "components/shared/ui/skeleton";
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

import { CommandResultSchema } from "../../../owy/companion/bridge/src/web/contract";

import { BridgeCard } from "./control/BridgeCard";
import { BridgeStrip } from "./control/BridgeStrip";
import { useCommands } from "./control/commands";
import { DeviceCard } from "./control/DeviceCard";
import { deviceIds, isOnline, mergeRows, OFFLINE_AFTER_MS, rollbackRows } from "./control/model";
import type { OnSet } from "./control/SettingField";
import { useBrowserAudio } from "./control/useBrowserAudio";

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
 * /admin/companion → Control: every physical Owy and the bridge on the venue Mac, from a laptop or
 * a phone. Settings are stored on the site and the bridge follows them; each row says whether it
 * is in effect yet. Changes and the bridge's reports arrive live on the companion channel (and a
 * read every 15 s covers a dropped socket).
 */
export default function CompanionControl() {
  const queryClient = useQueryClient();
  const queryKey = orpc.companion.state.queryKey();
  const query = useQuery({ ...orpc.companion.state.queryOptions(), refetchInterval: 15_000 });
  const commands = useCommands();
  const audio = useBrowserAudio();
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
  const ids = state ? deviceIds(state) : [];

  return (
    <PageContainer className="space-y-4 pt-0" size="large">
      <PageHeader
        className="mb-0"
        description="Cada Owy y el bridge de la Mac: el modo, el audio y todos los ajustes. El bridge los sigue en vivo."
        title="Owy"
      />

      {/* Sticky: a change far down the page that bounces back says why where it can be seen. */}
      <div className="sticky top-[calc(46px+env(safe-area-inset-top)+0.5rem)] z-30 empty:hidden md:top-2">
        <Notice show={!!error} tone="danger">
          <span className="flex items-start justify-between gap-3">
            <span>No se guardó: {error}</span>
            <Button
              aria-label="Cerrar el aviso"
              className="-my-1"
              size="icon-xs"
              variant="ghost"
              onClick={() => setError(null)}
            >
              <X />
            </Button>
          </span>
        </Notice>
      </div>

      <Notice show={query.isError} tone="danger">
        No se pudo leer el estado del companion: {query.error?.message}
      </Notice>

      {!state ? (
        query.isPending ? (
          <div className="space-y-4">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-96 w-full" />
          </div>
        ) : null
      ) : (
        <>
          <BridgeStrip ids={ids} online={online} send={commands.send} state={state} onSet={onSet} />
          {ids.length === 0 ? (
            <p className="text-ui text-muted-foreground">
              Todavía no hay dispositivos: aparecen cuando el bridge reporta (corre en la Mac con COMPANION_DEVICES).
            </p>
          ) : null}
          {/* Cards stack on a phone; side by side on a wide screen, the bridge's after the devices. */}
          <div className="grid items-start gap-4 xl:grid-cols-2">
            {ids.map((id) => (
              <DeviceCard
                key={id}
                audio={audio}
                id={id}
                online={online}
                send={commands.send}
                state={state}
                onSet={onSet}
              />
            ))}
            <BridgeCard online={online} send={commands.send} state={state} onSet={onSet} />
          </div>
        </>
      )}
    </PageContainer>
  );
}
