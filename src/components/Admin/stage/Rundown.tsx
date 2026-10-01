"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Reorder, useDragControls } from "motion/react";
import { GripVertical, ListVideo, Pause, Pin, Play, Repeat, SkipBack, SkipForward, Square, X } from "lucide-react";

import { clampValue, cn } from "app/lib/utils";
import { Badge } from "components/shared/ui/badge";
import { Button } from "components/shared/ui/button";
import { Card, CardContent } from "components/shared/ui/card";
import { Input } from "components/shared/ui/input";
import { Switch } from "components/shared/ui/switch";
import { toast } from "components/shared/ui/toast-utils";
import { useRealtimeChannel } from "hooks/useRealtimeChannel";
import { orpc } from "lib/orpc";
import { OWY_STAGE_CHANNEL, SCENES, type RundownStep, type SceneId } from "lib/owy-stage/scenes";

const DEFAULT_SEC = 20;
const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;

/** Where the player is. Local to this browser: the tab you press play in drives the wall. */
type Playhead = { cursor: string | null; startedAt: number; pausedAt: number | null };
const STOPPED: Playhead = { cursor: null, startedAt: 0, pausedAt: null };

/**
 * The rundown player: the ordered list of takes with the seconds each one
 * stays up, and the clock that walks it.
 *
 * ponytail: the clock lives in this tab (like the OBS loop), so closing it
 * leaves the wall on the current scene instead of advancing. Move the schedule
 * into the stage state if the wall ever has to run unattended.
 */
export function useRundown(take: (scene: SceneId, params?: Record<string, unknown>) => void, liveScene: SceneId) {
  const queryClient = useQueryClient();
  const key = orpc.owyStage.getRundown.queryKey();
  const { data } = useQuery(orpc.owyStage.getRundown.queryOptions({ staleTime: 60_000 }));
  const steps = data ?? [];

  const save = useMutation(
    orpc.owyStage.saveRundown.mutationOptions({
      onError: (error) => {
        toast.error("No se pudo guardar el guion", error.message);
        queryClient.invalidateQueries({ queryKey: key });
      },
    })
  );

  const [play, setPlay] = useState<Playhead>(STOPPED);
  // Always the caller's latest `take`, so the clock below never rebuilds itself.
  const takeRef = useRef(take);
  takeRef.current = take;
  const [loop, setLoop] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const playing = play.cursor !== null && play.pausedAt === null;
  // Interval callbacks and drag handlers read the live values from here instead
  // of from a closure, so neither needs to be rebuilt on every render.
  const stateRef = useRef({ steps, play });
  stateRef.current = { steps, play };
  /** The scene our own take put on air, so the sync below can tell it apart from someone else's. */
  const expected = useRef<SceneId | null>(null);

  // --- editing -------------------------------------------------------------
  /** Reordering only touches the cache; `persist` writes what the drag left behind. */
  const reorder = (next: RundownStep[]) => queryClient.setQueryData(key, next);
  const persist = () => save.mutate({ steps: stateRef.current.steps });
  const write = (next: RundownStep[]) => {
    reorder(next);
    save.mutate({ steps: next });
  };
  const add = (scene: SceneId, params: Record<string, unknown> = {}) => {
    write([...steps, { id: newId(), scene, sec: DEFAULT_SEC, params }]);
    toast.success("Al guion", SCENES[scene].title);
  };
  const patch = (id: string, change: Partial<RundownStep>) =>
    write(steps.map((step) => (step.id === id ? { ...step, ...change } : step)));
  const remove = (id: string) => write(steps.filter((step) => step.id !== id));
  const clear = () => {
    if (steps.length && !window.confirm(`¿Vaciar el guion? (${steps.length} pasos)`)) return;
    setPlay(STOPPED);
    write([]);
  };

  // --- playback ------------------------------------------------------------
  const go = useCallback((id: string) => {
    const step = stateRef.current.steps.find((item) => item.id === id);
    if (!step) return;
    expected.current = step.scene;
    takeRef.current(step.scene, step.params);
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
  const toggle = () => (playing ? pause() : start());

  // One interval does both jobs: redraw the countdown and cross the boundary.
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => {
      const { steps: list, play: current } = stateRef.current;
      const step = list.find((item) => item.id === current.cursor);
      if (!step) return setPlay(STOPPED);
      if (step.sec > 0 && Date.now() - current.startedAt >= step.sec * 1000) skip(1);
      setNow(Date.now());
    }, 250);

    return () => clearInterval(timer);
  }, [playing, skip]);

  // The countdown is drawn from `now`, which only moves while the clock runs:
  // refresh it on every transition so a resume never paints a stale number.
  useEffect(() => setNow(Date.now()), [play]);

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
    queryClient.setQueryData(key, (payload as { steps: RundownStep[] }).steps);
  });

  const step = steps.find((item) => item.id === play.cursor) ?? null;
  const at = step ? steps.indexOf(step) : -1;
  const elapsed = play.cursor ? ((play.pausedAt ?? now) - play.startedAt) / 1000 : 0;
  const after = at < 0 ? steps : steps.slice(at + 1);
  const left = step && step.sec > 0 ? Math.max(0, step.sec - elapsed) : null;
  // Only an all-timed tail has a finish time; a `0` step waits for a human.
  const tail = (left ?? 0) + after.reduce((sum, item) => sum + item.sec, 0);
  const timed = after.every((item) => item.sec > 0) && (!step || step.sec > 0);

  return {
    steps,
    step,
    at,
    next: steps[at + 1] ?? (loop ? steps[0] : undefined),
    left,
    elapsed,
    playing,
    stopped: play.cursor === null,
    loop,
    setLoop,
    total: steps.reduce((sum, item) => sum + item.sec, 0),
    // Only a finite, fully timed run has a finish time (a loop never ends and a `0` step waits for a human).
    endsAt: playing && !loop && timed ? new Date(Date.now() + tail * 1000) : null,
    add,
    patch,
    remove,
    clear,
    reorder,
    persist,
    go,
    skip,
    start,
    pause,
    stop,
    toggle,
  };
}

