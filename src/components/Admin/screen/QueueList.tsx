"use client";

import { Badge } from "components/shared/ui/badge";
import { Button } from "components/shared/ui/button";
import { Input } from "components/shared/ui/input";
import { Monitor, Plus, Minus, X, List, Clock, XCircle, Check } from "lucide-react";
import { cn, calculateProgressRing } from "app/lib/utils";
import { motion, AnimatePresence, Reorder } from "motion/react";

import type { QueueItem, ScenePreviews, SetQueueItems } from "./types";

interface QueueListProps {
  queueItems: QueueItem[];
  scenePreviews: ScenePreviews;
  isPlaying: boolean;
  isConnected: boolean;
  timeRemaining: number;
  editingPresetId: string | null;
  editingPresetName: string;
  editingDelay: string | null;
  isDragging: boolean;
  draggedItemId: string | null;
  // The drift check is a raw `&&` chain, so its falsy value can be `false`, `""` or `undefined`.
  hasSceneDrift: boolean | "" | undefined;
  setQueueItemsDB: SetQueueItems;
  setEditingPresetName: (name: string) => void;
  setEditingDelay: (itemId: string | null) => void;
  saveEditedPreset: () => void;
  cancelEditingPreset: () => void;
  isQueueItemActive: (item: QueueItem) => boolean;
  handleDragStart: (itemId: string) => void;
  handleDragEnd: () => void;
  removeFromQueue: (itemId: string) => void;
  updateItemDelay: (itemId: string, newDelay: number) => void;
}

export function QueueList({
  queueItems,
  scenePreviews,
  isPlaying,
  isConnected,
  timeRemaining,
  editingPresetId,
  editingPresetName,
  editingDelay,
  isDragging,
  draggedItemId,
  hasSceneDrift,
  setQueueItemsDB,
  setEditingPresetName,
  setEditingDelay,
  saveEditedPreset,
  cancelEditingPreset,
  isQueueItemActive,
  handleDragStart,
  handleDragEnd,
  removeFromQueue,
  updateItemDelay,
}: QueueListProps) {
  return (
    <motion.div className="flex min-h-0 flex-1 flex-col rounded-xl border border-border bg-card p-3 backdrop-blur-sm">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {editingPresetId ? (
            <>
              <h3 className="text-sm font-medium text-white">Editing Preset</h3>
              <Input
                value={editingPresetName}
                onChange={(e) => setEditingPresetName(e.target.value)}
                placeholder="Nombre del preset..."
                className="h-7 w-40 rounded border-0 bg-white/10 text-xs text-white"
                onKeyDown={(e) => e.key === "Enter" && saveEditedPreset()}
              />
            </>
          ) : (
            <>
              <h3 className="text-sm font-medium text-white">Secuencia</h3>
              <AnimatePresence>
                {hasSceneDrift && (
                  <motion.div className="flex items-center gap-1.5 rounded-full bg-red-500/20 px-2 py-1 text-xs font-medium text-red-400">
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
            <div className="text-sm text-white/60">{queueItems.length} escenas</div>
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
                        <motion.div className="mr-1 h-16 border-l-2 border-dashed border-primary/70 shadow-[0_0_10px_rgba(250,204,21,0.3)]" />
                      )}
                    </AnimatePresence>

                    <Reorder.Item
                      value={item}
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
                                  strokeDashoffset={calculateProgressRing(item.delay - timeRemaining, item.delay, 14)}
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
                                  strokeDashoffset={calculateProgressRing(item.delay - timeRemaining, item.delay, 14)}
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
                              : "bg-destructive/15 text-destructive"
                          )}
                          title="Remove from queue"
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1">
                          <Clock
                            className={cn("h-3 w-3 flex-shrink-0", isCurrentlyActive ? "text-black" : "text-white")}
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
                        <motion.div className="ml-1 h-16 border-l-2 border-dashed border-primary/70 shadow-[0_0_10px_rgba(250,204,21,0.3)]" />
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
              <p className="text-sm">Sin escenas en la cola</p>
              <p className="mt-1 text-xs">
                {isConnected ? "Click scenes above to add them" : "Conectate a OBS para empezar"}
              </p>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}
