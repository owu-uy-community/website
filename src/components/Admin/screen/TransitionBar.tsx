"use client";

import { Play, Scissors } from "lucide-react";

import { cn } from "app/lib/utils";
import { Button } from "components/shared/ui/button";
import { Input } from "components/shared/ui/input";
import { Kbd } from "components/shared/ui/kbd";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "components/shared/ui/select";
import { Switch } from "components/shared/ui/switch";
import type { ObsActions, ObsView } from "lib/obs/actions";

import { releaseFocus } from "./SceneBus";

/**
 * Studio mode, the transition and its duration, CUT and TAKE. Big targets: this row is what gets
 * hit on a tablet. TAKE is the page's one yellow button; CUT is neutral.
 */
export function TransitionBar({ view, actions }: { view: ObsView; actions: ObsActions }) {
  const ready = view.connected && view.studioMode && Boolean(view.preview);
  const fixed = view.transition === "Cut";
  const local = view.source === "local";

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3 shadow-edge sm:flex-row sm:items-center">
      <div className="flex flex-1 flex-wrap items-center gap-2">
        <label
          className={cn(
            "flex h-10 cursor-pointer items-center gap-2.5 rounded-md border border-input bg-raised px-3 text-ui shadow-edge",
            !view.connected && "cursor-not-allowed opacity-50"
          )}
        >
          <span
            className={cn(view.pending.studio !== undefined && "text-warning-foreground motion-safe:animate-pulse")}
          >
            Estudio
          </span>
          <Switch
            checked={view.studioMode}
            disabled={!view.connected}
            onCheckedChange={(enabled) => void actions.setStudioMode(enabled)}
          />
          <Kbd className="pointer-coarse:hidden">S</Kbd>
        </label>
        <Select disabled={!local} value={view.transition} onValueChange={(name) => void actions.setTransition(name)}>
          <SelectTrigger aria-label="Transición" className="h-10 w-40">
            <SelectValue placeholder="Transición" />
          </SelectTrigger>
          <SelectContent>
            {view.transitions.map((name) => (
              <SelectItem key={name} value={name}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label className="flex items-center gap-1.5 text-meta text-muted-foreground">
          <Input
            aria-label="Duración de la transición en milisegundos"
            className="h-10 w-20 text-right font-terminal tabular-nums sm:h-10"
            defaultValue={view.transitionMs}
            disabled={!local || fixed}
            inputMode="numeric"
            key={view.transitionMs}
            min={0}
            step={50}
            type="number"
            onBlur={(event) => {
              const value = Number(event.target.value);
              if (Number.isFinite(value) && value !== view.transitionMs) void actions.setTransition(undefined, value);
            }}
            onKeyDown={(event) => event.key === "Enter" && (event.target as HTMLInputElement).blur()}
          />
          ms
        </label>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:w-96">
        <Button
          className="h-14 text-base font-bold tracking-[0.12em]"
          disabled={!ready}
          size="lg"
          variant="outline"
          onClick={(event) => {
            releaseFocus(event);
            void actions.cut();
          }}
        >
          <Scissors className="size-5" /> CUT <Kbd className="ml-1 pointer-coarse:hidden">⌫</Kbd>
        </Button>
        <Button
          className={cn(
            "h-14 text-base font-bold tracking-[0.12em]",
            view.transitioning && "motion-safe:animate-pulse"
          )}
          disabled={!ready}
          size="lg"
          onClick={(event) => {
            releaseFocus(event);
            void actions.take();
          }}
        >
          <Play className="size-5 fill-current" /> TAKE <Kbd className="ml-1 pointer-coarse:hidden">↵</Kbd>
        </Button>
      </div>
      {!view.studioMode && view.connected && (
        <p className="text-meta text-muted-foreground sm:hidden">Activá Estudio para preview, CUT y TAKE.</p>
      )}
    </div>
  );
}
