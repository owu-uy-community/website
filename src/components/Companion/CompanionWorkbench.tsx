"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

import { ConfirmDialog, Notice, SegmentedTabsList } from "components/Admin/panel";
import { MicroLabel, PageContainer, PageHeader, Panel } from "components/Admin/ui/page";
import { StatusDot } from "components/Admin/ui/status";
import type { FaceApi } from "components/OwyStage/Face";
import { Badge } from "components/shared/ui/badge";
import { Button } from "components/shared/ui/button";
import { Kbd } from "components/shared/ui/kbd";
import { Tabs } from "components/shared/ui/tabs";
import { EXPRESSIONS, type Expression } from "lib/owy-stage/scenes";

import LiveVoicePanel from "./LiveVoicePanel";
import { DevicePanel, type Board } from "./lab/Device";
import { stamp, useCues, useEmulator, voiceLabel, type Mode, type StateMessage } from "./lab/emulator";
import { FRESH_CONTROLS, MoreControls, type Controls } from "./lab/MoreControls";
import {
  ClockPanel,
  FacePanel,
  ReplayPanel,
  StoriesPanel,
  TracePanel,
  TraceStrip,
  WallPanel,
  WhyPanel,
} from "./lab/panels";
import type { DeviceCommand, VoiceVisual, WebVoice } from "./web-voice";

const MODES: { value: Mode; label: string; key: string }[] = [
  { value: "simulated", label: "Simulado", key: "1" },
  { value: "live", label: "En vivo", key: "2" },
  { value: "replay", label: "Reproducir", key: "3" },
];
const isExpression = (name: string): name is Expression => (EXPRESSIONS as readonly string[]).includes(name);

/**
 * The lab (/admin/companion?tab=lab): the firmware's own code in the browser, the same face,
 * gestures and voice as the Owy on the table. Three modes, each starting a fresh session:
 * Simulado (stories and every input, against virtual time), En vivo (this virtual Owy talking
 * through the real bridge) and Reproducir (an exported run, read-only). The board switch shows
 * the knob's face mirroring the emulator.
 */
