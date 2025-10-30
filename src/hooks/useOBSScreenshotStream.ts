import { useState, useEffect, useRef, useCallback } from "react";
import OBSWebSocket from "obs-websocket-js";

interface UseOBSScreenshotStreamProps {
  isConnected: boolean;
  obsAddress: string;
  obsPort: number;
  obsPassword: string;
  fps?: number;
  quality?: number;
  enabled: boolean;
  currentScene?: string | null;
}

export function useOBSScreenshotStream({
  isConnected,
  obsAddress,
  obsPort,
  obsPassword,
  fps = 15,
  quality = 85,
  enabled,
  currentScene,
}: UseOBSScreenshotStreamProps) {
  const [currentFrame, setCurrentFrame] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const obsRef = useRef<OBSWebSocket | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const frameCountRef = useRef(0);
  const lastFpsCheckRef = useRef(Date.now());
  const [actualFps, setActualFps] = useState(0);

  // Cap FPS at 15 maximum to avoid overwhelming OBS
  const cappedFps = Math.min(Math.max(1, fps), 15);

  // Use refs for values that change frequently to avoid recreating callbacks
  const currentSceneRef = useRef(currentScene);
  const qualityRef = useRef(quality);

  // Update refs when values change
  useEffect(() => {
    currentSceneRef.current = currentScene;
  }, [currentScene]);

  useEffect(() => {
    qualityRef.current = quality;
  }, [quality]);

  // Initialize OBS connection for screenshots
  useEffect(() => {
    if (!enabled) return;

    const obs = new OBSWebSocket();
    obsRef.current = obs;

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      obsRef.current = null;
    };
  }, [enabled]);

  // Capture screenshot from OBS
  const captureFrame = useCallback(async () => {
    if (!obsRef.current || !isConnected || !currentSceneRef.current) return;

    try {
      const { imageData } = await obsRef.current.call("GetSourceScreenshot", {
        sourceName: currentSceneRef.current,
        imageFormat: "jpg",
        imageWidth: 1920,
        imageHeight: 1080,
        imageCompressionQuality: qualityRef.current,
      });

      setCurrentFrame(imageData);
      setError(null);

      // Calculate actual FPS
      frameCountRef.current++;
      const now = Date.now();
      if (now - lastFpsCheckRef.current >= 1000) {
        setActualFps(frameCountRef.current);
        frameCountRef.current = 0;
        lastFpsCheckRef.current = now;
      }
    } catch (err) {
      console.error("Error capturing screenshot:", err);
      setError(err instanceof Error ? err.message : "Failed to capture screenshot");
    }
  }, [isConnected]);

  // Start streaming
  const startStreaming = useCallback(() => {
    if (isStreaming || !enabled || !isConnected || !currentSceneRef.current) return;

    setIsStreaming(true);
    setError(null);
    frameCountRef.current = 0;
    lastFpsCheckRef.current = Date.now();

    const interval = Math.floor(1000 / cappedFps);
    intervalRef.current = setInterval(captureFrame, interval);

    console.log(`📹 Started OBS screenshot stream at ${cappedFps} FPS (capped at 15 max)`);
  }, [isStreaming, enabled, isConnected, cappedFps, captureFrame]);

  // Stop streaming
  const stopStreaming = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (isStreaming) {
      setIsStreaming(false);
      setActualFps(0);
      frameCountRef.current = 0;
      console.log("⏹️ Stopped OBS screenshot stream");
    }
  }, [isStreaming]);

  // Auto-start/stop based on enabled and connected state
  useEffect(() => {
    if (enabled && isConnected && currentSceneRef.current && !isStreaming) {
      startStreaming();
    } else if ((!enabled || !isConnected) && isStreaming) {
      stopStreaming();
    }
  }, [enabled, isConnected, isStreaming, startStreaming, stopStreaming]);

  // Immediately stop when disabled to prevent unnecessary API calls
  useEffect(() => {
    if (!enabled) {
      stopStreaming();
    }
  }, [enabled, stopStreaming]);

  // Connect to OBS WebSocket (reuse existing connection)
  useEffect(() => {
    if (!enabled || !obsRef.current) return;

    const connectOBS = async () => {
      try {
        await obsRef.current!.connect(`ws://${obsAddress}:${obsPort}`, obsPassword);
        console.log("✅ OBS screenshot stream connected");
      } catch (err) {
        // Connection might already exist from main hook, that's ok
        console.log("ℹ️ Using existing OBS connection for screenshots");
      }
    };

    if (isConnected) {
      connectOBS();
    }
  }, [enabled, isConnected, obsAddress, obsPort, obsPassword]);

  // Cleanup on unmount - ensure stream is stopped and interval is cleared
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, []);

  return {
    currentFrame,
    isStreaming,
    actualFps,
    error,
    startStreaming,
    stopStreaming,
  };
}
