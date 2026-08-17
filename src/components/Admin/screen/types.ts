export interface QueueItem {
  sceneName: string;
  delay: number;
  id: string;
}

export interface PresetQueue {
  id: string;
  name: string;
  items: QueueItem[];
}

export interface OBSScene {
  sceneName: string;
  sceneIndex: number;
}

export type ScenePreviews = Record<string, string>;

export type SetQueueItems = (items: QueueItem[] | ((prev: QueueItem[]) => QueueItem[])) => void;
