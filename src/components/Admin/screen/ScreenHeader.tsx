"use client";

import { useState } from "react";
import { Circle, Radio, Square } from "lucide-react";

import { cn } from "app/lib/utils";
import { StatusDot } from "components/Admin/ui/status";
import { useNow } from "components/Admin/ui/time";
import { Badge } from "components/shared/ui/badge";
import { Button } from "components/shared/ui/button";
import type { ObsActions, ObsView } from "lib/obs/actions";
import { STATS_INTERVAL_MS, type ObsState } from "lib/obs/client";
import { congestionTone } from "lib/obs/health";
import type { ObsStatus } from "lib/orpc/obs-control/schemas";

import { HoldButton } from "./HoldButton";
import { formatDuration } from "./tally";

const percent = new Intl.NumberFormat("es-UY", { style: "percent", maximumFractionDigits: 1 });
const megabits = new Intl.NumberFormat("es-UY", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/**
 * OBS reports how long the stream or the recording has run every few seconds: the seconds in
 * between tick here, never more than one report ahead (a paused recording stops counting).
 */
function Elapsed({ ms }: { ms: number }) {
  const now = useNow(1000);
  const [anchor, setAnchor] = useState({ ms, at: now });
  if (anchor.ms !== ms || (now && !anchor.at)) setAnchor({ ms, at: now });
  const since = now && anchor.at ? Math.min(now - anchor.at, STATS_INTERVAL_MS) : 0;

  return formatDuration(anchor.ms + since);
}

/**
 * How the stream is doing, as OBS itself reads it: bitrate, dropped frames and congestion (above
 * 0.8 is bad, above 0.5 a warning). Only a tab with its own socket to OBS knows. Narrower
 * screens get the bitrate and the dot, which turns orange or red when either one is off.
 */
function StreamHealth({ obs }: { obs: ObsState }) {
  if (obs.connection !== "connected" || !obs.streaming) return null;
  if (obs.streamReconnecting) {
    return (
      <Badge variant="destructive">
        <StatusDot pulse tone="live" />
        {/* A phone's header has no room for the words: the pulsing dot stays. */}
        <span className="max-sm:sr-only">Reconectando el stream…</span>
      </Badge>
    );
  }
  const dropped = obs.totalFrames > 0 ? obs.skippedFrames / obs.totalFrames : 0;
  const tone = congestionTone(obs.streamCongestion);

  return (
    <span
      className="hidden items-center gap-2.5 font-terminal text-meta whitespace-nowrap text-muted-foreground tabular-nums sm:flex"
      title={`${obs.skippedFrames} de ${obs.totalFrames} frames perdidos · congestión ${percent.format(obs.streamCongestion)}`}
    >
      <span className="flex items-center gap-1.5 text-foreground">
        <StatusDot tone={tone === "ok" && dropped > 0.01 ? "warn" : tone} />
        {obs.streamKbps === null ? "— Mb/s" : `${megabits.format(obs.streamKbps / 1000)} Mb/s`}
      </span>
      <span className={cn("hidden min-[1360px]:inline", dropped > 0.01 && "text-warning-foreground")}>
        {percent.format(dropped)} perdidos
      </span>
      <span
        className={cn(
          "hidden min-[1360px]:inline",
          tone === "warn" && "text-warning-foreground",
          tone === "live" && "text-live-foreground"
        )}
      >
        congestión {percent.format(obs.streamCongestion)}
      </span>
    </span>
  );
}

/**
 * The OBS page's controls in the admin header: where this tab talks to OBS, who executes the
 * commands, the stream's health, and Stream / Rec (stopping either takes a long press).
 */
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
  const connecting = obs.connection === "connecting" || obs.connection === "reconnecting";

  return (
    <div className="flex min-w-0 items-center gap-2">
      <Button
        className="min-w-0 font-terminal"
        size="sm"
        title="Conexión a OBS"
        variant={connected ? "ghost" : "outline"}
        onClick={openSettings}
      >
        <StatusDot tone={connected ? "ok" : connecting ? "warn" : "idle"} />
        {/* Tablets keep the room for the seat and the stream; the address is in the sheet. */}
        <span className={cn("truncate", connected ? "max-lg:sr-only" : "max-sm:sr-only")}>
          {connected ? obs.address : connecting ? "Conectando…" : "Conectar a OBS"}
        </span>
      </Button>
      {isExecutor ? (
        <Badge className="max-md:hidden" title="Esta pestaña ejecuta los comandos de todos" variant="success">
          Ejecutor
        </Badge>
      ) : status?.executorOnline ? (
        <span className="flex items-center gap-1 max-md:hidden">
          <Badge title="Otra pestaña ejecuta los comandos; esta se los manda" variant="warning">
            Observando
          </Badge>
          {connected && (
            <Button className="max-lg:hidden" size="xs" variant="ghost" onClick={takeControl}>
              Tomar el control
            </Button>
          )}
        </span>
      ) : (
        <Badge className="max-md:hidden" variant="secondary">
          {connected ? "Tomando el control…" : "Sin ejecutor"}
        </Badge>
      )}
      {!busOpen && (
        <Badge title="Los comandos de otros dispositivos no llegan a esta pestaña" variant="warning">
          <Radio /> <span className="max-sm:sr-only">Sin tiempo real</span>
        </Badge>
      )}
      <StreamHealth obs={obs} />
      <span aria-hidden className="h-4 w-px shrink-0 bg-input" />

      {view.streaming ? (
        <HoldButton
          aria-label="Al aire: mantené apretado para cortar el stream"
          disabled={!view.connected}
          size="sm"
          title="Mantené apretado para cortar el stream"
          variant="destructive"
          onHold={() => void actions.setStream("stop")}
        >
          <StatusDot pulse tone="live" />
          <span className="font-terminal tracking-[0.08em] uppercase tabular-nums max-sm:sr-only">
            Al aire {connected ? <Elapsed ms={obs.streamMs} /> : null}
          </span>
        </HoldButton>
      ) : (
        <Button
          className={cn(view.pending.stream !== undefined && "motion-safe:animate-pulse")}
          disabled={!view.connected}
          size="sm"
          variant="outline"
          onClick={() => void actions.setStream("start")}
        >
          <Radio /> <span className="max-sm:sr-only">Stream</span>
        </Button>
      )}

      {view.recording ? (
        <HoldButton
          aria-label="Grabando: mantené apretado para detener la grabación"
          disabled={!view.connected}
          size="sm"
          title="Mantené apretado para detener la grabación"
          variant="destructive"
          onHold={() => void actions.setRecord("stop")}
        >
          <Square className="fill-current" />
          <span className="font-terminal tracking-[0.08em] uppercase tabular-nums max-sm:sr-only">
            Rec {connected ? <Elapsed ms={obs.recordMs} /> : null}
          </span>
        </HoldButton>
      ) : (
        <Button
          className={cn(view.pending.record !== undefined && "motion-safe:animate-pulse")}
          disabled={!view.connected}
          size="sm"
          variant="outline"
          onClick={() => void actions.setRecord("start")}
        >
          <Circle className="fill-live text-live" /> <span className="max-sm:sr-only">Grabar</span>
        </Button>
      )}
    </div>
  );
}
