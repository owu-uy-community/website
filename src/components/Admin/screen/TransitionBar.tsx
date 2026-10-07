"use client";

import { Play, Scissors } from "lucide-react";

import { cn } from "app/lib/utils";
import { Button } from "components/shared/ui/button";
import { Input } from "components/shared/ui/input";
import { Kbd } from "components/shared/ui/kbd";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "components/shared/ui/select";
import type { ObsActions, ObsView } from "lib/obs/actions";

/** Transition picker + duration, CUT and TAKE. Big targets: this row is what gets hit on a tablet. */
export function TransitionBar({ view, actions }: { view: ObsView; actions: ObsActions }) {
  const ready = view.connected && view.studioMode && Boolean(view.preview);
  const fixed = view.transition === "Cut";
  const local = view.source === "local";

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3 sm:flex-row sm:items-center">
      <div className="flex flex-1 items-center gap-2">
        <Select disabled={!local} value={view.transition} onValueChange={(name) => void actions.setTransition(name)}>
          <SelectTrigger className="h-11 w-full sm:w-44">
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
        <div className="flex items-center gap-1">
          <Input
            className="h-11 w-24 text-right"
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
          <span className="text-xs text-muted-foreground">ms</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:w-96">
        <Button
          className="h-14 text-base font-bold tracking-wide"
          disabled={!ready}
          size="lg"
          variant="outline"
          onClick={() => void actions.cut()}
        >
          <Scissors className="h-5 w-5" /> CUT <Kbd className="ml-1">⌫</Kbd>
        </Button>
        <Button
          className={cn(
            "h-14 text-base font-bold tracking-wide",
            ready && "bg-red-600 text-white hover:bg-red-500",
            view.transitioning && "animate-pulse"
          )}
          disabled={!ready}
          size="lg"
          onClick={() => void actions.take()}
        >
          <Play className="h-5 w-5 fill-current" /> TAKE{" "}
          <Kbd className="ml-1 border-white/30 bg-white/20 text-white">↵</Kbd>
        </Button>
      </div>
      {!view.studioMode && view.connected && (
        <p className="text-xs text-muted-foreground sm:hidden">Activá Estudio para preview, CUT y TAKE.</p>
      )}
    </div>
  );
}
