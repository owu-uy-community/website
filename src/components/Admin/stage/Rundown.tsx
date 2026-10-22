"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Reorder, useDragControls } from "motion/react";
import { GripVertical, ListVideo, Pause, Pin, Play, Repeat, SkipBack, SkipForward, Square, X } from "lucide-react";

import { clampValue, cn } from "app/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "components/shared/ui/alert-dialog";
import { tallyChip } from "components/Admin/screen/tally";
import { Badge } from "components/shared/ui/badge";
import { Button } from "components/shared/ui/button";
import { ButtonGroup } from "components/shared/ui/button-group";
import { Empty } from "components/shared/ui/empty";
import { Input } from "components/shared/ui/input";
import { Switch } from "components/shared/ui/switch";
import { toast } from "components/shared/ui/toast-utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "components/shared/ui/tooltip";
import { useRealtimeChannel } from "hooks/useRealtimeChannel";
import { orpc } from "lib/orpc";
import { OWY_STAGE_CHANNEL, SCENES, type RundownStep, type SceneId } from "lib/owy-stage/scenes";

import { ActionsMenuButton } from "./menus";
import { paramText } from "./Queue";

const DEFAULT_SEC = 20;
const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;

/** Where the player is. Local to this browser: the tab you press play in drives the wall. */
type Playhead = { cursor: string | null; startedAt: number; pausedAt: number | null };
const STOPPED: Playhead = { cursor: null, startedAt: 0, pausedAt: null };
const NO_STEPS: RundownStep[] = [];

/**
 * The rundown player: the ordered list of takes with the seconds each one
 * stays up, and the clock that walks it. The clock only crosses boundaries;
 * the countdown is drawn by `useRundownClock` where it is shown, so the page
 * around it doesn't re-render four times a second.
 *
 * ponytail: the clock lives in this tab (like the OBS loop), so closing it
 * leaves the wall on the current scene instead of advancing. Move the schedule
 * into the stage state if the wall ever has to run unattended.
 */
