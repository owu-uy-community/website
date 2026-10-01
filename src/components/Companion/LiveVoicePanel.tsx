"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, Mic, MicOff, PhoneOff, Play, Send, Volume2, Wrench } from "lucide-react";

import { Badge } from "components/shared/ui/badge";
import { Button } from "components/shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "components/shared/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "components/shared/ui/collapsible";
import { Label } from "components/shared/ui/label";
import { Slider } from "components/shared/ui/slider";
import { Switch } from "components/shared/ui/switch";

import { WebVoice, type DeviceCommand, type VoiceStage, type VoiceStatus, type VoiceVisual } from "./web-voice";

const STAGE: Record<VoiceStage, { label: string; dot: string }> = {
  off: { label: "Apagado", dot: "bg-zinc-500" },
  requesting: { label: "Pidiendo micrófono", dot: "bg-yellow-400 animate-pulse" },
  connecting: { label: "Conectando", dot: "bg-yellow-400 animate-pulse" },
  listening: { label: "Escuchando", dot: "bg-[#0162C8] animate-pulse" },
  thinking: { label: "Pensando", dot: "bg-yellow-400 animate-pulse" },
  speaking: { label: "Hablando", dot: "bg-[#FBF5E7] animate-pulse" },
  idle: { label: "En pausa", dot: "bg-zinc-400" },
  muted: { label: "Mic apagado", dot: "bg-zinc-400" },
  error: { label: "Error", dot: "bg-red-500" },
};

const TOOL_STATUS: Record<string, string> = {
  running: "corriendo",
  done: "ok",
  denied: "denegada",
  error: "error",
};

