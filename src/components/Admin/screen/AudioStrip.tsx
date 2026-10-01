"use client";

import { useState } from "react";
import { Mic, MicOff, SlidersHorizontal } from "lucide-react";

import { cn } from "app/lib/utils";
import { Button } from "components/shared/ui/button";
import { Kbd } from "components/shared/ui/kbd";
import { Slider } from "components/shared/ui/slider";
import type { ObsActions, ObsView } from "lib/obs/actions";
import { useObsLevels } from "lib/obs/client";

const SEGMENTS = 20;

/** A 20-segment peak meter driven by OBS's InputVolumeMeters (green → amber → red). */
function Meter({ level, muted }: { level: number; muted: boolean }) {
  const lit = Math.round(level * SEGMENTS);

  return (
    <div className="flex h-3 flex-1 items-stretch gap-px" aria-hidden>
      {Array.from({ length: SEGMENTS }, (_, i) => {
        const on = i < lit && !muted;
        const tone = i >= SEGMENTS - 2 ? "bg-red-500" : i >= SEGMENTS - 6 ? "bg-amber-400" : "bg-green-500";

        return <span key={i} className={cn("flex-1 rounded-[1px]", on ? tone : "bg-muted")} />;
      })}
    </div>
  );
}

function Fader({ name, db, onCommit }: { name: string; db: number; onCommit: (db: number) => void }) {
  const [value, setValue] = useState(db);

  return (
    <div className="flex items-center gap-2 pr-1 pl-9">
      <Slider
        aria-label={`Volumen ${name}`}
        max={0}
        min={-60}
        step={0.5}
        value={[value]}
        onValueChange={([v]) => setValue(v ?? value)}
        onValueCommit={([v]) => onCommit(v ?? value)}
      />
      <span className="font-terminal text-muted-foreground w-14 text-right text-xs">
        {value <= -60 ? "-inf" : `${value.toFixed(1)} dB`}
      </span>
    </div>
  );
}

/** Every audio input in OBS: mute (confirmed by event), live meter, optional fader. */
export function AudioStrip({ view, actions }: { view: ObsView; actions: ObsActions }) {
  const levels = useObsLevels();
  const [open, setOpen] = useState<Record<string, boolean>>({});

  if (!view.connected) return <p className="text-muted-foreground text-xs">Sin conexión a OBS.</p>;
  if (view.inputs.length === 0) return <p className="text-muted-foreground text-xs">OBS no tiene fuentes de audio.</p>;

  return (
    <div className="space-y-2">
      {view.inputs.map((input, index) => {
        const pending = view.pending[`mute:${input.name}`] !== undefined;

        return (
          <div key={input.name} className="space-y-1">
            <div className="flex items-center gap-2">
              <Button
                className={cn(
                  "h-8 w-8 shrink-0",
                  input.muted && "border-red-500/60 bg-red-500/20 text-red-100 hover:bg-red-500/30",
                  pending && "animate-pulse border-amber-400"
                )}
                size="icon"
                title={input.muted ? "Activar" : "Mutear"}
                variant="outline"
                onClick={() => void actions.setMute(input.name)}
              >
                {input.muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </Button>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className={cn("truncate text-xs font-medium", input.muted && "text-red-200 line-through")}>
                    {input.name}
                  </span>
                  <span className="flex items-center gap-1">
                    {index === 0 && <Kbd>M</Kbd>}
                    {input.volumeDb !== null && (
                      <button
                        className="text-muted-foreground hover:text-foreground"
                        title="Volumen"
                        type="button"
                        onClick={() => setOpen((prev) => ({ ...prev, [input.name]: !prev[input.name] }))}
                      >
                        <SlidersHorizontal className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </span>
                </div>
                {view.source === "local" ? (
                  <Meter level={levels[input.name] ?? 0} muted={input.muted} />
                ) : (
                  <div className="h-3" />
                )}
              </div>
            </div>
            {open[input.name] && input.volumeDb !== null && (
              <Fader
                key={`${input.name}:${input.volumeDb}`}
                db={input.volumeDb}
                name={input.name}
                onCommit={(db) => void actions.setVolume(input.name, db)}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
