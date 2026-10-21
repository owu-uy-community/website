"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Copy, Loader2, RotateCcw, Search, Undo2, X } from "lucide-react";

import { cn } from "app/lib/utils";
import { MONITOR_READY, MONITOR_SHOW } from "components/OwyStage/StageClient";
import { Button } from "components/shared/ui/button";
import { Kbd } from "components/shared/ui/kbd";
import type { StageCanvas } from "lib/owy-stage/canvas";
import { SCENES, type DeskStep, type StageState } from "lib/owy-stage/scenes";

import { ScaledFrame } from "./ScaledFrame";
import { readParams } from "./SceneParams";
import { releaseFocus } from "./useStageHotkeys";

/** Height of the label bar under each monitor (px): the screen gets the rest. */
const BAR = 30;

const mmss = (ms: number) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");

  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${String(m).padStart(2, "0")}:${s}`;
};

/** Time on air, ticking on its own so nothing else re-renders every second. */
function Since({ iso }: { iso: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);

    return () => clearInterval(timer);
  }, []);
  if (!iso) return null;

  return <span className="font-terminal tabular-nums">{mmss(now - new Date(iso).getTime())}</span>;
}

/**
 * A monitor box: the screen at the wall's aspect ratio plus its label bar,
 * as large as the space allows (container query units) and centred in it.
 */
function Monitor({
  canvas,
  tone,
  selected,
  label,
  onSelect,
  children,
}: {
  canvas: StageCanvas;
  tone: "preview" | "program";
  selected: boolean;
  label: ReactNode;
  onSelect: () => void;
  children: ReactNode;
}) {
  return (
    <div className="[container-type:size] flex min-h-0 min-w-0 flex-1 items-center justify-center">
      <div
        className={cn(
          "flex flex-col overflow-hidden rounded-lg bg-black ring-2 transition-shadow",
          tone === "preview" ? "ring-green-500" : "ring-red-500",
          selected &&
            (tone === "preview" ? "shadow-[0_0_0_5px_rgba(34,197,94,.18)]" : "shadow-[0_0_0_5px_rgba(239,68,68,.2)]")
        )}
        style={{ width: `min(100cqw, calc((100cqh - ${BAR}px) * ${canvas.w} / ${canvas.h}))` }}
      >
        <button
          aria-label={tone === "preview" ? "Editar la preview" : "Editar lo que está al aire"}
          className="block w-full touch-manipulation"
          type="button"
          onClick={(event) => {
            onSelect();
            releaseFocus(event);
          }}
        >
          {children}
        </button>
        <div
          className={cn(
            "flex shrink-0 items-center gap-2 px-2 text-[11px] font-bold tracking-[0.08em] uppercase",
            tone === "preview" ? "bg-green-500/15 text-green-300" : "bg-red-500/15 text-red-300"
          )}
          style={{ height: BAR }}
        >
          {label}
        </div>
      </div>
    </div>
  );
}

/** The staged scene, rendered by a monitor page that shows whatever this component posts to it. */
function PreviewScreen({
  step,
  live,
  canvas,
  replay,
}: {
  step: DeskStep;
  live: StageState;
  canvas: StageCanvas;
  replay: number;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  // Timers in the staged scene start when it is cued (or replayed), not on every keystroke.
  const cueKey = `${step.id}:${replay}`;
  const [cued, setCued] = useState(() => ({ key: cueKey, at: new Date().toISOString() }));
  if (cued.key !== cueKey) setCued({ key: cueKey, at: new Date().toISOString() });
  const cuedAt = cued.at;
  const state = useMemo<StageState>(
    () => ({
      scene: step.scene,
      // Always valid: a stale stored step must not crash the monitor page.
      params: readParams(step.scene, step.params),
      eventId: live.eventId,
      round: `preview-${step.id}-${replay}`,
      takenAt: cuedAt,
      face: live.face,
    }),
    [step, live.eventId, live.face, replay, cuedAt]
  );
  const stateRef = useRef(state);
  stateRef.current = state;

  const post = useCallback(() => {
    frame.current?.contentWindow?.postMessage({ type: MONITOR_SHOW, state: stateRef.current }, window.location.origin);
  }, []);

  // The monitor page asks for the state when it (re)loads.
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow) return;
      if ((event.data as { type?: string } | null)?.type === MONITOR_READY) post();
    };
    window.addEventListener("message", onMessage);

    return () => window.removeEventListener("message", onMessage);
  }, [post]);

  useEffect(post, [post, state]);

  return (
    <div className="relative" style={{ aspectRatio: `${canvas.w} / ${canvas.h}` }}>
      {/* The thumbnail covers the black frame until the monitor page paints. */}
      <img
        alt=""
        className="absolute inset-0 h-full w-full object-cover"
        draggable={false}
        src={`/owy-stage/thumbs/${step.scene}.jpg`}
      />
      <ScaledFrame
        canvas={canvas}
        className="absolute inset-0 rounded-none bg-transparent"
        frameRef={frame}
        src={`/owy/stage?monitor=preview${canvasQuery(canvas)}`}
        title="Preview"
      />
    </div>
  );
}

const canvasQuery = (canvas: StageCanvas) =>
  canvas.w === 1920 && canvas.h === 1080 ? "" : `&canvas=${canvas.w}x${canvas.h}`;

function MonitorsView({
  live,
  preview,
  next,
  canvas,
  target,
  taking,
  replay,
  onTarget,
  onTake,
  onClearPreview,
  onReplay,
  onCopyLive,
  onSearch,
}: {
  live: StageState;
  preview: DeskStep | null;
  /** The head of the queue: what drops into preview after a TAKE. */
  next: DeskStep | null;
  canvas: StageCanvas;
  target: "preview" | "program";
  taking: boolean;
  replay: number;
  onTarget: (target: "preview" | "program") => void;
  onTake: () => void;
  onClearPreview: () => void;
  onReplay: () => void;
  onCopyLive: () => void;
  onSearch: () => void;
}) {
  const after = next ?? (preview ? { scene: live.scene } : null);

  return (
    <div className="flex h-full min-h-0 items-stretch gap-3 p-3">
      {preview ? (
        <Monitor
          canvas={canvas}
          label={
            <>
              <span className="h-2 w-2 shrink-0 rounded-full bg-green-500" />
              Preview
              <span className="min-w-0 truncate font-semibold tracking-normal text-zinc-100 normal-case">
                {SCENES[preview.scene].title}
              </span>
              {preview.from === "swap" && (
                <span className="flex shrink-0 items-center gap-1 tracking-normal normal-case opacity-80">
                  <Undo2 className="h-3 w-3" /> recién salió
                </span>
              )}
              <span className="ml-auto flex shrink-0 items-center">
                <Button
                  aria-label="Reiniciar la preview"
                  className="h-6 w-6 text-green-200 hover:bg-green-500/20 pointer-coarse:h-7 pointer-coarse:w-7"
                  size="icon"
                  title="Reiniciar (vuelve a correr lo que cuenta o se anima)"
                  variant="ghost"
                  onClick={onReplay}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </Button>
                <Button
                  aria-label="Sacar de la preview"
                  className="h-6 w-6 text-green-200 hover:bg-green-500/20 pointer-coarse:h-7 pointer-coarse:w-7"
                  size="icon"
                  title="Sacar de la preview"
                  variant="ghost"
                  onClick={onClearPreview}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </span>
            </>
          }
          selected={target === "preview"}
          tone="preview"
          onSelect={() => onTarget("preview")}
        >
          <PreviewScreen canvas={canvas} live={live} replay={replay} step={preview} />
        </Monitor>
      ) : (
        <div className="[container-type:size] flex min-h-0 min-w-0 flex-1 items-center justify-center">
          <div
            className="flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-green-500/40 p-4 text-center"
            style={{
              width: `min(100cqw, calc((100cqh - ${BAR}px) * ${canvas.w} / ${canvas.h}))`,
              aspectRatio: `${canvas.w} / ${canvas.h}`,
            }}
          >
            <p className="text-sm font-semibold text-green-300">Preview vacía</p>
            <p className="max-w-xs text-xs text-muted-foreground">
              Tocá una escena de la biblioteca o de la cola: se ve acá antes de salir al aire.
            </p>
            <Button className="h-9" size="sm" variant="outline" onClick={onSearch}>
              <Search className="h-4 w-4" /> Buscar escena
            </Button>
          </div>
        </div>
      )}

      <div className="flex w-[116px] shrink-0 flex-col justify-center gap-3">
        <Button
          aria-label="TAKE: la preview sale al aire"
          className="h-auto min-h-[88px] touch-manipulation flex-col gap-2 rounded-xl text-xl font-extrabold tracking-[0.12em] shadow-[0_10px_28px_rgba(250,204,21,.16)]"
          disabled={!preview || taking}
          onClick={(event) => {
            onTake();
            releaseFocus(event);
          }}
        >
          {taking ? <Loader2 className="h-6 w-6 animate-spin" /> : "TAKE"}
          <Kbd className="border-black/20 bg-black/10 text-black/70 pointer-coarse:hidden">Espacio</Kbd>
        </Button>
        {after && (
          <div className="min-w-0 text-[11px] leading-tight text-muted-foreground">
            {next ? "Después entra" : "Después vuelve"}
            <span className="mt-0.5 block truncate text-xs font-semibold text-foreground">
              {SCENES[after.scene].title}
            </span>
            <img
              alt=""
              className="mt-1.5 aspect-video w-full rounded bg-black object-cover opacity-80"
              draggable={false}
              src={`/owy-stage/thumbs/${after.scene}.jpg`}
            />
          </div>
        )}
      </div>

      <Monitor
        canvas={canvas}
        label={
          <>
            <span
              className={cn("h-2 w-2 shrink-0 rounded-full", taking ? "animate-pulse bg-amber-400" : "bg-red-500")}
            />
            Al aire
            <span className="min-w-0 truncate font-semibold tracking-normal text-zinc-100 normal-case">
              {SCENES[live.scene].title}
            </span>
            <span className="ml-auto flex shrink-0 items-center gap-1 tracking-normal">
              <Since iso={live.takenAt} />
              <Button
                aria-label="Copiar a la preview"
                className="h-6 w-6 text-red-200 hover:bg-red-500/20 pointer-coarse:h-7 pointer-coarse:w-7"
                size="icon"
                title="Copiar a la preview, para preparar un cambio fuera del aire"
                variant="ghost"
                onClick={onCopyLive}
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </span>
          </>
        }
        selected={target === "program"}
        tone="program"
        onSelect={() => onTarget("program")}
      >
        <ScaledFrame
          canvas={canvas}
          className="rounded-none"
          src={`/owy/stage?monitor=program${canvasQuery(canvas)}`}
          title="Al aire"
        />
      </Monitor>
    </div>
  );
}

export const Monitors = memo(MonitorsView);
