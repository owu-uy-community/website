"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

import { SCENES, type SceneId } from "lib/owy-stage/scenes";

import { BRAND } from "./Stage";
import StageClient from "./StageClient";

const WIDTH = 1920;
const HEIGHT = 1080;
const FPS = 60;
/** ponytail: the MP4 is built in memory (~2.5 MB/s); stream it to disk (showSaveFilePicker) if exports grow longer. */
const MAX_SECONDS = 120;
/** Motion graphics at 1080p60 want more than the 12 Mbps "very high" preset gives. */
const BITRATE = 20_000_000;
/** H.264 High 4.2: the lowest level that allows 1080p at 60 fps. */
const CODEC = "avc1.64002a";
/**
 * A few pixels off each edge of the 1920×1080 capture (a 0.4% zoom, still 16:9):
 * Chrome's cropped tab capture ends in a black column on the right, and rounding
 * the stage's fractional edges outward adds a dark line of letterbox elsewhere.
 */
const TRIM = { left: 4, top: 2, width: WIDTH - 8, height: HEIGHT - 4 };

/** Region Capture (Chrome 104+) is not in TypeScript's DOM types yet. */
type CropTargetApi = { fromElement: (element: Element) => Promise<unknown> };
type CroppableTrack = MediaStreamVideoTrack & { cropTo: (target: unknown) => Promise<void> };

type Phase =
  | { kind: "idle" }
  /** Panel and scene are gone, so the first frames are black while the recorder starts. */
  | { kind: "armed" }
  | { kind: "rolling" }
  /** `frames` under `expected`: the encoder fell behind and some frames last two. */
  | { kind: "done"; file: string; frames: number; expected: number }
  | { kind: "error"; message: string };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** The recorded box in device pixels: under 1920×1080 the video comes out softer. */
function useSourceSize(frame: RefObject<HTMLDivElement | null>) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  // Polled: zoom or moving the window to another screen changes it without a resize.
  useEffect(() => {
    const id = setInterval(() => {
      const box = frame.current?.getBoundingClientRect();
      if (!box) return;
      const w = Math.round(box.width * devicePixelRatio);
      const h = Math.round(box.height * devicePixelRatio);
      setSize((size) => (size?.w === w && size.h === h ? size : { w, h }));
    }, 500);
    return () => clearInterval(id);
  }, [frame]);

  return size;
}

/**
 * Records this tab's stage to a 1920×1080, 60 fps H.264 MP4, encoded in the
 * browser: Chrome shares this very tab, crops it to the stage box (Region
 * Capture) and scales that to 1080p; mediabunny samples it at a constant 60 fps
 * (repeating a frame when nothing moved) and encodes it. The scene restarts
 * when the recording starts, so its entrance is in the video.
 */