export function useRundown(
  take: (scene: SceneId, params: Record<string, unknown> | undefined, restart: boolean) => void,
  liveScene: SceneId
) {
  const queryClient = useQueryClient();
  const { data } = useQuery(orpc.owyStage.getRundown.queryOptions({ staleTime: 60_000 }));
  const steps = data ?? NO_STEPS;

  const save = useMutation(
    orpc.owyStage.saveRundown.mutationOptions({
      onError: (error) => {
        toast.error("No se pudo guardar el guion", error.message);
        queryClient.invalidateQueries({ queryKey: orpc.owyStage.getRundown.queryKey() });
      },
    })
  );
  const { mutate } = save;

  const [play, setPlay] = useState<Playhead>(STOPPED);
  // Always the caller's latest `take`, so the clock below never rebuilds itself.
  const takeRef = useRef(take);
  takeRef.current = take;
  const [loop, setLoop] = useState(true);
  const playing = play.cursor !== null && play.pausedAt === null;
  // Interval callbacks, drag handlers and the actions below read the live values
  // from here instead of from a closure, so none of them is rebuilt on every render.
  const stateRef = useRef({ steps, play });
  stateRef.current = { steps, play };
  /** The scene our own take put on air, so the sync below can tell it apart from someone else's. */
  const expected = useRef<SceneId | null>(null);

  // --- editing -------------------------------------------------------------
  const edit = useMemo(() => {
    const key = orpc.owyStage.getRundown.queryKey();
    const list = () => stateRef.current.steps;
    /** Reordering only touches the cache; `persist` writes what the drag left behind. */
    const reorder = (next: RundownStep[]) => {
      stateRef.current = { ...stateRef.current, steps: next };
      queryClient.setQueryData(key, next);
    };
    const write = (next: RundownStep[]) => {
      reorder(next);
      mutate({ steps: next });
    };

    return {
      reorder,
      persist: () => mutate({ steps: list() }),
      add: (scene: SceneId, params: Record<string, unknown> = {}) =>
        write([...list(), { id: newId(), scene, sec: DEFAULT_SEC, params }]),
      patch: (id: string, change: Partial<RundownStep>) =>
        write(list().map((step) => (step.id === id ? { ...step, ...change } : step))),
      remove: (id: string) => write(list().filter((step) => step.id !== id)),
      /** The UI confirms first (AlertDialog). */
      clear: () => {
        setPlay(STOPPED);
        write([]);
      },
    };
  }, [queryClient, mutate]);

  // --- playback ------------------------------------------------------------
  const go = useCallback((id: string) => {
    const step = stateRef.current.steps.find((item) => item.id === id);
    if (!step) return;
    expected.current = step.scene;
    // Every step is a fresh take: two polls in a row must not share their votes or timers.
    takeRef.current(step.scene, step.params, true);
    setPlay({ cursor: id, startedAt: Date.now(), pausedAt: null });
  }, []);

  const skip = useCallback(
    (dir: 1 | -1) => {
      const { steps: list, play: current } = stateRef.current;
      if (!list.length) return;
      const at = list.findIndex((step) => step.id === current.cursor);
      const next = at + dir;
      if (next >= 0 && next < list.length) return go(list[next].id);
      if (dir === -1) return go(list[list.length - 1].id);
      if (loop) return go(list[0].id);
      // End of the run with the loop off: hold the last scene, stop the clock.
      setPlay((previous) => ({ ...previous, pausedAt: Date.now() }));
    },
    [go, loop]
  );

  const controls = useMemo(() => {
    const start = () => {
      const { steps: list, play: current } = stateRef.current;
      if (!list.length) return;
      const held = current.cursor && list.some((step) => step.id === current.cursor) ? current.cursor : null;
      // Resuming picks the countdown up where it was paused; otherwise start over.
      if (held && current.pausedAt !== null)
        return setPlay((previous) => ({
          ...previous,
          startedAt: previous.startedAt + (Date.now() - (previous.pausedAt ?? Date.now())),
          pausedAt: null,
        }));
      go(held ?? list[0].id);
    };
    const pause = () => setPlay((previous) => (previous.cursor ? { ...previous, pausedAt: Date.now() } : previous));
    const stop = () => setPlay(STOPPED);
    const toggle = () => {
      const { play: current } = stateRef.current;
      return current.cursor !== null && current.pausedAt === null ? pause() : start();
    };

    return { start, pause, stop, toggle };
  }, [go]);

  // Crossing a step's boundary; nothing re-renders between boundaries.
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => {
      const { steps: list, play: current } = stateRef.current;
      const step = list.find((item) => item.id === current.cursor);
      if (!step) return setPlay(STOPPED);
      if (step.sec > 0 && Date.now() - current.startedAt >= step.sec * 1000) skip(1);
    }, 250);

    return () => clearInterval(timer);
  }, [playing, skip]);

  // The player follows the wall: a take from anywhere else (the library, the
  // params form, another device, the bot) moves the playhead when that scene is
  // in the guion and stops the run when it is not.
  useEffect(() => {
    if (expected.current === liveScene) {
      expected.current = null;

      return;
    }
    expected.current = null;
    if (!stateRef.current.play.cursor) return;
    const found = stateRef.current.steps.find((step) => step.scene === liveScene);
    setPlay((previous) =>
      found
        ? { cursor: found.id, startedAt: Date.now(), pausedAt: previous.pausedAt === null ? null : Date.now() }
        : STOPPED
    );
  }, [liveScene]);

  // Another admin device edited the list.
  useRealtimeChannel(OWY_STAGE_CHANNEL, (event, payload) => {
    if (event !== "rundown" || save.isPending) return;
    queryClient.setQueryData(orpc.owyStage.getRundown.queryKey(), (payload as { steps: RundownStep[] }).steps);
  });

  // One object per change of the list or the playhead, so what shows it can skip the renders in between.
  return useMemo(() => {
    const step = steps.find((item) => item.id === play.cursor) ?? null;
    const at = step ? steps.indexOf(step) : -1;

    return {
      steps,
      step,
      at,
      next: steps[at + 1] ?? (loop ? steps[0] : undefined),
      play,
      playing: play.cursor !== null && play.pausedAt === null,
      stopped: play.cursor === null,
      loop,
      setLoop,
      total: steps.reduce((sum, item) => sum + item.sec, 0),
      ...edit,
      go,
      skip,
      ...controls,
    };
  }, [steps, play, loop, edit, go, skip, controls]);
}

export type Rundown = ReturnType<typeof useRundown>;

