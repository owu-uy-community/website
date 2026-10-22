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

import { Notice } from "components/Admin/panel";
import { ScaledFrame } from "components/Admin/stage/ScaledFrame";
import { Meter, MicroLabel, PageContainer, PageHeader } from "components/Admin/ui/page";
import { StatusDot } from "components/Admin/ui/status";
import { Badge } from "components/shared/ui/badge";
import { Button } from "components/shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "components/shared/ui/card";
import { Kbd } from "components/shared/ui/kbd";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "components/shared/ui/select";
import { Slider } from "components/shared/ui/slider";
import { Switch } from "components/shared/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "components/shared/ui/tabs";

import AudioRoutingCard from "./AudioRoutingCard";
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

/** The scenarios come from the emulator in English; the page tells them in Spanish (by id). */
const SCENARIO_COPY: Record<string, { name: string; detail: string }> = {
  hello: { name: "Un saludo", detail: "Inclinar, parpadear, una caricia y una sacudida a propósito." },
  conversation: {
    name: "Que siga la charla",
    detail: "Tres respuestas, el parlante que termina de sonar y ocho segundos de silencio.",
  },
  pitch: {
    name: "Un pitch en el mercado",
    detail:
      "Modo pitch: un toque, catorce segundos de pitch con pausas, otro toque. Sin ventana de silencio ni repregunta.",
  },
  calibration: {
    name: "Encontrar el centro",
    detail: "Una pose corrida del centro con 2°/s de desvío del giroscopio. Medir y guardar el neutro.",
  },
  "calibration-motion": {
    name: "Muy movido para calibrar",
    detail: "Las muestras en movimiento no pueden reemplazar la calibración anterior.",
  },
  privacy: {
    name: "Privacidad a mitad de respuesta",
    detail: "Cortar el audio y bloquear los intentos de activación que siguen.",
  },
  driver: {
    name: "El parlante llega tarde",
    detail: "Una falla inyectada al arrancar el driver ejercita la recuperación.",
  },
  drain: {
    name: "Terminar no es detenerse",
    detail: "Un parlante que no termina de vaciarse no puede reabrir el micrófono.",
  },
  transport: {
    name: "Una ráfaga en el cable",
    detail: "El marcapasos real, una pausa de 700 ms en el transporte y un receptor de 32 KiB.",
  },
  "ready-timeout": {
    name: "Esperando al bus de audio",
    detail: "El control de disponibilidad del turno de voz vence sin abrir la voz.",
  },
  "imu-gap": {
    name: "Sensor desenchufado",
    detail: "Cortar las muestras de la IMU, dejar quieta la mirada y recuperar la gravedad.",
  },
  offline: { name: "Se cortó la conexión", detail: "Desconectar mientras escucha y reconectar sin riesgo." },
  staff: { name: "La puerta del staff", detail: "PIN equivocado, el PIN de prueba 1234 y la pantalla de ajustes." },
  power: { name: "Batería y descanso", detail: "Cargando, batería baja y el atenuado tras dos minutos quieto." },
  "long-reply": {
    name: "Una historia larga",
    detail: "Veinte segundos de respuesta modelada, con el movimiento todavía activo.",
  },
};

/** The firmware's voice states, in words; an unknown one shows as the firmware names it. */
const VOICE: Record<string, string> = {
  wake_word: "esperando activación",
  listening: "escuchando",
  thinking: "pensando",
  speaking: "hablando",
  idle: "en reposo",
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
  ["wake", "Palabra de activación"],
  ["quiet", "Modo silencioso"],
  ["pitch", "Modo pitch"],
  ["pitch_reacts", "Owy reacciona al pitch"],
];
/** Label → owy::Mood value (companion_model.h); FOLLOWUP and SLEEP were appended. */
const MOODS: [string, number][] = [
  ["En reposo", 0],
  ["Escuchando", 1],
  ["¿Algo más?", 8],
  ["Pensando", 2],
  ["Hablando", 3],
  ["Feliz", 4],
  ["Error", 5],
  ["Sin conexión", 6],
  ["Dormido", 9],
  ["Grabando", 10],
  ["Tocá (pitch)", 11],
];
/** owy::Expression order (companion_model.h): the face while a sentence plays (bridge expression.ts). */
const EXPRESSIONS = [
  "Neutral",
  "Contento",
  "Entusiasmado",
  "Curioso",
  "Pensativo",
  "Empático",
  "Pícaro",
  "Sorprendido",
];
const FAULTS = [
  "Driver demorado más allá del timeout",
  "El parlante nunca termina de drenar",
  "El bridge pierde el timeout de silencio",
];
const TRANSPORT_FAULTS = ["Ráfaga de 700 ms en el transporte", "Nunca confirmar que el audio está listo"];

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
      <MicroLabel className="flex items-center gap-2">
        {Icon && <Icon aria-hidden className="h-3.5 w-3.5" />}
        {children}
      </MicroLabel>
      {hint && <span className="font-terminal text-2xs text-muted-foreground">{hint}</span>}
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
      <span className="w-28 shrink-0 text-ui">{label}</span>
      <Slider
        disabled={disabled}
        max={max}
        min={min}
        step={step}
        value={[value]}
        onValueChange={([v]) => onChange(v)}
      />
      <span className="w-12 shrink-0 text-right font-terminal text-meta text-muted-foreground tabular-nums">
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
    <label className="flex items-center justify-between gap-3 py-1 text-ui">
      <span>{label}</span>
      <Switch checked={checked} disabled={disabled} onCheckedChange={onChange} />
    </label>
  );
}