export type Rundown = ReturnType<typeof useRundown>;

/** 56 px of scene: the pre-rendered thumbnail, no hover preview (a list of iframes is not free). */
function Thumb({ scene, className }: { scene: SceneId; className?: string }) {
  return (
    <img
      alt=""
      className={cn("aspect-video shrink-0 rounded bg-black object-cover", className)}
      decoding="async"
      loading="lazy"
      src={`/owy-stage/thumbs/${scene}.jpg`}
    />
  );
}

function Step({
  step,
  index,
  active,
  progress,
  left,
  live,
  liveParams,
  rundown,
}: {
  step: RundownStep;
  index: number;
  active: boolean;
  progress: number;
  left: number | null;
  live: boolean;
  liveParams: Record<string, unknown>;
  rundown: Rundown;
}) {
  const controls = useDragControls();
  const pinned = Object.keys(step.params).length > 0;

  return (
    <Reorder.Item
      className={cn(
        "bg-card relative flex items-center gap-2 overflow-hidden rounded-lg border px-2 py-1.5",
        active ? "border-[#F5BB03] bg-[#F5BB03]/10" : "hover:border-muted-foreground/40"
      )}
      dragControls={controls}
      dragListener={false}
      value={step}
      whileDrag={{ scale: 1.01, zIndex: 20, boxShadow: "0 8px 24px rgba(0,0,0,.35)" }}
      onDragEnd={rundown.persist}
    >
      <button
        aria-label="Arrastrar para reordenar"
        className="text-muted-foreground hover:text-foreground cursor-grab touch-none active:cursor-grabbing"
        type="button"
        onPointerDown={(event) => controls.start(event)}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <span className="text-muted-foreground w-5 text-right text-xs tabular-nums">{index + 1}</span>
      <Thumb className="w-14" scene={step.scene} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{SCENES[step.scene].title}</p>
        <p className="text-muted-foreground truncate text-xs">
          {pinned ? "parámetros propios" : SCENES[step.scene].description}
        </p>
      </div>
      {live && !active && <Badge className="bg-red-600 text-white hover:bg-red-600">AL AIRE</Badge>}
      {active && left !== null && (
        <span className="text-xs font-semibold text-[#F5BB03] tabular-nums">{Math.ceil(left)}s</span>
      )}
      <div className="flex items-center gap-1">
        <Input
          className="h-7 w-14 text-center text-xs tabular-nums"
          max={7200}
          min={0}
          title="Segundos al aire · 0 = se queda hasta que pases de paso"
          type="number"
          value={step.sec}
          onChange={(event) =>
            rundown.patch(step.id, { sec: clampValue(Math.round(Number(event.target.value) || 0), 0, 7200) })
          }
        />
        <span className="text-muted-foreground text-xs">{step.sec === 0 ? "manual" : "s"}</span>
      </div>
      <Button
        className={cn("h-7 w-7", pinned && "text-[#F5BB03]")}
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
        className="h-7 w-7"
        size="icon"
        title="Arrancar desde este paso"
        variant="ghost"
        onClick={() => rundown.go(step.id)}
      >
        <Play className="h-3.5 w-3.5" />
      </Button>
      <Button
        className="text-muted-foreground hover:text-destructive h-7 w-7"
        size="icon"
        title="Quitar del guion"
        variant="ghost"
        onClick={() => rundown.remove(step.id)}
      >
        <X className="h-3.5 w-3.5" />
      </Button>
      {active && (
        <span
          className="absolute bottom-0 left-0 h-0.5 bg-[#F5BB03] transition-[width] duration-200"
          style={{ width: `${progress}%` }}
        />
      )}
    </Reorder.Item>
  );
}

