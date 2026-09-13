"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowDownToLine,
  ArrowUpFromLine,
  AudioLines,
  CircleHelp,
  ExternalLink,
  Fingerprint,
  FlaskConical,
  Gauge,
  Hand,
  Maximize2,
  Mic,
  Move3D,
  Pause,
  Play,
  Radio,
  RotateCcw,
  Settings2,
  SkipForward,
  Tv,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";

import { ScaledFrame } from "components/Admin/stage/ScaledFrame";
import { Badge } from "components/shared/ui/badge";
import { Button } from "components/shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "components/shared/ui/card";
import { Kbd } from "components/shared/ui/kbd";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "components/shared/ui/select";
import { Slider } from "components/shared/ui/slider";
import { Switch } from "components/shared/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "components/shared/ui/tabs";

import LiveVoicePanel, { LevelMeter } from "./LiveVoicePanel";
import type { DeviceCommand, VoiceVisual, WebVoice } from "./web-voice";

type Snapshot = {
  time: number;
  page: string;
  voice: string;
  phase: number;
  why: string;
  event: string;
  eventSerial: number;
  cueSerial: number;
  cueKind: number;
  powered: boolean;
  dimmed: boolean;
  imuReady: boolean;
  gravity: number[];
  bias: number[];
  neutral: number[];
  gaze: number[];
  calibration: string;
  calibrationProgress: number;
  settings: Record<string, number>;
  followDeadline: number;
  staffDeadline: number;
  audioReceived: number;
  audioBuffered: number;
  envelope: number[];
};
type Trace = { t: number; event: string; voice: string; page: string };
type Scenario = { id: string; name: string; detail: string; duration: number };
type Cue = { kind: number; volume: number; t: number; pcm: Uint8Array };
type Manifest = {
  version: string;
  lvgl: string;
  esphome: string;
  width: number;
  height: number;
  pages: string[];
  objects: number;
  wasmHash: string;
};

const stamp = (t: number) =>
  `${String(Math.floor(t / 60000)).padStart(2, "0")}:${((t % 60000) / 1000).toFixed(2).padStart(5, "0")}`;

const TOGGLES: [string, string][] = [
  ["privacy", "Privacidad del micrófono"],
  ["continuous", "Conversación continua"],
  ["chime", "Tono de escucha"],
  ["sounds", "Sonidos de interacción"],
  ["motion", "Seguir el movimiento"],
  ["reduced", "Animaciones mínimas"],
  ["invert_x", "Invertir horizontal"],
  ["invert_y", "Invertir vertical"],
  ["wake", "Wake word"],
  ["quiet", "Modo silencioso"],
];
const MOODS = ["Idle", "Escuchando", "Pensando", "Hablando", "Feliz", "Error", "Offline"];
const FAULTS = [
  "Driver demorado más allá del timeout",
  "El parlante nunca termina de drenar",
  "El bridge pierde el timeout de silencio",
];
const TRANSPORT_FAULTS = ["Ráfaga de 700 ms en el transporte", "Nunca confirmar playback ready"];

function SectionTitle({
  icon: Icon,
  children,
  hint,
}: {
  icon?: typeof Activity;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <p className="text-muted-foreground flex items-center gap-2 text-xs font-semibold tracking-[0.15em] uppercase">
        {Icon && <Icon className="h-3.5 w-3.5" />}
        {children}
      </p>
      {hint && <span className="font-terminal text-muted-foreground text-[11px]">{hint}</span>}
    </div>
  );
}

function RangeRow({
  label,
  value,
  unit = "",
  min,
  max,
  step = 1,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  unit?: string;
  min: number;
  max: number;
  step?: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-28 shrink-0 text-sm">{label}</span>
      <Slider
        disabled={disabled}
        max={max}
        min={min}
        step={step}
        value={[value]}
        onValueChange={([v]) => onChange(v)}
      />
      <span className="font-terminal text-muted-foreground w-12 shrink-0 text-right text-xs tabular-nums">
        {value}
        {unit}
      </span>
    </div>
  );
}

function SwitchRow({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 py-1 text-sm">
      <span>{label}</span>
      <Switch checked={checked} disabled={disabled} onCheckedChange={onChange} />
    </label>
  );
}

