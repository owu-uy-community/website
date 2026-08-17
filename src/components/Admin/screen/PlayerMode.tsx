"use client";

import { Monitor, RefreshCw } from "lucide-react";
import { cn } from "app/lib/utils";
import { motion } from "motion/react";

import type { OBSScene, ScenePreviews } from "./types";

interface PlayerModeProps {
  currentFrame: string | null;
  isScreenshotStreaming: boolean;
  actualFps: number;
  streamError: string | null;
  isConnected: boolean;
  currentActiveSceneId: string;
  scenes: OBSScene[];
  scenePreviews: ScenePreviews;
  isSceneActive: (sceneName: string) => boolean;
  switchScene: (sceneName: string) => void;
}

export function PlayerMode({
  currentFrame,
  isScreenshotStreaming,
  actualFps,
  streamError,
  isConnected,
  currentActiveSceneId,
  scenes,
  scenePreviews,
  isSceneActive,
  switchScene,
}: PlayerModeProps) {
  return (
    <motion.div className="flex flex-1 flex-col gap-3 overflow-hidden">
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
      <motion.div className="flex-shrink-0 rounded-xl border border-border bg-card p-3 backdrop-blur-sm">
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
                      : "bg-secondary text-secondary-foreground hover:bg-secondary/80",
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
  );
}
