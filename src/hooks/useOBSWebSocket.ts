"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import OBSWebSocket from "obs-websocket-js";

interface OBSScene {
  sceneName: string;
  sceneIndex: number;
}

interface OBSConnectionConfig {
  address: string;
  port: number;
  password?: string;
}

const STORAGE_KEY = "obs-scene-previews";

export function useOBSWebSocket(config?: OBSConnectionConfig) {
  const [isConnected, setIsConnected] = useState(() => {
    // Check if we have a stored connection state
    if (typeof window !== "undefined") {
      return sessionStorage.getItem("obs-connected") === "true";
    }
    return false;
  });
  const [scenes, setScenes] = useState<OBSScene[]>([]);
  const [currentScene, setCurrentScene] = useState<string>("");
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scenePreviews, setScenePreviews] = useState<Record<string, string>>(() => {
    // Load from localStorage on initial mount
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        return stored ? JSON.parse(stored) : {};
      } catch (err) {
        console.error("Error loading scene previews from localStorage:", err);
        return {};
      }
    }
    return {};
  });
  const obsRef = useRef<OBSWebSocket | null>(null);

  const defaultConfig = {
    address: config?.address || "localhost",
    port: config?.port || 4455,
    password: config?.password || "",
  };

  const connect = useCallback(
    async (customConfig?: OBSConnectionConfig) => {
      const connectionConfig = customConfig || defaultConfig;
      setIsConnecting(true);
      setError(null);

      try {
        if (!obsRef.current) {
          obsRef.current = new OBSWebSocket();
        }

        await obsRef.current.connect(
          `ws://${connectionConfig.address}:${connectionConfig.port}`,
          connectionConfig.password
        );

        setIsConnected(true);
        setIsConnecting(false);

        // Store connection state in sessionStorage
        if (typeof window !== "undefined") {
          sessionStorage.setItem("obs-connected", "true");
        }

        // Get initial scene list
        const sceneList = await obsRef.current.call("GetSceneList");
        setScenes(sceneList.scenes as unknown as OBSScene[]);
        setCurrentScene((sceneList.currentProgramSceneName as string) || "");

        // Set up event listeners
        obsRef.current.on("CurrentProgramSceneChanged", (data) => {
          setCurrentScene(data.sceneName);
        });

        obsRef.current.on("SceneListChanged", async () => {
          if (obsRef.current) {
            const updatedSceneList = await obsRef.current.call("GetSceneList");
            setScenes(updatedSceneList.scenes as unknown as OBSScene[]);
          }
        });
      } catch (err) {
        setIsConnected(false);
        setIsConnecting(false);
        setError(err instanceof Error ? err.message : "Failed to connect to OBS");
        console.error("OBS connection error:", err);

        // Clear connection state on error
        if (typeof window !== "undefined") {
          sessionStorage.removeItem("obs-connected");
        }
      }
    },
    [defaultConfig.address, defaultConfig.port, defaultConfig.password]
  );

  const disconnect = useCallback(async () => {
    if (obsRef.current) {
      try {
        await obsRef.current.disconnect();
      } catch (err) {
        console.error("Error disconnecting from OBS:", err);
      }
      obsRef.current = null;
      setIsConnected(false);
      setScenes([]);
      setCurrentScene("");

      // Clear connection state from sessionStorage
      if (typeof window !== "undefined") {
        sessionStorage.removeItem("obs-connected");
      }
    }
  }, []);

  const switchScene = useCallback(
    async (sceneName: string) => {
      if (!obsRef.current || !isConnected) {
        setError("Not connected to OBS");
        return false;
      }

      try {
        await obsRef.current.call("SetCurrentProgramScene", {
          sceneName,
        });
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to switch scene");
        console.error("Error switching scene:", err);
        return false;
      }
    },
    [isConnected]
  );

  const refreshScenes = useCallback(async () => {
    if (!obsRef.current || !isConnected) {
      return;
    }

    try {
      const sceneList = await obsRef.current.call("GetSceneList");
      setScenes(sceneList.scenes as unknown as OBSScene[]);
      setCurrentScene((sceneList.currentProgramSceneName as string) || "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to refresh scenes");
      console.error("Error refreshing scenes:", err);
    }
  }, [isConnected]);

  const getSceneScreenshot = useCallback(
    async (sceneName: string, width = 320, height = 180, delayMs = 0) => {
      if (!obsRef.current || !isConnected) {
        return null;
      }

      try {
        // Add delay before capturing screenshot to allow scene to render
        if (delayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }

        const response = await obsRef.current.call("GetSourceScreenshot", {
          sourceName: sceneName,
          imageFormat: "png",
          imageWidth: width,
          imageHeight: height,
        });
        return response.imageData as string;
      } catch (err) {
        console.error(`Error getting screenshot for scene ${sceneName}:`, err);
        return null;
      }
    },
    [isConnected]
  );

  const refreshScenePreviews = useCallback(
    async (delayMs = 1000) => {
      if (!obsRef.current || !isConnected || scenes.length === 0) {
        return;
      }

      const previews: Record<string, string> = {};
      const originalScene = currentScene;

      // Get screenshots for all scenes with delay to allow rendering
      for (const scene of scenes) {
        try {
          // Switch to the scene first
          await obsRef.current.call("SetCurrentProgramScene", {
            sceneName: scene.sceneName,
          });

          // Wait for the scene to render
          if (delayMs > 0) {
            await new Promise((resolve) => setTimeout(resolve, delayMs));
          }

          // Now take the screenshot
          const screenshot = await getSceneScreenshot(scene.sceneName, 320, 180, 0);
          if (screenshot) {
            previews[scene.sceneName] = screenshot;
          }
        } catch (err) {
          console.error(`Error capturing preview for scene ${scene.sceneName}:`, err);
        }
      }

      // Switch back to the original scene
      if (originalScene) {
        try {
          await obsRef.current.call("SetCurrentProgramScene", {
            sceneName: originalScene,
          });
        } catch (err) {
          console.error("Error switching back to original scene:", err);
        }
      }

      // Save to localStorage
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(previews));
        } catch (err) {
          console.error("Error saving scene previews to localStorage:", err);
        }
      }

      setScenePreviews(previews);
    },
    [isConnected, scenes, currentScene, getSceneScreenshot]
  );

  // Maintain connection across component lifecycle
  useEffect(() => {
    // If we have a stored connection state but no active connection, try to reconnect
    if (typeof window !== "undefined") {
      const wasConnected = sessionStorage.getItem("obs-connected") === "true";
      if (wasConnected && !obsRef.current && !isConnecting) {
        // Reconnect with default config
        connect({
          address: defaultConfig.address,
          port: defaultConfig.port,
          password: defaultConfig.password,
        });
      }
    }
  }, [isConnecting, defaultConfig.address, defaultConfig.port, defaultConfig.password, connect]);

  // Cleanup on unmount - but don't disconnect, keep connection alive
  useEffect(() => {
    return () => {
      // Only disconnect if explicitly requested, not on unmount
      // This keeps the connection alive across navigations
    };
  }, []);

  const clearScenePreviews = useCallback(() => {
    if (typeof window !== "undefined") {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch (err) {
        console.error("Error clearing scene previews from localStorage:", err);
      }
    }
    setScenePreviews({});
  }, []);

  return {
    isConnected,
    isConnecting,
    scenes,
    currentScene,
    error,
    scenePreviews,
    connect,
    disconnect,
    switchScene,
    refreshScenes,
    getSceneScreenshot,
    refreshScenePreviews,
    clearScenePreviews,
  };
}
