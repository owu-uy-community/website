"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowDownToLine,
  ArrowUpFromLine,
  AudioLines,
  ChevronRight,
  CircleHelp,
  Fingerprint,
  FlaskConical,
  Gauge,
  Hand,
  Maximize2,
  Mic,
  MoreHorizontal,
  Move3D,
  Pause,
  Play,
  Radio,
  RotateCcw,
  Settings2,
  ShieldCheck,
  SkipForward,
  Sparkles,
  Volume2,
  VolumeX,
  Wifi,
  X,
} from "lucide-react";
import styles from "./companion.module.css";
import LiveVoicePanel from "./LiveVoicePanel";
import type { VoiceVisual, DeviceCommand, WebVoice } from "./web-voice";

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
const toggles = [
  ["privacy", "Microphone privacy"],
  ["continuous", "Continuous conversation"],
  ["chime", "Listening tone"],
  ["sounds", "Interaction sounds"],
  ["motion", "Follow movement"],
  ["reduced", "Reduced motion"],
  ["invert_x", "Reverse horizontal"],
  ["invert_y", "Reverse vertical"],
  ["wake", "Wake word"],
  ["quiet", "Quiet mode"],
];

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
  const [tab, setTab] = useState<"inputs" | "state" | "settings" | "faults">("inputs");
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
  const [transport, setTransport] = useState("Browser microphone is never opened in fixture mode.");
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
        liveClient.current?.stop("The virtual device stopped. Microphone off; reload before reconnecting.");
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
      liveClient.current?.stop("The virtual device stopped. Microphone off.");
      setError("The WASM runtime could not load. Run the companion emulator build and reload.");
    };
    instance.postMessage({ type: "init" });
    const visibility = () => {
      if (document.hidden) {
        if (!liveRef.current) instance.postMessage({ type: "play", value: false });
        stopSound();
        void audio.current?.suspend();
        setTransport("Paused while hidden. Press Play and enable sound to continue.");
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
        `Shared 16 kHz PCM cues · browser output ${audio.current.sampleRate / 1000} kHz. Speech transport is a silent fixture.`
      );
    } catch {
      setError("Audio is unavailable. You can still run every silent scenario.");
    }
  };
  const ready = !!manifest && !!state,
    locked = mode === "replay" || live,
    inputsLocked = mode === "replay";
  const pointer = (event: React.PointerEvent<HTMLCanvasElement>, pressed: number) => {
    if (!ready || inputsLocked) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(465, ((event.clientX - rect.left) * 466) / rect.width));
    const y = Math.max(0, Math.min(465, ((event.clientY - rect.top) * 466) / rect.height));
    input("pointer", [x, y, pressed]);
  };
  const changeAngle = (index: number, value: number) => {
    const next = [...angles];
    next[index] = value;
    setAngles(next);
    send({ type: "pose", angles: next });
  };
  const powerTelemetry = (pct: number, cable: boolean, charge: boolean) =>
    input("powerTelemetry", [0x08 | (cable ? 0x20 : 0), charge ? 0x20 : 0x40, pct, 31]);
  const currentScenario = scenarios.find((s) => s.id === selected);
  const progress = currentScenario ? Math.min(100, ((state?.time ?? 0) / currentScenario.duration) * 100) : 0;

  return (
    <section className={styles.lab} aria-label="Owy companion emulator">
      <header className={styles.header}>
        <div className={styles.brand}>
          <span className={styles.brandIcon}>
            <Sparkles size={21} />
          </span>
          <div>
            <p className={styles.eyebrow}>OWY / DEVELOPMENT STUDIO</p>
            <h1>
              Companion lab<span>.</span>
            </h1>
          </div>
        </div>
        <div className={styles.headerActions}>
          <span className={styles.safe}>
            <ShieldCheck size={14} />
            {live ? "Virtual device · real bridge" : "Fixtures + bridge conversations"}
          </span>
          <button
            className={styles.iconButton}
            title="About parity and keyboard controls"
            aria-label="About this emulator"
            onClick={() => setHelp(!help)}
          >
            <CircleHelp size={20} />
          </button>
          <button className={styles.export} disabled={!ready || live} onClick={() => send({ type: "export" })}>
            <ArrowDownToLine size={15} />
            Export session
          </button>
        </div>
      </header>
      <LiveVoicePanel
        disabled={!ready || mode === "replay"}
        onActive={onLive}
        onVisual={onLiveVisual}
        onCue={onLiveCue}
        onDevice={onLiveDevice}
        onClient={onLiveClient}
        onSetting={onLiveSetting}
        deviceSettings={state?.settings}
        unavailable={
          state?.settings.privacy
            ? "Turn off microphone privacy in device settings before starting voice."
            : state?.powered === false
              ? "Power the virtual device on before starting voice."
              : state && ["settling", "collecting"].includes(state.calibration)
                ? "Finish or cancel calibration before starting voice."
                : undefined
        }
      />
      {error && (
        <div className={styles.error} role="alert">
          <span>{error}</span>
          <button aria-label="Dismiss error" onClick={() => setError(null)}>
            <X size={16} />
          </button>
        </div>
      )}
      {help && (
        <div className={styles.about}>
          <strong>A device-shaped window into the real code.</strong>
          <p>
            All nine screens and font bitmaps come from the pinned ESPHome LVGL output. Motion fusion, calibration,
            touch classification, animation, and cue synthesis run as the same C++ code in WebAssembly.
          </p>
          <p>
            The production VoiceTurn and PacedSpeaker run against virtual time and a simulated device transport.
            Network, power, and staff access use deterministic fixtures. Wake is injected—not recognized acoustically.
            Fixture PIN: <code>1234</code>. Live voice connects this virtual device to the gadget's real Node bridge:
            same prompts, tools and turn handling. Live data is excluded from replay. Production permissions are granted
            separately; the test PIN never grants them. Acoustics and electrical faults still need hardware checks.
          </p>
          <p>
            Drag directly on Owy to pet or swipe. Use the input buttons for keyboard-accessible equivalents. Pause,
            step, and scrub to replay an issue; importing locks inputs until you reset.
          </p>
        </div>
      )}
      <div className={styles.workspace}>
        <aside className={styles.scenarios} aria-label="Scenarios">
          <div className={styles.sectionTitle}>
            <span>
              <FlaskConical size={15} />
              SCENARIOS
            </span>
            <span>{scenarios.length.toString().padStart(2, "0")}</span>
          </div>
          <p className={styles.asideIntro}>Small stories. Reproducible behavior.</p>
          <div className={styles.scenarioList}>
            {scenarios.map((scenario, index) => (
              <button
                key={scenario.id}
                className={`${styles.scenario} ${selected === scenario.id ? styles.selected : ""}`}
                disabled={!ready || live}
                onClick={() => {
                  resetControls();
                  setSelected(scenario.id);
                  send({ type: "scenario", id: scenario.id });
                }}
              >
                <span className={styles.scenarioIndex}>{String(index + 1).padStart(2, "0")}</span>
                <span>
                  <strong>{scenario.name}</strong>
                  <small>{scenario.detail}</small>
                </span>
                <ChevronRight size={14} />
              </button>
            ))}
          </div>
          <div className={styles.fixtureNote}>
            <Radio size={17} />
            <div>
              <strong>Fixtures stay local</strong>
              <p>Simulated scenarios never send audio. Live voice is opt-in and cannot be recorded or replayed.</p>
            </div>
          </div>
          <button className={styles.import} disabled={!ready || live} onClick={() => picker.current?.click()}>
            <ArrowUpFromLine size={15} />
            Import a replay
          </button>
          <input
            ref={picker}
            hidden
            type="file"
            accept="application/json,.json"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              if (file.size > 2 * 1024 * 1024) {
                setError("Replay exceeds the 2 MiB limit.");
                return;
              }
              resetControls();
              setSelected(null);
              send({ type: "import", json: await file.text() });
            }}
          />
        </aside>

        <div className={styles.stage}>
          <div className={styles.stageBar}>
            <span className={styles.mode}>
              <i />
              {live ? "LIVE BRIDGE · VIRTUAL DEVICE" : locked ? "RECORDED REPLAY" : "SIMULATED DEVICE"}
            </span>
            <button
              className={styles.iconButton}
              onClick={() => setZoom(!zoom)}
              aria-label={zoom ? "Fit device" : "Show device at native pixel size"}
            >
              <Maximize2 size={15} />
            </button>
          </div>
          <div className={styles.deviceSpace}>
            <div className={`${styles.device} ${zoom ? styles.nativeSize : ""}`}>
              <div className={styles.bezelDetail} />
              <canvas
                ref={panel}
                width={466}
                height={466}
                className={styles.screen}
                style={{ opacity: state?.powered === false ? 0 : state?.dimmed ? 0.15 : 1 }}
                aria-label="Interactive Owy screen, 466 by 466 pixels. Equivalent controls are in the Inputs tab."
                role="img"
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
                onPointerCancel={(event) => pointer(event, 0)}
              />
              {!ready && (
                <div className={styles.loading}>
                  <span />
                  <p>Waking up the real pixels…</p>
                </div>
              )}
            </div>
            <p className={styles.deviceHint}>
              <Hand size={14} />
              {live
                ? "Tap to cancel or start; hold for settings. Voice and screen tools use the real bridge."
                : "Touch, tilt, and get to know Owy."}
            </p>
          </div>
          <div className={styles.deviceStatus}>
            <span>
              <i className={ready ? styles.readyDot : styles.waitDot} />
              {state?.voice.replaceAll("_", " ") ?? "loading runtime"}
            </span>
            <span>
              {state?.page ?? "face"}
              <span className={styles.divider}>/</span>466 × 466
            </span>
          </div>
          <div className={styles.scenarioNow}>
            <div>
              <span className={styles.eyebrow}>{currentScenario ? "NOW EXPLORING" : "YOUR PLAYGROUND"}</span>
              <h2>
                {currentScenario?.name ?? (locked ? "A moment, reproduced." : "A little curiosity goes a long way.")}
              </h2>
              <p>{currentScenario?.detail ?? "Try a gesture, adjust the pose, or choose a story on the left."}</p>
            </div>
            <Sparkles size={24} />
            {currentScenario && (
              <div className={styles.scenarioProgress}>
                <i style={{ width: `${progress}%` }} />
              </div>
            )}
          </div>
        </div>

        <aside className={styles.inspector} aria-label="Device debugger">
          <div className={styles.tabs} role="tablist" aria-label="Inspector tabs">
            {(
              [
                ["inputs", Fingerprint],
                ["state", Activity],
                ["settings", Settings2],
                ["faults", Gauge],
              ] as const
            ).map(([name, Icon]) => (
              <button
                key={name}
                role="tab"
                aria-selected={tab === name}
                aria-controls={`companion-${name}`}
                onClick={() => setTab(name)}
                className={tab === name ? styles.activeTab : ""}
              >
                <Icon size={16} />
                <span>{name}</span>
              </button>
            ))}
          </div>
          <div className={styles.inspectorBody} role="tabpanel" id={`companion-${tab}`}>
            {locked && (
              <p className={styles.locked}>
                {live
                  ? "Touch, motion and settings remain interactive. Live voice uses the bridge; replay and synthetic voice/faults are locked."
                  : "Replay is read-only. Reset to try something new."}
              </p>
            )}
            {tab === "inputs" && (
              <>
                <div className={styles.sectionTitle}>
                  <span>
                    <Move3D size={15} />
                    MOTION RIG
                  </span>
                  <span>g / °/s</span>
                </div>
                <div className={styles.poseRig}>
                  <div className={styles.rigGrid} />
                  <div
                    className={styles.rigBody}
                    style={{ transform: `rotateX(${angles[0]}deg) rotateY(${angles[1]}deg) rotateZ(${angles[2]}deg)` }}
                  >
                    <span />
                    <span />
                  </div>
                  <span className={styles.rigLabel}>6-axis IMU · body frame</span>
                </div>
                {["Roll", "Pitch", "Yaw"].map((axis, i) => (
                  <label className={styles.range} key={axis}>
                    <span>
                      {axis}
                      <output>{angles[i]}°</output>
                    </span>
                    <input
                      aria-label={axis}
                      type="range"
                      min={-70}
                      max={70}
                      step={1}
                      value={angles[i]}
                      disabled={!ready || inputsLocked}
                      onChange={(e) => changeAngle(i, Number(e.target.value))}
                    />
                  </label>
                ))}
                <div className={styles.actionGrid}>
                  <button disabled={!ready || inputsLocked} onClick={() => send({ type: "shake" })}>
                    <Activity size={15} />
                    Shake
                  </button>
                  <button disabled={!ready || inputsLocked} onClick={() => input("center")}>
                    <RotateCcw size={15} />
                    Center gaze
                  </button>
                </div>
                <p className={styles.microcopy}>
                  Pose changes produce gravity and angular rate together. Yaw is relative—not a compass heading.
                </p>
                <div className={styles.rule} />
                <div className={styles.sectionTitle}>
                  <span>
                    <Fingerprint size={15} />
                    TOUCH & VOICE
                  </span>
                </div>
                <div className={styles.actionGrid}>
                  <button disabled={!ready || inputsLocked} onClick={() => input("boot", [100])}>
                    <Mic size={15} />
                    Tap / BOOT
                  </button>
                  <button disabled={!ready || inputsLocked} onClick={() => input("boot", [900])}>
                    <Settings2 size={15} />
                    Hold / menu
                  </button>
                  <button disabled={!ready || inputsLocked} onClick={() => input("pet")}>
                    <Hand size={15} />
                    Pet
                  </button>
                  <button disabled={!ready || inputsLocked} onClick={() => input("wake")}>
                    <Radio size={15} />
                    Wake word
                  </button>
                </div>
                <button
                  className={styles.primaryAction}
                  disabled={!ready || locked || state?.phase !== 2}
                  onClick={() => input("speech", [1, 1200])}
                >
                  <AudioLines size={16} />
                  Say something (fixture)
                </button>
                <div className={styles.smallLinks}>
                  <button disabled={inputsLocked} onClick={() => input("page", [], "help")}>
                    Swipe left · help
                  </button>
                  <button disabled={inputsLocked} onClick={() => input("page", [], "qr")}>
                    Swipe right · QR
                  </button>
                </div>
                <div className={styles.rule} />
                <div className={styles.sectionTitle}>
                  <span>
                    <Volume2 size={15} />
                    SHARED CUES
                  </span>
                </div>
                <button className={styles.audioToggle} onClick={toggleSound}>
                  {sound ? <Volume2 size={16} /> : <VolumeX size={16} />}
                  {sound ? "Sound enabled" : "Enable sound"}
                  <span>opt-in</span>
                </button>
                <div className={styles.smallLinks}>
                  {["Listening", "Playful", "Diagnostic"].map((name, i) => (
                    <button key={name} disabled={!sound || locked || !ready} onClick={() => input("cue", [i])}>
                      {name}
                    </button>
                  ))}
                </div>
                <p className={styles.microcopy}>{transport}</p>
                {["Microphone envelope", "Speaking envelope"].map((name, i) => (
                  <label className={styles.range} key={name}>
                    <span>
                      {name}
                      <output>{Math.round((state?.envelope[i] ?? 0) * (i === 0 ? 100 : 1))}%</output>
                    </span>
                    <input
                      aria-label={name}
                      type="range"
                      min={0}
                      max={100}
                      step={1}
                      disabled={!ready || locked}
                      value={(state?.envelope[i] ?? 0) * (i === 0 ? 100 : 1)}
                      onChange={(e) => {
                        const values = [...(state?.envelope ?? [0, 0])];
                        values[i] = Number(e.target.value) / (i === 0 ? 100 : 1);
                        input("envelope", values);
                      }}
                    />
                  </label>
                ))}
                <p className={styles.microcopy}>
                  Synthetic levels exercise the shared listening and mouth animation. They do not generate speech or run
                  speech recognition.
                </p>
              </>
            )}
            {tab === "state" && (
              <>
                <div className={styles.sectionTitle}>
                  <span>
                    <Activity size={15} />
                    WHY THIS STATE?
                  </span>
                </div>
                <p className={styles.explanation}>{state?.why ?? "Loading the runtime…"}</p>
                <dl className={styles.values}>
                  {[
                    ["Voice", state?.voice],
                    ["PCM received · bytes", String(state?.audioReceived ?? 0)],
                    ["Receive buffer · bytes", `${state?.audioBuffered ?? 0} / 32768`],
                    ["Page", state?.page],
                    ["IMU samples", state?.imuReady ? "fresh" : "unavailable / stale"],
                    ["Gaze · px", state?.gaze.join(", ")],
                    ["Fused gravity · g", state?.gravity.map((n) => n.toFixed(3)).join(", ")],
                    ["Gyro bias · °/s", state?.bias.map((n) => n.toFixed(3)).join(", ")],
                    ["Neutral · g", state?.neutral.map((n) => n.toFixed(3)).join(", ")],
                    ["Calibration", state?.calibration],
                    ["Calibration progress", `${state?.calibrationProgress ?? 0}%`],
                    ["Staff fixture", state?.settings.staff ? "unlocked" : "locked"],
                  ].map(([name, value]) => (
                    <div key={name}>
                      <dt>{name}</dt>
                      <dd>{value ?? "—"}</dd>
                    </div>
                  ))}
                </dl>
                <div className={styles.rule} />
                <div className={styles.sectionTitle}>
                  <span>PARITY BOUNDARY</span>
                </div>
                <p className={styles.microcopy}>
                  Shared C++: IMU fusion, calibration, gestures, face, PCM.
                  <br />
                  <br />
                  Generated from firmware: all nine LVGL scenes and fonts.
                  <br />
                  <br />
                  Shared bridge: production VoiceTurn and PacedSpeaker, with virtual timers.
                  <br />
                  <br />
                  Fixture HAL: device audio driver, network, power, staff. The opt-in voice panel connects to Gemini
                  separately; acoustic wake inference and live hardware are not connected.
                </p>
                <div className={styles.buildInfo}>
                  LVGL {manifest?.lvgl} · ESPHome {manifest?.esphome}
                  <br />
                  {manifest?.version}
                  <br />
                  No ESP32 heap or panel-FPS estimates.
                </div>
              </>
            )}
            {tab === "settings" && (
              <>
                <div className={styles.sectionTitle}>
                  <span>
                    <Settings2 size={15} />
                    DEVICE PREFERENCES
                  </span>
                </div>
                {toggles.map(([key, name]) => (
                  <label className={styles.toggle} key={key}>
                    <span>{name}</span>
                    <input
                      type="checkbox"
                      role="switch"
                      checked={!!state?.settings[key]}
                      disabled={!ready || inputsLocked}
                      onChange={(e) => input("setting", [Number(e.target.checked)], key)}
                    />
                    <i />
                  </label>
                ))}
                {[
                  ["volume", "Volume", 0, 80],
                  ["brightness", "Brightness", 10, 100],
                ].map(([key, name, min, max]) => (
                  <label className={styles.range} key={key}>
                    <span>
                      {name}
                      <output>{state?.settings[String(key)] ?? 80}%</output>
                    </span>
                    <input
                      aria-label={String(name)}
                      type="range"
                      min={min}
                      max={max}
                      step={5}
                      value={state?.settings[String(key)] ?? 80}
                      disabled={!ready || inputsLocked}
                      onChange={(e) => input("setting", [Number(e.target.value)], String(key))}
                    />
                  </label>
                ))}
                <button
                  className={styles.primaryAction}
                  disabled={!ready || inputsLocked}
                  onClick={() => input("page", [], "calibration")}
                >
                  <Move3D size={16} />
                  Open calibration menu
                </button>
                <p className={styles.microcopy}>
                  Use the actual on-screen controls too. Reset restores fixture defaults. These settings never change
                  the physical device.
                </p>
                <div className={styles.rule} />
                <div className={styles.sectionTitle}>
                  <span>DISPLAY FIXTURES</span>
                </div>
                <div className={styles.actionGrid}>
                  {["Idle", "Listening", "Thinking", "Speaking", "Happy", "Error", "Offline"].map((name, i) => (
                    <button disabled={!ready || locked} key={name} onClick={() => input("mood", [i])}>
                      {name}
                    </button>
                  ))}
                  <button disabled={!ready || locked} onClick={() => input("mood", [-1])}>
                    Follow voice
                  </button>
                </div>
                <div className={styles.smallLinks}>
                  <button disabled={locked} onClick={() => input("card", [], "Ideas que nos conectan")}>
                    Show card
                  </button>
                  <button
                    disabled={locked}
                    onClick={() =>
                      input("text", [], "Nos vemos en la próxima charla. Compartir ideas nos hace crecer.")
                    }
                  >
                    Show text
                  </button>
                </div>
              </>
            )}
            {tab === "faults" && (
              <>
                <div className={styles.sectionTitle}>
                  <span>
                    <Gauge size={15} />
                    FAULT INJECTION
                  </span>
                  <span>modeled</span>
                </div>
                <p className={styles.microcopy}>
                  Repeat failures without touching a real speaker, connection, or microphone.
                </p>
                {["Delay driver beyond timeout", "Never finish speaker drain", "Bridge misses silence timeout"].map(
                  (name, i) => (
                    <label className={styles.toggle} key={name}>
                      <span>{name}</span>
                      <input
                        type="checkbox"
                        role="switch"
                        checked={!!faults[i]}
                        disabled={!ready || locked}
                        onChange={(e) => {
                          const next = [...faults];
                          next[i] = Number(e.target.checked);
                          setFaults(next);
                          input("fault", next);
                        }}
                      />
                      <i />
                    </label>
                  )
                )}
                {["700 ms transport burst", "Never acknowledge playback ready"].map((name, i) => (
                  <label className={styles.toggle} key={name}>
                    <span>{name}</span>
                    <input
                      type="checkbox"
                      role="switch"
                      checked={!!transportFault[i]}
                      disabled={!ready || locked}
                      onChange={(e) => {
                        const next = [...transportFault];
                        next[i] = e.target.checked ? (i === 0 ? 700 : 1) : 0;
                        setTransportFault(next);
                        input("transport", next);
                      }}
                    />
                    <i />
                  </label>
                ))}
                <div className={styles.rule} />
                <div className={styles.sectionTitle}>
                  <span>
                    <Wifi size={15} />
                    CONNECTIONS
                  </span>
                </div>
                <label className={styles.toggle}>
                  <span>Bridge connected</span>
                  <input
                    type="checkbox"
                    role="switch"
                    checked={connected}
                    disabled={!ready || locked}
                    onChange={(e) => {
                      setConnected(e.target.checked);
                      input("connection", [Number(e.target.checked)]);
                    }}
                  />
                  <i />
                </label>
                <label className={styles.toggle}>
                  <span>IMU delivering samples</span>
                  <input
                    type="checkbox"
                    role="switch"
                    checked={imu}
                    disabled={!ready || inputsLocked}
                    onChange={(e) => {
                      setImu(e.target.checked);
                      input("imuAvailable", [Number(e.target.checked)]);
                    }}
                  />
                  <i />
                </label>
                <div className={styles.rule} />
                <div className={styles.sectionTitle}>
                  <span>POWER TELEMETRY</span>
                </div>
                <label className={styles.range}>
                  <span>
                    Battery<output>{battery}%</output>
                  </span>
                  <input
                    aria-label="Battery percentage"
                    type="range"
                    min={0}
                    max={100}
                    value={battery}
                    disabled={!ready || inputsLocked}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setBattery(v);
                      powerTelemetry(v, usb, charging);
                    }}
                  />
                </label>
                {[
                  ["USB connected", usb, setUsb],
                  ["Charging", charging, setCharging],
                ].map(([name, value, setter]) => (
                  <label className={styles.toggle} key={String(name)}>
                    <span>{String(name)}</span>
                    <input
                      type="checkbox"
                      role="switch"
                      checked={Boolean(value)}
                      disabled={!ready || inputsLocked}
                      onChange={(e) => {
                        (setter as (v: boolean) => void)(e.target.checked);
                        powerTelemetry(
                          battery,
                          name === "USB connected" ? e.target.checked : usb,
                          name === "Charging" ? e.target.checked : charging
                        );
                      }}
                    />
                    <i />
                  </label>
                ))}
                <button
                  className={styles.primaryAction}
                  disabled={!ready || inputsLocked}
                  onClick={() => input("power", [state?.powered ? 0 : 1])}
                >
                  PWR · {state?.powered ? "Power off" : "Power on"}
                </button>
                <p className={styles.microcopy}>
                  Power is a fixture input, not a PMIC electrical simulation. No fake physical memory or frame-rate
                  telemetry.
                </p>
              </>
            )}
          </div>
        </aside>
      </div>
      <footer className={styles.timeline}>
        <div className={styles.transport}>
          <button
            className={styles.play}
            disabled={!ready || live}
            aria-label={playing ? "Pause virtual clock" : "Play virtual clock"}
            onClick={() => send({ type: "play", value: !playing })}
          >
            {playing ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}
          </button>
          <button
            className={styles.iconButton}
            disabled={!ready || playing}
            aria-label="Step 16 milliseconds"
            onClick={() => send({ type: "advance", ms: 16 })}
          >
            <SkipForward size={18} />
          </button>
          <button className={styles.iconButton} disabled={!ready || live} aria-label="Reset simulation" onClick={reset}>
            <RotateCcw size={17} />
          </button>
          <time>{stamp(state?.time ?? 0)}</time>
          <span className={styles.virtual}>virtual time</span>
          <select
            aria-label="Playback speed"
            disabled={live}
            value={speed}
            onChange={(e) => {
              setSpeed(e.target.value);
              send({ type: "speed", value: Number(e.target.value) });
            }}
          >
            {[0.25, 0.5, 1, 2, 4].map((v) => (
              <option key={v} value={v}>
                {v}×
              </option>
            ))}
          </select>
          <button
            className={styles.jump}
            disabled={!ready || playing}
            onClick={() => send({ type: "advance", ms: 1000 })}
          >
            +1s
          </button>
          <span className={styles.recording}>
            <i />
            {live ? "NOT RECORDING" : locked ? "REPLAY" : "RECORDING INPUTS"}
          </span>
        </div>
        <label className={styles.scrubber}>
          <span>Replay to</span>
          <input
            aria-label="Replay timeline"
            type="range"
            min={0}
            max={Math.max(duration, 1)}
            step={16}
            disabled={!ready || playing || duration < 16}
            value={Math.min(state?.time ?? 0, duration)}
            onChange={(e) => {
              stopSound();
              send({ type: "seek", time: Number(e.target.value) });
            }}
          />
          <span>{stamp(duration)}</span>
        </label>
        <div className={styles.trace}>
          <span className={styles.traceLabel}>
            <MoreHorizontal size={17} />
            EVENT TRACE
          </span>
          {trace
            .slice(-5)
            .reverse()
            .map((event, i) => (
              <span className={styles.traceEntry} key={`${event.t}-${i}`}>
                <time>{stamp(event.t)}</time>
                {event.event}
              </span>
            ))}
          <span className={styles.traceTail}>
            {live ? "real bridge · live tools · not recording" : "deterministic · bounded · exportable"}
          </span>
        </div>
      </footer>
    </section>
  );
}
