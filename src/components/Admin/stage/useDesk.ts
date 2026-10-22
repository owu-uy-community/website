"use client";

import { useEffect, useMemo, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { toast } from "components/shared/ui/toast-utils";
import { useRealtimeChannel } from "hooks/useRealtimeChannel";
import { orpc } from "lib/orpc";
import { afterTake, cue, cueQueued, readDesk, stepId } from "lib/owy-stage/desk";
import {
  EMPTY_DESK,
  OWY_DESK_CHANNEL,
  isSceneId,
  type Desk,
  type DeskStep,
  type SceneId,
  type StageState,
  type StageTransition,
} from "lib/owy-stage/scenes";

/** Preview param edits reach the other devices after a pause in typing, not per keystroke. */
const EDIT_SAVE_MS = 400;
/** Where favorites lived before they moved to the server (one device's list seeds the shared one). */
const LEGACY_FAVORITES = "owy-stage-favorites";

type Params = Record<string, unknown>;

/**
 * The desk every admin device shares: the scene in preview, the queue behind
 * it and the favorites. Edits apply locally at once and save in the
 * background; TAKE goes through the server so the queue moves up in the same
 * transaction that puts the preview on air.
 */
export function useDesk(live: StageState, onAir: (state: StageState) => void) {
  const queryClient = useQueryClient();
  const { data, refetch } = useQuery(orpc.owyStage.getDesk.queryOptions({ staleTime: 60_000 }));
  const desk = data ?? EMPTY_DESK;

  const deskRef = useRef(desk);
  deskRef.current = desk;
  /** Until the shared desk arrives, the empty fallback must never be saved over it. */
  const loaded = useRef(false);
  loaded.current = data !== undefined;
  const liveRef = useRef(live);
  liveRef.current = live;
  const onAirRef = useRef(onAir);
  onAirRef.current = onAir;

  /** Saves in flight and a pending typed edit: meanwhile, echoes of our own older saves are stale. */
  const inflight = useRef(0);
  const editTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSave = useRef<Promise<unknown>>(Promise.resolve());
  const taking = useRef(false);

  const save = useMutation(
    orpc.owyStage.saveDesk.mutationOptions({
      // The last save in flight is the desk as this device left it: settle on it, in case a read
      // that was already on its way (the first load, a reconnect) landed on top of the local edit.
      onSuccess: (saved) => {
        if (inflight.current === 1 && !editTimer.current)
          queryClient.setQueryData(orpc.owyStage.getDesk.queryKey(), saved);
      },
      onError: (error) => {
        toast.error("No se pudo guardar la cola", error.message);
        void refetch();
      },
    })
  );
  const takeMutation = useMutation(orpc.owyStage.take.mutationOptions());
  const saveRef = useRef(save.mutateAsync);
  saveRef.current = save.mutateAsync;
  const takeRef = useRef(takeMutation.mutateAsync);
  takeRef.current = takeMutation.mutateAsync;

  // Another admin device changed the desk (or the server answered a TAKE).
  const { isConnected } = useRealtimeChannel(OWY_DESK_CHANNEL, (event, payload) => {
    if (event !== "desk" || inflight.current > 0 || editTimer.current) return;
    queryClient.setQueryData(orpc.owyStage.getDesk.queryKey(), readDesk(payload));
  });
  // The WebSocket recycles every few minutes and drops what was sent meanwhile.
  // A refetch while an edit is still saving would bring back the desk from before it.
  useEffect(() => {
    if (isConnected && inflight.current === 0 && !editTimer.current) void refetch();
  }, [isConnected, refetch]);

  const actions = useMemo(() => {
    const key = orpc.owyStage.getDesk.queryKey();
    const current = () => deskRef.current;
    /**
     * One save at a time, in order. Each one writes the whole desk, and two sent together (one
     * batch) ran concurrently on the server: an older desk could commit last and drop a queued step.
     * Counted from here, not from the request, so an echo between two chained saves is still stale.
     */
    const send = (next: Desk) => {
      inflight.current += 1;
      lastSave.current = lastSave.current
        .then(() => saveRef.current({ desk: next }))
        .catch(() => undefined)
        .finally(() => {
          inflight.current -= 1;
        });
    };
    /** Local at once; saved now, or after a pause when it's typing. */
    /** A local change wins over any read still on its way (TanStack's optimistic-update rule). */
    const local = (next: Desk) => {
      void queryClient.cancelQueries({ queryKey: key, exact: true });
      queryClient.setQueryData(key, next);
    };
    const write = (next: Desk, typing = false) => {
      if (!loaded.current) {
        toast.error("La cola todavía está cargando", "Probá de nuevo en un segundo.");
        return;
      }
      local(next);
      deskRef.current = next;
      if (editTimer.current) clearTimeout(editTimer.current);
      editTimer.current = null;
      if (!typing) return send(next);
      editTimer.current = setTimeout(() => {
        editTimer.current = null;
        send(deskRef.current);
      }, EDIT_SAVE_MS);
    };
    const queued = (scene: SceneId, params: Params = {}): DeskStep => ({ id: stepId(), scene, params, from: "queue" });

    return {
      /** A scene from the library, the palette or a favorite key: into preview, with its defaults. */
      pick: (scene: SceneId, params: Params = {}) =>
        write(cue(current(), { id: stepId(), scene, params, from: "pick" })),
      /** What is on air, copied into preview to prepare a variant off air. */
      copyLive: () => {
        const { scene, params } = liveRef.current;
        write(cue(current(), { id: stepId(), scene, params, from: "pick" }));
      },
      cueQueued: (id: string) => write(cueQueued(current(), id)),
      editPreview: (params: Params) => {
        const { preview } = current();
        if (preview) write({ ...current(), preview: { ...preview, params } }, true);
      },
      /** Out of preview; a step that came from the queue goes back to its front. */
      clearPreview: () => {
        const { preview, queue } = current();
        write({ ...current(), preview: null, queue: preview?.from === "queue" ? [preview, ...queue] : queue });
      },
      enqueue: (scene: SceneId, params: Params = {}) =>
        write({ ...current(), queue: [...current().queue, queued(scene, params)] }),
      enqueuePreview: () => {
        const { preview, queue } = current();
        if (preview) write({ ...current(), queue: [...queue, queued(preview.scene, preview.params)] });
      },
      remove: (id: string) => write({ ...current(), queue: current().queue.filter((step) => step.id !== id) }),
      /** Undo for a removal: the step goes back where it was. */
      restore: (step: DeskStep, index: number) => {
        const { queue } = current();
        if (queue.some((item) => item.id === step.id)) return;
        write({ ...current(), queue: [...queue.slice(0, index), step, ...queue.slice(index)] });
      },
      duplicate: (id: string) => {
        const { queue } = current();
        const at = queue.findIndex((step) => step.id === id);
        if (at >= 0)
          write({
            ...current(),
            queue: [...queue.slice(0, at + 1), { ...queue[at], id: stepId() }, ...queue.slice(at + 1)],
          });
      },
      moveToTop: (id: string) => {
        const { queue } = current();
        const step = queue.find((item) => item.id === id);
        if (step) write({ ...current(), queue: [step, ...queue.filter((item) => item.id !== id)] });
      },
      /** While dragging: local only. `persistOrder` saves what the drag left behind. */
      reorder: (queue: DeskStep[]) => {
        deskRef.current = { ...current(), queue };
        local(deskRef.current);
      },
      persistOrder: () => write(current()),
      clearQueue: () => write({ ...current(), queue: [] }),
      toggleFavorite: (scene: SceneId) => {
        const { favorites } = current();
        write({
          ...current(),
          favorites: favorites.includes(scene) ? favorites.filter((id) => id !== scene) : [...favorites, scene],
        });
      },
      /**
       * TAKE (or CUT). The step travels with the request (what goes out is
       * what the operator sees); a queue edit still saving lands first, or it
       * would bring the taken step back.
       */
      /** Whether a TAKE would go out now: something in preview, and no TAKE on its way. */
      canTake: () => Boolean(current().preview) && !taking.current,
      take: async (transition: StageTransition = "wipe") => {
        const step = current().preview;
        // A double press must not send the next queued scene too.
        if (!step || taking.current) return;
        taking.current = true;
        if (editTimer.current) clearTimeout(editTimer.current);
        editTimer.current = null;
        try {
          await lastSave.current;
          const before = liveRef.current;
          local(afterTake(current(), { scene: before.scene, params: before.params }, stepId()));
          const result = await takeRef.current({ step, transition });
          queryClient.setQueryData(key, result.desk);
          onAirRef.current(result.state);
        } catch (error) {
          toast.error("No se pudo hacer TAKE", error instanceof Error ? error.message : undefined);
          void refetch();
        } finally {
          taking.current = false;
        }
      },
    };
  }, [queryClient, refetch]);

  // Favorites used to be per browser: the first device that loads the shared desk seeds it, once.
  const seeded = useRef(false);
  useEffect(() => {
    if (!data || seeded.current) return;
    seeded.current = true;
    try {
      const stored = JSON.parse(window.localStorage.getItem(LEGACY_FAVORITES) ?? "[]") as unknown;
      window.localStorage.removeItem(LEGACY_FAVORITES);
      const legacy = Array.isArray(stored)
        ? stored.filter((id): id is SceneId => typeof id === "string" && isSceneId(id))
        : [];
      if (legacy.length && !data.favorites.length) {
        queryClient.setQueryData(orpc.owyStage.getDesk.queryKey(), { ...data, favorites: legacy });
        void saveRef.current({ desk: { ...data, favorites: legacy } }).catch(() => undefined);
      }
    } catch {
      // Corrupt or missing: nothing to carry over.
    }
  }, [data, queryClient]);

  return { desk, loading: !data, taking: takeMutation.isPending, actions };
}

export type DeskActions = ReturnType<typeof useDesk>["actions"];