/** The ticking part (seconds left, progress, finish time), only where it is drawn. */
export function useRundownClock(rundown: Rundown) {
  const { play, playing, step, steps, at, loop } = rundown;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    setNow(Date.now());
    if (!playing) return;
    const timer = setInterval(() => setNow(Date.now()), 250);

    return () => clearInterval(timer);
  }, [playing, play]);

  const elapsed = play.cursor ? ((play.pausedAt ?? now) - play.startedAt) / 1000 : 0;
  const left = step && step.sec > 0 ? Math.max(0, step.sec - elapsed) : null;
  const after = at < 0 ? steps : steps.slice(at + 1);
  // Only a finite, fully timed run has a finish time (a loop never ends and a `0` step waits for a human).
  const timed = after.every((item) => item.sec > 0) && (!step || step.sec > 0);
  const tail = (left ?? 0) + after.reduce((sum, item) => sum + item.sec, 0);

  return {
    elapsed,
    left,
    progress: step && step.sec > 0 ? Math.min(100, (elapsed / step.sec) * 100) : 0,
    endsAt: playing && !loop && timed ? new Date(now + tail * 1000) : null,
  };
}

/** 56 px of scene: the pre-rendered thumbnail, no live iframe (a list of iframes is not free). */
function Thumb({ scene, className }: { scene: SceneId; className?: string }) {
  return (
    <img
      alt=""
      className={cn("aspect-video shrink-0 rounded bg-black object-cover", className)}
      decoding="async"
      draggable={false}
      loading="lazy"
      src={`/owy-stage/thumbs/${scene}.jpg`}
    />
  );
}