export default function SceneExport({ scene, params }: { scene: SceneId; params?: Record<string, unknown> }) {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [seconds, setSeconds] = useState(10);
  const [take, setTake] = useState(0);
  const frame = useRef<HTMLDivElement>(null);
  const source = useSourceSize(frame);
  const { title } = SCENES[scene];

  const record = async () => {
    const CropTarget = (window as { CropTarget?: CropTargetApi }).CropTarget;
    const box = frame.current;
    if (!navigator.mediaDevices?.getDisplayMedia || !CropTarget || !box)
      return setPhase({ kind: "error", message: "Grabar video necesita Chrome en una compu." });

    const { BufferTarget, MediaStreamVideoTrackSource, Mp4OutputFormat, Output, canEncodeVideo } =
      await import("mediabunny");
    let frames = 0;
    const encoding = {
      codec: "avc",
      bitrate: BITRATE,
      fullCodecString: CODEC,
      // Chrome's hardware encoder on macOS held every frame until the end, so the
      // live source dropped all but the first 8; the software one keeps up with 1080p60.
      hardwareAcceleration: "prefer-software",
      sizeChangeBehavior: "fill",
      transform: { crop: TRIM, width: WIDTH, height: HEIGHT },
      onEncodedPacket: () => void frames++,
    } as const;
    if (!(await canEncodeVideo("avc", { ...encoding, width: WIDTH, height: HEIGHT })))
      return setPhase({ kind: "error", message: "Este navegador no puede codificar H.264 a 1080p60." });

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: FPS },
        audio: false,
        preferCurrentTab: true,
        selfBrowserSurface: "include",
        surfaceSwitching: "exclude",
      } as DisplayMediaStreamOptions);
    } catch (error) {
      // NotAllowedError: the share prompt was dismissed, which needs no message.
      const dismissed = error instanceof DOMException && error.name === "NotAllowedError";
      return setPhase(
        dismissed ? { kind: "idle" } : { kind: "error", message: `No se pudo compartir la pestaña: ${error}` }
      );
    }
    const [track] = stream.getVideoTracks() as CroppableTrack[];

    try {
      await track.cropTo(await CropTarget.fromElement(box));
      // Chrome scales the crop down to exactly 1080p (it never scales up: see the size warning).
      await track.applyConstraints({ width: WIDTH, height: HEIGHT, frameRate: FPS });
      const output = new Output({
        format: new Mp4OutputFormat({ fastStart: "in-memory" }),
        target: new BufferTarget(),
      });
      const video = new MediaStreamVideoTrackSource(track, encoding, { frameRate: FPS });
      output.addVideoTrack(video, { frameRate: FPS });
      const failed = video.errorPromise;
      failed.catch(() => undefined); // raced below; this only keeps an early failure from going unhandled

      setPhase({ kind: "armed" });
      await sleep(150);
      await output.start();
      const started = performance.now();
      setTake((n) => n + 1);
      setPhase({ kind: "rolling" });

      // «Dejar de compartir» ends it early; what was recorded is still saved.
      const ended = new Promise((resolve) => track.addEventListener("ended", resolve, { once: true }));
      await Promise.race([sleep(seconds * 1000), ended, failed]);
      const expected = Math.round(((performance.now() - started) / 1000) * FPS);
      await output.finalize();

      const file = `owy-${scene}-1080p60.mp4`;
      const url = URL.createObjectURL(new Blob([output.target.buffer!], { type: "video/mp4" }));
      const link = Object.assign(document.createElement("a"), { href: url, download: file });
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setPhase({ kind: "done", file, frames, expected });
    } catch (error) {
      setPhase({ kind: "error", message: error instanceof Error ? error.message : String(error) });
    } finally {
      track.stop();
    }
  };

  const busy = phase.kind === "armed" || phase.kind === "rolling";

  return (
    <>
      {/* What gets recorded: the stage's 16:9 box, drawn by CSS (the stage fits the same way) so it
          outlives the stage's remounts: a crop target that leaves the page stops the capture.
          Black under the stage, so the video opens on black. */}
      <div
        ref={frame}
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 m-auto h-[min(100vh,calc(100vw*9/16))] w-[min(100vw,calc(100vh*16/9))] bg-black"
      />
      {phase.kind !== "armed" && <StageClient key={take} bg="black" fixed={scene} params={params} />}
      {!busy && (
        <div
          className="fixed bottom-6 left-1/2 z-50 w-[min(92vw,520px)] -translate-x-1/2 space-y-3 rounded-xl border border-white/15 bg-black/85 p-5 font-sans text-sm text-[#FBF5E7] shadow-2xl backdrop-blur"
          role="dialog"
          aria-label="Exportar video"
        >
          <div>
            <h1 className="font-display text-lg font-bold">Exportar «{title}»</h1>
            <p className="text-white/60">
              {WIDTH} × {HEIGHT} · {FPS} fps · MP4 (H.264)
            </p>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2">
              Duración
              <input
                className="w-20 rounded-md border border-white/20 bg-white/10 px-2 py-1.5 tabular-nums"
                max={MAX_SECONDS}
                min={1}
                type="number"
                value={seconds}
                onChange={(event) => setSeconds(Math.min(MAX_SECONDS, Math.max(1, Number(event.target.value) || 1)))}
              />
              s
            </label>
            <button
              className="ml-auto rounded-md px-4 py-2 font-semibold text-black"
              style={{ background: BRAND.yellow }}
              type="button"
              onClick={record}
            >
              ● Grabar
            </button>
          </div>
          <p className="text-xs text-white/60">
            Chrome te pide compartir esta pestaña: elegí «Compartir». La escena arranca de cero, se graba sin este
            cuadro y el MP4 se descarga solo.
          </p>
          {source && (source.w < WIDTH || source.h < HEIGHT) && (
            <p className="text-xs text-[#F5BB03]">
              La escena se ve a {source.w} × {source.h} px: agrandá la ventana o usá pantalla completa, si no el video
              sale más suave.
            </p>
          )}
          {phase.kind === "done" && (
            <p className={phase.frames < phase.expected * 0.98 ? "text-xs text-[#F5BB03]" : "text-xs text-emerald-300"}>
              Listo: {phase.file} · {phase.frames} de {phase.expected} cuadros
            </p>
          )}
          {phase.kind === "error" && <p className="text-xs text-red-300">{phase.message}</p>}
        </div>
      )}
    </>
  );
}
