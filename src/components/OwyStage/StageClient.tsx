"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useRealtimeChannel } from "hooks/useRealtimeChannel";
import { client } from "lib/orpc";
import {
  DEFAULT_STAGE_STATE,
  INTERACTIVE_SCENES,
  OWY_STAGE_CHANNEL,
  parseSceneParams,
  type EffectEvent,
  type SceneId,
  type StageState,
} from "lib/owy-stage/scenes";

import { Effects, useEffectQueue } from "./effects";
import { SCENE_COMPONENTS } from "./scenes";
import { type StageCanvas } from "lib/owy-stage/canvas";

import { Stage, WIPE_MID_MS, Wipe, type StageBackground } from "./Stage";

/** The admin page posts this into a preview monitor; the monitor says it is ready to receive. */
export const MONITOR_SHOW = "owy-stage:show";
export const MONITOR_READY = "owy-stage:ready";

type Props = {
  bg: StageBackground;
  /** Pin one scene (direct OBS embed / admin thumbnail) instead of following the director. */
  fixed?: SceneId;
  /** Thumbnail mode: no realtime, no effects, lower frame rate. */
  preview?: boolean;
  /** Logical canvas (`?canvas=3584x960`, `ucu`, `fit`). Defaults to 1920×1080. */
  canvas?: StageCanvas | "fit";
  /**
   * The admin's monitors. `program` is the wall itself at a lower frame rate;
   * `preview` never follows the wall: it shows whatever the admin page posts
   * (a scene that is not on air yet), so it changes as the operator types.
   */
  monitor?: "program" | "preview";
};

export default function StageClient({ bg, fixed, preview = false, canvas, monitor }: Props) {
  const posted = monitor === "preview";
  const follows = !preview && !posted;
  const [shown, setShown] = useState<StageState | null>(null);
  const shownRef = useRef<StageState | null>(null);
  shownRef.current = shown;
  const [wipe, setWipe] = useState(0);
  const swapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [fx, pushFx] = useEffectQueue();

  const load = useCallback(() => {
    client.owyStage
      .getState()
      .catch(() => DEFAULT_STAGE_STATE)
      .then((state) => setShown(fixed ? { ...state, scene: fixed, params: {} } : state));
  }, [fixed]);

  useEffect(() => {
    if (!posted) load();
  }, [posted, load]);

  // A preview monitor renders what its (same-origin) parent posts, and asks for it on mount.
  useEffect(() => {
    if (!posted) return;
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data as { type?: string; state?: StageState | null } | null;
      if (data?.type === MONITOR_SHOW) setShown(data.state ?? null);
    };
    window.addEventListener("message", onMessage);
    window.parent.postMessage({ type: MONITOR_READY }, window.location.origin);

    return () => window.removeEventListener("message", onMessage);
  }, [posted]);

  // A scene change plays the band wipe and swaps the scene while the bands
  // cover the frame; params-only updates apply live.
  const goTo = useCallback((next: StageState) => {
    if (next.scene === shownRef.current?.scene) {
      setShown(next);
      return;
    }
    setWipe(Date.now());
    if (swapTimer.current) clearTimeout(swapTimer.current);
    swapTimer.current = setTimeout(() => setShown(next), WIPE_MID_MS);
  }, []);

  const { isConnected } = useRealtimeChannel(follows ? OWY_STAGE_CHANNEL : null, (event, payload) => {
    if (event === "scene" && !fixed) goTo(payload as StageState);
    if (event === "effect") pushFx(payload as EffectEvent);
  });

  // The WebSocket route recycles every few minutes; anything sent during the
  // gap is gone, so resync whenever the connection comes back.
  useEffect(() => {
    if (isConnected && follows) load();
  }, [isConnected, follows, load]);

  const Scene = shown
    ? (SCENE_COMPONENTS[shown.scene] as React.ComponentType<{
        params: unknown;
        eventId: string | null;
        round: string;
        takenAt: string;
      }>)
    : null;
  // Interactive scenes restart (timers, inputs) on every take; the rest keep
  // running through param edits. A preview monitor restarts on a new round too,
  // which is how the admin replays a scene that counts down.
  const restarts = posted || (INTERACTIVE_SCENES as readonly string[]).includes(shown?.scene ?? "");

  return (
    <Stage bg={bg} canvas={canvas} preview={preview} throttle={preview || Boolean(monitor)}>
      {Scene && shown && (
        <Scene
          key={restarts ? `${shown.scene}:${shown.round}` : shown.scene}
          eventId={shown.eventId}
          params={parseSceneParams(shown.scene, shown.params)}
          round={shown.round ?? ""}
          takenAt={shown.takenAt ?? ""}
        />
      )}
      {wipe > 0 && <Wipe key={wipe} onDone={() => setWipe(0)} />}
      <Effects fx={fx} />
    </Stage>
  );
}
