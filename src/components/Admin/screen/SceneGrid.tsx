"use client";

import { Badge } from "components/shared/ui/badge";
import { Card, CardContent } from "components/shared/ui/card";
import { Monitor } from "lucide-react";
import { cn, calculateProgressRing } from "app/lib/utils";
import { motion, AnimatePresence } from "motion/react";

import type { OBSScene, QueueItem, ScenePreviews } from "./types";

interface SceneGridProps {
  scenes: OBSScene[];
  scenePreviews: ScenePreviews;
  queueItems: QueueItem[];
  currentItemIndex: number;
  isPlaying: boolean;
  directMode: boolean;
  editingPresetId: string | null;
  timeRemaining: number;
  isSceneActive: (sceneName: string) => boolean;
  handleSceneClick: (sceneName: string) => void;
}

export function SceneGrid({
  scenes,
  scenePreviews,
  queueItems,
  currentItemIndex,
  isPlaying,
  directMode,
  editingPresetId,
  timeRemaining,
  isSceneActive,
  handleSceneClick,
}: SceneGridProps) {
  return (
    <motion.div className="mb-3 grid shrink-0 grid-cols-4 gap-3 md:grid-cols-6 lg:grid-cols-8">
      {[...scenes]
        .sort((a, b) => a.sceneName.localeCompare(b.sceneName))
        .map((scene, index) => {
          const isInQueue = queueItems.some((item) => item.sceneName === scene.sceneName);
          const isActive = isSceneActive(scene.sceneName);
          const queuePosition = queueItems.findIndex((item) => item.sceneName === scene.sceneName);

          return (
            <motion.div key={scene.sceneName} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.9 }}>
              <Card
                className={cn(
                  "relative aspect-square cursor-pointer border-0 transition-all duration-200",
                  isActive
                    ? "bg-white text-black shadow-lg"
                    : editingPresetId && isInQueue
                      ? "bg-white/30 text-white ring-2 ring-white"
                      : isInQueue && !directMode
                        ? "bg-white/20 text-white"
                        : "bg-card text-white hover:bg-white/10 hover:text-white"
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
                      <motion.div className="absolute -right-1 -top-1">
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
                      <motion.div className="absolute -left-1 -top-1 h-4 w-4 animate-pulse rounded-full bg-red-500 shadow-lg shadow-red-500/50" />
                    )}
                  </AnimatePresence>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
    </motion.div>
  );
}
