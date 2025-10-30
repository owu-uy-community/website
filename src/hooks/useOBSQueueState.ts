"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "app/lib/supabase";

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

const DEFAULT_STATE: OBSQueueState = {
  queueItems: [],
  isPlaying: false,
  currentItemIndex: 0,
  directMode: false,
  presets: [],
  currentPreset: "",
};

export function useOBSQueueState() {
  const [state, setState] = useState<OBSQueueState>(DEFAULT_STATE);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isUpdatingRef = useRef(false);
  const stateRef = useRef<OBSQueueState>(DEFAULT_STATE);
  const hasLoadedInitialStateRef = useRef(false);

  // Keep ref in sync with state
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Fetch initial state
  const fetchState = useCallback(async () => {
    try {
      setIsLoading(true);
      const { data, error: fetchError } = await supabase.from("obs_queue_state").select("*").eq("id", 1).single();

      if (fetchError) {
        if (fetchError.code === "PGRST116") {
          // No row exists, create default
          const { data: newData, error: insertError } = await supabase
            .from("obs_queue_state")
            .insert([{ id: 1, state: DEFAULT_STATE }])
            .select()
            .single();

          if (insertError) {
            throw insertError;
          }
          const newState = newData.state as OBSQueueState;
          setState(newState);
          stateRef.current = newState;
        } else {
          throw fetchError;
        }
      } else if (data) {
        const newState = data.state as OBSQueueState;
        console.log("Loaded OBS state from Supabase:", {
          queueItemsCount: newState.queueItems?.length,
          isPlaying: newState.isPlaying,
          currentItemIndex: newState.currentItemIndex,
        });
        setState(newState);
        stateRef.current = newState;
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch state");
      console.error("Error fetching OBS queue state:", err);
    } finally {
      setIsLoading(false);
      hasLoadedInitialStateRef.current = true;
    }
  }, []);

  // Update state in Supabase with optimistic updates
  const updateState = useCallback(async (newState: Partial<OBSQueueState>) => {
    // Don't allow updates until initial state is loaded
    if (!hasLoadedInitialStateRef.current) {
      console.warn("Skipping update - initial state not yet loaded", { newState });
      return;
    }

    // Use ref to get the latest state (avoid stale closures)
    const currentState = stateRef.current;
    const updatedState = { ...currentState, ...newState };

    console.log("Updating OBS state:", {
      queueItemsCount: updatedState.queueItems?.length,
      isPlaying: updatedState.isPlaying,
      currentItemIndex: updatedState.currentItemIndex,
    });

    // Optimistic update - update UI immediately (synchronous)
    setState(updatedState);
    stateRef.current = updatedState;

    // Sync to Supabase in background (don't await, don't block)
    setTimeout(async () => {
      if (isUpdatingRef.current) return;

      try {
        isUpdatingRef.current = true;

        const { error: updateError } = await supabase
          .from("obs_queue_state")
          .update({ state: updatedState, updated_at: new Date().toISOString() })
          .eq("id", 1);

        if (updateError) {
          throw updateError;
        }
      } catch (err) {
        // On error, revert to previous state
        console.error("Error updating OBS queue state:", err);
        setError(err instanceof Error ? err.message : "Failed to sync state");

        // Fetch latest state from server to resync
        try {
          const { data } = await supabase.from("obs_queue_state").select("*").eq("id", 1).single();
          if (data) {
            setState(data.state as OBSQueueState);
            stateRef.current = data.state as OBSQueueState;
          }
        } catch (fetchErr) {
          console.error("Error fetching latest state:", fetchErr);
        }
      } finally {
        isUpdatingRef.current = false;
      }
    }, 0);
  }, []);

  // Initialize and subscribe to changes
  useEffect(() => {
    fetchState();

    // Subscribe to real-time changes
    const channel = supabase
      .channel("obs_queue_state_changes")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "obs_queue_state",
          filter: "id=eq.1",
        },
        (payload) => {
          if (payload.new && !isUpdatingRef.current) {
            const newState = payload.new.state as OBSQueueState;
            setState(newState);
            stateRef.current = newState;
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchState]);

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
    error,
    updateState,
    setQueueItems,
    setIsPlaying,
    setCurrentItemIndex,
    setDirectMode,
    setPresets,
    setCurrentPreset,
  };
}
