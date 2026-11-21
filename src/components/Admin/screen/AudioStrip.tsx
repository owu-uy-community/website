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
        const tone = i >= SEGMENTS - 2 ? "bg-live" : i >= SEGMENTS - 6 ? "bg-warning" : "bg-success";

        return <span key={i} className={cn("flex-1 rounded-[1px]", on ? tone : "bg-white/[0.06]")} />;
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
      <span className="w-16 text-right font-terminal text-2xs text-muted-foreground tabular-nums">
        {value <= -60
          ? "−∞ dB"
          : `${value.toLocaleString("es-UY", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} dB`}
      </span>
    </div>
  );
}

/** Every audio input in OBS: mute (confirmed by event), live meter, optional fader. */
export function AudioStrip({ view, actions }: { view: ObsView; actions: ObsActions }) {
  const levels = useObsLevels();
  const [open, setOpen] = useState<Record<string, boolean>>({});

  if (!view.connected) return <p className="text-meta text-muted-foreground">Sin conexión a OBS.</p>;
  if (view.inputs.length === 0)
    return <p className="text-meta text-muted-foreground">OBS no tiene fuentes de audio.</p>;

  return (
    <div className="space-y-2">
      {view.inputs.map((input, index) => {
        const pending = view.pending[`mute:${input.name}`] !== undefined;

        return (
          <div key={input.name} className="space-y-1">
            <div className="flex items-center gap-2">
              <Button
                aria-label={input.muted ? `Activar ${input.name}` : `Silenciar ${input.name}`}
                aria-pressed={input.muted}
                className={cn(pending && "border-warning motion-safe:animate-pulse")}
                size="icon"
                title={input.muted ? "Activar" : "Silenciar"}
                variant={input.muted ? "destructive" : "outline"}
                onClick={() => void actions.setMute(input.name)}
              >
                {input.muted ? <MicOff /> : <Mic />}
              </Button>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={cn("truncate text-meta font-medium", input.muted && "text-live-foreground line-through")}
                  >
                    {input.name}
                  </span>
                  <span className="flex items-center gap-1">
                    {index === 0 && <Kbd className="pointer-coarse:hidden">M</Kbd>}
                    {input.volumeDb !== null && (
                      <Button
                        aria-expanded={open[input.name] === true}
                        aria-label={`Volumen de ${input.name}`}
                        className="text-muted-foreground"
                        size="icon-xs"
                        title="Volumen"
                        variant="ghost"
                        onClick={() => setOpen((prev) => ({ ...prev, [input.name]: !prev[input.name] }))}
                      >
                        <SlidersHorizontal />
                      </Button>
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
