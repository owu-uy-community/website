"use client";

import { useRef, useState } from "react";
import {
  ArrowDownToLine,
  CircleHelp,
  Clock,
  ExternalLink,
  FileUp,
  FlaskConical,
  History,
  ListTree,
  Pause,
  Play,
  RotateCcw,
  Smile,
  Tv,
} from "lucide-react";

import { cn } from "app/lib/utils";
import { ScaledFrame } from "components/Admin/stage/ScaledFrame";
import { Meter, MicroLabel, Panel, PanelHead } from "components/Admin/ui/page";
import { Button } from "components/shared/ui/button";
import { Kbd } from "components/shared/ui/kbd";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "components/shared/ui/select";
import { Slider } from "components/shared/ui/slider";
import { EXPRESSIONS, type Expression } from "lib/owy-stage/scenes";

import { EXPRESSION_LABEL, MOODS, stamp, type Mode, type Scenario, type Snapshot, type Trace } from "./emulator";

export const SPEEDS = [0.25, 0.5, 1, 2, 4];

/** Playback speed, for the simulation and the replay. */
export function SpeedSelect({ value, onChange }: { value: number; onChange: (speed: number) => void }) {
  return (
    <Select value={String(value)} onValueChange={(next) => onChange(Number(next))}>
      <SelectTrigger aria-label="Velocidad" className="h-8 w-[84px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {SPEEDS.map((speed) => (
          <SelectItem key={speed} value={String(speed)}>
            {speed}×
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function PlayButton({
  playing,
  disabled,
  onClick,
}: {
  playing: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <Button className="w-[104px] justify-between" disabled={disabled} size="sm" onClick={onClick}>
      <span className="flex items-center gap-1.5">
        {playing ? <Pause /> : <Play />}
        {playing ? "Pausa" : "Seguir"}
      </span>
      <Kbd className="border-primary-foreground/30 text-primary-foreground/80">K</Kbd>
    </Button>
  );
}

// ---------------------------------------------------------------------------
// Simulado
// ---------------------------------------------------------------------------

/** The stories: each one a reproducible run of the firmware against virtual time. */
export function StoriesPanel({
  scenarios,
  selected,
  time,
  ready,
  onPick,
}: {
  scenarios: Scenario[];
  selected: string | null;
  time: number;
  ready: boolean;
  onPick: (id: string) => void;
}) {
  return (
    <Panel>
      <PanelHead icon={FlaskConical} meta={String(scenarios.length).padStart(2, "0")} title="Elegí una historia" />
      <div className="max-h-[360px] scrollbar-thin space-y-0.5 overflow-y-auto p-1.5">
        {scenarios.map((scenario, index) => {
          const on = selected === scenario.id;
          return (
            <button
              key={scenario.id}
              className={cn(
                "flex w-full items-start gap-3 rounded-md px-2.5 py-2 text-left transition-colors outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/70 disabled:opacity-50",
                on && "bg-accent ring-1 ring-primary/60"
              )}
              disabled={!ready}
              type="button"
              onClick={() => onPick(scenario.id)}
            >
              <span className="mt-0.5 font-terminal text-2xs text-muted-foreground tabular-nums">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-ui leading-tight font-medium">{scenario.name}</span>
                <span className="block text-meta leading-snug text-muted-foreground">{scenario.detail}</span>
                {on && <Meter className="mt-2" value={Math.min(100, (time / scenario.duration) * 100)} />}
              </span>
            </button>
          );
        })}
      </div>
    </Panel>
  );
}

/** The face by hand: a mood (until «Seguir la voz»), and the feeling a sentence would bring. */
export function FacePanel({
  ready,
  onMood,
  onExpression,
}: {
  ready: boolean;
  onMood: (mood: number) => void;
  onExpression: (name: Expression, index: number) => void;
}) {
  return (
    <Panel>
      <PanelHead icon={Smile} title="Cara" />
      <div className="space-y-4 p-4">
        <div className="space-y-2">
          <MicroLabel>Estado</MicroLabel>
          <div className="flex flex-wrap gap-1.5">
            {MOODS.map(([name, mood]) => (
              <Button key={name} disabled={!ready} size="sm" variant="secondary" onClick={() => onMood(mood)}>
                {name}
              </Button>
            ))}
            <Button disabled={!ready} size="sm" variant="outline" onClick={() => onMood(-1)}>
              Seguir la voz
            </Button>
          </div>
        </div>
        <div className="space-y-2">
          <MicroLabel>Expresión al hablar</MicroLabel>
          <div className="flex flex-wrap gap-1.5">
            {EXPRESSIONS.map((name, index) => (
              <Button
                key={name}
                disabled={!ready}
                size="sm"
                variant="outline"
                onClick={() => onExpression(name, index)}
              >
                {EXPRESSION_LABEL[name]}
              </Button>
            ))}
          </div>
          <p className="text-meta text-muted-foreground">
            Se ven con <em>Hablando</em> o <em>Pensando</em>; en vivo las elige el bridge, una por frase.
          </p>
        </div>
      </div>
    </Panel>
  );
}

/** The simulation's clock: play, step, speed, start over; and the run as a file. */
export function ClockPanel({
  ready,
  playing,
  time,
  speed,
  onPlay,
  onStep,
  onSpeed,
  onReset,
  onExport,
}: {
  ready: boolean;
  playing: boolean;
  time: number;
  speed: number;
  onPlay: () => void;
  onStep: (ms: number) => void;
  onSpeed: (speed: number) => void;
  onReset: () => void;
  onExport: () => void;
}) {
  return (
    <Panel>
      <PanelHead
        actions={
          <Button disabled={!ready} size="sm" variant="ghost" onClick={onExport}>
            <ArrowDownToLine /> Exportar
          </Button>
        }
        icon={Clock}
        meta={`${stamp(time)} · tiempo virtual`}
        title="Reloj"
      />
      <div className="flex flex-wrap items-center gap-2 p-3">
        <PlayButton disabled={!ready} playing={playing} onClick={onPlay} />
        <Button disabled={!ready || playing} size="sm" variant="outline" onClick={() => onStep(16)}>
          +16 ms <Kbd>.</Kbd>
        </Button>
        <Button disabled={!ready || playing} size="sm" variant="outline" onClick={() => onStep(1000)}>
          +1 s
        </Button>
        <SpeedSelect value={speed} onChange={onSpeed} />
        <Button className="ml-auto" disabled={!ready} size="sm" variant="outline" onClick={onReset}>
          <RotateCcw /> Reiniciar <Kbd>R</Kbd>
        </Button>
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// En vivo
// ---------------------------------------------------------------------------

/** The wall as OBS shows it, on demand: an iframe of the face scene costs a second face. */
export function WallPanel() {
  const [shown, setShown] = useState(false);
  return (
    <Panel>
      <PanelHead
        actions={
          <a
            className="inline-flex items-center gap-1 text-meta text-muted-foreground hover:text-foreground"
            href="/admin/owy/scenes"
          >
            Escenas <ExternalLink className="h-3 w-3" />
          </a>
        }
        icon={Tv}
        title="Ver la pared"
      />
      <div className="space-y-2 p-3">
        {shown ? (
          <ScaledFrame src="/owy/stage/owy-face" title="Owy en la pared" />
        ) : (
          <Button className="w-full" size="sm" variant="outline" onClick={() => setShown(true)}>
            Mostrar la pared
          </Button>
        )}
        <p className="text-2xs text-muted-foreground">La pared espeja la charla si el bridge tiene OWY_API_KEY.</p>
      </div>
    </Panel>
  );
}

/** Why the device is where it is: the firmware's own reason, and the facts behind it. */
export function WhyState({ state }: { state: Snapshot | null }) {
  return (
    <div className="space-y-3">
      <p className="rounded-md border bg-background p-3 text-ui">{state?.why ?? "Cargando el emulador…"}</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-ui">
        {[
          ["Voz", state?.voice],
          ["Pantalla", state?.page],
          ["PCM recibido", `${state?.audioReceived ?? 0} B`],
          ["Buffer de recepción", `${state?.audioBuffered ?? 0} / 32768 B`],
          ["IMU", state?.imuReady ? "muestras frescas" : "sin muestras / viejas"],
          ["Mirada · px", state?.gaze.join(", ")],
          ["Gravedad · g", state?.gravity.map((n) => n.toFixed(3)).join(", ")],
          ["Calibración", `${state?.calibration ?? "—"} · ${state?.calibrationProgress ?? 0}%`],
          ["Staff (simulado)", state?.settings.staff ? "desbloqueado" : "bloqueado"],
        ].map(([name, value]) => (
          <div key={name} className="contents">
            <dt className="text-muted-foreground">{name}</dt>
            <dd className="font-terminal text-meta tabular-nums">{value ?? "—"}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function WhyPanel({ state }: { state: Snapshot | null }) {
  return (
    <Panel>
      <PanelHead icon={CircleHelp} title="Por qué este estado" />
      <div className="p-4">
        <WhyState state={state} />
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Reproducir
// ---------------------------------------------------------------------------

/** A run exported from Simulado, played back exactly: read-only, scrub, speed. */
export function ReplayPanel({
  ready,
  loaded,
  playing,
  time,
  duration,
  speed,
  onLoad,
  onPlay,
  onSeek,
  onSpeed,
}: {
  ready: boolean;
  /** The file's name once the worker took it. */
  loaded: string | null;
  playing: boolean;
  time: number;
  duration: number;
  speed: number;
  onLoad: (file: File) => void;
  onPlay: () => void;
  onSeek: (time: number) => void;
  onSpeed: (speed: number) => void;
}) {
  const picker = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const take = (file: File | undefined) => {
    if (file) onLoad(file);
  };

  return (
    <Panel>
      <PanelHead
        actions={
          loaded ? (
            <Button disabled={!ready} size="sm" variant="ghost" onClick={() => picker.current?.click()}>
              <FileUp /> Otra sesión
            </Button>
          ) : undefined
        }
        icon={History}
        meta={loaded ?? undefined}
        title="Sesión grabada"
      />
      <input
        ref={picker}
        hidden
        accept="application/json,.json"
        type="file"
        onChange={(event) => {
          take(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
      {loaded ? (
        <div className="space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <PlayButton disabled={!ready} playing={playing} onClick={onPlay} />
            <SpeedSelect value={speed} onChange={onSpeed} />
            <span className="ml-auto font-terminal text-ui tabular-nums">
              {stamp(time)} <span className="text-muted-foreground">/ {stamp(duration)}</span>
            </span>
          </div>
          <Slider
            aria-label="Ir a"
            disabled={!ready || duration < 16}
            max={Math.max(duration, 1)}
            min={0}
            step={16}
            value={[Math.min(time, duration)]}
            onValueChange={([at]) => onSeek(at)}
          />
          <p className="text-meta text-muted-foreground">
            Solo lectura: lo grabado se reproduce igual cada vez. Para probar otra cosa, pasá a Simulado.
          </p>
        </div>
      ) : (
        <div className="p-4">
          <button
            className={cn(
              "flex w-full flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-10 text-center transition-colors outline-none hover:bg-white/[0.02] focus-visible:ring-2 focus-visible:ring-ring/70",
              over ? "border-primary bg-primary/[0.04]" : "border-input"
            )}
            disabled={!ready}
            type="button"
            onClick={() => picker.current?.click()}
            onDragLeave={() => setOver(false)}
            onDragOver={(event) => {
              event.preventDefault();
              setOver(true);
            }}
            onDrop={(event) => {
              event.preventDefault();
              setOver(false);
              take(event.dataTransfer.files[0]);
            }}
          >
            <FileUp aria-hidden className="h-5 w-5 text-muted-foreground" />
            <span className="text-ui font-medium">Soltá acá una sesión (.json)</span>
            <span className="text-meta text-muted-foreground">
              o tocá para elegirla. Se exporta desde Simulado, hasta 2 MiB.
            </span>
          </button>
        </div>
      )}
    </Panel>
  );
}

/** The recording's events, newest first. */
export function TracePanel({ trace }: { trace: Trace[] }) {
  return (
    <Panel>
      <PanelHead icon={ListTree} meta={String(trace.length)} title="Traza" />
      <ol className="max-h-[320px] scrollbar-thin overflow-y-auto p-2 font-terminal text-meta">
        {[...trace].reverse().map((event, i) => (
          <li key={`${event.t}-${i}`} className="flex gap-3 rounded px-2 py-1 even:bg-white/[0.02]">
            <span className="shrink-0 text-muted-foreground tabular-nums">{stamp(event.t)}</span>
            <span className="min-w-0 flex-1 truncate">{event.event}</span>
            <span className="shrink-0 text-muted-foreground">{event.voice}</span>
          </li>
        ))}
        {trace.length === 0 && <li className="px-2 py-1 text-muted-foreground">Sin eventos todavía.</li>}
      </ol>
    </Panel>
  );
}

/** The last few things the firmware did, under everything, in every mode. */
export function TraceStrip({ trace, mode }: { trace: Trace[]; mode: Mode }) {
  return (
    <Panel className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3.5 py-2.5 font-terminal text-2xs text-muted-foreground">
      <MicroLabel>Traza</MicroLabel>
      {trace
        .slice(-6)
        .reverse()
        .map((event, i) => (
          <span key={`${event.t}-${i}`}>
            <span className="mr-1 text-foreground/70">{stamp(event.t)}</span>
            {event.event}
          </span>
        ))}
      <span className="ml-auto">
        {mode === "live"
          ? "bridge real · nada se graba"
          : mode === "replay"
            ? "solo lectura"
            : "determinístico · exportable"}
      </span>
    </Panel>
  );
}
