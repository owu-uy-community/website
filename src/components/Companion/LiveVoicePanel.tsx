"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, Mic, MicOff, PhoneOff, Play, Send, Volume2, Wrench } from "lucide-react";

import { Notice } from "components/Admin/panel";
import { Panel, PanelHead } from "components/Admin/ui/page";
import { Badge } from "components/shared/ui/badge";
import { Button } from "components/shared/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "components/shared/ui/collapsible";
import { Label } from "components/shared/ui/label";
import { Slider } from "components/shared/ui/slider";
import { Switch } from "components/shared/ui/switch";

import { WebVoice, type DeviceCommand, type VoiceStage, type VoiceStatus, type VoiceVisual } from "./web-voice";

const STAGE: Record<VoiceStage, { label: string; dot: string }> = {
  off: { label: "Apagado", dot: "bg-faint" },
  requesting: { label: "Pidiendo micrófono", dot: "bg-warning motion-safe:animate-pulse" },
  connecting: { label: "Conectando", dot: "bg-warning motion-safe:animate-pulse" },
  listening: { label: "Escuchando", dot: "bg-info-foreground motion-safe:animate-pulse" },
  thinking: { label: "Pensando", dot: "bg-warning motion-safe:animate-pulse" },
  speaking: { label: "Hablando", dot: "bg-foreground motion-safe:animate-pulse" },
  idle: { label: "En pausa", dot: "bg-muted-foreground" },
  muted: { label: "Mic apagado", dot: "bg-muted-foreground" },
  error: { label: "Error", dot: "bg-live" },
  standby: { label: "Audio de un dispositivo", dot: "bg-info-foreground" },
};

const TOOL_STATUS: Record<string, string> = {
  running: "corriendo",
  done: "hecha",
  denied: "denegada",
  error: "falló",
};

/** Mic / speaker level bars fed by the voice envelope (~25 fps). */
export function LevelMeter({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-3 text-meta text-muted-foreground">
      <span className="w-8 shrink-0 font-terminal text-2xs tracking-[0.14em] uppercase">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className="h-full rounded-full transition-[width] duration-75"
          style={{ width: `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%`, background: color }}
        />
      </div>
    </div>
  );
}

/**
 * A real conversation with the lab's virtual Owy: this browser's mic and speakers through the
 * bridge, the same prompts, tools and 16 kHz audio as the device. (A physical Owy takes this
 * browser as its audio from the Control tab.)
 */
