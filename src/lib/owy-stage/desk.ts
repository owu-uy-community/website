import { DeskStepSchema, isSceneId, type Desk, type DeskStep, type SceneId } from "./scenes";

/**
 * The desk's rules, shared by the server's TAKE and the admin's optimistic
 * updates. No React, no database: plain functions over a Desk.
 */

/** Short, sortable enough, unique enough for a list an operator builds by hand. */
export const stepId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/** A stored desk, without steps whose scene left the registry (like the rundown) or anything malformed. */
export function readDesk(raw: unknown): Desk {
  const value = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const step = (item: unknown): DeskStep | null => DeskStepSchema.safeParse(item).data ?? null;

  return {
    preview: step(value.preview),
    queue: Array.isArray(value.queue) ? value.queue.flatMap((item) => step(item) ?? []) : [],
    favorites: Array.isArray(value.favorites)
      ? value.favorites.filter((id): id is SceneId => typeof id === "string" && isSceneId(id))
      : [],
  };
}

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