export default function CompanionWorkbench() {
  const worker = useRef<Worker | null>(null);
  const panel = useRef<HTMLCanvasElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const audio = useRef<AudioContext | null>(null);
  const sources = useRef(new Set<AudioBufferSourceNode>());
  const soundEnabled = useRef(false);
  const [state, setState] = useState<Snapshot | null>(null);
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [trace, setTrace] = useState<Trace[]>([]);
  const [playing, setPlaying] = useState(false);
  const [mode, setMode] = useState("simulated");
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState("1");
  const [sound, setSound] = useState(false);
  const [angles, setAngles] = useState([0, 0, 0]);
  const [faults, setFaults] = useState([0, 0, 0]);
  const [transportFault, setTransportFault] = useState([0, 0]);
  const [connected, setConnected] = useState(true);
  const [imu, setImu] = useState(true);
  const [battery, setBattery] = useState(100);
  const [charging, setCharging] = useState(false);
  const [usb, setUsb] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [help, setHelp] = useState(false);
  const [zoom, setZoom] = useState(false);
  const [wall, setWall] = useState(false);
  const [transport, setTransport] = useState("En modo fixture el micrófono del navegador nunca se abre.");
  const [live, setLive] = useState(false);
  const liveRef = useRef(false);
  const liveClient = useRef<WebVoice | null>(null);

  const send = useCallback((message: Record<string, unknown>) => worker.current?.postMessage(message), []);
  const input = useCallback(
    (type: string, values: number[] = [], text?: string) =>
      send({ type: liveRef.current ? "liveInput" : "input", event: { type, values, ...(text ? { text } : {}) } }),
    [send]
  );
  const stopSound = useCallback(() => {
    for (const source of sources.current) {
      try {
        source.stop();
      } catch {
        /* already ended */
      }
    }
    sources.current.clear();
  }, []);
  const playCue = useCallback((cue: Cue) => {
    const ctx = audio.current;
    if (!soundEnabled.current || !ctx || ctx.state !== "running") return;
    const data = new DataView(cue.pcm.buffer, cue.pcm.byteOffset, cue.pcm.byteLength);
    const buffer = ctx.createBuffer(1, data.byteLength / 2, 16000);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < channel.length; i++) channel[i] = data.getInt16(i * 2, true) / 32768;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.value = cue.volume / 100;
    source.connect(gain).connect(ctx.destination);
    sources.current.add(source);
    source.onended = () => {
      sources.current.delete(source);
      source.disconnect();
      gain.disconnect();
    };
    source.start();
  }, []);
  const onLive = useCallback(
    (active: boolean) => {
      liveRef.current = active;
      setLive(active);
      setSelected(null);
      stopSound();
      soundEnabled.current = active;
      setSound(active);
      if (active) {
        audio.current ??= new AudioContext({ latencyHint: "interactive" });
        void audio.current.resume().catch(() => {});
      }
      send({ type: "live", value: active });
    },
    [send, stopSound]
  );
  const onLiveVisual = useCallback(
    (state: VoiceVisual) => {
      if (liveRef.current) send({ type: "liveVisual", ...state });
    },
    [send]
  );
  const onLiveCue = useCallback(() => send({ type: "liveCue" }), [send]);
  const onLiveDevice = useCallback(
    (command: DeviceCommand) => {
      if (liveRef.current) send({ type: "liveDevice", command });
    },
    [send]
  );
  const onLiveClient = useCallback((client: WebVoice | null) => {
    liveClient.current = client;
  }, []);
  const onLiveSetting = useCallback((name: string, value: number) => input("setting", [value], name), [input]);

  useEffect(() => {
    const instance = new Worker("/companion-runtime/worker.mjs", { type: "module", name: "owy-companion" });
    worker.current = instance;
    instance.onmessage = ({ data }) => {
      if (data.type === "ready") {
        setManifest(data.manifest);
        setScenarios(data.scenarios);
        instance.postMessage({ type: "play", value: true });
      }
      if (data.type === "error") {
        liveClient.current?.stop("El dispositivo virtual se detuvo. Micrófono apagado; recargá antes de reconectar.");
        setError(data.message);
        setPlaying(false);
        stopSound();
      }
      if (data.type === "export") {
        const url = URL.createObjectURL(new Blob([data.json], { type: "application/json" }));
        const a = document.createElement("a");
        a.href = url;
        a.download = "owy-replay.json";
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      if (data.type !== "state") return;
      const snapshot: Snapshot = data.state;
      if (liveRef.current) {
        liveClient.current?.syncDevice(
          snapshot.settings,
          snapshot.powered,
          ["settling", "collecting"].includes(snapshot.calibration)
        );
        for (const command of data.commands ?? []) {
          if (command === "start") void liveClient.current?.resume();
          if (command === "stop") liveClient.current?.mute();
        }
      }
      setState(snapshot);
      setPlaying(data.playing);
      setMode(data.mode);
      setDuration(data.duration);
      setTrace(data.trace);
      if (snapshot.settings.privacy || !snapshot.powered) stopSound();
      else for (const cue of data.cues as Cue[]) playCue(cue);
      const ctx = panel.current?.getContext("2d", { alpha: false });
      if (ctx) {
        const image = ctx.createImageData(466, 466),
          source: Uint16Array = data.frame;
        for (let i = 0; i < source.length; i++) {
          const v = source[i],
            p = i * 4;
          image.data[p] = Math.round(((v >> 11) * 255) / 31);
          image.data[p + 1] = Math.round((((v >> 5) & 63) * 255) / 63);
          image.data[p + 2] = Math.round(((v & 31) * 255) / 31);
          image.data[p + 3] = 255;
        }
        ctx.putImageData(image, 0, 0);
      }
    };
    instance.onerror = () => {
      liveClient.current?.stop("El dispositivo virtual se detuvo. Micrófono apagado.");
      setError("No se pudo cargar el runtime WASM. Corré el build del emulador y recargá.");
    };
    instance.postMessage({ type: "init" });
    const visibility = () => {
      if (document.hidden) {
        if (!liveRef.current) instance.postMessage({ type: "play", value: false });
        stopSound();
        void audio.current?.suspend();
        setTransport("Pausado mientras la pestaña estuvo oculta. Play y sonido para seguir.");
      }
    };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      worker.current = null;
      instance.terminate();
      stopSound();
      void audio.current?.close();
      audio.current = null;
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [playCue, stopSound]);

  const resetControls = () => {
    stopSound();
    setAngles([0, 0, 0]);
    setFaults([0, 0, 0]);
    setTransportFault([0, 0]);
    setConnected(true);
    setImu(true);
    setBattery(100);
    setUsb(true);
    setCharging(false);
    setError(null);
  };
  const reset = () => {
    resetControls();
    setSelected(null);
    send({ type: "reset" });
  };
  const toggleSound = async () => {
    if (sound && audio.current?.state === "running") {
      soundEnabled.current = false;
      setSound(false);
      stopSound();
      await audio.current.suspend();
      return;
    }
    try {
      audio.current ??= new AudioContext({ latencyHint: "interactive" });
      await audio.current.resume();
      soundEnabled.current = true;
      setSound(true);
      setTransport(
        `Cues PCM compartidos a 16 kHz · salida del navegador a ${audio.current.sampleRate / 1000} kHz. El transporte de voz es un fixture silencioso.`
      );
    } catch {
      setError("No hay audio disponible. Igual podés correr todos los escenarios silenciosos.");
    }
  };
  const ready = !!manifest && !!state;
  const locked = mode === "replay" || live;
  const inputsLocked = mode === "replay";
  const pointer = (event: React.PointerEvent<HTMLCanvasElement>, pressed: number) => {
    if (!ready || inputsLocked) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(465, ((event.clientX - rect.left) * 466) / rect.width));
    const y = Math.max(0, Math.min(465, ((event.clientY - rect.top) * 466) / rect.height));
    input("pointer", [x, y, pressed]);
  };
  const changeAngle = (index: number, value: number) => {
    const next = [...angles];
    next[index] = Math.max(-70, Math.min(70, value));
    setAngles(next);
    send({ type: "pose", angles: next });
  };
  const powerTelemetry = (pct: number, cable: boolean, charge: boolean) =>
    input("powerTelemetry", [0x08 | (cable ? 0x20 : 0), charge ? 0x20 : 0x40, pct, 31]);

  // Keyboard on the device: the same gestures the touchscreen and the BOOT button give.
  const shortcuts = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!ready || inputsLocked || event.repeat) return;
    const key = event.key.toLowerCase();
    const actions: Record<string, () => void> = {
      " ": () => input("boot", [100]),
      h: () => input("boot", [900]),
      p: () => input("pet"),
      w: () => input("wake"),
      s: () => send({ type: "shake" }),
      c: () => input("center"),
      arrowleft: () => changeAngle(0, angles[0] - 10),
      arrowright: () => changeAngle(0, angles[0] + 10),
      arrowup: () => changeAngle(1, angles[1] - 10),
      arrowdown: () => changeAngle(1, angles[1] + 10),
    };
    const action = actions[key];
    if (!action) return;
    event.preventDefault();
    action();
  };

  const currentScenario = scenarios.find((s) => s.id === selected);
  const progress = currentScenario ? Math.min(100, ((state?.time ?? 0) / currentScenario.duration) * 100) : 0;
  const voiceLabel = state?.voice.replaceAll("_", " ") ?? "cargando runtime";
  const modeLabel = live ? "Bridge en vivo · dispositivo virtual" : locked ? "Replay grabado" : "Dispositivo simulado";

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-foreground text-2xl font-bold tracking-tight">Owy Companion</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            El firmware real corriendo en el navegador: la misma cara, gestos y voz que el Owy físico de la mesa.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Badge className="whitespace-nowrap" variant={ready ? "default" : "outline"}>
            {ready ? "Runtime listo" : "Cargando runtime…"}
          </Badge>
          <Badge className="whitespace-nowrap" variant="outline">
            {modeLabel}
          </Badge>
          <Button size="icon" title="Cómo funciona este emulador" variant="ghost" onClick={() => setHelp(!help)}>
            <CircleHelp className="h-4 w-4" />
          </Button>
          <Button disabled={!ready || live} size="sm" variant="outline" onClick={() => picker.current?.click()}>
            <ArrowUpFromLine className="mr-1 h-4 w-4" /> Importar replay
          </Button>
          <Button disabled={!ready || live} size="sm" onClick={() => send({ type: "export" })}>
            <ArrowDownToLine className="mr-1 h-4 w-4" /> Exportar sesión
          </Button>
          <input
            ref={picker}
            hidden
            accept="application/json,.json"
            type="file"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              if (file.size > 2 * 1024 * 1024) {
                setError("El replay supera el límite de 2 MiB.");
                return;
              }
              resetControls();
              setSelected(null);
              send({ type: "import", json: await file.text() });
            }}
          />
        </div>
      </div>

      {error && (
        <div
          className="flex items-center justify-between gap-3 rounded-md border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm"
          role="alert"
        >
          <span>{error}</span>
          <Button aria-label="Cerrar" size="icon" variant="ghost" onClick={() => setError(null)}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {help && (
        <Card>
          <CardContent className="text-muted-foreground space-y-2 p-4 text-sm">
            <p className="text-foreground font-medium">Una ventana con forma de dispositivo al código real.</p>
            <p>
              Las nueve pantallas y las fuentes salen del LVGL de ESPHome fijado. Fusión de movimiento, calibración,
              clasificación de toques, animación y síntesis de cues corren como el mismo C++ en WebAssembly.
            </p>
            <p>
              El VoiceTurn y el PacedSpeaker de producción corren contra tiempo virtual y un transporte simulado. Red,
              energía y acceso de staff usan fixtures determinísticos; el wake se inyecta, no se reconoce. PIN del
              fixture: <code className="font-terminal">1234</code>. La voz en vivo conecta este dispositivo virtual al
              bridge Node real (mismos prompts, tools y turnos) y queda fuera del replay.
            </p>
            <p>
              Arrastrá sobre Owy para acariciarlo o deslizar; los botones y el teclado hacen lo mismo. Pausá, avanzá y
              arrastrá la línea de tiempo para reproducir un problema; importar un replay bloquea las entradas hasta
              reiniciar.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 xl:grid-cols-[260px_minmax(0,1fr)_380px] 2xl:grid-cols-[300px_minmax(0,1fr)_420px]">
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <FlaskConical className="h-4 w-4 text-yellow-400" /> Escenarios
                <span className="font-terminal text-muted-foreground ml-auto text-xs">
                  {scenarios.length.toString().padStart(2, "0")}
                </span>
              </CardTitle>
              <CardDescription>Historias cortas, comportamiento reproducible.</CardDescription>
            </CardHeader>
            <CardContent className="max-h-[640px] [scrollbar-width:thin] [scrollbar-color:#3f3f46_transparent] space-y-1 overflow-y-auto p-2 pt-0">
              {scenarios.map((scenario, index) => {
                const isSelected = selected === scenario.id;
                return (
                  <button
                    key={scenario.id}
                    className={`hover:bg-accent flex w-full items-start gap-3 rounded-md px-3 py-2 text-left transition-colors disabled:opacity-50 ${
                      isSelected ? "bg-accent ring-1 ring-yellow-400/60" : ""
                    }`}
                    disabled={!ready || live}
                    onClick={() => {
                      resetControls();
                      setSelected(scenario.id);
                      send({ type: "scenario", id: scenario.id });
                    }}
                  >
                    <span className="font-terminal text-muted-foreground mt-0.5 text-[11px]">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm leading-tight font-medium">{scenario.name}</span>
                      <span className="text-muted-foreground block text-xs leading-snug">{scenario.detail}</span>
                      {isSelected && (
                        <span className="mt-2 block h-1 w-full overflow-hidden rounded-full bg-zinc-800">
                          <span
                            className="block h-full bg-yellow-400 transition-[width]"
                            style={{ width: `${progress}%` }}
                          />
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
              <p className="text-muted-foreground px-3 pt-2 pb-1 text-[11px]">
                Los escenarios simulados nunca mandan audio. La voz en vivo es opt-in y no se graba ni se reproduce.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Tv className="h-4 w-4 text-yellow-400" /> Pantalla grande
              </CardTitle>
              <CardDescription>Lo que la pared muestra mientras alguien habla con Owy.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 pt-0">
              {wall ? (
                <ScaledFrame src="/owy/stage/owy-face" title="Owy en la pantalla grande" />
              ) : (
                <Button className="w-full" size="sm" variant="outline" onClick={() => setWall(true)}>
                  Mostrar la vista de la pared
                </Button>
              )}
              <div className="text-muted-foreground flex items-center justify-between text-[11px]">
                <span>Necesita el bridge con OWY_API_KEY.</span>
                <a className="hover:text-foreground inline-flex items-center gap-1" href="/admin/owy/scenes">
                  Escenas <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <div className="flex items-center gap-2 text-sm">
              <span
                className={`inline-block h-2.5 w-2.5 rounded-full ${live ? "animate-pulse bg-[#0162C8]" : ready ? "bg-yellow-400" : "bg-zinc-600"}`}
              />
              <span className="font-medium">{modeLabel}</span>
            </div>
            <Button
              aria-label={zoom ? "Ajustar" : "Tamaño nativo 466 px"}
              size="icon"
              variant="ghost"
              onClick={() => setZoom(!zoom)}
            >
              <Maximize2 className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div
              aria-label="Owy. Espacio: tocar. H: mantener. P: acariciar. W: wake word. S: sacudir. C: centrar. Flechas: inclinar."
              className="flex flex-col items-center rounded-lg bg-[radial-gradient(circle_at_50%_30%,rgba(245,187,3,0.10),transparent_60%)] p-4 outline-none focus-visible:ring-2 focus-visible:ring-yellow-400/60"
              role="group"
              tabIndex={0}
              onKeyDown={shortcuts}
            >
              <div
                className={`relative aspect-square shrink-0 overflow-hidden rounded-full border-[10px] border-zinc-800 bg-black shadow-[0_30px_70px_rgba(0,0,0,0.6),inset_0_0_0_2px_rgba(255,255,255,0.05)] ${
                  zoom ? "w-[486px]" : "w-full max-w-[440px]"
                }`}
              >
                <canvas
                  ref={panel}
                  aria-label="Pantalla interactiva de Owy, 466 por 466 píxeles. Los mismos controles están en Entradas."
                  className="h-full w-full cursor-pointer touch-none rounded-full transition-opacity"
                  height={466}
                  role="img"
                  style={{ opacity: state?.powered === false ? 0 : state?.dimmed ? 0.15 : 1 }}
                  width={466}
                  onPointerCancel={(event) => pointer(event, 0)}
                  onPointerDown={(event) => {
                    event.currentTarget.setPointerCapture(event.pointerId);
                    pointer(event, 1);
                  }}
                  onPointerMove={(event) => {
                    if (event.buttons) pointer(event, 1);
                  }}
                  onPointerUp={(event) => {
                    pointer(event, 0);
                    if (event.currentTarget.hasPointerCapture(event.pointerId))
                      event.currentTarget.releasePointerCapture(event.pointerId);
                  }}
                />
                {!ready && (
                  <div className="text-muted-foreground absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black text-xs">
                    <span className="h-6 w-6 animate-spin rounded-full border-2 border-yellow-400 border-t-transparent" />
                    Despertando los píxeles reales…
                  </div>
                )}
              </div>
              <p className="text-muted-foreground mt-4 flex items-center gap-2 text-xs">
                <Hand className="h-3.5 w-3.5" />
                {live
                  ? "Tocá para cancelar o empezar; mantené para ajustes. Voz y pantalla usan el bridge real."
                  : "Tocá, arrastrá, incliná. Con el foco acá, el teclado también sirve."}
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="flex items-center gap-2">
                <span className={`inline-block h-2 w-2 rounded-full ${ready ? "bg-yellow-400" : "bg-zinc-600"}`} />
                <span className="font-terminal">{voiceLabel}</span>
              </span>
              <span className="font-terminal text-muted-foreground">
                {state?.page ?? "face"} · 466 × 466 · {stamp(state?.time ?? 0)}
              </span>
            </div>

            <div className="space-y-1.5">
              <LevelMeter color="#0162C8" label="Mic" value={state?.envelope[0] ?? 0} />
              <LevelMeter color="#F5BB03" label="Voz" value={(state?.envelope[1] ?? 0) / 100} />
            </div>

            <div>
              <SectionTitle icon={Fingerprint}>Gestos</SectionTitle>
              <div className="mt-2 grid grid-cols-2 gap-2 2xl:grid-cols-3">
                {(
                  [
                    ["Tocar / BOOT", Mic, () => input("boot", [100]), "␣"],
                    ["Mantener", Settings2, () => input("boot", [900]), "H"],
                    ["Acariciar", Hand, () => input("pet"), "P"],
                    ["Wake word", Radio, () => input("wake"), "W"],
                    ["Sacudir", Activity, () => send({ type: "shake" }), "S"],
                    ["Centrar mirada", RotateCcw, () => input("center"), "C"],
                  ] as const
                ).map(([label, Icon, action, key]) => (
                  <Button
                    key={label}
                    className="min-w-0 justify-between overflow-hidden"
                    disabled={!ready || inputsLocked}
                    size="sm"
                    variant="outline"
                    onClick={action}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <Icon className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{label}</span>
                    </span>
                    <Kbd className="ml-2 shrink-0">{key}</Kbd>
                  </Button>
                ))}
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  disabled={!ready || locked || state?.phase !== 2}
                  size="sm"
                  onClick={() => input("speech", [1, 1200])}
                >
                  <AudioLines className="mr-2 h-4 w-4" /> Decir algo (fixture)
                </Button>
                <Button disabled={inputsLocked} size="sm" variant="ghost" onClick={() => input("page", [], "help")}>
                  Deslizar ← ayuda
                </Button>
                <Button disabled={inputsLocked} size="sm" variant="ghost" onClick={() => input("page", [], "qr")}>
                  Deslizar → QR
                </Button>
              </div>
            </div>

            <div>
              <SectionTitle icon={Activity} hint={locked ? "fijo por voz/replay" : undefined}>
                Cara
              </SectionTitle>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {MOODS.map((name, i) => (
                  <Button
                    key={name}
                    disabled={!ready || locked}
                    size="sm"
                    variant="secondary"
                    onClick={() => input("mood", [i])}
                  >
                    {name}
                  </Button>
                ))}
                <Button disabled={!ready || locked} size="sm" variant="outline" onClick={() => input("mood", [-1])}>
                  Seguir la voz
                </Button>
              </div>
            </div>

            {currentScenario && (
              <div className="rounded-md border bg-zinc-900/60 p-3 text-sm">
                <p className="text-xs font-semibold tracking-[0.15em] text-yellow-400 uppercase">Explorando</p>
                <p className="mt-1 font-medium">{currentScenario.name}</p>
                <p className="text-muted-foreground text-xs">{currentScenario.detail}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <LiveVoicePanel
          deviceSettings={state?.settings}
          disabled={!ready || mode === "replay"}
          unavailable={
            state?.settings.privacy
              ? "Apagá la privacidad del micrófono en los ajustes del dispositivo antes de hablar."
              : state?.powered === false
                ? "Encendé el dispositivo virtual antes de hablar."
                : state && ["settling", "collecting"].includes(state.calibration)
                  ? "Terminá o cancelá la calibración antes de hablar."
                  : undefined
          }
          onActive={onLive}
          onClient={onLiveClient}
          onCue={onLiveCue}
          onDevice={onLiveDevice}
          onSetting={onLiveSetting}
          onVisual={onLiveVisual}
        />
      </div>

      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              aria-label={playing ? "Pausar el reloj virtual" : "Reanudar el reloj virtual"}
              disabled={!ready || live}
              size="icon"
              onClick={() => send({ type: "play", value: !playing })}
            >
              {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </Button>
            <Button
              aria-label="Avanzar 16 ms"
              disabled={!ready || playing}
              size="icon"
              variant="outline"
              onClick={() => send({ type: "advance", ms: 16 })}
            >
              <SkipForward className="h-4 w-4" />
            </Button>
            <Button
              disabled={!ready || playing}
              size="sm"
              variant="outline"
              onClick={() => send({ type: "advance", ms: 1000 })}
            >
              +1 s
            </Button>
            <Button
              aria-label="Reiniciar la simulación"
              disabled={!ready || live}
              size="icon"
              variant="outline"
              onClick={reset}
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
            <span className="font-terminal ml-2 text-lg tabular-nums">{stamp(state?.time ?? 0)}</span>
            <span className="text-muted-foreground text-xs">tiempo virtual</span>
            <Select
              disabled={live}
              value={speed}
              onValueChange={(value) => {
                setSpeed(value);
                send({ type: "speed", value: Number(value) });
              }}
            >
              <SelectTrigger className="h-8 w-[90px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[0.25, 0.5, 1, 2, 4].map((v) => (
                  <SelectItem key={v} value={String(v)}>
                    {v}×
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Badge className="ml-auto" variant={live ? "outline" : locked ? "secondary" : "destructive"}>
              {live ? "No graba" : locked ? "Replay" : "Grabando entradas"}
            </Badge>
          </div>
          <div className="text-muted-foreground flex items-center gap-3 text-xs">
            <span className="w-16 shrink-0">Ir a</span>
            <Slider
              disabled={!ready || playing || duration < 16}
              max={Math.max(duration, 1)}
              min={0}
              step={16}
              value={[Math.min(state?.time ?? 0, duration)]}
              onValueChange={([time]) => {
                stopSound();
                send({ type: "seek", time });
              }}
            />
            <span className="font-terminal w-16 shrink-0 text-right tabular-nums">{stamp(duration)}</span>
          </div>
          <div className="font-terminal text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
            <span className="tracking-[0.15em] uppercase">Traza</span>
            {trace
              .slice(-6)
              .reverse()
              .map((event, i) => (
                <span key={`${event.t}-${i}`}>
                  <span className="text-foreground/70 mr-1">{stamp(event.t)}</span>
                  {event.event}
                </span>
              ))}
            <span className="ml-auto">
              {live ? "bridge real · tools en vivo" : "determinístico · acotado · exportable"}
            </span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <Tabs defaultValue="inputs">
          <CardHeader className="pb-0">
            <TabsList className="w-fit">
              <TabsTrigger value="inputs">
                <Move3D className="mr-2 h-4 w-4" /> Entradas
              </TabsTrigger>
              <TabsTrigger value="state">
                <Activity className="mr-2 h-4 w-4" /> Estado
              </TabsTrigger>
              <TabsTrigger value="settings">
                <Settings2 className="mr-2 h-4 w-4" /> Ajustes
              </TabsTrigger>
              <TabsTrigger value="faults">
                <Gauge className="mr-2 h-4 w-4" /> Fallas
              </TabsTrigger>
            </TabsList>
            {locked && (
              <p className="text-muted-foreground pt-3 text-xs">
                {live
                  ? "Toque, movimiento y ajustes siguen activos. La voz usa el bridge; replay, voz sintética y fallas quedan bloqueados."
                  : "El replay es de solo lectura. Reiniciá para probar otra cosa."}
              </p>
            )}
          </CardHeader>
          <CardContent className="pt-4">
            <TabsContent className="grid gap-8 md:grid-cols-2" value="inputs">
              <div className="space-y-4">
                <SectionTitle icon={Move3D} hint="g / °/s">
                  Movimiento
                </SectionTitle>
                {["Roll", "Pitch", "Yaw"].map((axis, i) => (
                  <RangeRow
                    key={axis}
                    disabled={!ready || inputsLocked}
                    label={axis}
                    max={70}
                    min={-70}
                    unit="°"
                    value={angles[i]}
                    onChange={(value) => changeAngle(i, value)}
                  />
                ))}
                <p className="text-muted-foreground text-xs">
                  Cambiar la pose produce gravedad y velocidad angular juntas. El yaw es relativo, no una brújula.
                </p>
              </div>
              <div className="space-y-4">
                <SectionTitle icon={Volume2}>Cues y envolventes</SectionTitle>
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" variant={sound ? "secondary" : "outline"} onClick={toggleSound}>
                    {sound ? <Volume2 className="mr-2 h-4 w-4" /> : <VolumeX className="mr-2 h-4 w-4" />}
                    {sound ? "Sonido activado" : "Activar sonido"}
                  </Button>
                  {["Escucha", "Juguetón", "Diagnóstico"].map((name, i) => (
                    <Button
                      key={name}
                      disabled={!sound || locked || !ready}
                      size="sm"
                      variant="ghost"
                      onClick={() => input("cue", [i])}
                    >
                      {name}
                    </Button>
                  ))}
                </div>
                <p className="text-muted-foreground text-xs">{transport}</p>
                {["Envolvente del mic", "Envolvente de voz"].map((name, i) => (
                  <RangeRow
                    key={name}
                    disabled={!ready || locked}
                    label={name}
                    max={100}
                    min={0}
                    unit="%"
                    value={Math.round((state?.envelope[i] ?? 0) * (i === 0 ? 100 : 1))}
                    onChange={(value) => {
                      const values = [...(state?.envelope ?? [0, 0])];
                      values[i] = value / (i === 0 ? 100 : 1);
                      input("envelope", values);
                    }}
                  />
                ))}
                <p className="text-muted-foreground text-xs">
                  Niveles sintéticos para ejercitar la animación de escucha y de boca; no generan voz ni reconocen nada.
                </p>
              </div>
            </TabsContent>

            <TabsContent className="grid gap-8 md:grid-cols-2" value="state">
              <div className="space-y-3">
                <SectionTitle icon={Activity}>Por qué este estado</SectionTitle>
                <p className="rounded-md border bg-zinc-900/60 p-3 text-sm">{state?.why ?? "Cargando el runtime…"}</p>
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                  {[
                    ["Voz", state?.voice],
                    ["PCM recibido", `${state?.audioReceived ?? 0} B`],
                    ["Buffer de recepción", `${state?.audioBuffered ?? 0} / 32768 B`],
                    ["Pantalla", state?.page],
                    ["IMU", state?.imuReady ? "muestras frescas" : "sin muestras / viejas"],
                    ["Mirada · px", state?.gaze.join(", ")],
                    ["Gravedad fusionada · g", state?.gravity.map((n) => n.toFixed(3)).join(", ")],
                    ["Bias del gyro · °/s", state?.bias.map((n) => n.toFixed(3)).join(", ")],
                    ["Neutral · g", state?.neutral.map((n) => n.toFixed(3)).join(", ")],
                    ["Calibración", `${state?.calibration ?? "—"} · ${state?.calibrationProgress ?? 0}%`],
                    ["Staff (fixture)", state?.settings.staff ? "desbloqueado" : "bloqueado"],
                  ].map(([name, value]) => (
                    <div key={name} className="contents">
                      <dt className="text-muted-foreground">{name}</dt>
                      <dd className="font-terminal text-xs tabular-nums">{value ?? "—"}</dd>
                    </div>
                  ))}
                </dl>
              </div>
              <div className="text-muted-foreground space-y-3 text-xs">
                <SectionTitle>Límite de paridad</SectionTitle>
                <p>C++ compartido: fusión de IMU, calibración, gestos, cara, PCM.</p>
                <p>Generado del firmware: las nueve escenas LVGL y las fuentes.</p>
                <p>Bridge compartido: VoiceTurn y PacedSpeaker de producción con timers virtuales.</p>
                <p>
                  HAL de fixture: driver de audio, red, energía, staff. El panel de voz conecta a Gemini aparte; el wake
                  acústico y el hardware real no están conectados.
                </p>
                <p className="font-terminal">
                  LVGL {manifest?.lvgl} · ESPHome {manifest?.esphome} · {manifest?.version}
                </p>
              </div>
            </TabsContent>

            <TabsContent className="grid gap-8 md:grid-cols-2" value="settings">
              <div className="space-y-1">
                <SectionTitle icon={Settings2}>Preferencias del dispositivo</SectionTitle>
                <div className="mt-2 divide-y">
                  {TOGGLES.map(([key, name]) => (
                    <SwitchRow
                      key={key}
                      checked={!!state?.settings[key]}
                      disabled={!ready || inputsLocked}
                      label={name}
                      onChange={(value) => input("setting", [Number(value)], key)}
                    />
                  ))}
                </div>
              </div>
              <div className="space-y-4">
                <SectionTitle>Volumen, brillo y pantalla</SectionTitle>
                {(
                  [
                    ["volume", "Volumen", 0, 80],
                    ["brightness", "Brillo", 10, 100],
                  ] as const
                ).map(([key, name, min, max]) => (
                  <RangeRow
                    key={key}
                    disabled={!ready || inputsLocked}
                    label={name}
                    max={max}
                    min={min}
                    step={5}
                    unit="%"
                    value={state?.settings[key] ?? 80}
                    onChange={(value) => input("setting", [value], key)}
                  />
                ))}
                <div className="flex flex-wrap gap-2">
                  <Button
                    disabled={!ready || inputsLocked}
                    size="sm"
                    variant="outline"
                    onClick={() => input("page", [], "calibration")}
                  >
                    <Move3D className="mr-2 h-4 w-4" /> Calibración
                  </Button>
                  <Button
                    disabled={locked}
                    size="sm"
                    variant="outline"
                    onClick={() => input("card", [], "Ideas que nos conectan")}
                  >
                    Mostrar card
                  </Button>
                  <Button
                    disabled={locked}
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      input("text", [], "Nos vemos en la próxima charla. Compartir ideas nos hace crecer.")
                    }
                  >
                    Mostrar texto
                  </Button>
                </div>
                <p className="text-muted-foreground text-xs">
                  Usá también los controles en pantalla del dispositivo. Reiniciar restaura los valores del fixture;
                  nada de esto toca el dispositivo físico.
                </p>
              </div>
            </TabsContent>

            <TabsContent className="grid gap-8 md:grid-cols-2" value="faults">
              <div className="space-y-1">
                <SectionTitle icon={Gauge} hint="modeladas">
                  Inyección de fallas
                </SectionTitle>
                <p className="text-muted-foreground pb-2 text-xs">
                  Repetí fallas sin tocar un parlante, una conexión o un micrófono reales.
                </p>
                <div className="divide-y">
                  {FAULTS.map((name, i) => (
                    <SwitchRow
                      key={name}
                      checked={!!faults[i]}
                      disabled={!ready || locked}
                      label={name}
                      onChange={(value) => {
                        const next = [...faults];
                        next[i] = Number(value);
                        setFaults(next);
                        input("fault", next);
                      }}
                    />
                  ))}
                  {TRANSPORT_FAULTS.map((name, i) => (
                    <SwitchRow
                      key={name}
                      checked={!!transportFault[i]}
                      disabled={!ready || locked}
                      label={name}
                      onChange={(value) => {
                        const next = [...transportFault];
                        next[i] = value ? (i === 0 ? 700 : 1) : 0;
                        setTransportFault(next);
                        input("transport", next);
                      }}
                    />
                  ))}
                  <SwitchRow
                    checked={connected}
                    disabled={!ready || locked}
                    label="Bridge conectado"
                    onChange={(value) => {
                      setConnected(value);
                      input("connection", [Number(value)]);
                    }}
                  />
                  <SwitchRow
                    checked={imu}
                    disabled={!ready || inputsLocked}
                    label="La IMU entrega muestras"
                    onChange={(value) => {
                      setImu(value);
                      input("imuAvailable", [Number(value)]);
                    }}
                  />
                </div>
              </div>
              <div className="space-y-4">
                <SectionTitle>Energía</SectionTitle>
                <RangeRow
                  disabled={!ready || inputsLocked}
                  label="Batería"
                  max={100}
                  min={0}
                  unit="%"
                  value={battery}
                  onChange={(value) => {
                    setBattery(value);
                    powerTelemetry(value, usb, charging);
                  }}
                />
                <div className="divide-y">
                  <SwitchRow
                    checked={usb}
                    disabled={!ready || inputsLocked}
                    label="USB conectado"
                    onChange={(value) => {
                      setUsb(value);
                      powerTelemetry(battery, value, charging);
                    }}
                  />
                  <SwitchRow
                    checked={charging}
                    disabled={!ready || inputsLocked}
                    label="Cargando"
                    onChange={(value) => {
                      setCharging(value);
                      powerTelemetry(battery, usb, value);
                    }}
                  />
                </div>
                <Button
                  disabled={!ready || inputsLocked}
                  size="sm"
                  variant="outline"
                  onClick={() => input("power", [state?.powered ? 0 : 1])}
                >
                  PWR · {state?.powered ? "Apagar" : "Encender"}
                </Button>
                <p className="text-muted-foreground text-xs">
                  La energía es una entrada del fixture, no una simulación eléctrica del PMIC.
                </p>
              </div>
            </TabsContent>
          </CardContent>
        </Tabs>
      </Card>
    </div>
  );
}
