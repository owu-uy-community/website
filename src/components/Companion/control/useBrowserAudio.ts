"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { WebVoice, type VoiceStage, type VoiceStatus } from "../web-voice";

export const STAGES: Record<VoiceStage, string> = {
  off: "desenchufado",
  requesting: "pidiendo el micrófono…",
  connecting: "conectando…",
  standby: "enchufado · esperando un turno",
  listening: "escuchando",
  thinking: "pensando",
  speaking: "hablando",
  idle: "desenchufado",
  muted: "micrófono apagado",
  error: "error",
};

/**
 * This browser as one device's laptop audio (its mic and speakers): the device keeps the touch,
 * the face and the captions. One device at a time; it lasts while the page is open, tab switches
 * included (a laptop at the venue stays on another app).
 */
export function useBrowserAudio() {
  const voice = useRef<WebVoice | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  const [status, setStatus] = useState<VoiceStatus | null>(null);

  useEffect(() => {
    const leave = () => voice.current?.stop("Se cerró el panel de control.");
    window.addEventListener("pagehide", leave);
    return () => {
      window.removeEventListener("pagehide", leave);
      leave();
    };
  }, []);

  const attach = useCallback((deviceId: string) => {
    voice.current ??= new WebVoice(
      (next) => setStatus({ ...next }),
      () => {},
      () => {}
    );
    setTarget(deviceId);
    void voice.current.start(undefined, deviceId);
  }, []);
  const detach = useCallback(() => voice.current?.stop("Desenchufaste este navegador desde el panel."), []);

  return { target, status, attach, detach };
}

export type BrowserAudio = ReturnType<typeof useBrowserAudio>;
