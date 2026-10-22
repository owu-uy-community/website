"use client";

import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { Copy, Loader2, RotateCcw, Scissors, Search, Smartphone, Timer, Undo2, X } from "lucide-react";

import { cn } from "app/lib/utils";
import { TALLY } from "components/Admin/screen/tally";
import { useInputs } from "components/OwyStage/inputs";
import { Button } from "components/shared/ui/button";
import { Kbd } from "components/shared/ui/kbd";
import type { StageCanvas } from "lib/owy-stage/canvas";
import {
  INTERACTIVE_SCENES,
  MONITOR_PREFETCH,
  MONITOR_READY,
  MONITOR_SHOW,
  SCENES,
  type DeskStep,
  type SceneId,
  type StageState,
} from "lib/owy-stage/scenes";

import { ScaledFrame } from "./ScaledFrame";
import { readParams } from "./SceneParams";
import { clockText, sceneClock } from "./timing";
import { releaseFocus } from "./useStageHotkeys";

const PHONE = new Set<string>(INTERACTIVE_SCENES);
/** The wall's wipe (WIPE_MS in the stage engine): TAKE's progress bar runs as long. */
const WIPE_S = 0.9;
const EASE = "cubic-bezier(0.2, 0.8, 0.2, 1)";

/** A TAKE on its way to the wall, for the animation from the preview monitor to AL AIRE. */
export type Flight = { id: number; scene: SceneId };

/** `Date.now()`, refreshed every `ms` (or frozen with null) — only where a clock is drawn. */
function useNow(ms: number | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (ms === null) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), ms);

    return () => clearInterval(timer);
  }, [ms]);

  return now;
}

/** Time on air, ticking on its own so nothing else re-renders every second. */
function OnAirFor({ iso }: { iso: string }) {
  const now = useNow(1000);
  if (!iso) return null;

  return <span className="font-terminal tabular-nums">{clockText((now - Date.parse(iso)) / 1000)}</span>;
}

/** The on-air scene's own clock (a quiz, a talk timer…), red in its last five seconds. */
function ClockChip({ live }: { live: StageState }) {
  const total = sceneClock(live.scene, readParams(live.scene, live.params));
  const now = useNow(total ? 250 : null);
  if (!total || !live.takenAt) return null;
  const left = total - (now - Date.parse(live.takenAt)) / 1000;

  return (
    <span
      className={cn(
        "flex items-center gap-1 rounded-md bg-black/75 px-1.5 py-0.5 font-terminal text-2xs text-white tabular-nums",
        left <= 5 && left > 0 && "bg-live/90 motion-safe:animate-pulse"
      )}
      title="El reloj de la escena"
    >
      <Timer className="h-3 w-3" />
      {left > 0 ? clockText(left) : "terminó"}
    </span>
  );
}

