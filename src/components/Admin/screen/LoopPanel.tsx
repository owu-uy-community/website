"use client";

import { useState } from "react";
import { Reorder, useDragControls } from "motion/react";
import { Bookmark, GripVertical, Minus, Pause, Play, Plus, Square, Trash2, X } from "lucide-react";

import { OBS_CONFIG } from "app/lib/constants";
import { calculateProgressRing, clampValue, cn } from "app/lib/utils";
import { MicroLabel, Meter } from "components/Admin/ui/page";
import { StatusDot } from "components/Admin/ui/status";
import { Badge } from "components/shared/ui/badge";
import { Button } from "components/shared/ui/button";
import { Input } from "components/shared/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "components/shared/ui/select";
import { Switch } from "components/shared/ui/switch";
import type { QueueItem, useObsQueue } from "hooks/useObsQueue";
import type { ObsView } from "lib/obs/actions";

import { SceneThumbnail } from "./SceneBus";

type Queue = ReturnType<typeof useObsQueue>;

/** One card in the strip: preview, position (with the countdown ring while it plays), delay ± and remove. */
function QueueCard({
  item,
  index,
  active,
  remaining,
  onDelay,
  onRemove,
  onJump,
}: {
  item: QueueItem;
  index: number;
  active: boolean;
  remaining: number | null;
  onDelay: (delay: number) => void;
  onRemove: () => void;
  onJump: () => void;
}) {
  const [editing, setEditing] = useState(false);
  // Only the grip drags: a finger swiping across the strip scrolls it.
  const controls = useDragControls();

  return (
    <Reorder.Item
      className={cn(
        "relative flex w-40 shrink-0 flex-col gap-1.5 rounded-lg border-2 p-1.5 select-none sm:w-44",
        active ? "border-primary bg-primary-surface" : "border-border bg-card hover:border-input"
      )}
      dragControls={controls}
      dragListener={false}
      value={item}
      whileDrag={{ scale: 1.04, zIndex: 50, boxShadow: "0 8px 24px rgba(0,0,0,.45)" }}
    >
      <div className="relative" onDoubleClick={onJump} title="Doble click: saltar a esta escena">
        <SceneThumbnail name={item.sceneName} />
        <div className="absolute top-1 right-1">
          {active && remaining !== null && (
            <svg aria-hidden className="absolute -inset-1 z-0 h-8 w-8" viewBox="0 0 32 32">
              <circle className="stroke-success/30" cx="16" cy="16" fill="white" r="14" strokeWidth="3" />
              <circle
                className="stroke-success"
                cx="16"
                cy="16"
                fill="none"
                r="14"
                strokeDasharray={`${2 * Math.PI * 14}`}
                strokeDashoffset={calculateProgressRing(item.delay - remaining, item.delay, 14)}
                strokeLinecap="round"
                strokeWidth="3"
                style={{ transition: "stroke-dashoffset 0.3s linear" }}
                transform="rotate(-90 16 16)"
              />
            </svg>
          )}
          <Badge className="relative z-10 flex size-6 items-center justify-center rounded-full border-0 bg-white p-0 font-terminal text-2xs font-semibold text-black shadow-lg">
            {index + 1}
          </Badge>
        </div>
        {active ? (
          <span className="absolute top-1 left-1 rounded-sm bg-primary px-1.5 py-0.5 font-terminal text-3xs font-semibold text-primary-foreground tabular-nums">
            {remaining !== null ? `${remaining} s` : "▶"}
          </span>
        ) : (
          // A touchscreen has no double click: the same jump, as a button.
          <button
            aria-label={`Saltar a ${item.sceneName}`}
            className="absolute top-1 left-1 hidden items-center gap-1 rounded-sm bg-black/70 px-1.5 py-0.5 font-terminal text-3xs font-semibold text-white pointer-coarse:flex pointer-coarse:after:absolute pointer-coarse:after:-inset-3.5"
            type="button"
            onClick={onJump}
          >
            <Play aria-hidden className="size-2.5 fill-current" />
            Saltar
          </button>
        )}
      </div>
      <div className="flex items-center gap-1">
        <button
          aria-label={`Mover ${item.sceneName}`}
          className="relative cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing pointer-coarse:after:absolute pointer-coarse:after:-inset-3.5"
          type="button"
          onPointerDown={(event) => controls.start(event)}
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
        <span className={cn("min-w-0 flex-1 truncate text-meta font-semibold", active && "text-primary")}>
          {item.sceneName}
        </span>
        <Button
          aria-label="Quitar del loop"
          className="text-muted-foreground hover:bg-live-surface hover:text-live-foreground"
          size="icon-xs"
          variant="ghost"
          onClick={onRemove}
        >
          <X />
        </Button>
      </div>
      <div className="flex items-center justify-between rounded-sm bg-background px-1 py-0.5">
        <Button
          aria-label="Menos tiempo"
          className="size-5 disabled:opacity-30"
          disabled={item.delay <= OBS_CONFIG.delays.min}
          size="icon-xs"
          variant="ghost"
          onClick={() => onDelay(item.delay - 1)}
        >
          <Minus />
        </Button>
        {editing ? (
          <Input
            autoFocus
            className="h-5 w-14 border-0 p-0 text-center font-terminal text-2xs sm:h-5 pointer-coarse:sm:h-5"
            defaultValue={item.delay}
            max={OBS_CONFIG.delays.max}
            min={OBS_CONFIG.delays.min}
            type="number"
            onBlur={(event) => {
              onDelay(Number(event.target.value) || item.delay);
              setEditing(false);
            }}
            onKeyDown={(event) => event.key === "Enter" && (event.target as HTMLInputElement).blur()}
            onPointerDown={(event) => event.stopPropagation()}
          />
        ) : (
          <button
            className="w-14 font-terminal text-2xs tabular-nums hover:underline pointer-coarse:h-8"
            type="button"
            onClick={() => setEditing(true)}
          >
            {item.delay} s
          </button>
        )}
        <Button
          aria-label="Más tiempo"
          className="size-5 disabled:opacity-30"
          disabled={item.delay >= OBS_CONFIG.delays.max}
          size="icon-xs"
          variant="ghost"
          onClick={() => onDelay(item.delay + 1)}
        >
          <Plus />
        </Button>
      </div>
    </Reorder.Item>
  );
}

