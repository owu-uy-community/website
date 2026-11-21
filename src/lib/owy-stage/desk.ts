import {
  DeskStepSchema,
  PresetSchema,
  SCENES,
  isSceneId,
  type Desk,
  type DeskStep,
  type Preset,
  type SceneId,
} from "./scenes";

/**
 * The desk's rules, shared by the server's TAKE and the admin's optimistic
 * updates. No React, no database: plain functions over a Desk.
 */

/** Short, sortable enough, unique enough for a list an operator builds by hand. */
export const stepId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/**
 * A stored desk, without steps or presets whose scene left the registry (like
 * the rundown) or anything malformed. A desk from before presets carries its
 * favorites over.
 */
export function readDesk(raw: unknown): Desk {
  const value = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const step = (item: unknown): DeskStep | null => DeskStepSchema.safeParse(item).data ?? null;
  const preset = (item: unknown): Preset | null => PresetSchema.safeParse(item).data ?? null;

  return {
    preview: step(value.preview),
    queue: Array.isArray(value.queue) ? value.queue.flatMap((item) => step(item) ?? []) : [],
    presets: Array.isArray(value.presets)
      ? value.presets.flatMap((item) => preset(item) ?? [])
      : fromFavorites(value.favorites),
  };
}

/**
 * Favorites were scenes only: each one becomes a preset with the scene's
 * defaults, in the same order, so keys 1–9 keep their scene. The id comes
 * from the scene, so every device reading the old desk agrees on it.
 */
export function fromFavorites(favorites: unknown): Preset[] {
  if (!Array.isArray(favorites)) return [];
  const scenes = favorites.filter((id): id is SceneId => typeof id === "string" && isSceneId(id));

  return [...new Set(scenes)].map((scene) => ({ id: `fav-${scene}`, name: "", scene, params: {} }));
}

/** A preset by its id, or by its number on the desk: 1-based, like keys 1–9 and a Stream Deck count. */
export function findPreset(presets: Preset[], ref: string): Preset | undefined {
  if (/^\d{1,2}$/.test(ref)) return presets[Number(ref) - 1];

  return presets.find((preset) => preset.id === ref);
}

/** Params as the scene reads them, defaults filled in: `{}` and the defaults spelled out are the same show. */
const content = (scene: SceneId, params: Record<string, unknown>) =>
  JSON.stringify(SCENES[scene].params.safeParse(params).data ?? params);

/** Whether a step (the preview, what is on air) shows exactly this preset. */
export function showsPreset(preset: Preset, step: { scene: SceneId; params: Record<string, unknown> } | null) {
  return step?.scene === preset.scene && content(step.scene, step.params) === content(preset.scene, preset.params);
}

/** A preset recalled into preview: a fresh step that remembers where it came from. */
export const presetStep = (preset: Preset, id: string): DeskStep => ({
  id,
  scene: preset.scene,
  params: preset.params,
  from: "pick",
  preset: preset.id,
});

/**
 * Stage a step in preview. What it replaces goes back to the front of the
 * queue when it came from there, so nothing queued is ever lost; a pick or a
 * swap is just dropped.
 */
export function cue(desk: Desk, step: DeskStep): Desk {
  const back = desk.preview?.from === "queue" ? [desk.preview] : [];

  return { ...desk, preview: step, queue: [...back, ...desk.queue] };
}

/** Pull a queued step into preview (same rule for whatever it replaces). */
export function cueQueued(desk: Desk, id: string): Desk {
  const step = desk.queue.find((item) => item.id === id);
  if (!step) return desk;

  return cue({ ...desk, queue: desk.queue.filter((item) => item.id !== id) }, { ...step, from: "queue" });
}

/**
 * After TAKE: the head of the queue moves into preview. With nothing queued,
 * the scene that just left the air comes back, so a second TAKE undoes.
 */
export function afterTake(desk: Desk, left: { scene: SceneId; params: Record<string, unknown> }, id: string): Desk {
  const [next, ...rest] = desk.queue;
  if (next) return { ...desk, preview: { ...next, from: "queue" }, queue: rest };

  return { ...desk, preview: { id, scene: left.scene, params: left.params, from: "swap" }, queue: [] };
}
