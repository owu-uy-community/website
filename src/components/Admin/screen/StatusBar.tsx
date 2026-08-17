"use client";

import { motion, AnimatePresence } from "motion/react";

import type { QueueItem } from "./types";

interface StatusBarProps {
  isPlaying: boolean;
  currentActiveSceneId: string;
  timeRemaining: number;
  queueItems: QueueItem[];
}

export function StatusBar({ isPlaying, currentActiveSceneId, timeRemaining, queueItems }: StatusBarProps) {
  return (
    <AnimatePresence>
      {(isPlaying || currentActiveSceneId || queueItems.length > 0) && (
        <motion.div className="mb-3 flex items-center justify-between rounded-xl border border-border bg-card p-3 text-sm backdrop-blur-sm">
          <div className="flex items-center gap-6">
            {isPlaying && (
              <motion.div className="flex items-center gap-2">
                <div className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
                <span className="font-medium text-white">{timeRemaining}s</span>
                <span className="text-white/60">until next</span>
              </motion.div>
            )}

            {currentActiveSceneId && (
              <motion.div className="flex items-center gap-2">
                <div className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
                <span className="font-medium text-white">{currentActiveSceneId}</span>
                <span className="text-white/60">active</span>
              </motion.div>
            )}
          </div>

          <motion.div className="flex items-center gap-2">
            <span className="font-medium text-white">{queueItems.length}</span>
            <span className="text-white/60">scenes queued</span>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
