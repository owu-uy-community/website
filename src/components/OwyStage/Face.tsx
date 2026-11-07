"use client";

import {
  useCallback,
  useContext,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type CSSProperties,
  type Ref,
} from "react";

import { useRealtimeChannel } from "hooks/useRealtimeChannel";
import { client } from "lib/orpc";
import { follow, forget, initialFollower, lost, release, resumable, type FaceApi } from "lib/owy-stage/face-flow";
import {
  FaceEventSchema,
  LevelEventSchema,
  MouthEventSchema,
  OWY_STAGE_CHANNEL,
  ScreenEventSchema,
  type EffectEvent,
  type FaceEvent,
  type ScreenEvent,
} from "lib/owy-stage/scenes";

import { StageContext } from "./Stage";

export type { FaceApi };
export type FaceBoard = "amoled" | "knob";

/** A real idle frame of the knob's face (rendered by the runtime): shown until the face is up. */
const STILL = "/companion-runtime/face.png";
/** The knob's panel: a face in device mode draws its real pixels and the page scales them. */
const KNOB_PX = 360;

type Message = { type: string } & Record<string, unknown>;

/**
 * Owy's face: the firmware's own model and LVGL renderer (the emulator's WASM), drawn by a worker
 * of its own, so the wall, the talk deck and the knob's twin show what the knob shows. A page
 * tells it what happens through the ref; blinks, springs, how long a feeling lasts, the happy mood
 * and the mouth's babble are the model's.
 *
 * Face-only (the wall): the face at `size` px, crisp. `device`: the knob's whole screen at its 360
 * px — the hint under the face, the answer view with the captions, cards, text, QR — scaled to
 * `size`. `lag` (ms, by default the stage's `?lag=`) makes it act earlier on a screen that shows it
 * late. Until it is up (or when it can't run: no worker, no canvas it can hand over, no frame), it
 * is a still of the idle face.
 */
export function OwyFace({
  size,
  board = "knob",
  device = false,
  fps,
  lag,
  className = "",
  style,
  ref,
}: {
  size: number;
  board?: FaceBoard;
  /** The knob's whole screen (the twin), not just the face. */
  device?: boolean;
  /** Frames per second; by default the stage's thumbnails and monitors take fewer. */
  fps?: number;
  lag?: number;
  className?: string;
  style?: CSSProperties;
  ref?: Ref<FaceApi>;
}) {
  const stage = useContext(StageContext);
  const rate = fps ?? (stage.preview ? 15 : stage.throttle ? 30 : 60);
  const late = lag ?? stage.lag;
  // In device mode the canvas is always the panel's pixels: a new size is only CSS.
  const pixels = device ? KNOB_PX : size;
  const host = useRef<HTMLDivElement>(null);
  /** `null` until the worker is up, `false` once it can't be. */
  const worker = useRef<Worker | false | null>(null);
  /** What the page said before the worker was up, in order. */
  const queue = useRef<Message[]>([]);
  /** What a new worker (a new size, StrictMode's second mount) starts from: the last state or mood, pausa, motion. */
  const standing = useRef<Map<string, Message>>(new Map());
  const [awake, setAwake] = useState(false);

  useImperativeHandle(ref, () => {
    const post = (message: Message) => {
      if (worker.current) worker.current.postMessage(message);
      else if (worker.current === null) queue.current.push(message);
    };
    /**
     * Kept for a new worker; `slot` groups what replaces what (a state replaces a mood). Every
     * event repeats the state and pausa: only a change reaches the worker (a repeated listening
     * would drop the halo's level until the next one).
     */
    const stand = (slot: string, message: Message) => {
      const before = standing.current.get(slot);
      standing.current.set(slot, message);
      if (before && JSON.stringify(before) === JSON.stringify(message)) return;
      post(message);
    };
    return {
      state: (state) => stand("face", { type: "state", state }),
      mood: (mood) => stand("face", { type: "mood", mood }),
      express: (name, strength, at) => post({ type: "express", name, strength: strength ?? 100, at }),
      smile: () => post({ type: "smile" }),
      mouth: (frames, at) => post({ type: "mouth", frames, at }),
      level: (level) => post({ type: "level", level }),
      privacy: (on) => stand("privacy", { type: "privacy", on }),
      reduced: (on) => stand("reduced", { type: "reduced", on }),
      caption: (text) => post({ type: "caption", text }),
      heard: (text) => post({ type: "heard", text }),
      card: (card) => post({ type: "card", ...card }),
      text: (body) => post({ type: "text", body }),
      qr: (url, caption) => post({ type: "qr", url, caption }),
    };
  }, []);

  useEffect(() => {
    const box = host.current;
    if (!box) return;
    // A fresh canvas each time: one that handed its context to a worker can't hand it again.
    const canvas = document.createElement("canvas");
    setAwake(false);
    if (typeof canvas.transferControlToOffscreen !== "function" || typeof Worker !== "function") {
      worker.current = false;
      queue.current = [];
      return;
    }
    canvas.className = "block h-full w-full";
    box.append(canvas);
    const instance = new Worker("/companion-runtime/face.mjs", { type: "module", name: "owy-face" });
    const fail = () => {
      instance.terminate();
      if (worker.current === instance) worker.current = false;
      setAwake(false);
    };
    instance.onmessage = ({ data }: MessageEvent<{ type?: string } | null>) => {
      // The worker starts its faces awake (face.mjs), so the first frame can show.
      if (data?.type === "frame") setAwake(true);
      else if (data?.type === "error") fail();
    };
    instance.onerror = fail;
    const offscreen = canvas.transferControlToOffscreen();
    instance.postMessage({ type: "init", canvas: offscreen, size: pixels, board, fps: rate, lag: late, device }, [
      offscreen,
    ]);
    // The worker takes each one once its runtime is up, in order.
    for (const message of standing.current.values()) instance.postMessage(message);
    for (const message of queue.current.splice(0)) instance.postMessage(message);
    worker.current = instance;

    return () => {
      if (worker.current === instance) worker.current = null;
      instance.terminate();
      canvas.remove();
    };
  }, [pixels, board, rate, late, device]);

  return (
    // A one-cell grid stacks the still over the canvas without taking the face's position from the caller.
    <div
      aria-hidden
      className={`grid grid-cols-1 grid-rows-1 overflow-hidden rounded-full ${className}`}
      style={{ width: size, height: size, ...style }}
    >
      <div ref={host} className="col-start-1 row-start-1 min-h-0 min-w-0" />
      <img
        alt=""
        className={`col-start-1 row-start-1 h-full w-full transition-opacity duration-300 ${awake ? "opacity-0" : ""}`}
        src={STILL}
      />
    </div>
  );
}

