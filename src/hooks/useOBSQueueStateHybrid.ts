"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "app/lib/supabase";
import { orpc } from "lib/orpc/client";

interface QueueItem {
  sceneName: string;
  delay: number;
  id: string;
}

interface OBSQueueState {
  queueItems: QueueItem[];
  isPlaying: boolean;
  currentItemIndex: number;
  directMode: boolean;
  presets: PresetQueue[];
  currentPreset: string;
}

interface PresetQueue {
  id: string;
  name: string;
  items: QueueItem[];
}

interface StateChangePayload {
  instanceId: number;
  version: number;
  timestamp: number;
  type: "full_state" | "queue_update" | "playback_update" | "preset_update";
}

const DEFAULT_STATE: OBSQueueState = {
  queueItems: [],
  isPlaying: false,
  currentItemIndex: 0,
  directMode: false,
  presets: [],
  currentPreset: "",
};

export function useOBSQueueStateHybrid(instanceId: number = 1) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<OBSQueueState>(DEFAULT_STATE);
  const stateRef = useRef<OBSQueueState>(DEFAULT_STATE);
  const versionRef = useRef(1);
  const isUpdatingRef = useRef(false);

  // Keep ref in sync with state
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Query for fetching OBS state
  const {
    data: serverData,
    isLoading,
    error: queryError,
  } = useQuery(
    orpc.obsQueue.getState.queryOptions({
      input: { instanceId },
      staleTime: 30 * 1000, // Consider data fresh for 30 seconds (increased from 10s)
      gcTime: 10 * 60 * 1000, // Keep in cache for 10 minutes (increased from 5min)
      refetchOnWindowFocus: false, // Don't refetch when tab regains focus
      refetchOnMount: "always", // Always check on mount (but use cache if fresh)
    })
  );

  // Update local state when server data changes
  useEffect(() => {
    if (serverData && !isUpdatingRef.current) {
      const loadedState: OBSQueueState = {
        queueItems: serverData.queueItems.map((item) => ({
          id: item.id,
          sceneName: item.sceneName,
          delay: item.delay,
        })),
        isPlaying: serverData.isPlaying,
        currentItemIndex: serverData.currentItemIndex,
        directMode: serverData.directMode,
        presets: serverData.presets.map((preset) => ({
          id: preset.id,
          name: preset.name,
          items: preset.items.map((item) => ({
            id: item.id,
            sceneName: item.sceneName,
            delay: item.delay,
          })),
        })),
        currentPreset: serverData.currentPreset,
      };

      setState(loadedState);
      versionRef.current = serverData.version;

      console.log("Loaded OBS state from server:", {
        instanceId,
        version: serverData.version,
        queueItemsCount: loadedState.queueItems.length,
        presetsCount: loadedState.presets.length,
        isPlaying: loadedState.isPlaying,
      });
    }
  }, [serverData, instanceId]);

  // Mutation for updating OBS state
  const updateStateMutation = useMutation(
    orpc.obsQueue.updateState.mutationOptions({
      onMutate: async (variables) => {
        isUpdatingRef.current = true;
        // Cancel outgoing refetches
        await queryClient.cancelQueries({ queryKey: orpc.obsQueue.getState.key() });

        // Snapshot the previous value
        const previousData = queryClient.getQueryData(orpc.obsQueue.getState.queryKey({ input: { instanceId } }));

        return { previousData };
      },
      onError: (error, variables, context) => {
        // Rollback on error
        if (context?.previousData) {
          queryClient.setQueryData(orpc.obsQueue.getState.queryKey({ input: { instanceId } }), context.previousData);
        }
        console.error("Error updating OBS state:", error);
      },
      onSuccess: (result) => {
        // Update version ref
        versionRef.current = result.version;
      },
      onSettled: () => {
        isUpdatingRef.current = false;
        // Refetch after error or success
        queryClient.invalidateQueries({ queryKey: orpc.obsQueue.getState.key() });
      },
    })
  );

  // Broadcast state change via Supabase
  const broadcastStateChange = useCallback(
    async (version: number, updateType: StateChangePayload["type"] = "full_state") => {
      const payload: StateChangePayload = {
        instanceId,
        version,
        timestamp: Date.now(),
        type: updateType,
      };

      const channel = supabase.channel(`obs_queue_broadcast_${instanceId}`);
      await channel.send({
        type: "broadcast",
        event: "state_update",
        payload,
      });
    },
    [instanceId]
  );

  // Update state (optimistic + persistent + broadcast)
  const updateState = useCallback(
    async (newState: Partial<OBSQueueState>) => {
      if (isLoading) {
        console.warn("Skipping update - initial state still loading");
        return;
      }

      if (isUpdatingRef.current) {
        console.warn("Update already in progress, skipping");
        return;
      }

      const currentState = stateRef.current;
      const updatedState = { ...currentState, ...newState };

      console.log("Updating OBS state:", {
        instanceId,
        queueItemsCount: updatedState.queueItems?.length,
        isPlaying: updatedState.isPlaying,
        currentItemIndex: updatedState.currentItemIndex,
      });

      // Optimistic update - update UI immediately
      setState(updatedState);
      stateRef.current = updatedState;

      // Save to database via mutation
      try {
        const result = await updateStateMutation.mutateAsync({
          instanceId,
          data: {
            queueItems: updatedState.queueItems.map((item, index) => ({
              id: item.id,
              sceneName: item.sceneName,
              delay: item.delay,
              position: index,
            })),
            isPlaying: updatedState.isPlaying,
            currentItemIndex: updatedState.currentItemIndex,
            directMode: updatedState.directMode,
            presets: updatedState.presets.map((preset) => ({
              id: preset.id,
              name: preset.name,
              items: preset.items.map((item, index) => ({
                id: item.id,
                sceneName: item.sceneName,
                delay: item.delay,
                position: index,
              })),
            })),
            currentPreset: updatedState.currentPreset,
          },
        });

        // Broadcast to other devices
        await broadcastStateChange(result.version, "full_state");
      } catch (err) {
        console.error("Error updating OBS queue state:", err);
        // Mutation handles rollback
      }
    },
    [isLoading, instanceId, updateStateMutation, broadcastStateChange]
  );

  // Handle remote state changes
  const handleRemoteStateChange = useCallback(
    async (payload: StateChangePayload) => {
      if (isUpdatingRef.current || payload.instanceId !== instanceId) {
        console.log("Ignoring remote update:", {
          reason: payload.instanceId !== instanceId ? "different instance" : "local update in progress",
          payloadInstanceId: payload.instanceId,
          ourInstanceId: instanceId,
        });
        return;
      }

      // Only apply if remote version is newer
      if (payload.version > versionRef.current) {
        console.log("Applying remote state update:", {
          instanceId,
          remoteVersion: payload.version,
          localVersion: versionRef.current,
          updateType: payload.type,
        });

        // Reload state from server by invalidating query
        queryClient.invalidateQueries({ queryKey: orpc.obsQueue.getState.key() });
      } else {
        console.log("Ignoring older remote update:", {
          remoteVersion: payload.version,
          localVersion: versionRef.current,
        });
      }
    },
    [instanceId, queryClient]
  );

  // Setup real-time subscription
  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const setup = async () => {
      // Subscribe to real-time updates
      channel = supabase.channel(`obs_queue_listener_${instanceId}`, {
        config: {
          broadcast: { self: false }, // Don't receive our own broadcasts
        },
      });

      channel.on("broadcast", { event: "state_update" }, ({ payload }) => {
        handleRemoteStateChange(payload as StateChangePayload);
      });

      await channel.subscribe();
      console.log("Subscribed to OBS queue state updates:", { instanceId });
    };

    setup();

    return () => {
      if (channel) {
        supabase.removeChannel(channel);
        console.log("Unsubscribed from OBS queue state updates:", { instanceId });
      }
    };
  }, [instanceId, handleRemoteStateChange]);

  // Convenience methods with optimistic updates
  const setQueueItems = useCallback(
    (items: QueueItem[] | ((prev: QueueItem[]) => QueueItem[])) => {
      const newItems = typeof items === "function" ? items(stateRef.current.queueItems) : items;
      updateState({ queueItems: newItems });
    },
    [updateState]
  );

  const setIsPlaying = useCallback(
    (playing: boolean) => {
      updateState({ isPlaying: playing });
    },
    [updateState]
  );

  const setCurrentItemIndex = useCallback(
    (index: number) => {
      updateState({ currentItemIndex: index });
    },
    [updateState]
  );

  const setDirectMode = useCallback(
    (mode: boolean) => {
      updateState({ directMode: mode });
    },
    [updateState]
  );

  const setPresets = useCallback(
    (presets: PresetQueue[]) => {
      updateState({ presets });
    },
    [updateState]
  );

  const setCurrentPreset = useCallback(
    (presetId: string) => {
      updateState({ currentPreset: presetId });
    },
    [updateState]
  );

  return {
    state,
    isLoading,
    error: queryError?.message || null,
    updateState,
    setQueueItems,
    setIsPlaying,
    setCurrentItemIndex,
    setDirectMode,
    setPresets,
    setCurrentPreset,
  };
}
