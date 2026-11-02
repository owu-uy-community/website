"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { Expression } from "lib/owy-stage/scenes";

/**
 * The lab's emulator: the firmware's C++ (model, LVGL scenes, VoiceTurn) in a worker
 * (public/companion-runtime/worker.mjs) that paints the page's canvas itself and posts its state
 * at most ~15 times a second (the trace only when it changed).
 */

export type Mode = "simulated" | "live" | "replay";

export type Snapshot = {
  time: number;
  page: string;
  voice: string;
  phase: number;
  why: string;
  event: string;
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
  audioReceived: number;
  audioBuffered: number;
  envelope: number[];
  /** The owy::Mood on screen (0..11), what the knob's face mirrors. */
  mood: number;
};
export type Trace = { t: number; event: string; voice: string; page: string };
export type Scenario = { id: string; name: string; detail: string; duration: number };
export type Manifest = { version: string; lvgl: string; esphome: string; wasmHash: string };
type Cue = { kind: number; volume: number; t: number; pcm: Uint8Array };
/** What the worker posts ~15 times a second; `commands` are the virtual Owy's asks of the live voice. */
export type StateMessage = {
  state: Snapshot;
  trace?: Trace[];
  mode: Mode;
  duration: number;
  playing: boolean;
  cues: Cue[];
  commands: string[];
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
    detail: "Modo pitch: un toque, catorce segundos de pitch con pausas, otro toque. Sin repregunta.",
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
  driver: { name: "El parlante llega tarde", detail: "Una falla al arrancar el driver ejercita la recuperación." },
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
    detail: "El control de disponibilidad del turno vence sin abrir la voz.",
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
  idle: "en reposo",
  mic_off: "esperando la voz",
  handoff: "abriendo el micrófono",
  listening: "escuchando",
  follow_up: "¿algo más?",
  recording: "grabando el pitch",
  thinking: "pensando",
  speaking: "hablando",
  draining: "terminando de sonar",
  recovering: "recuperando el audio",
  feedback: "reaccionando",
  calibrating: "calibrando",
  privacy: "privacidad",
  offline: "sin conexión",
  off: "apagado",
};
export const voiceLabel = (state: Snapshot | null) =>
  state ? (VOICE[state.voice] ?? state.voice.replaceAll("_", " ")) : "cargando";

/** Label → owy::Mood (companion_model.h); FOLLOWUP and SLEEP were appended. */
export const MOODS: [string, number][] = [
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
/** The face while a sentence plays (the bridge's expression.ts), in owy::Expression order. */
export const EXPRESSION_LABEL: Record<Expression, string> = {
  neutral: "Neutral",
  happy: "Contento",
  excited: "Entusiasmado",
  curious: "Curioso",
  thinking: "Pensativo",
  empathetic: "Empático",
  playful: "Pícaro",
  surprised: "Sorprendido",
};

/** 01:02.34 of virtual time. */
export const stamp = (t: number) =>
  `${String(Math.floor(t / 60000)).padStart(2, "0")}:${((t % 60000) / 1000).toFixed(2).padStart(5, "0")}`;

/**
 * The worker, the canvas it paints (created in `host`, handed over once: a canvas can't hand
 * its context twice, so StrictMode's second mount gets a new one) and what it reports.
 */
export function useEmulator(on: { state: (message: StateMessage) => void; error: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const worker = useRef<Worker | null>(null);
  const handlers = useRef(on);
  handlers.current = on;
  const [setup, setSetup] = useState<{ manifest: Manifest; scenarios: Scenario[] } | null>(null);
  const [message, setMessage] = useState<StateMessage | null>(null);
  const [trace, setTrace] = useState<Trace[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const box = host.current;
    if (!box) return;
    const canvas = document.createElement("canvas");
    canvas.className = "block h-full w-full";
    box.append(canvas);
    const instance = new Worker("/companion-runtime/worker.mjs", { type: "module", name: "owy-companion" });
    worker.current = instance;
    instance.onmessage = ({ data }) => {
      if (data.type === "ready") {
        setSetup({
          manifest: data.manifest,
          scenarios: (data.scenarios as Scenario[]).map((scenario) => ({ ...scenario, ...SCENARIO_COPY[scenario.id] })),
        });
        instance.postMessage({ type: "play", value: true });
      } else if (data.type === "error") {
        setError(data.message);
        handlers.current.error();
      } else if (data.type === "export") {
        const url = URL.createObjectURL(new Blob([data.json], { type: "application/json" }));
        const link = document.createElement("a");
        link.href = url;
        link.download = "owy-replay.json";
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } else if (data.type === "state") {
        const next = data as StateMessage & { type: string };
        setMessage(next);
        if (next.trace) setTrace(next.trace);
        handlers.current.state(next);
      }
    };
    instance.onerror = () => {
      setError("No se pudo cargar el emulador (WASM). Corré el build del emulador y recargá.");
      handlers.current.error();
    };
    const offscreen = canvas.transferControlToOffscreen();
    instance.postMessage({ type: "init", canvas: offscreen }, [offscreen]);

    return () => {
      worker.current = null;
      instance.terminate();
      canvas.remove();
    };
  }, []);

  const send = useCallback((data: Record<string, unknown>) => worker.current?.postMessage(data), []);

  return { host, send, setup, message, trace, error, setError };
}

/** The emulator's interaction cues (16 kHz PCM from the same C++), on the page's speakers when on. */
export function useCues() {
  const audio = useRef<AudioContext | null>(null);
  const sources = useRef(new Set<AudioBufferSourceNode>());
  const enabled = useRef(false);
  const [on, setOn] = useState(false);

  const stop = useCallback(() => {
    for (const source of sources.current) {
      try {
        source.stop();
      } catch {
        // already ended
      }
    }
    sources.current.clear();
  }, []);

  const play = useCallback((cue: Cue) => {
    const ctx = audio.current;
    if (!enabled.current || !ctx || ctx.state !== "running") return;
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

  /** Sound on needs a click (the browser's autoplay rule); false when there is no audio. */
  const enable = useCallback(
    async (value: boolean) => {
      enabled.current = value;
      setOn(value);
      if (!value) {
        stop();
        await audio.current?.suspend();
        return true;
      }
      try {
        audio.current ??= new AudioContext({ latencyHint: "interactive" });
        await audio.current.resume();
        return true;
      } catch {
        enabled.current = false;
        setOn(false);
        return false;
      }
    },
    [stop]
  );

  useEffect(
    () => () => {
      stop();
      void audio.current?.close();
      audio.current = null;
    },
    [stop]
  );

  return { on, play, stop, enable };
}