/** How often a page checks that the Owy it follows is still there. */
const LOST_CHECK_MS = 2000;

/**
 * Owy's events off the stage channel, checked, for a page whose faces follow the companion. A
 * page follows one Owy (the source of the latest face that isn't idle) — or exactly `source`, the
 * twin of one device — and drops what arrives late or twice (lib/owy-stage/face-flow `follow`):
 * `face` for each face that counts (and, on every (re)connect, the stored face if it is under a
 * minute old, with when it happened), `mouth`, `level` and `screen` from the Owy it follows,
 * `smile` for the owy-happy effect. An Owy whose bridge stops beating is let go: the page gets an
 * idle face instead of one that talks forever. Thumbnails hear nothing. `forget()`: the page put
 * a face of its own on, so the next heartbeat counts again.
 */
export function useFaceEvents(
  on: {
    face?: (event: FaceEvent, now: number) => void;
    mouth?: (frames: string, at: number) => void;
    level?: (level: number) => void;
    screen?: (event: ScreenEvent) => void;
    smile?: () => void;
  },
  { source: only }: { source?: string } = {}
) {
  const { preview } = useContext(StageContext);
  const handlers = useRef(on);
  handlers.current = on;
  const follower = useRef(initialFollower());
  const followed = useCallback(() => only ?? follower.current.source, [only]);
  const face = useCallback(
    (event: FaceEvent, at: number) => {
      if (only !== undefined && event.source !== only) return;
      const next = follow(follower.current, event, at);
      follower.current = next.follower;
      if (next.take) handlers.current.face?.(event, at);
    },
    [only]
  );

  const { isConnected } = useRealtimeChannel(preview ? null : OWY_STAGE_CHANNEL, (event, payload) => {
    if (event === "face") {
      const parsed = FaceEventSchema.safeParse(payload);
      if (parsed.success) face(parsed.data, Date.now());
    } else if (event === "mouth") {
      const parsed = MouthEventSchema.safeParse(payload);
      if (parsed.success && parsed.data.source === followed())
        handlers.current.mouth?.(parsed.data.frames, parsed.data.at);
    } else if (event === "level") {
      const parsed = LevelEventSchema.safeParse(payload);
      if (parsed.success && parsed.data.source === followed()) handlers.current.level?.(parsed.data.level);
    } else if (event === "screen") {
      const parsed = ScreenEventSchema.safeParse(payload);
      if (parsed.success && parsed.data.source === followed()) handlers.current.screen?.(parsed.data);
    } else if (event === "effect" && (payload as EffectEvent | null)?.effect === "owy-happy")
      handlers.current.smile?.();
  });

  // A bridge that stopped beating (crashed, unplugged, its socket gone) doesn't leave Owy mid-sentence.
  useEffect(() => {
    if (preview) return;
    const timer = setInterval(() => {
      const now = Date.now();
      if (!lost(follower.current, now)) return;
      const source = follower.current.source;
      follower.current = release(follower.current);
      handlers.current.face?.({ state: "idle", source }, now);
    }, LOST_CHECK_MS);
    return () => clearInterval(timer);
  }, [preview]);

  const forgetAll = useCallback(() => {
    follower.current = forget(follower.current);
  }, []);

  useEffect(() => {
    if (preview || !isConnected) return;
    let live = true;
    client.owyStage
      .getState()
      .then(({ face: stored }) => {
        const resumed = live ? resumable(stored, Date.now()) : null;
        if (resumed) face(resumed.face, resumed.at);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [preview, isConnected, face]);

  return { forget: forgetAll };
}
