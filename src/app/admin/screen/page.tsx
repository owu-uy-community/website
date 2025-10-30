"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "components/shared/ui/button";
import { Card, CardContent } from "components/shared/ui/card";
import { Badge } from "components/shared/ui/badge";
import { Input } from "components/shared/ui/input";
import { Label } from "components/shared/ui/label";
import {
  Play,
  Pause,
  Square,
  RotateCcw,
  Settings,
  Monitor,
  Plus,
  Minus,
  Save,
  Trash2,
  X,
  Wifi,
  WifiOff,
  RefreshCw,
  List,
  Clock,
  MousePointer,
  Image,
  XCircle,
  Maximize,
  Minimize,
  Edit,
  Check,
} from "lucide-react";
import { cn, clampValue, calculateProgressRing } from "app/lib/utils";
import { motion, AnimatePresence, Reorder } from "motion/react";
import { useOBSWebSocket } from "hooks/useOBSWebSocket";
import { AdminAuthWrapper } from "components/shared/AdminAuthWrapper";
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

interface QueueItem {
  sceneName: string;
  delay: number;
  id: string;
}

interface PresetQueue {
  id: string;
  name: string;
  items: QueueItem[];
}

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
    await refreshScenePreviews(delay);
    setIsLoadingPreviews(false);
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
      <div className="flex h-full items-center justify-center bg-black text-white">
        <div className="text-center">
          <RefreshCw className="mx-auto h-8 w-8 animate-spin text-yellow-400" />
          <p className="mt-4 text-sm text-gray-400">Loading queue state...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black p-2 text-white md:p-3">
      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-3">
        {/* Modern Navbar */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col gap-3 rounded-xl bg-white/5 p-3 backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-yellow-400">
              <Monitor className="h-5 w-5 text-black" />
            </div>
            <h1 className="text-xl font-semibold text-white">OBS Scene Looper</h1>
          </div>

          <div className="flex flex-wrap items-center justify-start gap-2">
            {/* Connection Status */}
            <div
              className={cn(
                "flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-xs font-medium",
                isConnected ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
              )}
            >
              {isConnected ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
              {isConnecting ? "Connecting..." : isConnected ? "Connected" : "Disconnected"}
            </div>

            {/* Playback Controls */}
            <div className="flex items-center gap-1 rounded-lg bg-white/10 p-1">
              <Button
                onClick={togglePlayback}
                disabled={queueItems.length === 0 || !isConnected}
                className="h-8 rounded-md bg-white px-4 py-2 text-xs font-medium text-black hover:bg-white/90"
              >
                {isPlaying ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
              </Button>
              <Button
                onClick={stopLoop}
                className="h-8 rounded-md bg-white/20 px-4 py-2 text-xs font-medium text-white hover:bg-white/30 hover:text-white"
              >
                <Square className="h-3 w-3" />
              </Button>
              <Button
                onClick={clearQueue}
                className="h-8 rounded-md bg-white/20 px-4 py-2 text-xs font-medium text-white hover:bg-white/30 hover:text-white"
              >
                <RotateCcw className="h-3 w-3" />
              </Button>
            </div>

            {/* Mode Toggle */}
            <Button
              onClick={() => setDirectModeDB(!directMode)}
              disabled={!isConnected}
              className={cn(
                "h-8 rounded-lg px-4 py-2 text-xs font-medium transition-all duration-200",
                directMode
                  ? "bg-white text-black hover:bg-white/90"
                  : "bg-white/10 text-white hover:bg-white/20 hover:text-white"
              )}
            >
              {directMode ? <MousePointer className="mr-2 h-3 w-3" /> : <List className="mr-2 h-3 w-3" />}
              {directMode ? "DIRECT" : "QUEUE"}
            </Button>

            {/* Refresh & Settings */}
            <Button
              onClick={refreshScenes}
              disabled={!isConnected}
              className="h-8 rounded-lg bg-white/10 px-3 py-2 text-xs font-medium text-white hover:bg-white/20 hover:text-white"
              title="Refresh scenes list"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button
              onClick={handleLoadPreviews}
              disabled={!isConnected || isLoadingPreviews}
              className="h-8 rounded-lg bg-white/10 px-3 py-2 text-xs font-medium text-white hover:bg-white/20 hover:text-white"
              title="Load scene previews"
            >
              {isLoadingPreviews ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Image className="h-4 w-4" />}
            </Button>
            <Button
              onClick={handleClearPreviews}
              disabled={Object.keys(scenePreviews).length === 0}
              className="h-8 rounded-lg bg-white/10 px-3 py-2 text-xs font-medium text-white hover:bg-white/20 hover:text-white"
              title="Clear cached previews"
            >
              <XCircle className="h-4 w-4" />
            </Button>
            <Button
              onClick={() => setPlayerMode(!playerMode)}
              disabled={!isConnected}
              className={cn(
                "h-8 rounded-lg px-3 py-2 text-xs font-medium text-white hover:bg-white/20 hover:text-white",
                playerMode ? "bg-white/30" : "bg-white/10"
              )}
              title={playerMode ? "Exit player mode" : "Full screen player"}
            >
              {playerMode ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
            </Button>
            <Button
              onClick={() => setShowConnectionSettings(!showConnectionSettings)}
              className="h-8 rounded-lg bg-white/10 px-3 py-2 text-xs font-medium text-white hover:bg-white/20 hover:text-white"
              title="Connection settings"
            >
              <Settings className="h-4 w-4" />
            </Button>
          </div>
        </motion.div>

        {/* Connection Settings */}
        <AnimatePresence>
          {showConnectionSettings && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="rounded-xl bg-white/5 p-4 backdrop-blur-sm"
            >
              <h3 className="mb-3 text-sm font-medium text-white">OBS Connection Settings</h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <div>
                  <Label htmlFor="obs-address" className="text-xs text-white/70">
                    Address
                  </Label>
                  <Input
                    id="obs-address"
                    value={obsAddress}
                    onChange={(e) => setObsAddress(e.target.value)}
                    placeholder="localhost"
                    className="h-8 border-white/20 bg-white/10 text-sm text-white"
                  />
                </div>
                <div>
                  <Label htmlFor="obs-port" className="text-xs text-white/70">
                    Port
                  </Label>
                  <Input
                    id="obs-port"
                    value={obsPort}
                    onChange={(e) => setObsPort(e.target.value)}
                    placeholder="4455"
                    className="h-8 border-white/20 bg-white/10 text-sm text-white"
                  />
                </div>
                <div>
                  <Label htmlFor="obs-password" className="text-xs text-white/70">
                    Password (optional)
                  </Label>
                  <Input
                    id="obs-password"
                    type="password"
                    value={obsPassword}
                    onChange={(e) => setObsPassword(e.target.value)}
                    placeholder="Enter password"
                    className="h-8 border-white/20 bg-white/10 text-sm text-white"
                  />
                </div>
                <div>
                  <Label htmlFor="screenshot-delay" className="text-xs text-white/70">
                    Screenshot Delay (ms)
                  </Label>
                  <Input
                    id="screenshot-delay"
                    type="number"
                    value={screenshotDelay}
                    onChange={(e) => setScreenshotDelay(e.target.value)}
                    placeholder="1000"
                    min="0"
                    max="5000"
                    className="h-8 border-white/20 bg-white/10 text-sm text-white"
                  />
                </div>
                <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-end">
                  {isConnected ? (
                    <Button
                      onClick={disconnect}
                      className="h-8 flex-1 bg-red-500/20 text-xs text-red-400 hover:bg-red-500/30"
                    >
                      Disconnect
                    </Button>
                  ) : (
                    <Button
                      onClick={handleConnect}
                      disabled={isConnecting}
                      className="h-8 flex-1 bg-green-500/20 text-xs text-green-400 hover:bg-green-500/30"
                    >
                      {isConnecting ? "Connecting..." : "Connect"}
                    </Button>
                  )}
                </div>
              </div>
              <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <Label htmlFor="stream-fps" className="text-xs text-white/70">
                    Player FPS
                  </Label>
                  <Input
                    id="stream-fps"
                    type="number"
                    value={streamFps}
                    onChange={(e) => setStreamFps(e.target.value)}
                    placeholder="15"
                    min="1"
                    max="15"
                    className="h-8 border-white/20 bg-white/10 text-sm text-white"
                  />
                  <p className="mt-1 text-xs text-white/50">Frames per second (1-15 max)</p>
                </div>
                <div>
                  <Label htmlFor="stream-quality" className="text-xs text-white/70">
                    JPEG Quality
                  </Label>
                  <Input
                    id="stream-quality"
                    type="number"
                    value={streamQuality}
                    onChange={(e) => setStreamQuality(e.target.value)}
                    placeholder="85"
                    min="1"
                    max="100"
                    className="h-8 border-white/20 bg-white/10 text-sm text-white"
                  />
                  <p className="mt-1 text-xs text-white/50">Image quality (1-100)</p>
                </div>
              </div>
              <div className="mt-2 rounded-lg bg-blue-500/10 p-2">
                <p className="text-xs text-blue-400">
                  💡 Player Mode uses OBS WebSocket screenshots - no additional server needed!
                </p>
              </div>
              {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Preset Switching */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="flex flex-col gap-3 rounded-xl bg-white/5 p-3 backdrop-blur-sm md:flex-row md:items-center"
        >
          <div className="flex flex-1 items-center gap-2 overflow-x-auto">
            <span className="whitespace-nowrap text-sm font-medium text-white/70">Presets</span>
            {presets.map((preset) => (
              <Button
                key={preset.id}
                onClick={() => loadPreset(preset.id)}
                className={cn(
                  "h-8 flex-shrink-0 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium",
                  currentPreset === preset.id
                    ? "bg-white text-black"
                    : "bg-white/10 text-white hover:bg-white/20 hover:!text-white"
                )}
              >
                {preset.name}
                <Badge className="ml-2 bg-black/20 px-1.5 py-0.5 text-xs">{preset.items.length}</Badge>
              </Button>
            ))}
          </div>

          <div className="flex flex-col items-stretch gap-2 md:flex-row md:items-center">
            <AnimatePresence mode="wait">
              {showPresetForm ? (
                <motion.div
                  key="form"
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: "auto" }}
                  exit={{ opacity: 0, width: 0 }}
                  className="flex items-center gap-2"
                >
                  <Input
                    value={newPresetName}
                    onChange={(e) => setNewPresetName(e.target.value)}
                    placeholder="Enter preset name..."
                    className="h-8 w-full rounded-lg border-0 bg-white text-sm text-black lg:w-36"
                    onKeyDown={(e) => e.key === "Enter" && savePreset()}
                    autoFocus
                  />
                  <Button
                    onClick={savePreset}
                    disabled={!newPresetName.trim() || queueItems.length === 0}
                    className="h-8 rounded-lg bg-white px-3 py-2 text-xs text-black hover:bg-white/90"
                  >
                    <Save className="h-3 w-3" />
                  </Button>
                  <Button
                    onClick={() => {
                      setShowPresetForm(false);
                      setNewPresetName("");
                    }}
                    className="h-8 rounded-lg bg-white/20 px-3 py-2 text-xs text-white hover:bg-white/30 hover:text-white"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </motion.div>
              ) : (
                <motion.div
                  key="buttons"
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: "auto" }}
                  exit={{ opacity: 0, width: 0 }}
                  className="flex items-center gap-2"
                >
                  <Button
                    onClick={() => setShowPresetForm(true)}
                    disabled={queueItems.length === 0}
                    className="h-8 rounded-lg bg-white px-3 py-2 text-xs text-black hover:bg-white/90"
                    title="Create new preset"
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                  {currentPreset && (
                    <>
                      <Button
                        onClick={() => startEditingPreset(currentPreset)}
                        className="h-8 rounded-lg bg-white/20 px-3 py-2 text-xs text-white hover:bg-white/30 hover:text-white"
                        title="Edit preset"
                      >
                        <Edit className="h-3 w-3" />
                      </Button>
                      <Button
                        onClick={() => deletePreset(currentPreset)}
                        className="h-8 rounded-lg bg-red-500/20 px-3 py-2 text-xs text-red-400 hover:bg-red-500/30"
                        title="Delete preset"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>

        {/* Player Mode View */}
        {playerMode ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-1 flex-col gap-3 overflow-hidden"
          >
            {/* Screenshot Stream Player */}
            <div className="relative flex-1 overflow-hidden rounded-xl bg-black">
              {currentFrame ? (
                <img src={currentFrame} alt="OBS Stream" className="h-full w-full object-contain" />
              ) : (
                <div className="flex h-full items-center justify-center">
                  <div className="text-center">
                    {isScreenshotStreaming ? (
                      <>
                        <RefreshCw className="mx-auto h-12 w-12 animate-spin text-white/50" />
                        <p className="mt-4 text-sm text-white/60">Loading stream...</p>
                      </>
                    ) : (
                      <>
                        <Monitor className="mx-auto h-12 w-12 text-white/50" />
                        <p className="mt-4 text-sm text-white/60">
                          {isConnected ? "Starting stream..." : "Connect to OBS to start streaming"}
                        </p>
                      </>
                    )}
                  </div>
                </div>
              )}
              {/* Live indicator */}
              {isScreenshotStreaming && (
                <div className="absolute left-4 top-4 flex items-center gap-2 rounded-full bg-red-500 px-3 py-1.5 text-sm font-medium text-white shadow-lg">
                  <div className="h-2 w-2 animate-pulse rounded-full bg-white" />
                  LIVE {actualFps > 0 && `• ${actualFps} FPS`}
                </div>
              )}
              {/* Current scene overlay */}
              {currentActiveSceneId && (
                <div className="absolute bottom-4 left-4 rounded-lg bg-black/70 px-4 py-2 backdrop-blur-sm">
                  <p className="text-xs text-white/60">Current Scene</p>
                  <p className="text-sm font-medium text-white">{currentActiveSceneId}</p>
                </div>
              )}
              {/* Stream error */}
              {streamError && (
                <div className="absolute right-4 top-4 rounded-lg bg-red-500/20 px-3 py-2 backdrop-blur-sm">
                  <p className="text-xs text-red-400">{streamError}</p>
                </div>
              )}
            </div>

            {/* Direct Scene Switcher */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="flex-shrink-0 rounded-xl bg-white/5 p-3 backdrop-blur-sm"
            >
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-medium text-white">Direct Scene Switch</h3>
                <div className="text-xs text-white/60">{scenes.length} scenes available</div>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-2">
                {[...scenes]
                  .sort((a, b) => a.sceneName.localeCompare(b.sceneName))
                  .map((scene) => {
                    const isActive = isSceneActive(scene.sceneName);
                    return (
                      <motion.button
                        key={scene.sceneName}
                        onClick={() => switchScene(scene.sceneName)}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        disabled={!isConnected}
                        className={cn(
                          "relative flex min-w-[120px] flex-shrink-0 flex-col items-center gap-2 rounded-lg p-3 transition-all duration-200",
                          isActive
                            ? "bg-white text-black shadow-lg"
                            : "bg-white/10 text-white hover:bg-white/20 hover:text-white",
                          !isConnected && "cursor-not-allowed opacity-50"
                        )}
                      >
                        {scenePreviews[scene.sceneName] ? (
                          <div className="aspect-video w-full overflow-hidden rounded bg-black/50">
                            <img
                              src={scenePreviews[scene.sceneName]}
                              alt={scene.sceneName}
                              className="h-full w-full object-cover"
                            />
                          </div>
                        ) : (
                          <div className="flex h-12 w-full items-center justify-center rounded bg-black/30">
                            <Monitor className="h-6 w-6 opacity-50" />
                          </div>
                        )}
                        <span className="text-xs font-medium">{scene.sceneName}</span>
                        {isActive && (
                          <div className="absolute right-2 top-2 h-3 w-3 animate-pulse rounded-full bg-red-500 shadow-lg shadow-red-500/50" />
                        )}
                      </motion.button>
                    );
                  })}
              </div>
            </motion.div>
          </motion.div>
        ) : (
          <>
            {/* Status Bar */}
            <AnimatePresence>
              {(isPlaying || currentActiveSceneId || queueItems.length > 0) && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mb-3 flex items-center justify-between rounded-xl bg-white/5 p-3 text-sm backdrop-blur-sm"
                >
                  <div className="flex items-center gap-6">
                    {isPlaying && (
                      <motion.div
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="flex items-center gap-2"
                      >
                        <div className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
                        <span className="font-medium text-white">{timeRemaining}s</span>
                        <span className="text-white/60">until next</span>
                      </motion.div>
                    )}

                    {currentActiveSceneId && (
                      <motion.div
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="flex items-center gap-2"
                      >
                        <div className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
                        <span className="font-medium text-white">{currentActiveSceneId}</span>
                        <span className="text-white/60">active</span>
                      </motion.div>
                    )}
                  </div>

                  <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex items-center gap-2"
                  >
                    <span className="font-medium text-white">{queueItems.length}</span>
                    <span className="text-white/60">scenes queued</span>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Scene Grid */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="mb-3 grid flex-shrink-0 grid-cols-4 gap-3 md:grid-cols-6 lg:grid-cols-8"
            >
              {[...scenes]
                .sort((a, b) => a.sceneName.localeCompare(b.sceneName))
                .map((scene, index) => {
                  const isInQueue = queueItems.some((item) => item.sceneName === scene.sceneName);
                  const isActive = isSceneActive(scene.sceneName);
                  const queuePosition = queueItems.findIndex((item) => item.sceneName === scene.sceneName);

                  return (
                    <motion.div
                      key={scene.sceneName}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: index * 0.05 }}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.9 }}
                    >
                      <Card
                        className={cn(
                          "relative aspect-square cursor-pointer border-0 transition-all duration-200",
                          isActive
                            ? "bg-white text-black shadow-lg"
                            : editingPresetId && isInQueue
                              ? "bg-white/30 text-white ring-2 ring-white"
                              : isInQueue && !directMode
                                ? "bg-white/20 text-white"
                                : "bg-white/5 text-white hover:bg-white/10 hover:text-white"
                        )}
                        onClick={() => handleSceneClick(scene.sceneName)}
                      >
                        <CardContent className="flex h-full flex-col items-center justify-center gap-1 p-2">
                          {scenePreviews[scene.sceneName] ? (
                            <div className="mb-1 aspect-video w-full overflow-hidden rounded bg-black/50">
                              <img
                                src={scenePreviews[scene.sceneName]}
                                alt={scene.sceneName}
                                className="h-full w-full object-cover"
                              />
                            </div>
                          ) : (
                            <div className="mb-2 flex h-7 w-7 items-center justify-center">
                              <Monitor className="h-6 w-6" />
                            </div>
                          )}
                          <h3 className="w-full break-words text-center text-xs font-medium leading-tight">
                            {scene.sceneName}
                          </h3>

                          {/* Queue/Edit position badge */}
                          <AnimatePresence>
                            {isInQueue && !directMode && queuePosition >= 0 && (
                              <motion.div
                                initial={{ opacity: 0, scale: 0 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0 }}
                                className="absolute -right-1 -top-1"
                              >
                                {/* Progress ring for active scene */}
                                {isPlaying && queuePosition === currentItemIndex && (
                                  <svg
                                    className="absolute inset-0 z-0 h-7 w-7 -translate-x-1 -translate-y-1"
                                    viewBox="0 0 28 28"
                                  >
                                    <circle
                                      cx="14"
                                      cy="14"
                                      r="12"
                                      fill="white"
                                      stroke="rgba(34, 197, 94, 0.3)"
                                      strokeWidth="3"
                                    />
                                    <circle
                                      cx="14"
                                      cy="14"
                                      r="12"
                                      fill="none"
                                      stroke="rgb(34, 197, 94)"
                                      strokeWidth="3"
                                      strokeLinecap="round"
                                      strokeDasharray={`${2 * Math.PI * 12}`}
                                      strokeDashoffset={calculateProgressRing(
                                        queueItems[currentItemIndex]?.delay - timeRemaining,
                                        queueItems[currentItemIndex]?.delay,
                                        12
                                      )}
                                      transform="rotate(-90 14 14)"
                                      style={{ transition: "stroke-dashoffset 0.3s linear" }}
                                    />
                                  </svg>
                                )}
                                <Badge
                                  className={cn(
                                    "relative z-10 flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold",
                                    isPlaying && queuePosition === currentItemIndex
                                      ? "bg-white"
                                      : editingPresetId
                                        ? "bg-white text-black"
                                        : "bg-white"
                                  )}
                                  style={{
                                    color:
                                      isPlaying && queuePosition === currentItemIndex
                                        ? "black"
                                        : editingPresetId
                                          ? "black"
                                          : "black",
                                  }}
                                >
                                  {queuePosition + 1}
                                </Badge>
                              </motion.div>
                            )}
                          </AnimatePresence>

                          {/* Active indicator */}
                          <AnimatePresence>
                            {isActive && (
                              <motion.div
                                initial={{ opacity: 0, scale: 0 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0 }}
                                className="absolute -left-1 -top-1 h-4 w-4 animate-pulse rounded-full bg-red-500 shadow-lg shadow-red-500/50"
                              />
                            )}
                          </AnimatePresence>
                        </CardContent>
                      </Card>
                    </motion.div>
                  );
                })}
            </motion.div>

            {/* Loop Sequence */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              transition={{ delay: 0.3 }}
              className="flex min-h-0 flex-1 flex-col rounded-xl bg-white/5 p-3 backdrop-blur-sm"
            >
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {editingPresetId ? (
                    <>
                      <h3 className="text-sm font-medium text-white">Editing Preset</h3>
                      <Input
                        value={editingPresetName}
                        onChange={(e) => setEditingPresetName(e.target.value)}
                        placeholder="Preset name..."
                        className="h-7 w-40 rounded border-0 bg-white/10 text-xs text-white"
                        onKeyDown={(e) => e.key === "Enter" && saveEditedPreset()}
                      />
                    </>
                  ) : (
                    <>
                      <h3 className="text-sm font-medium text-white">Loop Sequence</h3>
                      <AnimatePresence>
                        {hasSceneDrift && (
                          <motion.div
                            initial={{ opacity: 0, scale: 0.8, x: -10 }}
                            animate={{ opacity: 1, scale: 1, x: 0 }}
                            exit={{ opacity: 0, scale: 0.8, x: -10 }}
                            className="flex items-center gap-1.5 rounded-full bg-red-500/20 px-2 py-1 text-xs font-medium text-red-400"
                          >
                            <XCircle className="h-3 w-3" />
                            <span>Scene drifted - manual OBS change detected</span>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {editingPresetId ? (
                    <>
                      <Button
                        onClick={saveEditedPreset}
                        disabled={!editingPresetName.trim() || queueItems.length === 0}
                        className="h-7 rounded-lg bg-green-500/20 px-2 py-1 text-xs text-green-400 hover:bg-green-500/30"
                      >
                        <Check className="mr-1 h-3 w-3" />
                        Save
                      </Button>
                      <Button
                        onClick={cancelEditingPreset}
                        className="h-7 rounded-lg bg-white/20 px-2 py-1 text-xs text-white hover:bg-white/30 hover:text-white"
                      >
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <div className="text-sm text-white/60">{queueItems.length} scenes</div>
                  )}
                </div>
              </div>
              <div className="flex-1 overflow-x-auto overflow-y-hidden pb-3 sm:pb-0">
                {queueItems.length > 0 ? (
                  <Reorder.Group
                    axis="x"
                    values={queueItems}
                    onReorder={setQueueItemsDB}
                    className="flex h-full min-h-[120px] gap-2 pb-2"
                    layoutScroll
                  >
                    <AnimatePresence initial={false}>
                      {queueItems.map((item, index) => {
                        const isCurrentlyActive = isQueueItemActive(item);
                        const isBeingDragged = draggedItemId === item.id;

                        return (
                          <div key={item.id} className="flex items-center">
                            {/* Drop indicator */}
                            <AnimatePresence>
                              {isDragging && !isBeingDragged && index === 0 && (
                                <motion.div
                                  initial={{ opacity: 0, width: 0 }}
                                  animate={{ opacity: 1, width: 4 }}
                                  exit={{ opacity: 0, width: 0 }}
                                  transition={{
                                    duration: 0.15,
                                  }}
                                  className="mr-1 h-16 border-l-2 border-dashed border-yellow-400/70 shadow-[0_0_10px_rgba(250,204,21,0.3)]"
                                />
                              )}
                            </AnimatePresence>

                            <Reorder.Item
                              value={item}
                              initial={{ opacity: 0, scale: 0.8 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.8 }}
                              transition={{
                                delay: index * 0.05,
                                layout: {
                                  type: "spring",
                                  stiffness: 350,
                                  damping: 25,
                                },
                              }}
                              whileDrag={{
                                scale: 1.05,
                                zIndex: 999,
                                cursor: "grabbing",
                                boxShadow: "0 5px 20px rgba(0,0,0,0.4)",
                              }}
                              drag="x"
                              dragSnapToOrigin={false}
                              dragElastic={0.05}
                              onDragStart={() => handleDragStart(item.id)}
                              onDragEnd={handleDragEnd}
                              style={{ position: "relative" }}
                              className={cn(
                                "relative flex w-40 flex-shrink-0 cursor-grab select-none flex-col gap-2 rounded-lg border-0 p-3 active:cursor-grabbing sm:w-48 lg:w-56",
                                isCurrentlyActive
                                  ? "bg-white text-black shadow-lg"
                                  : "bg-white/10 text-white hover:bg-white/15 hover:text-white"
                              )}
                            >
                              {/* Preview Image */}
                              {scenePreviews[item.sceneName] ? (
                                <div className="relative w-full overflow-hidden rounded bg-black/50">
                                  <img
                                    src={scenePreviews[item.sceneName]}
                                    alt={item.sceneName}
                                    className="h-auto w-full object-cover"
                                    draggable={false}
                                  />
                                  <div className="absolute right-1 top-1">
                                    {/* Progress ring for active scene */}
                                    {isPlaying && isCurrentlyActive && (
                                      <svg className="absolute -inset-1 z-0 h-8 w-8" viewBox="0 0 32 32">
                                        <circle
                                          cx="16"
                                          cy="16"
                                          r="14"
                                          fill="white"
                                          stroke="rgba(34, 197, 94, 0.3)"
                                          strokeWidth="3"
                                        />
                                        <circle
                                          cx="16"
                                          cy="16"
                                          r="14"
                                          fill="none"
                                          stroke="rgb(34, 197, 94)"
                                          strokeWidth="3"
                                          strokeLinecap="round"
                                          strokeDasharray={`${2 * Math.PI * 14}`}
                                          strokeDashoffset={calculateProgressRing(
                                            item.delay - timeRemaining,
                                            item.delay,
                                            14
                                          )}
                                          transform="rotate(-90 16 16)"
                                          style={{ transition: "stroke-dashoffset 0.3s linear" }}
                                        />
                                      </svg>
                                    )}
                                    <Badge className="relative z-10 flex h-6 w-6 items-center justify-center rounded-full bg-white p-0 text-xs font-bold text-black shadow-lg">
                                      {index + 1}
                                    </Badge>
                                  </div>
                                </div>
                              ) : (
                                <div className="relative flex aspect-video w-full items-center justify-center rounded bg-black/30">
                                  <Monitor className="h-8 w-8 opacity-50" />
                                  <div className="absolute right-1 top-1">
                                    {/* Progress ring for active scene */}
                                    {isPlaying && isCurrentlyActive && (
                                      <svg className="absolute -inset-1 z-0 h-8 w-8" viewBox="0 0 32 32">
                                        <circle
                                          cx="16"
                                          cy="16"
                                          r="14"
                                          fill="white"
                                          stroke="rgba(34, 197, 94, 0.3)"
                                          strokeWidth="3"
                                        />
                                        <circle
                                          cx="16"
                                          cy="16"
                                          r="14"
                                          fill="none"
                                          stroke="rgb(34, 197, 94)"
                                          strokeWidth="3"
                                          strokeLinecap="round"
                                          strokeDasharray={`${2 * Math.PI * 14}`}
                                          strokeDashoffset={calculateProgressRing(
                                            item.delay - timeRemaining,
                                            item.delay,
                                            14
                                          )}
                                          transform="rotate(-90 16 16)"
                                          style={{ transition: "stroke-dashoffset 0.3s linear" }}
                                        />
                                      </svg>
                                    )}
                                    <Badge className="relative z-10 flex h-6 w-6 items-center justify-center rounded-full bg-white p-0 text-xs font-bold text-black shadow-lg">
                                      {index + 1}
                                    </Badge>
                                  </div>
                                </div>
                              )}

                              <div className="flex items-center justify-between gap-2">
                                <span className="flex-1 truncate text-xs font-medium">{item.sceneName}</span>
                                <Button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    removeFromQueue(item.id);
                                  }}
                                  className={cn(
                                    "h-5 w-5 rounded p-0 hover:bg-red-500/30",
                                    isCurrentlyActive
                                      ? "bg-red-500/30 text-red-600 hover:bg-red-500/40"
                                      : "bg-red-500/20 text-red-400"
                                  )}
                                  title="Remove from queue"
                                >
                                  <X className="h-3 w-3" />
                                </Button>
                              </div>

                              <div className="flex items-center gap-2">
                                <div className="flex items-center gap-1">
                                  <Clock
                                    className={cn(
                                      "h-3 w-3 flex-shrink-0",
                                      isCurrentlyActive ? "text-black" : "text-white"
                                    )}
                                  />
                                </div>
                                <div
                                  className={cn(
                                    "flex flex-1 items-center justify-between gap-1 rounded px-2 py-1",
                                    isCurrentlyActive ? "bg-black/10" : "bg-black/20"
                                  )}
                                >
                                  <Button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      updateItemDelay(item.id, item.delay - 1);
                                    }}
                                    className={cn(
                                      "h-5 w-5 rounded p-0",
                                      isCurrentlyActive
                                        ? "bg-black/20 text-black hover:bg-black/30"
                                        : "bg-white/20 text-white hover:bg-white/30 hover:text-white"
                                    )}
                                    disabled={item.delay <= 1}
                                  >
                                    <Minus className="h-3 w-3" />
                                  </Button>
                                  {editingDelay === item.id ? (
                                    <Input
                                      type="number"
                                      value={item.delay}
                                      onChange={(e) => updateItemDelay(item.id, Number.parseInt(e.target.value) || 1)}
                                      onBlur={() => setEditingDelay(null)}
                                      onKeyDown={(e) => e.key === "Enter" && setEditingDelay(null)}
                                      onClick={(e) => e.stopPropagation()}
                                      className={cn(
                                        "h-5 w-14 rounded border-0 p-1 text-center text-xs font-medium",
                                        isCurrentlyActive ? "bg-white text-black" : "bg-white text-black"
                                      )}
                                      min="1"
                                      max="300"
                                      autoFocus
                                    />
                                  ) : (
                                    <div
                                      className={cn(
                                        "flex h-5 w-14 cursor-pointer items-center justify-center rounded text-xs font-medium",
                                        isCurrentlyActive ? "hover:bg-black/10" : "hover:bg-white/10 hover:text-white"
                                      )}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setEditingDelay(item.id);
                                      }}
                                    >
                                      {item.delay}s
                                    </div>
                                  )}
                                  <Button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      updateItemDelay(item.id, item.delay + 1);
                                    }}
                                    className={cn(
                                      "h-5 w-5 rounded p-0",
                                      isCurrentlyActive
                                        ? "bg-black/20 text-black hover:bg-black/30"
                                        : "bg-white/20 text-white hover:bg-white/30 hover:text-white"
                                    )}
                                    disabled={item.delay >= 300}
                                  >
                                    <Plus className="h-3 w-3" />
                                  </Button>
                                </div>
                              </div>
                            </Reorder.Item>

                            {/* Drop indicator after each item */}
                            <AnimatePresence>
                              {isDragging && !isBeingDragged && (
                                <motion.div
                                  initial={{ opacity: 0, width: 0 }}
                                  animate={{ opacity: 1, width: 4 }}
                                  exit={{ opacity: 0, width: 0 }}
                                  transition={{
                                    duration: 0.15,
                                  }}
                                  className="ml-1 h-16 border-l-2 border-dashed border-yellow-400/70 shadow-[0_0_10px_rgba(250,204,21,0.3)]"
                                />
                              )}
                            </AnimatePresence>
                          </div>
                        );
                      })}
                    </AnimatePresence>
                  </Reorder.Group>
                ) : (
                  <div className="flex flex-1 items-center justify-center">
                    <div className="text-center text-white/40">
                      <List className="mx-auto mb-2 h-8 w-8" />
                      <p className="text-sm">No scenes in queue</p>
                      <p className="mt-1 text-xs">
                        {isConnected ? "Click scenes above to add them" : "Connect to OBS to get started"}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </div>
    </div>
  );
}

export default function OBSScreenPage() {
  return (
    <AdminAuthWrapper>
      <OBSSceneLooper />
    </AdminAuthWrapper>
  );
}
