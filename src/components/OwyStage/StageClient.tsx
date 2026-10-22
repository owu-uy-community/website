"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { ScreenBeacon } from "components/Admin/screens/ScreenBeacon";
import { useRealtimeChannel } from "hooks/useRealtimeChannel";
import { client } from "lib/orpc";
import {
  DEFAULT_STAGE_STATE,
  INTERACTIVE_SCENES,
  MONITOR_PREFETCH,
  MONITOR_READY,
  MONITOR_SHOW,
  OWY_STAGE_CHANNEL,
  isSceneId,
  parseSceneParams,
  type EffectEvent,
  type SceneId,
  type StageState,
} from "lib/owy-stage/scenes";

import { Effects, useEffectQueue } from "./effects";
import { loadScene, preloadScenes, sceneComponent } from "./scenes";
import { type StageCanvas } from "lib/owy-stage/canvas";

import { Stage, WIPE_MID_MS, Wipe, type StageBackground } from "./Stage";

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

/** Offline, or a deploy swapped the files: the frame keeps what it shows and the next state tries again. */
const logFailure = (error: unknown) => console.error("[stage] scene code did not load", error);

export default function StageClient({ bg, fixed, preview = false, canvas, monitor }: Props) {
  const posted = monitor === "preview";
  const follows = !preview && !posted;
  const wall = follows && !monitor && !fixed;
  const [shown, setShown] = useState<StageState | null>(null);
  const shownRef = useRef<StageState | null>(null);
  shownRef.current = shown;
  const [wipe, setWipe] = useState(0);
  const swapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Bumped by every new state: one that waited for its scene's code never lands over a newer one. */
  const latest = useRef(0);
  const [fx, pushFx] = useEffectQueue();

  /**
   * Puts `next` up as soon as its scene's code is here (at once when it already
   * is). Until then the frame keeps what it shows, so no state ever paints blank.
   */
  const show = useCallback((next: StageState | null, ticket = ++latest.current) => {
    if (!next) return setShown(null);
    loadScene(next.scene)
      .then(() => {
        if (ticket === latest.current) setShown(next);
      })
      .catch(logFailure);
  }, []);

  const load = useCallback(() => {
    const ticket = ++latest.current;
    client.owyStage
      .getState()
      .catch(() => DEFAULT_STAGE_STATE)
      .then((state) => show(fixed ? { ...state, scene: fixed, params: {} } : state, ticket));
  }, [fixed, show]);

  useEffect(() => {
    if (!posted) load();
  }, [posted, load]);

  // A monitor talks to its (same-origin) parent: the preview shows what it is posted, and both
  // load ahead the scenes they are told are coming. Each asks for its first word on mount.
  useEffect(() => {
    if (!monitor) return;
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data as { type?: string; state?: StageState | null; scenes?: unknown } | null;
      if (data?.type === MONITOR_SHOW && posted) show(data.state ?? null);
      if (data?.type === MONITOR_PREFETCH && Array.isArray(data.scenes))
        for (const id of data.scenes) if (typeof id === "string" && isSceneId(id)) loadScene(id).catch(logFailure);
    };
    window.addEventListener("message", onMessage);
    window.parent.postMessage({ type: MONITOR_READY }, window.location.origin);

    return () => window.removeEventListener("message", onMessage);
  }, [monitor, posted, show]);

  // Once it is up, the wall keeps every scene at hand: no take ever waits on the network.
  const up = shown !== null;
  useEffect(() => {
    if (wall && up) preloadScenes();
  }, [wall, up]);

  // A scene change plays the band wipe and swaps the scene while the bands
  // cover the frame; params-only updates apply live. A cut swaps at once,
  // and also beats a wipe still on its way. The newest state always wins.
  const goTo = useCallback(
    (next: StageState) => {
      const ticket = ++latest.current;
      if (swapTimer.current) clearTimeout(swapTimer.current);
      if (next.transition === "cut") {
        setWipe(0);
        show(next, ticket);
        return;
      }
      if (next.scene === shownRef.current?.scene) {
        show(next, ticket);
        return;
      }
      // Its code loads under the bands; the swap keeps its moment.
      loadScene(next.scene).catch(() => undefined);
      setWipe(Date.now());
      swapTimer.current = setTimeout(() => show(next, ticket), WIPE_MID_MS);
    },
    [show]
  );

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
    ? (sceneComponent(shown.scene) as React.ComponentType<{
        params: unknown;
        eventId: string | null;
        round: string;
        takenAt: string;
      }> | null)
    : null;
  // Interactive scenes restart (timers, inputs) on every take; the rest keep
  // running through param edits. A preview monitor restarts on a new round too,
  // which is how the admin replays a scene that counts down.
  const restarts = posted || (INTERACTIVE_SCENES as readonly string[]).includes(shown?.scene ?? "");

  return (
    <>
      {/* The wall itself is a venue screen; its monitors and pinned scenes are not. A scene without an event
          (black, Owy's face) leaves the wall in the event it was in, instead of dropping it from Pantallas. */}
      {wall && <ScreenBeacon eventId={shown?.eventId ?? undefined} />}
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
    </>
  );
}