export default function LiveVoicePanel({
  disabled,
  onActive,
  onVisual,
  onCue,
  onDevice,
  onClient,
  onSetting,
  deviceSettings,
  unavailable,
}: {
  disabled: boolean;
  onActive: (active: boolean) => void;
  onVisual: (state: VoiceVisual) => void;
  onCue: () => void;
  onDevice: (command: DeviceCommand) => void;
  onClient: (client: WebVoice | null) => void;
  onSetting: (name: string, value: number) => void;
  deviceSettings?: Record<string, number>;
  unavailable?: string;
}) {
  const client = useRef<WebVoice | null>(null);
  const activeRef = useRef(false);
  const [status, setStatus] = useState<VoiceStatus>({
    stage: "off",
    message: "Una conversación real con Owy, acá mismo.",
    input: "",
    output: "",
  });
  const [levels, setLevels] = useState({ mic: 0, speaker: 0 });
  const [consent, setConsent] = useState(false);
  const [volume, setVolume] = useState(65);
  const [continuous, setContinuous] = useState(true);
  const [writes, setWrites] = useState(false);
  const [staff, setStaff] = useState(false);
  const [marketplace, setMarketplace] = useState(false);
  const active = !["off", "error"].includes(status.stage);

  const visual = useCallback(
    (state: VoiceVisual) => {
      setLevels({ mic: state.mic, speaker: state.speaker / 100 });
      onVisual(state);
    },
    [onVisual]
  );

  useEffect(() => {
    // Its own stop on unmount still reports `onActive(false)`, but not a status for the next mount.
    let current = true;
    const instance = new WebVoice(
      (state) => {
        if (current) setStatus({ ...state });
        const next = !["off", "error"].includes(state.stage);
        if (next !== activeRef.current) {
          activeRef.current = next;
          onActive(next);
        }
      },
      visual,
      onCue,
      undefined,
      onDevice
    );
    client.current = instance;
    onClient(instance);
    const hide = () => {
      if (document.hidden && activeRef.current) instance.stop("Micrófono apagado porque la pestaña quedó oculta.");
    };
    const leave = () => instance.stop();
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("pagehide", leave);
    return () => {
      current = false;
      instance.stop();
      client.current = null;
      onClient(null);
      document.removeEventListener("visibilitychange", hide);
      window.removeEventListener("pagehide", leave);
    };
  }, [onActive, visual, onCue, onDevice, onClient]);

  useEffect(() => {
    if (deviceSettings) {
      setVolume(deviceSettings.volume);
      setContinuous(!!deviceSettings.continuous);
    }
  }, [deviceSettings?.volume, deviceSettings?.continuous]);
  useEffect(() => client.current?.setVolume(volume), [volume]);
  useEffect(() => client.current?.setContinuous(continuous), [continuous]);

  const start = () => {
    if (
      !window.isSecureContext ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof AudioWorkletNode !== "function" ||
      typeof AudioContext !== "function"
    ) {
      setStatus((s) => ({
        ...s,
        stage: "error",
        message: "La voz en vivo necesita un navegador moderno en HTTPS o localhost, con micrófono.",
      }));
      return;
    }
    void client.current?.start({ writes, staff, marketplace });
  };

  const stage = STAGE[status.stage];

  return (
    <Panel className="flex flex-col">
      <PanelHead
        actions={
          <Badge className="whitespace-nowrap" variant={active ? "info" : "outline"}>
            {active ? "Bridge en vivo" : "Mic cerrado"}
          </Badge>
        }
        icon={Mic}
        title="Hablá con Owy"
      />
      <div className="flex flex-1 flex-col gap-4 p-4">
        <div className="rounded-md border bg-background p-3">
          <div className="flex items-center gap-2 text-ui font-medium">
            <span aria-hidden className={`inline-block size-2 rounded-full ${stage.dot}`} />
            {stage.label}
          </div>
          <p aria-live="polite" className="mt-1 text-ui text-muted-foreground" role="status">
            {!active && unavailable ? unavailable : status.message}
          </p>
          {active && (
            <div className="mt-3 space-y-1.5">
              <LevelMeter color="hsl(var(--info))" label="Mic" value={levels.mic} />
              <LevelMeter color="hsl(var(--primary))" label="Owy" value={levels.speaker} />
            </div>
          )}
        </div>

        {!active ? (
          <>
            <label className="flex items-start gap-3 text-ui">
              <Switch checked={consent} className="mt-0.5" onCheckedChange={setConsent} />
              <span className="text-muted-foreground">
                Mandar el audio del micrófono por el bridge del companion a su proveedor de voz. No se graba audio,
                transcripción ni actividad de las herramientas; las herramientas autorizadas sí pueden guardar cambios.
              </span>
            </label>
            <Collapsible>
              <CollapsibleTrigger className="flex w-full items-center justify-between rounded-sm text-ui font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring/70 pointer-coarse:min-h-11">
                Permisos de la conversación
                <span className="flex items-center gap-2 text-meta text-muted-foreground">
                  {writes || staff || marketplace ? "personalizados" : "solo lectura"}
                  <ChevronDown className="h-4 w-4" />
                </span>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-3 space-y-3">
                {(
                  [
                    ["Permitir cambios reales en el evento (no es sandbox)", writes, setWrites],
                    ["Habilitar las herramientas de staff en esta sesión", staff, setStaff],
                    ["Abrir el mercado de ideas para este dispositivo", marketplace, setMarketplace],
                  ] as const
                ).map(([label, value, set]) => (
                  <label key={label} className="flex items-center justify-between gap-3 text-ui">
                    <span>{label}</span>
                    <Switch checked={value} onCheckedChange={set} />
                  </label>
                ))}
                <p className="text-meta text-muted-foreground">
                  Fijos durante la sesión. El PIN del simulador nunca otorga permisos de producción.
                </p>
              </CollapsibleContent>
            </Collapsible>
            <Button className="w-full" disabled={disabled || !consent || !!unavailable} size="lg" onClick={start}>
              <Mic /> Empezar a hablar
            </Button>
          </>
        ) : (
          <div className="flex flex-wrap gap-2">
            {["idle", "muted"].includes(status.stage) && (
              <Button disabled={status.blocked} onClick={() => void client.current?.resume()}>
                <Play /> Seguir
              </Button>
            )}
            {status.stage === "speaking" && (
              <Button onClick={() => client.current?.interrupt()}>
                <Mic /> Interrumpir
              </Button>
            )}
            {status.stage === "listening" && (
              <Button variant="secondary" onClick={() => client.current?.finishTurn()}>
                <Send /> {status.pitch ? "Terminé el pitch" : "Listo, respondé"}
              </Button>
            )}
            {["listening", "thinking", "speaking"].includes(status.stage) && (
              <Button variant="outline" onClick={() => client.current?.mute()}>
                <MicOff /> Silenciar
              </Button>
            )}
            <Button className="ml-auto" variant="destructive" onClick={() => client.current?.stop()}>
              <PhoneOff /> Cortar
            </Button>
          </div>
        )}

        <div className="grid gap-3 rounded-md border p-3">
          <div className="flex items-center gap-3">
            <Volume2 aria-hidden className="h-4 w-4 text-muted-foreground" />
            <Label className="w-20 font-terminal text-2xs tracking-[0.14em] text-muted-foreground uppercase">
              Volumen
            </Label>
            <Slider
              aria-label="Volumen de Owy"
              max={80}
              min={0}
              value={[volume]}
              onValueChange={([value]) => {
                setVolume(value);
                onSetting("volume", value);
              }}
            />
            <span className="w-10 text-right font-terminal text-meta tabular-nums">{volume}%</span>
          </div>
          <label className="flex items-center justify-between text-ui">
            <span>Seguir escuchando después de cada respuesta</span>
            <Switch
              checked={continuous}
              onCheckedChange={(value) => {
                setContinuous(value);
                onSetting("continuous", +value);
              }}
            />
          </label>
        </div>

        {(status.input || status.output) && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="font-terminal text-2xs tracking-[0.14em] text-muted-foreground uppercase">Conversación</p>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  if (client.current) {
                    client.current.status.input = "";
                    client.current.status.output = "";
                  }
                  setStatus((s) => ({ ...s, input: "", output: "" }));
                }}
              >
                Limpiar
              </Button>
            </div>
            {status.input && (
              <div className="ml-8 rounded-2xl rounded-tr-sm border border-info/40 bg-info-surface px-4 py-2.5 text-ui">
                {status.input}
              </div>
            )}
            {status.output && (
              <div className="mr-8 rounded-2xl rounded-tl-sm border border-primary/40 bg-primary-surface px-4 py-2.5 text-ui">
                <span className="mr-2 font-semibold text-primary">Owy</span>
                {status.output}
              </div>
            )}
            <p className="text-2xs text-muted-foreground">Solo en pantalla; no se guarda.</p>
          </div>
        )}

        {status.bridge && (
          <Collapsible defaultOpen={false}>
            <CollapsibleTrigger className="flex w-full items-center justify-between rounded-sm text-ui font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring/70">
              <span className="flex items-center gap-2">
                <Wrench aria-hidden className="h-4 w-4 text-muted-foreground" />
                Bridge · {status.bridge.tools.length} herramientas
              </span>
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-3 space-y-2 text-meta text-muted-foreground">
              <p className="font-terminal">
                {status.bridge.model} · {status.bridge.voice} · prompt {status.bridge.promptHash}
              </p>
              <p>
                {status.bridge.permissions.writes ? "CAMBIOS REALES habilitados" : "Datos del evento en solo lectura"} ·{" "}
                {status.bridge.permissions.staff ? "staff" : "visitante"} · mercado{" "}
                {status.bridge.permissions.marketplace ? "abierto" : "cerrado"}
              </p>
              <Notice show={!status.bridge.siteConfigured} tone="warning">
                El bridge no tiene OWY_API_KEY: las herramientas del evento van a fallar (como en el gadget) y la pared
                no se espeja.
              </Notice>
              <p className="font-terminal leading-relaxed">{status.bridge.tools.join(" · ")}</p>
            </CollapsibleContent>
          </Collapsible>
        )}

        {status.tools?.length ? (
          <ol className="space-y-1 text-meta">
            {status.tools.map((tool, index) => (
              <li key={index} className="flex items-center gap-2">
                <Badge
                  className="font-terminal"
                  variant={tool.status === "error" || tool.status === "denied" ? "destructive" : "secondary"}
                >
                  {TOOL_STATUS[tool.status] ?? tool.status}
                </Badge>
                <code className="font-terminal">{tool.name}</code>
                {tool.ms !== undefined && <span className="text-muted-foreground">{tool.ms} ms</span>}
                {tool.detail && <span className="truncate text-muted-foreground">— {tool.detail}</span>}
              </li>
            ))}
          </ol>
        ) : null}

        <p className="mt-auto text-2xs leading-relaxed text-muted-foreground">
          El mismo bridge, prompts, herramientas y audio 16 kHz que el Owy de la mesa. Ocho segundos de silencio
          arrancan una conversación nueva; las sesiones duran media hora. Con auriculares anda mejor.
        </p>
      </div>
    </Panel>
  );
}
