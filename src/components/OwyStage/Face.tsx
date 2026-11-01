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
import { followSource, resumable, type FaceApi } from "lib/owy-stage/face-flow";
import {
  FaceEventSchema,
  MouthEventSchema,
  OWY_STAGE_CHANNEL,
  type EffectEvent,
  type FaceEvent,
} from "lib/owy-stage/scenes";

import { StageContext } from "./Stage";

export type { FaceApi };
export type FaceBoard = "amoled" | "knob";

/** A real idle frame of the AMOLED face (written by the emulator's goldens test). */
const STILL = "/companion-runtime/face.png";
/** No frame by then: the still shows until one arrives (a slow first load at the venue). */
const STILL_AFTER_MS = 3000;

type Message = { type: string } & Record<string, unknown>;

/**
 * Owy's face: the firmware's own model and LVGL renderer (the emulator's WASM in face-only mode),
 * drawn crisply at `size` px by a worker of its own, so the wall, the talk deck and the
 * workbench's knob show what the device shows. A page tells it what happens through the ref;
 * blinks, springs, how long a feeling lasts, the happy mood and the mouth's babble are the
 * model's. `lag` (ms, by default the stage's `?lag=`) makes it act earlier on a screen that
 * shows it late. Without a worker or a canvas it can hand over, it is a still of the idle face.
 */
export function OwyFace({
  size,
  board = "amoled",
  fps,
  lag,
  className = "",
  style,
  ref,
}: {
  size: number;
  board?: FaceBoard;
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
  const host = useRef<HTMLDivElement>(null);
  /** `null` until the worker is up, `false` once it can't be. */
  const worker = useRef<Worker | false | null>(null);
  /** What the page said before the worker was up, in order. */
  const queue = useRef<Message[]>([]);
  /** The last state or mood: a new worker (a new size, StrictMode's second mount) starts from it. */
  const standing = useRef<Message | null>(null);
  const [shown, setShown] = useState<"wait" | "live" | "still">("wait");

  useImperativeHandle(ref, () => {
    const post = (message: Message) => {
      if (worker.current) worker.current.postMessage(message);
      else if (worker.current === null) queue.current.push(message);
    };
    const stand = (message: Message) => {
      standing.current = message;
      post(message);
    };
    return {
      state: (state) => stand({ type: "state", state }),
      mood: (mood) => stand({ type: "mood", mood }),
      express: (name, strength, at) => post({ type: "express", name, strength: strength ?? 100, at }),
      smile: () => post({ type: "smile" }),
      mouth: (frames, at) => post({ type: "mouth", frames, at }),
    };
  }, []);

  useEffect(() => {
    const box = host.current;
    if (!box) return;
    // A fresh canvas each time: one that handed its context to a worker can't hand it again.
    const canvas = document.createElement("canvas");
    if (typeof canvas.transferControlToOffscreen !== "function" || typeof Worker !== "function") {
      worker.current = false;
      queue.current = [];
      setShown("still");
      return;
    }
    canvas.className = "block h-full w-full";
    box.append(canvas);
    const instance = new Worker("/companion-runtime/face.mjs", { type: "module", name: "owy-face" });
    const timer = setTimeout(() => setShown((now) => (now === "wait" ? "still" : now)), STILL_AFTER_MS);
    const fail = () => {
      clearTimeout(timer);
      instance.terminate();
      if (worker.current === instance) worker.current = false;
      setShown("still");
    };
    instance.onmessage = ({ data }: MessageEvent<{ type?: string } | null>) => {
      if (data?.type === "frame") {
        clearTimeout(timer);
        setShown("live");
      } else if (data?.type === "error") fail();
    };
    instance.onerror = fail;
    const offscreen = canvas.transferControlToOffscreen();
    instance.postMessage({ type: "init", canvas: offscreen, size, board, fps: rate, lag: late }, [offscreen]);
    // The worker takes each one once its runtime is up, in order.
    if (standing.current) instance.postMessage(standing.current);
    for (const message of queue.current.splice(0)) instance.postMessage(message);
    worker.current = instance;

    return () => {
      clearTimeout(timer);
      if (worker.current === instance) worker.current = null;
      instance.terminate();
      canvas.remove();
    };
  }, [size, board, rate, late]);

  return (
    // A one-cell grid stacks the still over the canvas without taking the face's position from the caller.
    <div
      aria-hidden
      className={`grid grid-cols-1 grid-rows-1 overflow-hidden rounded-full ${className}`}
      style={{ width: size, height: size, ...style }}
    >
      <div ref={host} className="col-start-1 row-start-1 min-h-0 min-w-0" />
      {shown === "still" && <img alt="" className="col-start-1 row-start-1 h-full w-full" src={STILL} />}
    </div>
  );
}

/**
 * Owy's face events off the stage channel, checked, for a page whose faces follow the
 * companion: `face` for each one (and, on every (re)connect, the stored face if it is under a
 * minute old, with when it happened), `mouth` for the lip shapes of the Owy being followed (the
 * source of the latest face that isn't idle), `smile` for the owy-happy effect. Thumbnails hear
 * nothing.
 */
export function useFaceEvents(on: {
  face?: (event: FaceEvent, now: number) => void;
  mouth?: (frames: string, at: number) => void;
  smile?: () => void;
}) {
  const { preview } = useContext(StageContext);
  const handlers = useRef(on);
  handlers.current = on;
  const source = useRef<string | undefined>(undefined);
  const face = useCallback((event: FaceEvent, now: number) => {
    source.current = followSource(source.current, event);
    handlers.current.face?.(event, now);
  }, []);

  const { isConnected } = useRealtimeChannel(preview ? null : OWY_STAGE_CHANNEL, (event, payload) => {
    if (event === "face") {
      const parsed = FaceEventSchema.safeParse(payload);
      if (parsed.success) face(parsed.data, Date.now());
    } else if (event === "mouth") {
      const parsed = MouthEventSchema.safeParse(payload);
      if (parsed.success && parsed.data.source === source.current)
        handlers.current.mouth?.(parsed.data.frames, parsed.data.at);
    } else if (event === "effect" && (payload as EffectEvent | null)?.effect === "owy-happy")
      handlers.current.smile?.();
  });

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
}