export default function CompanionWorkbench() {
  const worker = useRef<Worker | null>(null);
  const [attachDevices, setAttachDevices] = useState<string[]>([]);
  const onAttachDevices = useCallback(
    (ids: string[]) =>
      setAttachDevices((current) =>
        current.length === ids.length && current.every((v, i) => v === ids[i]) ? current : ids
      ),
    []
  );
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
  const [transport, setTransport] = useState("En modo simulado el micrófono del navegador nunca se abre.");
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
        setScenarios(
          (data.scenarios as Scenario[]).map((scenario) => ({ ...scenario, ...SCENARIO_COPY[scenario.id] }))
        );
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
          // Modo pitch on the virtual Owy: a tap records a pitch, the second tap sends it.
          if (command === "start:pitch" || command === "start:pitch-name") void liveClient.current?.resume("pitch");
          if (command === "commit") liveClient.current?.finishTurn();
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
      setError("No se pudo cargar el emulador (WASM). Corré el build del emulador y recargá.");
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
        `Cues PCM compartidos a 16 kHz · salida del navegador a ${audio.current.sampleRate / 1000} kHz. El transporte de voz es simulado y mudo.`
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
  const voiceLabel = state ? (VOICE[state.voice] ?? state.voice.replaceAll("_", " ")) : "cargando el emulador";
  const modeLabel = live ? "Bridge en vivo · dispositivo virtual" : locked ? "Sesión grabada" : "Dispositivo simulado";

  return (
    <PageContainer className="space-y-6" size="large">
      <PageHeader
        actions={
          <>
            <Button
              aria-expanded={help}
              aria-label="Cómo funciona este emulador"
              size="icon"
              title="Cómo funciona este emulador"
              variant="ghost"
              onClick={() => setHelp(!help)}
            >
              <CircleHelp />
            </Button>
            <Button disabled={!ready || live} variant="outline" onClick={() => picker.current?.click()}>
              <ArrowUpFromLine /> Importar sesión
            </Button>
            <Button disabled={!ready || live} onClick={() => send({ type: "export" })}>
              <ArrowDownToLine /> Exportar sesión
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
                  setError("La sesión supera el límite de 2 MiB.");
                  return;
                }
                resetControls();
                setSelected(null);
                send({ type: "import", json: await file.text() });
              }}
            />
          </>
        }
        description="El firmware real corriendo en el navegador: la misma cara, gestos y voz que el Owy físico de la mesa."
        meta={
          <>
            <Badge variant={ready ? "success" : "secondary"}>
              {ready ? "Emulador listo" : "Cargando el emulador…"}
            </Badge>
            <Badge variant="outline">{modeLabel}</Badge>
          </>
        }
        title="Owy"
      />

      <Notice show={Boolean(error)} tone="danger">
        <span className="flex items-start justify-between gap-3">
          <span>{error}</span>
          <Button
            aria-label="Cerrar el aviso"
            className="-my-1"
            size="icon-xs"
            variant="ghost"
            onClick={() => setError(null)}
          >
            <X />
          </Button>
        </span>
      </Notice>

      {help && (
        <Card>
          <CardContent className="space-y-2 p-4 text-ui text-muted-foreground">
            <p className="font-medium text-foreground">Una ventana con forma de dispositivo al código real.</p>
            <p>
              Las nueve pantallas y las fuentes salen del LVGL de ESPHome fijado. Fusión de movimiento, calibración,
              clasificación de toques, animación y síntesis de cues corren como el mismo C++ en WebAssembly.
            </p>
            <p>
              El VoiceTurn y el PacedSpeaker de producción corren contra tiempo virtual y un transporte simulado. Red,
              energía y acceso de staff usan datos simulados y repetibles; la palabra de activación se inyecta, no se
              reconoce. PIN de prueba: <code className="font-terminal">1234</code>. La voz en vivo conecta este
              dispositivo virtual al bridge Node real (mismos prompts, herramientas y turnos) y queda fuera de la sesión
              grabada.
            </p>
            <p>
              Arrastrá sobre Owy para acariciarlo o deslizar; los botones y el teclado hacen lo mismo. Pausá, avanzá y
              arrastrá la línea de tiempo para reproducir un problema; importar una sesión bloquea las entradas hasta
              reiniciar.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Tablets: Owy first (portrait), or beside the scenarios with the voice below (landscape). */}
      <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)] xl:grid-cols-[260px_minmax(0,1fr)_380px] 2xl:grid-cols-[300px_minmax(0,1fr)_420px]">
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <FlaskConical aria-hidden className="h-4 w-4 text-muted-foreground" /> Escenarios
                <span className="ml-auto font-terminal text-meta text-muted-foreground tabular-nums">
                  {scenarios.length.toString().padStart(2, "0")}
                </span>
              </CardTitle>
              <CardDescription>Historias cortas, comportamiento reproducible.</CardDescription>
            </CardHeader>
            <CardContent className="max-h-[640px] scrollbar-thin space-y-1 overflow-y-auto p-2 pt-0">
              {scenarios.map((scenario, index) => {
                const isSelected = selected === scenario.id;
                return (
                  <button
                    key={scenario.id}
                    className={`flex w-full items-start gap-3 rounded-md px-3 py-2 text-left transition-colors outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/70 disabled:opacity-50 ${
                      isSelected ? "bg-accent ring-1 ring-primary/60" : ""
                    }`}
                    disabled={!ready || live}
                    onClick={() => {
                      resetControls();
                      setSelected(scenario.id);
                      send({ type: "scenario", id: scenario.id });
                      // A tablet stacks Owy above the list: bring it back to watch the scenario play.
                      const box = panel.current?.getBoundingClientRect();
                      if (box && (box.bottom < 0 || box.top > window.innerHeight))
                        panel.current?.scrollIntoView({ block: "center" });
                    }}
                  >
                    <span className="mt-0.5 font-terminal text-2xs text-muted-foreground tabular-nums">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-ui leading-tight font-medium">{scenario.name}</span>
                      <span className="block text-meta leading-snug text-muted-foreground">{scenario.detail}</span>
                      {isSelected && <Meter className="mt-2" value={progress} />}
                    </span>
                  </button>
                );
              })}
              <p className="px-3 pt-2 pb-1 text-2xs text-muted-foreground">
                Los escenarios simulados nunca mandan audio. La voz en vivo es opt-in y no se graba ni se reproduce.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <Tv aria-hidden className="h-4 w-4 text-muted-foreground" /> Pantalla grande
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
              <div className="flex items-center justify-between text-2xs text-muted-foreground">
                <span>Necesita el bridge con OWY_API_KEY.</span>
                <a
                  className="relative inline-flex items-center gap-1 hover:text-foreground pointer-coarse:after:absolute pointer-coarse:after:-inset-x-2 pointer-coarse:after:-inset-y-4"
                  href="/admin/owy/scenes"
                >
                  Escenas <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="max-lg:order-first">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <div className="flex items-center gap-2 text-ui">
              <StatusDot pulse={live} tone={live ? "info" : ready ? "brand" : "idle"} />
              <span className="font-medium">{modeLabel}</span>
            </div>
            {/* A phone is narrower than the native 466 px: the face would push the page sideways. */}
            <Button
              aria-label={zoom ? "Ajustar" : "Tamaño nativo 466 px"}
              className="max-sm:hidden"
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
              className="flex flex-col items-center rounded-lg bg-[radial-gradient(circle_at_50%_30%,hsl(var(--primary)/0.10),transparent_60%)] p-4 outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
              role="group"
              tabIndex={0}
              onKeyDown={shortcuts}
            >
              <div
                className={`relative aspect-square shrink-0 overflow-hidden rounded-full border-[10px] border-input bg-black shadow-[0_30px_70px_rgba(0,0,0,0.6),inset_0_0_0_2px_rgba(255,255,255,0.05)] ${
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
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black text-meta text-muted-foreground">
                    <span className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                    Despertando los píxeles reales…
                  </div>
                )}
              </div>
              <p className="mt-4 flex items-center gap-2 text-meta text-muted-foreground">
                <Hand className="h-3.5 w-3.5" />
                {live
                  ? "Tocá para cancelar o empezar; mantené para ajustes. Voz y pantalla usan el bridge real."
                  : "Tocá, arrastrá, incliná. Con el foco acá, el teclado también sirve."}
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-meta">
              <span className="flex items-center gap-2">
                <StatusDot tone={ready ? "brand" : "idle"} />
                <span className="font-terminal">{voiceLabel}</span>
              </span>
              <span className="font-terminal text-muted-foreground">
                {state?.page ?? "face"} · 466 × 466 · {stamp(state?.time ?? 0)}
              </span>
            </div>

            <div className="space-y-1.5">
              <LevelMeter color="hsl(var(--info))" label="Mic" value={state?.envelope[0] ?? 0} />
              <LevelMeter color="hsl(var(--primary))" label="Voz" value={(state?.envelope[1] ?? 0) / 100} />
            </div>

            <div>
              <SectionTitle icon={Fingerprint}>Gestos</SectionTitle>
              <div className="mt-2 grid grid-cols-2 gap-2 2xl:grid-cols-3">
                {(
                  [
                    ["Tocar / BOOT", Mic, () => input("boot", [100]), "␣"],
                    ["Mantener", Settings2, () => input("boot", [900]), "H"],
                    ["Acariciar", Hand, () => input("pet"), "P"],
                    ["Palabra de activación", Radio, () => input("wake"), "W"],
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
                    <Kbd className="ml-2 shrink-0 pointer-coarse:hidden">{key}</Kbd>
                  </Button>
                ))}
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  disabled={!ready || locked || state?.phase !== 2}
                  size="sm"
                  onClick={() => input("speech", [1, 1200])}
                >
                  <AudioLines /> Decir algo (simulado)
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
              <SectionTitle icon={Activity} hint={locked ? "fija por la voz o la sesión grabada" : undefined}>
                Cara
              </SectionTitle>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {MOODS.map(([name, mood]) => (
                  <Button
                    key={name}
                    disabled={!ready || locked}
                    size="sm"
                    variant="secondary"
                    onClick={() => input("mood", [mood])}
                  >
                    {name}
                  </Button>
                ))}
                <Button disabled={!ready || locked} size="sm" variant="outline" onClick={() => input("mood", [-1])}>
                  Seguir la voz
                </Button>
              </div>
              <p className="mt-3 text-meta text-muted-foreground">
                Expresión al hablar (se ve con <em>Hablando</em> o <em>Pensando</em>; en vivo la elige jev por frase)
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {EXPRESSIONS.map((name, i) => (
                  <Button
                    key={name}
                    disabled={!ready || locked}
                    size="sm"
                    variant="outline"
                    onClick={() => input("expression", [i, 0, 100])}
                  >
                    {name}
                  </Button>
                ))}
              </div>
            </div>

            {currentScenario && (
              <div className="rounded-md border bg-background p-3 text-ui">
                <MicroLabel>Explorando</MicroLabel>
                <p className="mt-1 font-medium">{currentScenario.name}</p>
                <p className="text-meta text-muted-foreground">{currentScenario.detail}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-col gap-6 lg:col-span-2 xl:col-span-1">
          <LiveVoicePanel
            attachDevices={attachDevices}
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
          <AudioRoutingCard onDevices={onAttachDevices} />
        </div>
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
            <span className="ml-2 font-terminal text-lg tabular-nums">{stamp(state?.time ?? 0)}</span>
            <span className="text-meta text-muted-foreground">tiempo virtual</span>
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
              {live ? "No graba" : locked ? "Sesión grabada" : "Grabando entradas"}
            </Badge>
          </div>
          <div className="flex items-center gap-3 text-meta text-muted-foreground">
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
            <span className="w-16 shrink-0 text-right font-terminal tabular-nums">{stamp(duration)}</span>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-terminal text-2xs text-muted-foreground">
            <span className="tracking-[0.15em] uppercase">Traza</span>
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
              {live ? "bridge real · herramientas en vivo" : "determinístico · acotado · exportable"}
            </span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <Tabs defaultValue="inputs">
          <CardHeader className="pb-0">
            <TabsList className="w-fit">
              <TabsTrigger value="inputs">
                <Move3D /> Entradas
              </TabsTrigger>
              <TabsTrigger value="state">
                <Activity /> Estado
              </TabsTrigger>
              <TabsTrigger value="settings">
                <Settings2 /> Ajustes
              </TabsTrigger>
              <TabsTrigger value="faults">
                <Gauge /> Fallas
              </TabsTrigger>
            </TabsList>
            {locked && (
              <p className="pt-3 text-meta text-muted-foreground">
                {live
                  ? "Toque, movimiento y ajustes siguen activos. La voz usa el bridge; sesiones grabadas, voz simulada y fallas quedan bloqueadas."
                  : "La sesión grabada es de solo lectura. Reiniciá para probar otra cosa."}
              </p>
            )}
          </CardHeader>
          <CardContent className="pt-4">
            <TabsContent className="grid gap-8 md:grid-cols-2" value="inputs">
              <div className="space-y-4">
                <SectionTitle icon={Move3D} hint="g / °/s">
                  Movimiento
                </SectionTitle>
                {["Lateral", "Frontal", "Giro"].map((axis, i) => (
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
                <p className="text-meta text-muted-foreground">
                  Cambiar la pose produce gravedad y velocidad angular juntas. El giro es relativo, no una brújula.
                </p>
              </div>
              <div className="space-y-4">
                <SectionTitle icon={Volume2}>Cues y envolventes</SectionTitle>
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" variant={sound ? "secondary" : "outline"} onClick={toggleSound}>
                    {sound ? <Volume2 /> : <VolumeX />}
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
                <p className="text-meta text-muted-foreground">{transport}</p>
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
                <p className="text-meta text-muted-foreground">
                  Niveles sintéticos para ejercitar la animación de escucha y de boca; no generan voz ni reconocen nada.
                </p>
              </div>
            </TabsContent>

            <TabsContent className="grid gap-8 md:grid-cols-2" value="state">
              <div className="space-y-3">
                <SectionTitle icon={Activity}>Por qué este estado</SectionTitle>
                <p className="rounded-md border bg-background p-3 text-ui">{state?.why ?? "Cargando el emulador…"}</p>
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-ui">
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
                    ["Staff (simulado)", state?.settings.staff ? "desbloqueado" : "bloqueado"],
                  ].map(([name, value]) => (
                    <div key={name} className="contents">
                      <dt className="text-muted-foreground">{name}</dt>
                      <dd className="font-terminal text-meta tabular-nums">{value ?? "—"}</dd>
                    </div>
                  ))}
                </dl>
              </div>
              <div className="space-y-3 text-meta text-muted-foreground">
                <SectionTitle>Límite de paridad</SectionTitle>
                <p>C++ compartido: fusión de IMU, calibración, gestos, cara, PCM.</p>
                <p>Generado del firmware: las nueve escenas LVGL y las fuentes.</p>
                <p>Bridge compartido: VoiceTurn y PacedSpeaker de producción con timers virtuales.</p>
                <p>
                  HAL simulado: driver de audio, red, energía, staff. El panel de voz conecta a Gemini aparte; la
                  palabra de activación acústica y el hardware real no están conectados.
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
                    <Move3D /> Calibración
                  </Button>
                  <Button
                    disabled={locked}
                    size="sm"
                    variant="outline"
                    onClick={() => input("card", [], "Ideas que nos conectan")}
                  >
                    Mostrar tarjeta
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
                <p className="text-meta text-muted-foreground">
                  Usá también los controles en pantalla del dispositivo. Reiniciar restaura los valores de prueba; nada
                  de esto toca el dispositivo físico.
                </p>
              </div>
            </TabsContent>

            <TabsContent className="grid gap-8 md:grid-cols-2" value="faults">
              <div className="space-y-1">
                <SectionTitle icon={Gauge} hint="modeladas">
                  Inyección de fallas
                </SectionTitle>
                <p className="pb-2 text-meta text-muted-foreground">
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
                <p className="text-meta text-muted-foreground">
                  La energía es una entrada simulada, no una simulación eléctrica del PMIC.
                </p>
              </div>
            </TabsContent>
          </CardContent>
        </Tabs>
      </Card>
    </PageContainer>
  );
}