/** How many phones are in on an interactive scene, popping on every new one. */
function PhonesChip({ live }: { live: StageState }) {
  const interactive = PHONE.has(live.scene);
  const inputs = useInputs(interactive ? live.round : "");
  const people = useMemo(() => new Set(inputs.map((input) => input.voter)).size, [inputs]);
  if (!interactive) return null;

  return (
    <motion.span
      key={people}
      animate={{ scale: 1 }}
      className="flex items-center gap-1 rounded-md bg-black/75 px-1.5 py-0.5 font-terminal text-2xs text-white tabular-nums"
      initial={{ scale: people ? 1.3 : 1 }}
      title={`${people} personas participando · ${inputs.length} respuestas`}
      transition={{ type: "spring", stiffness: 500, damping: 18 }}
    >
      <Smartphone className="h-3 w-3" />
      {people}
    </motion.span>
  );
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
  overlay,
  screenRef,
  compact,
  onSelect,
  children,
}: {
  canvas: StageCanvas;
  tone: "preview" | "program";
  selected: boolean;
  label: ReactNode;
  overlay?: ReactNode;
  screenRef: RefObject<HTMLDivElement | null>;
  compact: boolean;
  onSelect: () => void;
  children: ReactNode;
}) {
  const bar = compact ? 26 : 30;

  return (
    <div className="[container-type:size] flex min-h-0 min-w-0 flex-1 items-center justify-center">
      <div
        className={cn(
          "flex flex-col overflow-hidden rounded-lg bg-black ring-2 transition-shadow duration-300",
          TALLY[tone].ring,
          selected &&
            (tone === "preview"
              ? "shadow-[0_0_0_5px_hsl(var(--success)/0.2)]"
              : "shadow-[0_0_0_5px_hsl(var(--live)/0.22)]")
        )}
        style={{ width: `min(100cqw, calc((100cqh - ${bar}px) * ${canvas.w} / ${canvas.h}))` }}
      >
        <div ref={screenRef} className="relative">
          <button
            aria-label={tone === "preview" ? "Editar la preview" : "Editar lo que está al aire"}
            className="block w-full"
            type="button"
            onClick={(event) => {
              onSelect();
              releaseFocus(event);
            }}
          >
            {children}
          </button>
          {overlay}
        </div>
        <div
          className={cn(
            "flex shrink-0 items-center gap-1.5 px-2 font-terminal font-semibold tracking-[0.08em] uppercase",
            compact ? "text-3xs" : "text-2xs",
            TALLY[tone].surface,
            TALLY[tone].text
          )}
          style={{ height: bar }}
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
  frame,
}: {
  step: DeskStep;
  live: StageState;
  canvas: StageCanvas;
  replay: number;
  frame: RefObject<HTMLIFrameElement | null>;
}) {
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
  }, [frame]);

  // The monitor page asks for the state when it (re)loads.
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow) return;
      if ((event.data as { type?: string } | null)?.type === MONITOR_READY) post();
    };
    window.addEventListener("message", onMessage);

    return () => window.removeEventListener("message", onMessage);
  }, [frame, post]);

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
      {/* A new scene in preview fades in from its thumbnail while the monitor page swaps it. */}
      <motion.img
        key={step.id}
        alt=""
        animate={{ opacity: 0 }}
        className="pointer-events-none absolute inset-0 h-full w-full object-cover"
        draggable={false}
        initial={{ opacity: 1 }}
        src={`/owy-stage/thumbs/${step.scene}.jpg`}
        transition={{ delay: 0.12, duration: 0.3 }}
      />
    </div>
  );
}

const canvasQuery = (canvas: StageCanvas) =>
  canvas.w === 1920 && canvas.h === 1080 ? "" : `&canvas=${canvas.w}x${canvas.h}`;

/**
 * TAKE, drawn: the taken scene flies from the preview monitor into AL AIRE,
 * so the eye follows what just happened. Rendered in a portal above everything,
 * and animated with transform and opacity only: the compositor runs it, so the
 * work a TAKE sets off on the page can't make it stutter.
 */
function FlightGhost({
  flight,
  from,
  to,
}: {
  flight: Flight | null;
  from: RefObject<HTMLDivElement | null>;
  to: RefObject<HTMLDivElement | null>;
}) {
  const ghost = useRef<HTMLImageElement>(null);
  const [trip, setTrip] = useState<{ id: number; scene: SceneId; a: DOMRect; b: DOMRect } | null>(null);

  useLayoutEffect(() => {
    if (!flight || !from.current || !to.current) return;
    setTrip({
      id: flight.id,
      scene: flight.scene,
      a: from.current.getBoundingClientRect(),
      b: to.current.getBoundingClientRect(),
    });
  }, [flight, from, to]);

  useLayoutEffect(() => {
    const img = ghost.current;
    if (!trip || !img) return;
    const { a, b } = trip;
    // It sits on AL AIRE and starts drawn over the preview; with reduced motion it only fades there.
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const start = `translate(${a.left - b.left}px, ${a.top - b.top}px) scale(${a.width / b.width}, ${a.height / b.height})`;
    const fly = still
      ? null
      : img.animate([{ transform: start }, { transform: "none" }], { duration: 450, easing: EASE });
    const fade = img.animate([{ opacity: 1 }, { opacity: 1, offset: 0.75 }, { opacity: 0 }], {
      duration: 600,
      fill: "forwards",
    });
    fade.onfinish = () => setTrip((current) => (current?.id === trip.id ? null : current));

    return () => {
      fly?.cancel();
      fade.cancel();
    };
  }, [trip]);

  if (!trip) return null;

  return createPortal(
    <img
      key={trip.id}
      ref={ghost}
      alt=""
      className="pointer-events-none fixed z-[60] origin-top-left rounded-md object-cover shadow-[0_18px_50px_rgba(0,0,0,.55),0_0_0_2px_hsl(var(--primary)/0.9)]"
      src={`/owy-stage/thumbs/${trip.scene}.jpg`}
      style={{ left: trip.b.left, top: trip.b.top, width: trip.b.width, height: trip.b.height }}
    />,
    document.body
  );
}

