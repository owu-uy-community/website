/**
 * OBS Timer Service - Persists across component unmounts
 * Manages the queue playback timer and syncs state across devices
 * @module obsTimerService
 */

export interface QueueItem {
  sceneName: string;
  delay: number;
  id: string;
}

export interface TimerCallback {
  onTick: (timeRemaining: number) => void;
  onSceneChange: (index: number, sceneName: string) => void;
}

export interface TimerState {
  isPlaying: boolean;
  timeRemaining: number;
  currentItemIndex: number;
}

type SwitchSceneFunction = (sceneName: string) => void;
type UpdateStateFunction = (index: number) => void;

const TICK_INTERVAL_MS = 1000;

let intervalId: NodeJS.Timeout | null = null;
let timeRemaining = 0;
let currentItemIndex = 0;
let queueItems: QueueItem[] = [];
let isPlaying = false;
const callbacks = new Set<TimerCallback>();
let switchSceneFn: SwitchSceneFunction | null = null;
let updateStateFn: UpdateStateFunction | null = null;

/**
 * Safely notifies all subscribers of a timer tick
 * @param time - Current time remaining in seconds
 */
const notifyTick = (time: number): void => {
  callbacks.forEach((callback) => {
    try {
      callback.onTick(time);
    } catch (err) {
      console.error("Error in timer tick callback:", err);
    }
  });
};

/**
 * Safely notifies all subscribers of a scene change
 * @param index - Index of the new scene in the queue
 * @param sceneName - Name of the new scene
 */
const notifySceneChange = (index: number, sceneName: string): void => {
  callbacks.forEach((callback) => {
    try {
      callback.onSceneChange(index, sceneName);
    } catch (err) {
      console.error("Error in scene change callback:", err);
    }
  });
};

/**
 * Handles each timer tick, updating time remaining and advancing to next scene when needed
 */
const tick = (): void => {
  if (!isPlaying || queueItems.length === 0) return;

  timeRemaining--;

  if (timeRemaining <= 0) {
    // Move to next scene (loop back to start if at end)
    currentItemIndex = (currentItemIndex + 1) % queueItems.length;
    const nextItem = queueItems[currentItemIndex];

    if (nextItem) {
      timeRemaining = nextItem.delay;

      // Switch scene in OBS
      switchSceneFn?.(nextItem.sceneName);

      // Update state in database
      updateStateFn?.(currentItemIndex);

      // Notify subscribers
      notifySceneChange(currentItemIndex, nextItem.sceneName);
    }
  }

  notifyTick(timeRemaining);
};

/**
 * Clears the timer interval if it exists
 */
const clearTimerInterval = (): void => {
  if (intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
  }
};

/**
 * Subscribe to timer updates and scene changes
 * @param callback - Callback object with onTick and onSceneChange handlers
 * @returns Unsubscribe function to remove the callback
 */
export const subscribe = (callback: TimerCallback): (() => void) => {
  callbacks.add(callback);
  return () => {
    callbacks.delete(callback);
  };
};

/**
 * Set the function to call when switching OBS scenes
 * @param fn - Function that switches to the specified scene in OBS
 */
export const setSwitchSceneFunction = (fn: SwitchSceneFunction): void => {
  switchSceneFn = fn;
};

/**
 * Set the function to call when state needs to be persisted
 * @param fn - Function that updates the current item index in the database
 */
export const setUpdateStateFunction = (fn: UpdateStateFunction): void => {
  updateStateFn = fn;
};

/**
 * Update the queue items and current position
 * @param items - Array of queue items to play through
 * @param currentIndex - Index of the current item in the queue
 */
export const updateQueue = (items: QueueItem[], currentIndex: number): void => {
  queueItems = items;
  currentItemIndex = currentIndex;
};

/**
 * Start playback of the queue
 * Switches to the current scene immediately and begins the timer
 * Does nothing if already playing or if queue is empty
 */
export const start = (): void => {
  if (isPlaying || queueItems.length === 0) return;

  isPlaying = true;
  const currentItem = queueItems[currentItemIndex];

  if (!currentItem) return;

  timeRemaining = currentItem.delay;

  // Switch to current scene immediately
  switchSceneFn?.(currentItem.sceneName);

  // Notify subscribers of initial state
  notifyTick(timeRemaining);

  // Start the interval timer
  intervalId = setInterval(tick, TICK_INTERVAL_MS);
};

/**
 * Pause playback without resetting position
 * Can be resumed with start()
 */
export const pause = (): void => {
  isPlaying = false;
  clearTimerInterval();
};

/**
 * Stop playback and reset to the beginning
 * Clears the timer and resets the index and time to zero
 */
export const stop = (): void => {
  pause();
  currentItemIndex = 0;
  timeRemaining = 0;
  notifyTick(0);
};

/**
 * Get the current state of the timer
 * @returns Current timer state including playing status, time remaining, and current index
 */
export const getState = (): TimerState => {
  return {
    isPlaying,
    timeRemaining,
    currentItemIndex,
  };
};

/**
 * Synchronize state from an external source (e.g., Supabase Realtime)
 * Handles play/pause state changes and scene index updates from other devices
 * @param playing - Whether playback should be active
 * @param currentIndex - The current item index to sync to
 */
export const syncState = (playing: boolean, currentIndex: number): void => {
  const wasPlaying = isPlaying;
  const indexChanged = currentItemIndex !== currentIndex;

  currentItemIndex = currentIndex;

  // Handle playback state changes
  if (playing && !wasPlaying) {
    start();
  } else if (!playing && wasPlaying) {
    pause();
  } else if (playing && indexChanged) {
    // Playing but index changed from another device
    const currentItem = queueItems[currentIndex];
    if (currentItem) {
      timeRemaining = currentItem.delay;
      switchSceneFn?.(currentItem.sceneName);
      notifyTick(timeRemaining);
    }
  }
};