/**
 * The guion: drag the order, give each step its seconds, press play and the
 * wall walks it on its own (loop optional). Everything is saved on the server,
 * so any admin device edits the same list.
 */
export function RundownCard({
  rundown,
  liveScene,
  liveParams,
}: {
  rundown: Rundown;
  liveScene: SceneId;
  liveParams: Record<string, unknown>;
}) {
  const { steps, step, playing, stopped, left, next, loop, total, endsAt } = rundown;

  // Space plays/pauses, arrows step. Skipped while typing or with a button
  // focused, where the browser already gives Space and Enter a meaning.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable) return;
      if (event.key === " " && tag !== "BUTTON") {
        event.preventDefault();
        rundown.toggle();
      }
      if (event.key === "ArrowRight") rundown.skip(1);
      if (event.key === "ArrowLeft") rundown.skip(-1);
    };
    window.addEventListener("keydown", onKey);

    return () => window.removeEventListener("keydown", onKey);
  }, [rundown]);

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <ListVideo className="h-5 w-5" />
          <h2 className="font-display text-lg font-semibold">Guion</h2>
          <span className="text-muted-foreground text-xs">
            {steps.length} paso{steps.length === 1 ? "" : "s"}
            {total > 0 && ` · ${mmss(total)} de vuelta`}
            {endsAt &&
              ` · termina ${endsAt.toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit", hour12: false })}`}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-muted-foreground hidden text-xs xl:inline">Espacio: play/pausa · ← →: pasos</span>
            <label
              className="text-muted-foreground flex items-center gap-1.5 text-xs"
              title="Volver al primer paso al terminar"
            >
              <Repeat className="h-3.5 w-3.5" /> Loop
              <Switch checked={loop} onCheckedChange={rundown.setLoop} />
            </label>
            {steps.length > 0 && (
              <Button size="sm" variant="ghost" onClick={rundown.clear}>
                Vaciar
              </Button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            className="h-11 min-w-[130px] text-base"
            disabled={!steps.length}
            size="lg"
            variant={playing ? "secondary" : "default"}
            onClick={rundown.toggle}
          >
            {playing ? <Pause className="mr-1.5 h-5 w-5" /> : <Play className="mr-1.5 h-5 w-5" />}
            {playing ? "Pausa" : stopped ? "Reproducir" : "Seguir"}
          </Button>
          <Button
            className="h-11 w-11"
            disabled={!steps.length}
            size="icon"
            title="Paso anterior (←)"
            variant="outline"
            onClick={() => rundown.skip(-1)}
          >
            <SkipBack className="h-5 w-5" />
          </Button>
          <Button
            className="h-11 w-11"
            disabled={!steps.length}
            size="icon"
            title="Paso siguiente (→)"
            variant="outline"
            onClick={() => rundown.skip(1)}
          >
            <SkipForward className="h-5 w-5" />
          </Button>
          <Button
            className="h-11 w-11"
            disabled={stopped}
            size="icon"
            title="Detener (la pantalla se queda en la escena actual)"
            variant="outline"
            onClick={rundown.stop}
          >
            <Square className="h-4 w-4" />
          </Button>

          <div className="ml-1 min-w-0 flex-1 text-sm">
            {step ? (
              <>
                <p className="truncate">
                  <span className="text-muted-foreground">Paso {rundown.at + 1}: </span>
                  <strong>{SCENES[step.scene].title}</strong>
                  {left !== null ? (
                    <span className="text-muted-foreground"> · {Math.ceil(left)} s</span>
                  ) : (
                    <span className="text-muted-foreground"> · se queda hasta que pases</span>
                  )}
                </p>
                {next && <p className="text-muted-foreground truncate text-xs">Sigue: {SCENES[next.scene].title}</p>}
              </>
            ) : (
              <p className="text-muted-foreground">
                {steps.length
                  ? "Detenido. Reproducir arranca desde el primer paso."
                  : "Armá el orden del día con «+» en las escenas de abajo."}
              </p>
            )}
          </div>
          {next && <Thumb className="w-20 opacity-70" scene={next.scene} />}
        </div>

        {steps.length > 0 && (
          <Reorder.Group axis="y" className="space-y-1.5" values={steps} onReorder={rundown.reorder}>
            {steps.map((item, index) => (
              <Step
                key={item.id}
                active={item.id === step?.id}
                index={index}
                left={item.id === step?.id ? left : null}
                live={item.scene === liveScene}
                liveParams={liveParams}
                progress={item.sec > 0 ? Math.min(100, (rundown.elapsed / item.sec) * 100) : 0}
                rundown={rundown}
                step={item}
              />
            ))}
          </Reorder.Group>
        )}
      </CardContent>
    </Card>
  );
}
