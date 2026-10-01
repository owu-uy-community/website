"use client";

import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { toast } from "components/shared/ui/toast-utils";
import { useRealtimeChannel } from "hooks/useRealtimeChannel";
import { orpc } from "lib/orpc/client";
import type { OBSQueueState, UpdateStateInput } from "lib/orpc/obs-queue/schemas";
import { obsQueueChannel } from "lib/realtime/channels";

export type { OBSQueueState };
export type QueueItem = OBSQueueState["queueItems"][number];
export type Preset = OBSQueueState["presets"][number];

const EMPTY: OBSQueueState = {
  queueItems: [],
  isPlaying: false,
  currentItemIndex: 0,
  directMode: false,
  presets: [],
  currentPreset: "",
  version: 0,
};

/**
 * The rig's loop state (queue, presets, playback) — the server row is the
 * truth, optimistic while a save is in flight, refreshed when any writer (an
 * admin tab, the Owy bot, /api/obs/loop) bumps the version.
 */
export function useObsQueue(instanceId = 1) {
  const queryClient = useQueryClient();
  const key = orpc.obsQueue.getState.queryKey({ input: { instanceId } });
  const query = useQuery(orpc.obsQueue.getState.queryOptions({ input: { instanceId }, staleTime: 30_000 }));

  useRealtimeChannel(obsQueueChannel(instanceId), (event, payload) => {
    if (event !== "state_update") return;
    const { version } = payload as { version: number };
    const current = queryClient.getQueryData<OBSQueueState>(key);
    if (!current || version > current.version) queryClient.invalidateQueries({ queryKey: key });
  });

  const mutation = useMutation(
    orpc.obsQueue.updateState.mutationOptions({
      onMutate: async ({ data }) => {
        await queryClient.cancelQueries({ queryKey: key });
        const previous = queryClient.getQueryData<OBSQueueState>(key);
        if (previous) queryClient.setQueryData<OBSQueueState>(key, { ...previous, ...data });

        return { previous };
      },
      onError: (error, _variables, context) => {
        if (context?.previous) queryClient.setQueryData(key, context.previous);
        toast.error("No se pudo guardar el loop", error.message);
      },
      onSuccess: (state) => queryClient.setQueryData(key, state),
    })
  );

  const update = useCallback(
    (data: UpdateStateInput["data"]) => mutation.mutate({ instanceId, data }),
    [instanceId, mutation]
  );

  return {
    state: query.data ?? EMPTY,
    isLoading: query.isLoading,
    update,
    setQueueItems: (items: Omit<QueueItem, "position">[]) =>
      update({ queueItems: items.map((item, position) => ({ ...item, position })) }),
    setIsPlaying: (isPlaying: boolean) => update({ isPlaying }),
    setCurrentItemIndex: (currentItemIndex: number) => update({ currentItemIndex }),
    setDirectMode: (directMode: boolean) => update({ directMode }),
    setPresets: (presets: Preset[]) => update({ presets }),
    setCurrentPreset: (currentPreset: string) => update({ currentPreset }),
  };
}