/** Mic / speaker level bars fed by the voice envelope (~25 fps). */
export function LevelMeter({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="text-muted-foreground flex items-center gap-3 text-xs">
      <span className="w-8 shrink-0 tracking-[0.15em] uppercase">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-800">
        <div
          className="h-full rounded-full transition-[width] duration-75"
          style={{ width: `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%`, background: color }}
        />
      </div>
    </div>
  );
}

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
    const instance = new WebVoice(
      (state) => {
        setStatus({ ...state });
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
    <Card className="flex h-full flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Mic className="h-4 w-4 text-yellow-400" />
              Hablá con Owy
            </CardTitle>
            <CardDescription>El mismo bridge, prompts, tools y audio 16 kHz que el gadget.</CardDescription>
          </div>
          <Badge className="shrink-0 whitespace-nowrap" variant={active ? "default" : "outline"}>
            {active ? "Bridge en vivo" : "Opt-in"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        <div className="rounded-md border bg-zinc-900/60 p-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <span className={`inline-block h-2.5 w-2.5 rounded-full ${stage.dot}`} />
            {stage.label}
          </div>
          <p aria-live="polite" className="text-muted-foreground mt-1 text-sm" role="status">
            {!active && unavailable ? unavailable : status.message}
          </p>
          {active && (
            <div className="mt-3 space-y-1.5">
              <LevelMeter color="#0162C8" label="Mic" value={levels.mic} />
              <LevelMeter color="#F5BB03" label="Owy" value={levels.speaker} />
            </div>
          )}
        </div>

        {!active ? (
          <>
            <label className="flex items-start gap-3 text-sm">
              <Switch checked={consent} className="mt-0.5" onCheckedChange={setConsent} />
              <span className="text-muted-foreground">
                Mandar el audio del micrófono por el bridge del companion a su proveedor de voz. No se graba audio,
                transcripción ni actividad de tools; las tools autorizadas sí pueden persistir cambios.
              </span>
            </label>
            <Collapsible>
              <CollapsibleTrigger className="flex w-full items-center justify-between text-sm font-medium">
                Permisos de la conversación
                <span className="text-muted-foreground flex items-center gap-2 text-xs">
                  {writes || staff || marketplace ? "personalizados" : "solo lectura"}
                  <ChevronDown className="h-4 w-4" />
                </span>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-3 space-y-3">
                {(
                  [
                    ["Permitir cambios reales en el evento (no es sandbox)", writes, setWrites],
                    ["Habilitar tools de staff en esta sesión", staff, setStaff],
                    ["Abrir el mercado de ideas para este dispositivo", marketplace, setMarketplace],
                  ] as const
                ).map(([label, value, set]) => (
                  <label key={label} className="flex items-center justify-between gap-3 text-sm">
                    <span>{label}</span>
                    <Switch checked={value} onCheckedChange={set} />
                  </label>
                ))}
                <p className="text-muted-foreground text-xs">
                  Fijos durante la sesión. El PIN del simulador nunca otorga permisos de producción.
                </p>
              </CollapsibleContent>
            </Collapsible>
            <Button className="w-full" disabled={disabled || !consent || !!unavailable} size="lg" onClick={start}>
              <Mic className="mr-2 h-4 w-4" /> Empezar a hablar
            </Button>
          </>
        ) : (
          <div className="flex flex-wrap gap-2">
            {["idle", "muted"].includes(status.stage) && (
              <Button disabled={status.blocked} onClick={() => void client.current?.resume()}>
                <Play className="mr-2 h-4 w-4" /> Seguir
              </Button>
            )}
            {status.stage === "speaking" && (
              <Button onClick={() => client.current?.interrupt()}>
                <Mic className="mr-2 h-4 w-4" /> Interrumpir
              </Button>
            )}
            {status.stage === "listening" && (
              <Button variant="secondary" onClick={() => client.current?.finishTurn()}>
                <Send className="mr-2 h-4 w-4" /> Listo, respondé
              </Button>
            )}
            {["listening", "thinking", "speaking"].includes(status.stage) && (
              <Button variant="outline" onClick={() => client.current?.mute()}>
                <MicOff className="mr-2 h-4 w-4" /> Silenciar
              </Button>
            )}
            <Button className="ml-auto" variant="destructive" onClick={() => client.current?.stop()}>
              <PhoneOff className="mr-2 h-4 w-4" /> Cortar
            </Button>
          </div>
        )}

        <div className="grid gap-3 rounded-md border p-3">
          <div className="flex items-center gap-3">
            <Volume2 className="text-muted-foreground h-4 w-4" />
            <Label className="text-muted-foreground w-20 text-xs tracking-[0.15em] uppercase">Volumen</Label>
            <Slider
              max={80}
              min={0}
              value={[volume]}
              onValueChange={([value]) => {
                setVolume(value);
                onSetting("volume", value);
              }}
            />
            <span className="font-terminal w-10 text-right text-xs tabular-nums">{volume}%</span>
          </div>
          <label className="flex items-center justify-between text-sm">
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
              <p className="text-muted-foreground text-xs font-semibold tracking-[0.15em] uppercase">Conversación</p>
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
              <div className="ml-8 rounded-2xl rounded-tr-sm border border-[#0162C8]/40 bg-[#0162C8]/15 px-4 py-2.5 text-sm">
                {status.input}
              </div>
            )}
            {status.output && (
              <div className="mr-8 rounded-2xl rounded-tl-sm border border-yellow-400/40 bg-yellow-400/10 px-4 py-2.5 text-sm">
                <span className="mr-2 font-semibold text-yellow-400">Owy</span>
                {status.output}
              </div>
            )}
            <p className="text-muted-foreground text-[11px]">Solo en pantalla; no se guarda.</p>
          </div>
        )}

        {status.bridge && (
          <Collapsible defaultOpen={false}>
            <CollapsibleTrigger className="flex w-full items-center justify-between text-sm font-medium">
              <span className="flex items-center gap-2">
                <Wrench className="text-muted-foreground h-4 w-4" />
                Bridge · {status.bridge.tools.length} tools
              </span>
              <ChevronDown className="text-muted-foreground h-4 w-4" />
            </CollapsibleTrigger>
            <CollapsibleContent className="text-muted-foreground mt-3 space-y-2 text-xs">
              <p className="font-terminal">
                {status.bridge.model} · {status.bridge.voice} · prompt {status.bridge.promptHash}
              </p>
              <p>
                {status.bridge.permissions.writes ? "CAMBIOS REALES habilitados" : "Datos del evento en solo lectura"} ·{" "}
                {status.bridge.permissions.staff ? "staff" : "visitante"} · mercado{" "}
                {status.bridge.permissions.marketplace ? "abierto" : "cerrado"}
              </p>
              {!status.bridge.siteConfigured && (
                <p className="text-yellow-400" role="alert">
                  El bridge no tiene OWY_API_KEY: las tools del evento van a fallar (como en el gadget) y la pared no se
                  espeja.
                </p>
              )}
              <p className="font-terminal leading-relaxed">{status.bridge.tools.join(" · ")}</p>
            </CollapsibleContent>
          </Collapsible>
        )}

        {status.tools?.length ? (
          <ol className="space-y-1 text-xs">
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
                {tool.detail && <span className="text-muted-foreground truncate">— {tool.detail}</span>}
              </li>
            ))}
          </ol>
        ) : null}

        <p className="text-muted-foreground mt-auto text-[11px] leading-relaxed">
          Ocho segundos de silencio arrancan una conversación nueva, como en el gadget. Las sesiones duran cinco
          minutos. Con auriculares anda mejor. Pantalla y volumen afectan solo a este dispositivo virtual.
        </p>
      </CardContent>
    </Card>
  );
}