export default function CompanionWorkbench() {
  const root = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<Mode>("simulated");
  const [board, setBoard] = useState<Board>("amoled");
  /** A mode switch waiting on «¿Cortamos la charla?». */
  const [leaving, setLeaving] = useState<Mode | null>(null);
  const [talking, setTalking] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [replayName, setReplayName] = useState<string | null>(null);
  const [speed, setSpeed] = useState(1);
  const [controls, setControls] = useState<Controls>(FRESH_CONTROLS);
  const [visible, setVisible] = useState(true);
  const voice = useRef<WebVoice | null>(null);
  const knob = useRef<FaceApi | null>(null);
  const mood = useRef<number | null>(null);
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const cues = useCues();

  const onState = ({ state, commands, cues: due, mode: running }: StateMessage) => {
    if (running === "live") {
      voice.current?.syncDevice(state.settings, state.powered, ["settling", "collecting"].includes(state.calibration));
      for (const command of commands) {
        if (command === "start") void voice.current?.resume();
        // Modo pitch on the virtual Owy: a tap records a pitch, the second tap sends it.
        if (command === "start:pitch" || command === "start:pitch-name") void voice.current?.resume("pitch");
        if (command === "commit") voice.current?.finishTurn();
        if (command === "stop") voice.current?.mute();
      }
    }
    if (state.mood !== mood.current) {
      mood.current = state.mood;
      knob.current?.mood(state.mood);
    }
    if (state.settings.privacy || !state.powered) cues.stop();
    else for (const cue of due) cues.play(cue);
  };
  const emulator = useEmulator({
    state: onState,
    error: () => {
      voice.current?.stop("El dispositivo virtual se detuvo. Micrófono apagado; recargá antes de reconectar.");
      cues.stop();
    },
  });
  const { send, setError } = emulator;
  const message = emulator.message;
  const state = message?.state ?? null;
  const playing = message?.playing ?? false;
  const time = state?.time ?? 0;
  const ready = Boolean(emulator.setup && state);

  const input = (type: string, values: number[] = [], text?: string) =>
    send({
      type: message?.mode === "live" ? "liveInput" : "input",
      event: { type, values, ...(text ? { text } : {}) },
    });
  const pose = (angles: number[]) => {
    const next = angles.map((angle) => Math.max(-70, Math.min(70, angle)));
    setControls((current) => ({ ...current, angles: next }));
    send({ type: "pose", angles: next });
  };
  const fresh = () => {
    cues.stop();
    setControls(FRESH_CONTROLS);
    setSelected(null);
    setError(null);
  };

  // Each mode starts a fresh session: Simulado plays, En vivo waits for the bridge, Reproducir for a file.
  const go = (next: Mode) => {
    setLeaving(null);
    if (next === mode) return;
    if (mode === "live") {
      voice.current?.stop();
      setTalking(false);
    }
    fresh();
    setReplayName(null);
    setMode(next);
    if (next === "live") send({ type: "live", value: true });
    else {
      send(mode === "live" ? { type: "live", value: false } : { type: "reset" });
      if (next === "simulated") send({ type: "play", value: true });
    }
  };
  const switchMode = (next: Mode) => {
    if (!ready || next === mode) return;
    if (mode === "live" && talking) setLeaving(next);
    else go(next);
  };
  const loaded = message?.mode === "replay" ? replayName : null;
  const playPause = () => {
    if (mode === "live" || !ready || (mode === "replay" && !loaded)) return;
    // A replay that reached its end starts over.
    if (mode === "replay" && !playing && message && time >= message.duration) send({ type: "seek", time: 0 });
    send({ type: "play", value: !playing });
  };
  const step = (ms: number) => {
    if (ready && !playing && (mode === "simulated" || loaded)) send({ type: "advance", ms });
  };
  const reset = () => {
    if (mode !== "simulated" || !ready) return;
    fresh();
    send({ type: "reset" });
    send({ type: "play", value: true });
  };

  // The knob mirrors the emulator: the mood on screen, plus every feeling and lip shape it is sent.
  const knobRef = useCallback((face: FaceApi | null) => {
    knob.current = face;
    if (face && mood.current !== null) face.mood(mood.current);
  }, []);
  const pet = () => {
    input("pet");
    knob.current?.smile();
  };

  // The live voice's callbacks recreate its client when they change: all of them are stable.
  const onActive = useCallback(
    (active: boolean) => {
      setTalking(active);
      void cues.enable(active);
    },
    [cues.enable]
  );
  const onVisual = useCallback((visual: VoiceVisual) => send({ type: "liveVisual", ...visual }), [send]);
  const onCue = useCallback(() => send({ type: "liveCue" }), [send]);
  const onDevice = useCallback(
    (command: DeviceCommand) => {
      send({ type: "liveDevice", command });
      if (command.kind === "expression" && isExpression(command.expression))
        knob.current?.express(command.expression, command.strength, Date.now() + command.leadMs);
      if (command.kind === "mouth") knob.current?.mouth(command.frames, Date.now() + command.leadMs);
    },
    [send]
  );
  const onClient = useCallback((client: WebVoice | null) => {
    voice.current = client;
  }, []);
  const onSetting = useCallback(
    (name: string, value: number) =>
      send({ type: "liveInput", event: { type: "setting", values: [value], text: name } }),
    [send]
  );

  // A hidden page or lab tab (Control open) pauses the simulation, and picks it up when it is back.
  const pausedHidden = useRef(false);
  const playingRef = useRef(playing);
  playingRef.current = playing;
  useEffect(() => {
    const element = root.current;
    const hide = (hidden: boolean) => {
      if (hidden && modeRef.current !== "live" && playingRef.current) {
        pausedHidden.current = true;
        send({ type: "play", value: false });
        cues.stop();
      } else if (!hidden && pausedHidden.current) {
        pausedHidden.current = false;
        send({ type: "play", value: true });
      }
    };
    const page = () => hide(document.hidden);
    const observer = new IntersectionObserver(([entry]) => {
      setVisible(entry.isIntersecting);
      hide(!entry.isIntersecting);
    });
    if (element) observer.observe(element);
    document.addEventListener("visibilitychange", page);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", page);
    };
  }, [send, cues.stop]);

  // The page's keys (the device's own, Space H P W S C and arrows, stay with the device).
  const keys = useRef<Record<string, () => void>>({});
  keys.current = {
    "1": () => switchMode("simulated"),
    "2": () => switchMode("live"),
    "3": () => switchMode("replay"),
    b: () => setBoard((current) => (current === "amoled" ? "knob" : "amoled")),
    k: playPause,
    ".": () => step(16),
    r: reset,
  };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest("input, textarea, select, [contenteditable='true'], [role='dialog'], [role='alertdialog']"))
        return;
      // The lab tab is hidden (Control is open): its keys are off.
      if (!root.current || root.current.offsetParent === null) return;
      const action = keys.current[event.key.toLowerCase()];
      if (!action) return;
      event.preventDefault();
      action();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div ref={root}>
      <PageContainer className="space-y-4 pt-0" size="large">
        <PageHeader
          className="mb-0"
          description="El firmware de Owy en el navegador: la misma cara, los mismos gestos y la misma voz que el de la mesa."
          meta={<Badge variant={ready ? "success" : "secondary"}>{ready ? "Emulador listo" : "Cargando…"}</Badge>}
          title="Laboratorio"
        />

        <Panel className="flex flex-wrap items-center gap-x-6 gap-y-3 px-3.5 py-2.5">
          <div className="flex items-center gap-3">
            <MicroLabel>Modo</MicroLabel>
            <Tabs value={mode} onValueChange={(next) => switchMode(next as Mode)}>
              <SegmentedTabsList
                className="w-auto"
                items={MODES.map(({ value, label, key }) => ({
                  value,
                  label: (
                    <>
                      {label}
                      <Kbd className="pointer-coarse:hidden">{key}</Kbd>
                    </>
                  ),
                }))}
                value={mode}
              />
            </Tabs>
          </div>
          <div className="flex items-center gap-3">
            <MicroLabel>Placa</MicroLabel>
            <Tabs value={board} onValueChange={(next) => setBoard(next as Board)}>
              <SegmentedTabsList
                className="w-auto"
                items={[
                  { value: "amoled", label: "AMOLED 466" },
                  { value: "knob", label: "Knob 360" },
                ]}
                value={board}
              />
            </Tabs>
            <Kbd className="pointer-coarse:hidden">B</Kbd>
          </div>
          <div aria-live="polite" className="ml-auto flex items-center gap-2 font-terminal text-meta" role="status">
            <StatusDot pulse={talking} tone={talking ? "info" : ready ? "brand" : "idle"} />
            <span>{voiceLabel(state)}</span>
            <span className="text-muted-foreground tabular-nums">· {stamp(time)}</span>
          </div>
        </Panel>

        <Notice show={Boolean(emulator.error)} tone="danger">
          <span className="flex items-start justify-between gap-3">
            <span>{emulator.error}</span>
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

        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,500px)_minmax(0,1fr)]">
          <DevicePanel
            board={board}
            input={input}
            knob={visible ? knobRef : null}
            mode={mode}
            pet={pet}
            ready={ready}
            screen={emulator.host}
            shake={() => send({ type: "shake" })}
            state={state}
            tilt={(axis, by) => {
              const angles = [...controls.angles];
              angles[axis] += by;
              pose(angles);
            }}
          />

          <div className="min-w-0 space-y-4">
            {mode === "simulated" && (
              <>
                <StoriesPanel
                  ready={ready}
                  scenarios={emulator.setup?.scenarios ?? []}
                  selected={selected}
                  time={time}
                  onPick={(id) => {
                    fresh();
                    setSelected(id);
                    send({ type: "scenario", id });
                  }}
                />
                <FacePanel
                  ready={ready}
                  onExpression={(name, index) => {
                    input("expression", [index, 0, 100]);
                    knob.current?.express(name, 100);
                  }}
                  onMood={(value) => input("mood", [value])}
                />
                <ClockPanel
                  playing={playing}
                  ready={ready}
                  speed={speed}
                  time={time}
                  onExport={() => send({ type: "export" })}
                  onPlay={playPause}
                  onReset={reset}
                  onSpeed={(value) => {
                    setSpeed(value);
                    send({ type: "speed", value });
                  }}
                  onStep={step}
                />
                <MoreControls
                  controls={controls}
                  input={input}
                  manifest={emulator.setup?.manifest ?? null}
                  pose={pose}
                  ready={ready}
                  setControls={setControls}
                  sound={cues.on}
                  state={state}
                  onSound={() => {
                    void cues.enable(!cues.on).then((ok) => {
                      if (!ok) setError("No hay audio disponible. Los escenarios igual corren en silencio.");
                    });
                  }}
                />
              </>
            )}
            {mode === "live" && (
              <>
                <LiveVoicePanel
                  deviceSettings={state?.settings}
                  disabled={!ready}
                  unavailable={
                    state?.settings.privacy
                      ? "Apagá la privacidad del micrófono en los ajustes del dispositivo antes de hablar."
                      : state?.powered === false
                        ? "Encendé el dispositivo virtual antes de hablar."
                        : state && ["settling", "collecting"].includes(state.calibration)
                          ? "Terminá o cancelá la calibración antes de hablar."
                          : undefined
                  }
                  onActive={onActive}
                  onClient={onClient}
                  onCue={onCue}
                  onDevice={onDevice}
                  onSetting={onSetting}
                  onVisual={onVisual}
                />
                <WallPanel />
                <WhyPanel state={state} />
              </>
            )}
            {mode === "replay" && (
              <>
                <ReplayPanel
                  duration={message?.duration ?? 0}
                  loaded={loaded}
                  playing={playing}
                  ready={ready}
                  speed={speed}
                  time={time}
                  onLoad={(file) => {
                    if (file.size > 2 * 1024 * 1024) {
                      setError("La sesión supera el límite de 2 MiB.");
                      return;
                    }
                    fresh();
                    setReplayName(file.name);
                    void file.text().then((json) => send({ type: "import", json }));
                  }}
                  onPlay={playPause}
                  onSeek={(at) => {
                    cues.stop();
                    send({ type: "seek", time: at });
                  }}
                  onSpeed={(value) => {
                    setSpeed(value);
                    send({ type: "speed", value });
                  }}
                />
                {loaded && <TracePanel trace={emulator.trace} />}
              </>
            )}
          </div>
        </div>

        <TraceStrip mode={mode} trace={emulator.trace} />

        <ConfirmDialog
          confirmLabel="Cortar y cambiar"
          description="El micrófono está abierto: si cambiás de modo, la conversación con Owy termina."
          open={leaving !== null}
          title="¿Cortamos la charla?"
          onConfirm={() => leaving && go(leaving)}
          onOpenChange={(open) => !open && setLeaving(null)}
        />
      </PageContainer>
    </div>
  );
}