/**
 * Tells a monitor page which scenes are coming (what TAKE would put on air,
 * what drops into preview after it, what goes back), so it loads their code
 * ahead and TAKE never waits for it. Sent again whenever the page (re)loads.
 */
function useWarmScenes(frame: RefObject<HTMLIFrameElement | null>, scenes: string) {
  const post = useCallback(() => {
    frame.current?.contentWindow?.postMessage(
      { type: MONITOR_PREFETCH, scenes: scenes.split(",") },
      window.location.origin
    );
  }, [frame, scenes]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow) return;
      if ((event.data as { type?: string } | null)?.type === MONITOR_READY) post();
    };
    window.addEventListener("message", onMessage);

    return () => window.removeEventListener("message", onMessage);
  }, [frame, post]);

  useEffect(post, [post]);
}

/** The red flash on AL AIRE whenever something new goes on air (not on page load). */
function OnAirFlash({ round }: { round: string }) {
  // The first round seen is what was already on air when the page loaded.
  const seen = useRef(round);
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    if (!seen.current) {
      seen.current = round;
      return;
    }
    if (round && round !== seen.current) {
      seen.current = round;
      setFlash(round);
    }
  }, [round]);

  return (
    <AnimatePresence>
      {flash && (
        <motion.div
          key={flash}
          animate={{ opacity: 0 }}
          className="pointer-events-none absolute inset-0 z-10 bg-live/25 ring-4 ring-live ring-inset"
          initial={{ opacity: 1 }}
          transition={{ duration: 0.9, ease: "easeOut" }}
          onAnimationComplete={() => setFlash(null)}
        />
      )}
    </AnimatePresence>
  );
}

/**
 * PREVIEW (green) and AL AIRE (red), side by side like a switcher's
 * multiview. `center` sits between them (the studio layout puts TAKE there);
 * `compact` is the phone's smaller label bar.
 */
