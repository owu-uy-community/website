"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { RefreshCw } from "lucide-react";
import { clampValue } from "app/lib/utils";
import { useOBSWebSocket } from "hooks/useOBSWebSocket";
import { useOBSQueueStateHybrid } from "hooks/useOBSQueueStateHybrid";
import {
  pause,
  start,
  stop,
  setSwitchSceneFunction,
  setUpdateStateFunction,
  subscribe,
  updateQueue,
  syncState,
} from "services/obsTimerService";
import { supabase } from "app/lib/supabase";
import { useOBSScreenshotStream } from "hooks/useOBSScreenshotStream";
import { OBS_CONFIG } from "app/lib/constants";
import { ConnectionCard } from "components/Admin/screen/ConnectionCard";
import { PlayerMode } from "components/Admin/screen/PlayerMode";
import { PresetsBar } from "components/Admin/screen/PresetsBar";
import { QueueList } from "components/Admin/screen/QueueList";
import { SceneGrid } from "components/Admin/screen/SceneGrid";
import { ScreenToolbar } from "components/Admin/screen/ScreenToolbar";
import { StatusBar } from "components/Admin/screen/StatusBar";

import type { PresetQueue, QueueItem } from "components/Admin/screen/types";

function OBSSceneLooper() {
  // Hybrid SQLite + Supabase state management
  const {
    state: queueState,
    isLoading: isLoadingState,
    setQueueItems: setQueueItemsDB,
    setIsPlaying: setIsPlayingDB,
    setCurrentItemIndex: setCurrentItemIndexDB,
    setDirectMode: setDirectModeDB,
    setPresets: setPresetsDB,
    setCurrentPreset: setCurrentPresetDB,
  } = useOBSQueueStateHybrid(1); // Instance ID 1 for admin screen

  // Local UI state
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [newPresetName, setNewPresetName] = useState("");
  const [editingDelay, setEditingDelay] = useState<string | null>(null);
  const [showPresetForm, setShowPresetForm] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);
  const lastIndexChangeRef = useRef<number>(Date.now());

  // Preset editing state
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null);
  const [editingPresetName, setEditingPresetName] = useState("");

  // Destructure from synced state
  const { queueItems, currentItemIndex, isPlaying, directMode, presets, currentPreset } = queueState;

  // OBS Connection
  const [obsAddress, setObsAddress] = useState<string>(OBS_CONFIG.defaults.address);
  const [obsPort, setObsPort] = useState<string>(OBS_CONFIG.defaults.port);
  const [obsPassword, setObsPassword] = useState<string>("");
  const [screenshotDelay, setScreenshotDelay] = useState<string>(OBS_CONFIG.defaults.screenshotDelay);
  const [showConnectionSettings, setShowConnectionSettings] = useState(false);
  const [playerMode, setPlayerMode] = useState(false);
  const [streamFps, setStreamFps] = useState<string>(OBS_CONFIG.defaults.streamFps);
  const [streamQuality, setStreamQuality] = useState<string>(OBS_CONFIG.defaults.streamQuality);

  const {
    isConnected,
    isConnecting,
    scenes,
    currentScene: obsCurrentScene,
    error,
    scenePreviews,
    connect,
    disconnect,
    switchScene: obsSwitchScene,
    refreshScenes,
    refreshScenePreviews,
    clearScenePreviews,
  } = useOBSWebSocket();

  const {
    currentFrame,
    isStreaming: isScreenshotStreaming,
    actualFps,
    error: streamError,
  } = useOBSScreenshotStream({
    isConnected,
    obsAddress,
    obsPort: parseInt(obsPort, 10),
    obsPassword,
    fps: parseInt(streamFps, 10),
    quality: parseInt(streamQuality, 10),
    enabled: playerMode,
    currentScene: obsCurrentScene,
  });

  const [isLoadingPreviews, setIsLoadingPreviews] = useState(false);

  // ⚡ OPTIMISTIC UPDATES ARCHITECTURE:
  // 1. Scene switches: Immediate UI update before OBS confirms
  // 2. Queue changes: Immediate UI update before database saves (via useOBSQueueStateHybrid)
  // 3. Both use same source (currentScene) for perfect synchronization

  const [optimisticScene, setOptimisticScene] = useState<string | null>(null);
  const optimisticTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Use optimistic scene if set, otherwise use actual OBS scene
  const currentScene = optimisticScene || obsCurrentScene;

  // Reset optimistic scene when OBS confirms the switch
  useEffect(() => {
    if (optimisticScene && obsCurrentScene === optimisticScene) {
      setOptimisticScene(null);
      if (optimisticTimeoutRef.current) {
        clearTimeout(optimisticTimeoutRef.current);
        optimisticTimeoutRef.current = null;
      }
    }
  }, [obsCurrentScene, optimisticScene]);

  // Optimistic scene switch wrapper
  const switchScene = useCallback(
    (sceneName: string) => {
      // Immediately update UI optimistically
      setOptimisticScene(sceneName);

      // Clear any existing timeout
      if (optimisticTimeoutRef.current) {
        clearTimeout(optimisticTimeoutRef.current);
      }

      // Fallback: reset optimistic state if OBS doesn't confirm
      optimisticTimeoutRef.current = setTimeout(() => {
        console.warn("OBS scene switch timeout, reverting to actual OBS state");
        setOptimisticScene(null);
      }, OBS_CONFIG.timeouts.sceneSwitch);

      // Actually switch the scene in OBS
      obsSwitchScene(sceneName);
    },
    [obsSwitchScene]
  );

  // Handle scene selection for loop queue or direct switching
  const handleSceneClick = useCallback(
    (sceneName: string) => {
      if (directMode) {
        // Direct scene switch - stop playback immediately
        if (isPlaying) {
          setIsPlayingDB(false);
          pause();
        }
        switchScene(sceneName);
      } else {
        // Add to queue with default 5s delay (works for both normal queue and editing preset)
        const existingIndex = queueItems.findIndex((item) => item.sceneName === sceneName);
        if (existingIndex >= 0) {
          setQueueItemsDB(queueItems.filter((_, index) => index !== existingIndex));
        } else {
          setQueueItemsDB([
            ...queueItems,
            { sceneName, delay: OBS_CONFIG.delays.default, id: `queue-${Date.now()}-${sceneName}` },
          ]);
        }
      }
    },
    [directMode, isPlaying, switchScene, queueItems, setIsPlayingDB, setQueueItemsDB]
  );

  // Start/pause the loop
  const togglePlayback = useCallback(() => {
    if (isPlaying) {
      setIsPlayingDB(false);
      pause();
    } else {
      if (queueItems.length > 0) {
        setIsPlayingDB(true);
        start();
      }
    }
  }, [isPlaying, queueItems, setIsPlayingDB]);

  // Stop the loop and reset
  const stopLoop = useCallback(() => {
    setIsPlayingDB(false);
    setCurrentItemIndexDB(0);
    stop();
  }, [setIsPlayingDB, setCurrentItemIndexDB]);

  // Clear all selected scenes
  const clearQueue = useCallback(() => {
    setQueueItemsDB([]);
    stopLoop();
  }, [stopLoop, setQueueItemsDB]);

  // Update delay for specific queue item
  const updateItemDelay = useCallback(
    (itemId: string, newDelay: number) => {
      const clampedDelay = clampValue(newDelay, OBS_CONFIG.delays.min, OBS_CONFIG.delays.max);
      setQueueItemsDB(queueItems.map((item) => (item.id === itemId ? { ...item, delay: clampedDelay } : item)));
    },
    [queueItems, setQueueItemsDB]
  );

  // Remove item from queue
  const removeFromQueue = useCallback(
    (itemId: string) => {
      setQueueItemsDB(queueItems.filter((item) => item.id !== itemId));
    },
    [queueItems, setQueueItemsDB]
  );

  // Save current queue as preset
  const savePreset = useCallback(() => {
    if (newPresetName.trim() && queueItems.length > 0) {
      const newPreset: PresetQueue = {
        id: Date.now().toString(),
        name: newPresetName.trim(),
        items: [...queueItems],
      };
      setPresetsDB([...presets, newPreset]);
      setNewPresetName("");
      setShowPresetForm(false);
    }
  }, [newPresetName, queueItems, presets, setPresetsDB]);

  // Load preset queue (or deselect if already selected)
  const loadPreset = useCallback(
    (presetId: string) => {
      // If clicking the currently selected preset, deselect it
      if (currentPreset === presetId) {
        setQueueItemsDB([]);
        setCurrentPresetDB("");
        stopLoop();
        return;
      }

      // Otherwise, load the preset
      const preset = presets.find((p) => p.id === presetId);
      if (preset) {
        setQueueItemsDB([...preset.items]);
        setCurrentPresetDB(presetId);
        stopLoop();
      }
    },
    [currentPreset, presets, stopLoop, setQueueItemsDB, setCurrentPresetDB]
  );

  // Delete preset
  const deletePreset = useCallback(
    (presetId: string) => {
      setPresetsDB(presets.filter((p) => p.id !== presetId));
      if (currentPreset === presetId) {
        setCurrentPresetDB("");
      }
    },
    [currentPreset, presets, setPresetsDB, setCurrentPresetDB]
  );

  // Start editing preset - load it into the queue
  const startEditingPreset = useCallback(
    (presetId: string) => {
      const preset = presets.find((p) => p.id === presetId);
      if (preset) {
        setEditingPresetId(presetId);
        setEditingPresetName(preset.name);
        setQueueItemsDB([...preset.items]);
        setCurrentPresetDB(presetId);
        stopLoop();
      }
    },
    [presets, stopLoop, setQueueItemsDB, setCurrentPresetDB]
  );

  // Cancel editing preset
  const cancelEditingPreset = useCallback(() => {
    setEditingPresetId(null);
    setEditingPresetName("");
  }, []);

  // Save edited preset
  const saveEditedPreset = useCallback(() => {
    if (!editingPresetId || !editingPresetName.trim()) return;

    const updatedPresets = presets.map((p) =>
      p.id === editingPresetId ? { ...p, name: editingPresetName.trim(), items: queueItems } : p
    );

    setPresetsDB(updatedPresets);
    cancelEditingPreset();
  }, [editingPresetId, editingPresetName, queueItems, presets, setPresetsDB, cancelEditingPreset]);

  // Handle drag start
  const handleDragStart = useCallback((itemId: string) => {
    setIsDragging(true);
    setDraggedItemId(itemId);
  }, []);

  // Handle drag end
  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
    setDraggedItemId(null);
  }, []);

  // Connect to OBS
  const handleConnect = useCallback(() => {
    connect({
      address: obsAddress,
      port: parseInt(obsPort, 10),
      password: obsPassword,
    });
    setShowConnectionSettings(false);
  }, [obsAddress, obsPort, obsPassword, connect]);

  // Load scene previews
  const handleLoadPreviews = useCallback(async () => {
    setIsLoadingPreviews(true);
    const delay = parseInt(screenshotDelay, 10) || 1000;
    try {
      await refreshScenePreviews(delay);
    } catch (error) {
      // Without this the spinner stays up forever when OBS drops mid-refresh.
      console.error("Error loading scene previews:", error);
    } finally {
      setIsLoadingPreviews(false);
    }
  }, [refreshScenePreviews, screenshotDelay]);

  // Clear scene previews
  const handleClearPreviews = useCallback(() => {
    clearScenePreviews();
  }, [clearScenePreviews]);

  // Auto-connect on page load if not already connected
  useEffect(() => {
    // Check if we should auto-connect (not already connected and no stored connection)
    const hasStoredConnection = typeof window !== "undefined" && sessionStorage.getItem("obs-connected") === "true";

    if (!isConnected && !isConnecting && !hasStoredConnection) {
      connect({
        address: obsAddress,
        port: parseInt(obsPort, 10),
        password: obsPassword,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty dependency array means this runs once on mount

  // Initialize timer service with OBS functions
  useEffect(() => {
    setSwitchSceneFunction(switchScene);
    setUpdateStateFunction(setCurrentItemIndexDB);
  }, [switchScene, setCurrentItemIndexDB]);

  // Subscribe to timer updates
  useEffect(() => {
    const unsubscribe = subscribe({
      onTick: (time) => {
        setTimeRemaining(time);
      },
      onSceneChange: (index, sceneName) => {
        // Timer service already calls setCurrentItemIndexDB
        console.log(`Scene changed to: ${sceneName} (index: ${index})`);
      },
    });

    return unsubscribe;
  }, []);

  // Sync queue updates to timer service (only after initial load)
  useEffect(() => {
    if (!isLoadingState) {
      updateQueue(queueItems, currentItemIndex);
    }
  }, [queueItems, currentItemIndex, isLoadingState]);

  // Sync playback state from Supabase to timer service (only after initial load)
  useEffect(() => {
    if (!isLoadingState) {
      syncState(isPlaying, currentItemIndex);
    }
  }, [isPlaying, currentItemIndex, isLoadingState]);

  // Broadcast OBS scene changes to other clients in real-time
  useEffect(() => {
    if (!currentScene || isLoadingState) return;

    const broadcastSceneChange = async () => {
      try {
        const channel = supabase.channel("obs_scene_broadcast");
        await channel.send({
          type: "broadcast",
          event: "scene_changed",
          payload: {
            sceneName: currentScene,
            timestamp: Date.now(),
            source: "obs_manual",
          },
        });
      } catch (err) {
        console.error("Error broadcasting scene change:", err);
      }
    };

    broadcastSceneChange();
  }, [currentScene, isLoadingState]);

  // Listen for scene changes from other clients
  useEffect(() => {
    if (isLoadingState) return;

    const channel = supabase.channel("obs_scene_listener", {
      config: {
        broadcast: { self: false }, // Don't receive our own broadcasts
      },
    });

    channel.on("broadcast", { event: "scene_changed" }, ({ payload }) => {
      console.log("📡 Received scene change from another client:", payload.sceneName);
      // The visual indicator will update automatically via currentActiveSceneId
      // No need to update local state since each client has its own OBS connection
    });

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isLoadingState]);

  // Always show the actual OBS scene as active (source of truth)
  // The queue tracks what SHOULD play next, but OBS shows what IS playing
  const currentActiveSceneId = currentScene;

  // Track when currentItemIndex changes to add grace period
  useEffect(() => {
    if (isPlaying) {
      lastIndexChangeRef.current = Date.now();
    }
  }, [currentItemIndex, isPlaying]);

  // Detect scene drift: queue is playing but OBS scene doesn't match expected scene
  // Add grace period after index changes to allow OBS to switch scenes
  const expectedScene = queueItems[currentItemIndex]?.sceneName;
  const timeSinceIndexChange = Date.now() - lastIndexChangeRef.current;
  const hasSceneDrift =
    isPlaying &&
    expectedScene &&
    currentScene !== expectedScene &&
    timeSinceIndexChange > OBS_CONFIG.timeouts.gracePeriod;

  // Optimize: Memoize active scene checks to prevent recalculation on every render
  const isSceneActive = useCallback((sceneName: string) => currentActiveSceneId === sceneName, [currentActiveSceneId]);

  const isQueueItemActive = useCallback(
    (item: QueueItem) => isPlaying && item.sceneName === currentActiveSceneId,
    [isPlaying, currentActiveSceneId]
  );

  // Show loading state while initial data is being fetched
  if (isLoadingState) {
    return (
      <div className="flex h-full items-center justify-center py-24">
        <div className="text-center">
          <RefreshCw className="mx-auto h-8 w-8 animate-spin text-primary" />
          <p className="mt-4 text-sm text-muted-foreground">Cargando estado de la cola…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full p-4 md:p-6">
      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-3">
        <ScreenToolbar
          isConnected={isConnected}
          isConnecting={isConnecting}
          isPlaying={isPlaying}
          directMode={directMode}
          playerMode={playerMode}
          showConnectionSettings={showConnectionSettings}
          isLoadingPreviews={isLoadingPreviews}
          queueItems={queueItems}
          scenePreviews={scenePreviews}
          togglePlayback={togglePlayback}
          stopLoop={stopLoop}
          clearQueue={clearQueue}
          setDirectModeDB={setDirectModeDB}
          refreshScenes={refreshScenes}
          handleLoadPreviews={handleLoadPreviews}
          handleClearPreviews={handleClearPreviews}
          setPlayerMode={setPlayerMode}
          setShowConnectionSettings={setShowConnectionSettings}
        />

        <ConnectionCard
          showConnectionSettings={showConnectionSettings}
          obsAddress={obsAddress}
          obsPort={obsPort}
          obsPassword={obsPassword}
          screenshotDelay={screenshotDelay}
          streamFps={streamFps}
          streamQuality={streamQuality}
          isConnected={isConnected}
          isConnecting={isConnecting}
          error={error}
          setObsAddress={setObsAddress}
          setObsPort={setObsPort}
          setObsPassword={setObsPassword}
          setScreenshotDelay={setScreenshotDelay}
          setStreamFps={setStreamFps}
          setStreamQuality={setStreamQuality}
          disconnect={disconnect}
          handleConnect={handleConnect}
        />

        <PresetsBar
          presets={presets}
          currentPreset={currentPreset}
          showPresetForm={showPresetForm}
          newPresetName={newPresetName}
          queueItems={queueItems}
          loadPreset={loadPreset}
          setShowPresetForm={setShowPresetForm}
          setNewPresetName={setNewPresetName}
          savePreset={savePreset}
          startEditingPreset={startEditingPreset}
          deletePreset={deletePreset}
        />

        {playerMode ? (
          <PlayerMode
            currentFrame={currentFrame}
            isScreenshotStreaming={isScreenshotStreaming}
            actualFps={actualFps}
            streamError={streamError}
            isConnected={isConnected}
            currentActiveSceneId={currentActiveSceneId}
            scenes={scenes}
            scenePreviews={scenePreviews}
            isSceneActive={isSceneActive}
            switchScene={switchScene}
          />
        ) : (
          <>
            <StatusBar
              isPlaying={isPlaying}
              currentActiveSceneId={currentActiveSceneId}
              timeRemaining={timeRemaining}
              queueItems={queueItems}
            />

            <SceneGrid
              scenes={scenes}
              scenePreviews={scenePreviews}
              queueItems={queueItems}
              currentItemIndex={currentItemIndex}
              isPlaying={isPlaying}
              directMode={directMode}
              editingPresetId={editingPresetId}
              timeRemaining={timeRemaining}
              isSceneActive={isSceneActive}
              handleSceneClick={handleSceneClick}
            />

            <QueueList
              queueItems={queueItems}
              scenePreviews={scenePreviews}
              isPlaying={isPlaying}
              isConnected={isConnected}
              timeRemaining={timeRemaining}
              editingPresetId={editingPresetId}
              editingPresetName={editingPresetName}
              editingDelay={editingDelay}
              isDragging={isDragging}
              draggedItemId={draggedItemId}
              hasSceneDrift={hasSceneDrift}
              setQueueItemsDB={setQueueItemsDB}
              setEditingPresetName={setEditingPresetName}
              setEditingDelay={setEditingDelay}
              saveEditedPreset={saveEditedPreset}
              cancelEditingPreset={cancelEditingPreset}
              isQueueItemActive={isQueueItemActive}
              handleDragStart={handleDragStart}
              handleDragEnd={handleDragEnd}
              removeFromQueue={removeFromQueue}
              updateItemDelay={updateItemDelay}
            />
          </>
        )}
      </div>
    </div>
  );
}

export default function ScreenClient() {
  return <OBSSceneLooper />;
}