/**
 * The automatic loop: a strip of scene cards with a delay each, presets to
 * save/load it, play/pause/stop and a status bar. The executor tab runs the
 * timer (see useObsLoop); everyone edits the same server-side queue.
 */
export function LoopPanel({
  queue,
  remaining,
  isExecutor,
  view,
}: {
  queue: Queue;
  remaining: number;
  isExecutor: boolean;
  view: ObsView;
}) {
  const { queueItems, isPlaying, currentItemIndex, directMode, presets, currentPreset } = queue.state;
  const [presetName, setPresetName] = useState("");
  const current = queueItems[currentItemIndex];
  const drift = isPlaying && isExecutor && current && view.program && view.program !== current.sceneName;
  const progress = current && isExecutor && current.delay > 0 ? 1 - remaining / current.delay : null;

  const setDelay = (id: string, delay: number) => {
    const clamped = clampValue(delay, OBS_CONFIG.delays.min, OBS_CONFIG.delays.max);
    queue.setQueueItems(queueItems.map((q) => (q.id === id ? { ...q, delay: clamped } : q)));
  };
  const addScene = (sceneName: string) => {
    if (queueItems.some((item) => item.sceneName === sceneName)) return;
    queue.setQueueItems([
      ...queueItems,
      { id: `queue-${Date.now()}-${sceneName}`, sceneName, delay: OBS_CONFIG.delays.default },
    ]);
  };
  const stop = () => queue.update({ isPlaying: false, currentItemIndex: 0 });

  return (
    <div className="min-w-0 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          disabled={queueItems.length === 0 || directMode}
          variant="outline"
          onClick={() => queue.setIsPlaying(!isPlaying)}
        >
          {isPlaying ? <Pause /> : <Play className="fill-current" />}
          {isPlaying ? "Pausar" : "Reproducir"}
        </Button>
        <Button disabled={!isPlaying && currentItemIndex === 0} variant="outline" onClick={stop}>
          <Square /> Detener
        </Button>
        <label className="flex h-8 cursor-pointer items-center gap-2 rounded-md border border-input px-2.5 text-ui">
          <Switch
            checked={directMode}
            onCheckedChange={(direct) => queue.update({ directMode: direct, ...(direct ? { isPlaying: false } : {}) })}
          />
          Directo (no rota)
        </label>
        <div className="ml-auto flex items-center gap-2">
          <Select value="" onValueChange={addScene}>
            <SelectTrigger aria-label="Agregar una escena al loop" className="w-52" disabled={view.scenes.length === 0}>
              <SelectValue placeholder={view.scenes.length ? "+ Agregar escena" : "Conectate a OBS"} />
            </SelectTrigger>
            <SelectContent>
              {view.scenes
                .filter((name) => !queueItems.some((item) => item.sceneName === name))
                .map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <Button
            disabled={queueItems.length === 0}
            size="sm"
            variant="ghost"
            onClick={() => {
              queue.setQueueItems([]);
              stop();
            }}
          >
            <Trash2 /> Vaciar
          </Button>
        </div>
      </div>

      {(isPlaying || queueItems.length > 0) && (
        <div className="flex items-center gap-4 rounded-lg border border-border bg-background px-3 py-2 text-ui">
          {isPlaying && current ? (
            <>
              <span className="flex items-center gap-2">
                <StatusDot tone="live" />
                <span className="font-medium">{current.sceneName}</span>
              </span>
              {isExecutor ? (
                <span className="text-muted-foreground">
                  <span className="font-terminal text-foreground tabular-nums">{remaining} s</span> para la siguiente
                </span>
              ) : (
                <span className="text-muted-foreground">rotando en el puesto de control</span>
              )}
              {progress !== null && <Meter className="min-w-16 flex-1" value={Math.round(progress * 100)} />}
            </>
          ) : (
            <span className="text-muted-foreground">
              {directMode ? "Modo directo: la escena no rota." : "Loop en pausa."}
            </span>
          )}
          {drift && <Badge variant="warning">OBS muestra otra escena</Badge>}
          <span className="ml-auto font-terminal text-meta whitespace-nowrap text-muted-foreground tabular-nums">
            {queueItems.length} en el loop
          </span>
        </div>
      )}

      {queueItems.length === 0 ? (
        <p className="rounded-lg border border-dashed border-input p-4 text-center text-meta text-muted-foreground">
          Agregá escenas con el + de cada tarjeta (o el selector) para armar una rotación automática: sponsors, avisos…
        </p>
      ) : (
        <Reorder.Group
          axis="x"
          className="flex gap-2 overflow-x-auto pb-2"
          layoutScroll
          values={queueItems}
          onReorder={(items: QueueItem[]) => queue.setQueueItems(items)}
        >
          {queueItems.map((item, index) => (
            <QueueCard
              key={item.id}
              active={isPlaying && index === currentItemIndex}
              index={index}
              item={item}
              remaining={isExecutor ? remaining : null}
              onDelay={(delay) => setDelay(item.id, delay)}
              onJump={() => queue.setCurrentItemIndex(index)}
              onRemove={() => queue.setQueueItems(queueItems.filter((q) => q.id !== item.id))}
            />
          ))}
        </Reorder.Group>
      )}
      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <MicroLabel>Presets</MicroLabel>
        {presets.length === 0 && <span className="text-meta text-muted-foreground">ninguno guardado</span>}
        {presets.map((preset) => (
          <span key={preset.id} className="flex items-center">
            <Button
              className={cn("rounded-r-none", currentPreset === preset.id && "border-primary/40 text-primary")}
              size="sm"
              title={preset.items.map((item) => item.sceneName).join(" → ")}
              variant="outline"
              onClick={() =>
                queue.update({
                  queueItems: preset.items.map((item, position) => ({ ...item, position })),
                  currentPreset: preset.id,
                  currentItemIndex: 0,
                  isPlaying: false,
                })
              }
            >
              {preset.name}
              <span className="font-terminal text-muted-foreground tabular-nums">{preset.items.length}</span>
            </Button>
            <Button
              aria-label={`Eliminar el preset ${preset.name}`}
              className="rounded-l-none border-l-0"
              size="icon-sm"
              title="Eliminar preset"
              variant="outline"
              onClick={() => {
                if (!window.confirm(`¿Eliminar el preset "${preset.name}"?`)) return;
                queue.update({
                  presets: presets.filter((p) => p.id !== preset.id),
                  ...(currentPreset === preset.id ? { currentPreset: "" } : {}),
                });
              }}
            >
              <Trash2 />
            </Button>
          </span>
        ))}
        <form
          className="ml-auto flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const name = presetName.trim();
            if (!name || queueItems.length === 0) return;
            queue.setPresets([
              ...presets,
              { id: `preset-${Date.now()}`, name, items: queueItems.map((item, position) => ({ ...item, position })) },
            ]);
            setPresetName("");
          }}
        >
          <Input
            aria-label="Nombre del preset"
            className="h-7 w-44 sm:h-7 pointer-coarse:h-10"
            disabled={queueItems.length === 0}
            placeholder="Guardar loop como…"
            value={presetName}
            onChange={(event) => setPresetName(event.target.value)}
          />
          <Button
            aria-label="Guardar el loop como preset"
            disabled={!presetName.trim() || queueItems.length === 0}
            size="icon-sm"
            type="submit"
            variant="outline"
          >
            <Bookmark />
          </Button>
        </form>
      </div>
    </div>
  );
}