function MonitorsView({
  live,
  preview,
  next,
  canvas,
  target,
  replay,
  taking,
  flight,
  compact = false,
  center,
  onTarget,
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
  replay: number;
  taking: boolean;
  flight: Flight | null;
  compact?: boolean;
  center?: ReactNode;
  onTarget: (target: "preview" | "program") => void;
  onClearPreview: () => void;
  onReplay: () => void;
  onCopyLive: () => void;
  onSearch: () => void;
}) {
  const previewRef = useRef<HTMLDivElement>(null);
  const programRef = useRef<HTMLDivElement>(null);
  const previewFrame = useRef<HTMLIFrameElement>(null);
  const programFrame = useRef<HTMLIFrameElement>(null);
  const coming = [...new Set([preview?.scene, next?.scene, live.scene].filter(Boolean))].join(",");
  useWarmScenes(previewFrame, coming);
  useWarmScenes(programFrame, coming);
  const iconButton = cn(
    "h-6 w-6 shrink-0 pointer-coarse:h-8 pointer-coarse:w-8",
    compact && "pointer-coarse:h-7 pointer-coarse:w-7"
  );

  return (
    // A size container, so the TAKE column can scale with the panel's height (cqh).
    <div className={cn("[container-type:size] flex h-full min-h-0 items-stretch", compact ? "gap-2" : "gap-3 p-3")}>
      {preview ? (
        <Monitor
          canvas={canvas}
          compact={compact}
          label={
            <>
              <span className={cn("size-2 shrink-0 rounded-full", TALLY.preview.dot)} />
              <span className={cn(compact && "sr-only")}>Preview</span>
              <span className="min-w-0 truncate font-sans font-semibold tracking-normal text-foreground normal-case">
                {SCENES[preview.scene].title}
              </span>
              {preview.from === "swap" && !compact && (
                <span className="flex shrink-0 items-center gap-1 tracking-normal normal-case opacity-80">
                  <Undo2 className="h-3 w-3" /> recién salió
                </span>
              )}
              <span className="ml-auto flex shrink-0 items-center">
                <Button
                  aria-label="Reiniciar la preview"
                  className={cn(iconButton, "text-success-foreground hover:bg-success/15")}
                  size="icon"
                  title="Reiniciar (vuelve a correr lo que cuenta o se anima)"
                  variant="ghost"
                  onClick={onReplay}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </Button>
                <Button
                  aria-label="Sacar de la preview"
                  className={cn(iconButton, "text-success-foreground hover:bg-success/15")}
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
          screenRef={previewRef}
          selected={target === "preview"}
          tone="preview"
          onSelect={() => onTarget("preview")}
        >
          <PreviewScreen canvas={canvas} frame={previewFrame} live={live} replay={replay} step={preview} />
        </Monitor>
      ) : (
        <div className="[container-type:size] flex min-h-0 min-w-0 flex-1 items-center justify-center">
          <div
            ref={previewRef}
            className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-success/40 p-3 text-center"
            style={{
              width: `min(100cqw, calc((100cqh - 30px) * ${canvas.w} / ${canvas.h}))`,
              aspectRatio: `${canvas.w} / ${canvas.h}`,
            }}
          >
            <p className="text-ui font-semibold text-success-foreground">Preview vacía</p>
            {!compact && (
              <p className="max-w-xs text-meta text-muted-foreground">
                Tocá una escena de la biblioteca o de la cola: se ve acá antes de salir al aire.
              </p>
            )}
            <Button variant="outline" onClick={onSearch}>
              <Search /> Buscar
            </Button>
          </div>
        </div>
      )}

      {center}

      <Monitor
        canvas={canvas}
        compact={compact}
        label={
          <>
            <span
              className={cn(
                "size-2 shrink-0 rounded-full",
                taking ? [TALLY.pending.dot, "motion-safe:animate-pulse"] : TALLY.program.dot
              )}
            />
            <span className={cn(compact && "sr-only")}>Al aire</span>
            <span className="min-w-0 truncate font-sans font-semibold tracking-normal text-foreground normal-case">
              {SCENES[live.scene].title}
            </span>
            <span className="ml-auto flex shrink-0 items-center gap-1 tracking-normal">
              <OnAirFor iso={live.takenAt} />
              <Button
                aria-label="Copiar a la preview"
                className={cn(iconButton, "text-live-foreground hover:bg-live/15")}
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
        overlay={
          <>
            <span className="pointer-events-none absolute top-1.5 right-1.5 left-1.5 z-20 flex justify-between gap-1">
              <ClockChip live={live} />
              <span className="ml-auto">
                <PhonesChip live={live} />
              </span>
            </span>
            <OnAirFlash round={live.round} />
          </>
        }
        screenRef={programRef}
        selected={target === "program"}
        tone="program"
        onSelect={() => onTarget("program")}
      >
        <ScaledFrame
          canvas={canvas}
          className="rounded-none"
          frameRef={programFrame}
          src={`/owy/stage?monitor=program${canvasQuery(canvas)}`}
          title="Al aire"
        />
      </Monitor>

      <FlightGhost flight={flight} from={previewRef} to={programRef} />
    </div>
  );
}

export const Monitors = memo(MonitorsView);

function TakeControlsView({
  live,
  preview,
  next,
  taking,
  layout,
  onTake,
}: {
  live: StageState;
  preview: DeskStep | null;
  /** The head of the queue: what drops into preview after a TAKE. */
  next: DeskStep | null;
  taking: boolean;
  layout: "column" | "bar";
  onTake: (transition: "wipe" | "cut") => void;
}) {
  const after = next ?? (preview ? { scene: live.scene } : null);
  const disabled = !preview || taking;
  const column = layout === "column";

  const take = (
    <Button
      aria-label="TAKE: la preview sale al aire"
      className={cn(
        "relative h-auto touch-manipulation flex-col gap-1.5 overflow-hidden rounded-xl font-extrabold tracking-[0.12em] shadow-[0_10px_28px_hsl(var(--primary)/0.16)] transition-transform active:scale-[0.97]",
        column ? "h-[clamp(52px,32cqh,104px)] text-xl" : "h-14 flex-1 text-lg"
      )}
      disabled={disabled}
      onClick={(event) => {
        onTake("wipe");
        releaseFocus(event);
      }}
    >
      {taking ? <Loader2 className="h-6 w-6 animate-spin" /> : "TAKE"}
      {column && <Kbd className="hidden [@container(min-height:240px)]:pointer-fine:inline-flex">Espacio</Kbd>}
      {/* The wall's wipe, as a progress bar along the button. */}
      <AnimatePresence>
        {taking && (
          <motion.span
            animate={{ scaleX: 1 }}
            className="absolute inset-x-0 bottom-0 h-1 origin-left bg-black/40"
            exit={{ opacity: 0 }}
            initial={{ scaleX: 0 }}
            transition={{ duration: WIPE_S, ease: "linear" }}
          />
        )}
      </AnimatePresence>
    </Button>
  );
  const cut = (
    <Button
      aria-label="CUT: la preview sale al aire sin transición"
      className={cn(
        "touch-manipulation gap-1.5 font-bold tracking-[0.12em] transition-transform active:scale-[0.97]",
        column ? "h-9" : "h-14 w-[4.5rem] flex-col gap-0.5 text-meta"
      )}
      disabled={disabled}
      title="Sin el barrido: aparece de golpe"
      variant="outline"
      onClick={(event) => {
        onTake("cut");
        releaseFocus(event);
      }}
    >
      <Scissors className="h-4 w-4" /> CUT
      {column && <Kbd className="ml-auto pointer-coarse:hidden">⌫</Kbd>}
    </Button>
  );
  const upcoming = after && (
    <div className={cn("min-w-0 text-2xs leading-tight text-muted-foreground", !column && "flex items-center gap-2")}>
      <span className="shrink-0">{next ? "Después entra" : "Después vuelve"}</span>
      <span className={cn("truncate text-meta font-semibold text-foreground", column && "mt-0.5 block")}>
        {SCENES[after.scene].title}
      </span>
      {column && (
        <img
          alt=""
          className="mt-1.5 hidden aspect-video w-full rounded bg-black object-cover opacity-80 [@container(min-height:300px)]:block"
          draggable={false}
          src={`/owy-stage/thumbs/${after.scene}.jpg`}
        />
      )}
    </div>
  );

  if (column)
    return (
      <div className="flex w-[116px] shrink-0 flex-col justify-center gap-2 overflow-hidden">
        {take}
        {cut}
        <p className="hidden text-center font-terminal text-3xs tracking-[0.12em] text-muted-foreground uppercase [@container(min-height:220px)]:block">
          Barrido · 0,9 s
        </p>
        {upcoming}
      </div>
    );

  return (
    <div className="space-y-1.5">
      <div className="flex gap-2">
        {take}
        {cut}
      </div>
      {/* Its line is kept even while empty: what arrives with the desk must not push the page down. */}
      <div className="h-4">{upcoming}</div>
    </div>
  );
}

export const TakeControls = memo(TakeControlsView);
