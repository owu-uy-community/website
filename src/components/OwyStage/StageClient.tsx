"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useRealtimeChannel } from "hooks/useRealtimeChannel";
import { client } from "lib/orpc";
import {
  DEFAULT_STAGE_STATE,
  OWY_STAGE_CHANNEL,
  parseSceneParams,
  type EffectEvent,
  type SceneId,
  type StageState,
} from "lib/owy-stage/scenes";

import { Effects, useEffectQueue } from "./effects";
import { SCENE_COMPONENTS } from "./scenes";
import { Stage, WIPE_MID_MS, Wipe, type StageBackground } from "./Stage";

type Props = {
  bg: StageBackground;
  /** Pin one scene (direct OBS embed / admin thumbnail) instead of following the director. */
  fixed?: SceneId;
  /** Thumbnail mode: no realtime, no effects, lower frame rate. */
  preview?: boolean;
};

export default function StageClient({ bg, fixed, preview = false }: Props) {
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
    load();
  }, [load]);

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

  const { isConnected } = useRealtimeChannel(preview ? null : OWY_STAGE_CHANNEL, (event, payload) => {
    if (event === "scene" && !fixed) goTo(payload as StageState);
    if (event === "effect") pushFx(payload as EffectEvent);
  });

  // The WebSocket route recycles every few minutes; anything sent during the
  // gap is gone, so resync whenever the connection comes back.
  useEffect(() => {
    if (isConnected && !preview) load();
  }, [isConnected, preview, load]);

  const Scene = shown
    ? (SCENE_COMPONENTS[shown.scene] as React.ComponentType<{ params: unknown; eventId: string | null }>)
    : null;

  return (
    <Stage bg={bg} preview={preview}>
      {Scene && shown && (
        <Scene key={shown.scene} eventId={shown.eventId} params={parseSceneParams(shown.scene, shown.params)} />
      )}
      {wipe > 0 && <Wipe key={wipe} onDone={() => setWipe(0)} />}
      <Effects fx={fx} />
    </Stage>
  );
}
