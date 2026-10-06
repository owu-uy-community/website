"use client";

import { useState } from "react";
import { Reorder } from "motion/react";
import { Bookmark, Minus, Pause, Play, Plus, Square, Trash2, X } from "lucide-react";

import { OBS_CONFIG } from "app/lib/constants";
import { calculateProgressRing, clampValue, cn } from "app/lib/utils";
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

  return (
    <Reorder.Item
      className={cn(
        "relative flex w-40 shrink-0 cursor-grab flex-col gap-1.5 rounded-lg border-2 p-1.5 select-none active:cursor-grabbing sm:w-44",
        active ? "border-primary bg-primary/10" : "border-border bg-card hover:border-muted-foreground/40"
      )}
      value={item}
      whileDrag={{ scale: 1.04, zIndex: 50, boxShadow: "0 8px 24px rgba(0,0,0,.45)" }}
    >
      <div className="relative" onDoubleClick={onJump} title="Doble click: saltar a esta escena">
        <SceneThumbnail name={item.sceneName} />
        <div className="absolute top-1 right-1">
          {active && remaining !== null && (
            <svg aria-hidden className="absolute -inset-1 z-0 h-8 w-8" viewBox="0 0 32 32">
              <circle cx="16" cy="16" fill="white" r="14" stroke="rgba(34,197,94,.3)" strokeWidth="3" />
              <circle
                cx="16"
                cy="16"
                fill="none"
                r="14"
                stroke="rgb(34,197,94)"
                strokeDasharray={`${2 * Math.PI * 14}`}
                strokeDashoffset={calculateProgressRing(item.delay - remaining, item.delay, 14)}
                strokeLinecap="round"
                strokeWidth="3"
                style={{ transition: "stroke-dashoffset 0.3s linear" }}
                transform="rotate(-90 16 16)"
              />
            </svg>
          )}
          <Badge className="relative z-10 flex h-6 w-6 items-center justify-center rounded-full bg-white p-0 text-xs font-bold text-black shadow-lg">
            {index + 1}
          </Badge>
        </div>
        {active && (
          <span className="absolute top-1 left-1 rounded bg-primary px-1.5 py-0.5 text-[9px] font-bold tracking-wider text-black uppercase">
            {remaining !== null ? `${remaining}s` : "▶"}
          </span>
        )}
      </div>
      <div className="flex items-center gap-1">
        <span className={cn("min-w-0 flex-1 truncate text-xs font-semibold", active && "text-primary")}>
          {item.sceneName}
        </span>
        <button
          aria-label="Quitar del loop"
          className="rounded p-0.5 text-muted-foreground hover:bg-red-500/20 hover:text-red-200"
          type="button"
          onClick={onRemove}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="flex items-center justify-between rounded bg-black/30 px-1 py-0.5">
        <button
          aria-label="Menos tiempo"
          className="rounded p-0.5 hover:bg-white/10 disabled:opacity-30"
          disabled={item.delay <= OBS_CONFIG.delays.min}
          type="button"
          onClick={() => onDelay(item.delay - 1)}
        >
          <Minus className="h-3 w-3" />
        </button>
        {editing ? (
          <Input
            autoFocus
            className="h-5 w-14 border-0 bg-white p-0 text-center text-xs text-black"
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
            className="w-14 text-xs font-medium tabular-nums hover:underline"
            type="button"
            onClick={() => setEditing(true)}
          >
            {item.delay}s
          </button>
        )}
        <button
          aria-label="Más tiempo"
          className="rounded p-0.5 hover:bg-white/10 disabled:opacity-30"
          disabled={item.delay >= OBS_CONFIG.delays.max}
          type="button"
          onClick={() => onDelay(item.delay + 1)}
        >
          <Plus className="h-3 w-3" />
        </button>
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
          className="h-10"
          disabled={queueItems.length === 0 || directMode}
          variant={isPlaying ? "outline" : "default"}
          onClick={() => queue.setIsPlaying(!isPlaying)}
        >
          {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 fill-current" />}
          {isPlaying ? "Pausar" : "Reproducir"}
        </Button>
        <Button className="h-10" disabled={!isPlaying && currentItemIndex === 0} variant="outline" onClick={stop}>
          <Square className="h-4 w-4" /> Detener
        </Button>
        <label className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
          <Switch
            checked={directMode}
            onCheckedChange={(direct) => queue.update({ directMode: direct, ...(direct ? { isPlaying: false } : {}) })}
          />
          Directo (no rota)
        </label>
        <div className="ml-auto flex items-center gap-2">
          <Select value="" onValueChange={addScene}>
            <SelectTrigger className="h-9 w-52" disabled={view.scenes.length === 0}>
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
            className="h-9"
            disabled={queueItems.length === 0}
            size="sm"
            variant="ghost"
            onClick={() => {
              queue.setQueueItems([]);
              stop();
            }}
          >
            <Trash2 className="h-4 w-4" /> Vaciar
          </Button>
        </div>
      </div>

      {(isPlaying || queueItems.length > 0) && (
        <div className="flex items-center gap-4 rounded-lg border border-border bg-card px-3 py-2 text-sm">
          {isPlaying && current ? (
            <>
              <span className="flex items-center gap-2">
                <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
                <span className="font-medium">{current.sceneName}</span>
              </span>
              {isExecutor ? (
                <span className="text-muted-foreground">
                  <span className="font-terminal text-foreground">{remaining}s</span> para la siguiente
                </span>
              ) : (
                <span className="text-muted-foreground">rotando en el puesto de control</span>
              )}
              {progress !== null && (
                <span className="h-1.5 min-w-16 flex-1 overflow-hidden rounded-full bg-muted">
                  <span
                    className="block h-full bg-primary"
                    style={{ width: `${Math.round(progress * 100)}%`, transition: "width .3s linear" }}
                  />
                </span>
              )}
            </>
          ) : (
            <span className="text-muted-foreground">
              {directMode ? "Modo directo: la escena no rota." : "Loop en pausa."}
            </span>
          )}
          {drift && (
            <Badge className="border-amber-400/50 bg-amber-400/15 text-amber-100" variant="outline">
              OBS muestra otra escena
            </Badge>
          )}
          <span className="ml-auto text-xs text-muted-foreground">{queueItems.length} escenas en el loop</span>
        </div>
      )}

      {queueItems.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
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
      <div className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
        <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Presets</span>
        {presets.length === 0 && <span className="text-xs text-muted-foreground">ninguno guardado</span>}
        {presets.map((preset) => (
          <span key={preset.id} className="flex items-center">
            <Button
              className={cn("h-8 rounded-r-none", currentPreset === preset.id && "border-primary text-primary")}
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
              <span className="text-xs text-muted-foreground">{preset.items.length}</span>
            </Button>
            <Button
              className="h-8 w-8 rounded-l-none border-l-0"
              size="icon"
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
              <Trash2 className="h-3.5 w-3.5" />
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
            className="h-8 w-44"
            disabled={queueItems.length === 0}
            placeholder="Guardar loop como…"
            value={presetName}
            onChange={(event) => setPresetName(event.target.value)}
          />
          <Button
            className="h-8"
            disabled={!presetName.trim() || queueItems.length === 0}
            size="sm"
            type="submit"
            variant="outline"
          >
            <Bookmark className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}
