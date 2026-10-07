"use client";

import { Circle, Plug, PlugZap, Radio, RefreshCw, Settings2, Square } from "lucide-react";

import { cn } from "app/lib/utils";
import { Badge } from "components/shared/ui/badge";
import { Button } from "components/shared/ui/button";
import { Kbd } from "components/shared/ui/kbd";
import { Switch } from "components/shared/ui/switch";
import type { ObsActions, ObsView } from "lib/obs/actions";
import type { ObsState } from "lib/obs/client";
import type { ObsStatus } from "lib/orpc/obs-control/schemas";

import { HoldButton } from "./HoldButton";
import { formatDuration } from "./tally";

function Pill({ tone, children }: { tone: "ok" | "warn" | "off" | "live"; children: React.ReactNode }) {
  return (
    <Badge
      className={cn(
        "gap-1.5 border font-medium whitespace-nowrap",
        tone === "ok" && "border-green-500/40 bg-green-500/15 text-green-200",
        tone === "warn" && "border-amber-400/40 bg-amber-400/15 text-amber-100",
        tone === "off" && "border-border bg-muted text-muted-foreground",
        tone === "live" && "border-red-500/50 bg-red-500/20 text-red-100"
      )}
      variant="outline"
    >
      {children}
    </Badge>
  );
}

export function ScreenHeader({
  obs,
  view,
  actions,
  status,
  isExecutor,
  busOpen,
  takeControl,
  openSettings,
}: {
  obs: ObsState;
  view: ObsView;
  actions: ObsActions;
  status: ObsStatus | null;
  isExecutor: boolean;
  busOpen: boolean;
  takeControl: () => void;
  openSettings: () => void;
}) {
  const connected = obs.connection === "connected";
  const dropRate = obs.totalFrames > 0 ? obs.skippedFrames / obs.totalFrames : 0;

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-2 font-display text-2xl font-bold tracking-tight text-foreground">Pantalla OBS</h1>
        {connected ? (
          <Pill tone="ok">
            <PlugZap className="h-3 w-3" /> {obs.address}
          </Pill>
        ) : obs.connection === "disconnected" ? (
          <Pill tone="off">
            <Plug className="h-3 w-3" /> Desconectado
          </Pill>
        ) : (
          <Pill tone="warn">
            <RefreshCw className="h-3 w-3 animate-spin" />{" "}
            {obs.connection === "connecting" ? "Conectando…" : "Reconectando…"}
          </Pill>
        )}
        {isExecutor ? (
          <Pill tone="ok">Ejecutor</Pill>
        ) : status?.executorOnline ? (
          <Pill tone="warn">
            Observando
            {connected && (
              <button className="underline underline-offset-2" onClick={takeControl} type="button">
                Tomar el control
              </button>
            )}
          </Pill>
        ) : (
          <Pill tone="off">{connected ? "Tomando el control…" : "Sin ejecutor"}</Pill>
        )}
        {!busOpen && (
          <Pill tone="warn">
            <Radio className="h-3 w-3" /> Sin realtime
          </Pill>
        )}
        {connected && dropRate > 0.01 && <Pill tone="warn">{Math.round(dropRate * 100)}% frames perdidos</Pill>}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-sm">
          <span className={cn(view.pending.studio !== undefined && "animate-pulse text-amber-200")}>Estudio</span>
          <Switch
            checked={view.studioMode}
            disabled={!view.connected}
            onCheckedChange={(enabled) => void actions.setStudioMode(enabled)}
          />
          <Kbd>S</Kbd>
        </label>

        {view.streaming ? (
          <HoldButton
            className="h-9 border border-red-500/50 bg-red-500/20 text-red-100 hover:bg-red-500/30"
            disabled={!view.connected}
            title="Mantené apretado para detener el stream"
            variant="ghost"
            onHold={() => void actions.setStream("stop")}
          >
            <Radio className="h-4 w-4 animate-pulse" /> EN VIVO {connected ? formatDuration(obs.streamMs) : ""} ·
            mantené para cortar
          </HoldButton>
        ) : (
          <Button
            className={cn("h-9", view.pending.stream !== undefined && "animate-pulse")}
            disabled={!view.connected}
            size="sm"
            variant="outline"
            onClick={() => void actions.setStream("start")}
          >
            <Radio className="h-4 w-4" /> Stream
          </Button>
        )}

        {view.recording ? (
          <HoldButton
            className="h-9 border border-red-500/50 bg-red-500/20 text-red-100 hover:bg-red-500/30"
            disabled={!view.connected}
            title="Mantené apretado para detener la grabación"
            variant="ghost"
            onHold={() => void actions.setRecord("stop")}
          >
            <Square className="h-4 w-4 fill-current" /> REC {connected ? formatDuration(obs.recordMs) : ""}
          </HoldButton>
        ) : (
          <Button
            className={cn("h-9", view.pending.record !== undefined && "animate-pulse")}
            disabled={!view.connected}
            size="sm"
            variant="outline"
            onClick={() => void actions.setRecord("start")}
          >
            <Circle className="h-4 w-4 fill-red-500 text-red-500" /> Grabar
          </Button>
        )}

        <Button className="h-9" size="sm" variant={connected ? "ghost" : "brand"} onClick={openSettings}>
          <Settings2 className="h-4 w-4" /> {connected ? "Conexión" : "Conectar"}
        </Button>
      </div>
    </div>
  );
}