/** The guion's controls in the admin header: always at hand, whatever tab is open below. */
export function RundownMiniPlayer({ rundown, onOpen }: { rundown: Rundown; onOpen: () => void }) {
  const { steps, step, at, playing, stopped } = rundown;
  const { left } = useRundownClock(rundown);

  return (
    <ButtonGroup className="hidden lg:flex">
      <Button
        className="h-9 gap-2 border border-input px-2.5 text-xs font-medium"
        title="Ver el guion"
        variant="ghost"
        onClick={onOpen}
      >
        <ListVideo className="h-4 w-4" />
        <span className="hidden xl:inline">Guion</span>
        <span className="font-terminal text-muted-foreground tabular-nums">
          {step ? `${at + 1}/${steps.length}${left !== null ? ` · ${mmss(left)}` : ""}` : `${steps.length} pasos`}
        </span>
      </Button>
      <Button
        aria-label={playing ? "Pausar el guion" : "Reproducir el guion"}
        className="h-9 w-9 border border-input"
        disabled={!steps.length}
        size="icon"
        variant="ghost"
        onClick={rundown.toggle}
      >
        {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
      </Button>
      {!stopped && (
        <Button
          aria-label="Paso siguiente del guion"
          className="h-9 w-9 border border-input"
          size="icon"
          variant="ghost"
          onClick={() => rundown.skip(1)}
        >
          <SkipForward className="h-4 w-4" />
        </Button>
      )}
    </ButtonGroup>
  );
}

function Step({
  step,
  index,
  active,
  live,
  liveParams,
  rundown,
}: {
  step: RundownStep;
  index: number;
  active: boolean;
  live: boolean;
  liveParams: Record<string, unknown>;
  rundown: Rundown;
}) {
  const controls = useDragControls();
  const pinned = Object.keys(step.params).length > 0;
  // Two steps of one scene (two presets of «Mensaje») tell themselves apart by what they say.
  const text = pinned ? paramText(step.scene, step.params) : null;

  return (
    <Reorder.Item
      className={cn(
        "relative flex items-center gap-2 overflow-hidden rounded-lg border bg-card px-2 py-1.5",
        active ? "border-primary bg-primary/10" : "hover:border-muted-foreground/40"
      )}
      dragControls={controls}
      dragListener={false}
      value={step}
      whileDrag={{ scale: 1.01, zIndex: 20, boxShadow: "0 8px 24px rgba(0,0,0,.35)" }}
      onDragEnd={rundown.persist}
    >
      <Button
        aria-label="Arrastrar para reordenar"
        className="h-9 w-5 cursor-grab touch-none text-muted-foreground active:cursor-grabbing"
        size="icon"
        variant="ghost"
        onPointerDown={(event) => controls.start(event)}
      >
        <GripVertical className="h-4 w-4" />
      </Button>
      <span className="hidden w-5 text-right text-xs text-muted-foreground tabular-nums @[30rem]:inline">
        {index + 1}
      </span>
      <Thumb className="hidden w-14 @[26rem]:block" scene={step.scene} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{SCENES[step.scene].title}</p>
        <p className="truncate text-xs text-muted-foreground">
          {text ? `«${text}»` : pinned ? "parámetros propios" : SCENES[step.scene].description}
        </p>
      </div>
      {live && !active && <span className={tallyChip("program")}>Al aire</span>}
      {active && <StepCountdown rundown={rundown} />}
      <div className="flex items-center gap-1">
        <Input
          aria-label="Segundos al aire"
          className="h-9 w-14 [appearance:textfield] px-1.5 text-center text-base tabular-nums sm:h-8 sm:text-xs pointer-coarse:h-10 pointer-coarse:sm:h-10 pointer-coarse:sm:text-base [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          max={7200}
          min={0}
          title="Segundos al aire · 0 = se queda hasta que pases de paso"
          type="number"
          value={step.sec}
          onChange={(event) =>
            rundown.patch(step.id, { sec: clampValue(Math.round(Number(event.target.value) || 0), 0, 7200) })
          }
        />
        <span className="text-xs text-muted-foreground @[30rem]:w-10">{step.sec === 0 ? "manual" : "s"}</span>
      </div>
      {/* With a mouse, three icons that explain themselves on hover; to a finger, one ⋯ with their names. */}
      <div className="hidden items-center pointer-fine:flex">
        <Button
          aria-label={pinned ? "Quitar los parámetros propios" : "Fijar los parámetros que están al aire"}
          className={cn("h-8 w-8", pinned && "text-primary")}
          disabled={!pinned && !live}
          size="icon"
          title={
            pinned
              ? "Quitar los parámetros propios (vuelve a los de la escena)"
              : "Fijar en este paso los parámetros que están al aire"
          }
          variant="ghost"
          onClick={() => rundown.patch(step.id, { params: pinned ? {} : liveParams })}
        >
          <Pin className="h-3.5 w-3.5" fill={pinned ? "currentColor" : "none"} />
        </Button>
        <Button
          aria-label="Arrancar desde este paso"
          className="h-8 w-8"
          size="icon"
          title="Arrancar desde este paso"
          variant="ghost"
          onClick={() => rundown.go(step.id)}
        >
          <Play className="h-3.5 w-3.5" />
        </Button>
        <Button
          aria-label="Quitar del guion"
          className="h-8 w-8 text-muted-foreground hover:text-destructive"
          size="icon"
          title="Quitar del guion"
          variant="ghost"
          onClick={() => rundown.remove(step.id)}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
      <ActionsMenuButton
        actions={() => [
          { label: "Arrancar desde este paso", icon: Play, tone: "air", onSelect: () => rundown.go(step.id) },
          {
            label: pinned ? "Quitar los parámetros propios" : "Fijar los parámetros que están al aire",
            icon: Pin,
            disabled: !pinned && !live,
            onSelect: () => rundown.patch(step.id, { params: pinned ? {} : liveParams }),
          },
          { label: "Quitar del guion", icon: X, tone: "danger", group: true, onSelect: () => rundown.remove(step.id) },
        ]}
        className="h-9 w-9 shrink-0 text-muted-foreground pointer-fine:hidden"
        label={`Más acciones para ${SCENES[step.scene].title}`}
        title={SCENES[step.scene].title}
      />
      {active && <StepProgress rundown={rundown} />}
    </Reorder.Item>
  );
}

function StepCountdown({ rundown }: { rundown: Rundown }) {
  const { left } = useRundownClock(rundown);
  if (left === null) return null;

  return <span className="text-xs font-semibold text-primary tabular-nums">{Math.ceil(left)}s</span>;
}

function StepProgress({ rundown }: { rundown: Rundown }) {
  const { progress } = useRundownClock(rundown);

  return (
    <span
      className="absolute bottom-0 left-0 h-0.5 bg-primary transition-[width] duration-200"
      style={{ width: `${progress}%` }}
    />
  );
}

function NowPlaying({ rundown }: { rundown: Rundown }) {
  const { step, next, steps, at, total } = rundown;
  const { left, endsAt } = useRundownClock(rundown);

  return (
    <div className="min-w-0 flex-1 text-sm">
      {step ? (
        <>
          <p className="truncate">
            <span className="text-muted-foreground">Paso {at + 1}: </span>
            <strong>{SCENES[step.scene].title}</strong>
            <span className="text-muted-foreground">
              {left !== null ? ` · ${Math.ceil(left)} s` : " · se queda hasta que pases"}
            </span>
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {next ? `Sigue: ${SCENES[next.scene].title}` : "Último paso"}
            {endsAt &&
              ` · termina ${endsAt.toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit", hour12: false })}`}
          </p>
        </>
      ) : (
        <p className="truncate text-muted-foreground">
          {steps.length
            ? `Detenido · ${steps.length} paso${steps.length === 1 ? "" : "s"}${total > 0 ? ` · ${mmss(total)} de vuelta` : ""}`
            : "Sin pasos todavía"}
        </p>
      )}
    </div>
  );
}

/**
 * The guion: drag the order, give each step its seconds, press play and the
 * wall walks it on its own (loop optional). Everything is saved on the server,
 * so any admin device edits the same list.
 */
function RundownPanelView({
  rundown,
  liveScene,
  liveParams,
}: {
  rundown: Rundown;
  liveScene: SceneId;
  liveParams: Record<string, unknown>;
}) {
  const { steps, step, playing, stopped, loop } = rundown;

  return (
    <div className="@container flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
        <Button
          className="h-10 min-w-[120px]"
          disabled={!steps.length}
          variant={playing ? "secondary" : "default"}
          onClick={rundown.toggle}
        >
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          {playing ? "Pausa" : stopped ? "Reproducir" : "Seguir"}
        </Button>
        <ButtonGroup>
          <Button
            aria-label="Paso anterior"
            className="h-10 w-10"
            disabled={!steps.length}
            size="icon"
            variant="outline"
            onClick={() => rundown.skip(-1)}
          >
            <SkipBack className="h-4 w-4" />
          </Button>
          <Button
            aria-label="Paso siguiente"
            className="h-10 w-10"
            disabled={!steps.length}
            size="icon"
            variant="outline"
            onClick={() => rundown.skip(1)}
          >
            <SkipForward className="h-4 w-4" />
          </Button>
          <Button
            aria-label="Detener (la pantalla se queda en la escena actual)"
            className="h-10 w-10"
            disabled={stopped}
            size="icon"
            variant="outline"
            onClick={rundown.stop}
          >
            <Square className="h-3.5 w-3.5" />
          </Button>
        </ButtonGroup>
        <Tooltip>
          <TooltipTrigger asChild>
            <label className="flex h-10 items-center gap-1.5 text-xs text-muted-foreground">
              <Repeat className="h-3.5 w-3.5" /> Loop
              <Switch checked={loop} onCheckedChange={rundown.setLoop} />
            </label>
          </TooltipTrigger>
          <TooltipContent>Volver al primer paso al terminar</TooltipContent>
        </Tooltip>
        <div className="flex min-w-0 basis-full items-center gap-2 @[36rem]:contents">
          <NowPlaying rundown={rundown} />
          {steps.length > 0 && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button className="h-10" size="sm" variant="ghost">
                  Vaciar
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>¿Vaciar el guion?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Se borran los {steps.length} pasos en todos los dispositivos. La pantalla se queda en la escena
                    actual.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction variant="destructive" onClick={rundown.clear}>
                    Vaciar
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {steps.length === 0 ? (
          <Empty
            className="h-full border-0"
            description="Para pausas y loops desatendidos: cada paso con sus segundos. Agregalos con «⋯ → Agregar al guion» en la biblioteca o en los presets."
            icon={ListVideo}
            title="El guion está vacío"
          />
        ) : (
          <Reorder.Group axis="y" className="space-y-1.5" values={steps} onReorder={rundown.reorder}>
            {steps.map((item, index) => (
              <Step
                key={item.id}
                active={item.id === step?.id}
                index={index}
                live={item.scene === liveScene}
                liveParams={liveParams}
                rundown={rundown}
                step={item}
              />
            ))}
          </Reorder.Group>
        )}
      </div>
    </div>
  );
}

export const RundownPanel = memo(RundownPanelView);
