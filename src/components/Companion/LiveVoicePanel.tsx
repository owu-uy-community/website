"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, PhoneOff, Play, Send, Volume2 } from "lucide-react";
import { WebVoice, type VoiceStatus, type VoiceVisual, type DeviceCommand } from "./web-voice";
import styles from "./companion.module.css";

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
  const client = useRef<WebVoice | null>(null),
    activeRef = useRef(false);
  const [status, setStatus] = useState<VoiceStatus>({
    stage: "off",
    message: "A real conversation, right here.",
    input: "",
    output: "",
  });
  const [consent, setConsent] = useState(false),
    [volume, setVolume] = useState(65),
    [continuous, setContinuous] = useState(true);
  const [writes, setWrites] = useState(false),
    [staff, setStaff] = useState(false),
    [marketplace, setMarketplace] = useState(false);
  const active = !["off", "error"].includes(status.stage);
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
      onVisual,
      onCue,
      undefined,
      onDevice
    );
    client.current = instance;
    onClient(instance);
    const hide = () => {
      if (document.hidden && activeRef.current) instance.stop("Microphone off because this tab was hidden.");
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
  }, [onActive, onVisual, onCue, onDevice, onClient]);
  useEffect(() => {
    if (deviceSettings) {
      setVolume(deviceSettings.volume);
      setContinuous(!!deviceSettings.continuous);
    }
  }, [deviceSettings?.volume, deviceSettings?.continuous]);
  useEffect(() => client.current?.setVolume(volume), [volume]);
  useEffect(() => client.current?.setContinuous(continuous), [continuous]);
  return (
    <section className={styles.livePanel} aria-label="Talk to Owy on the web">
      <div className={styles.liveTitle}>
        <Mic size={18} />
        <strong>Talk to Owy</strong>
        <span>{active ? "REAL BRIDGE" : "OPT-IN · BRIDGE"}</span>
      </div>
      <p role="status" aria-live="polite" className={styles.liveStatus}>
        {!active && unavailable ? unavailable : status.message}
      </p>
      {!active && (
        <label className={styles.liveConsent}>
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span>
            Send microphone audio through the companion bridge to its voice provider. This app does not record live
            audio, transcripts, or tool activity in logs or replays. Authorized tool actions can persist changes.
          </span>
        </label>
      )}
      {!active && (
        <details className={styles.liveTranscript}>
          <summary>Conversation permissions · read-only by default</summary>
          <label className={styles.liveConsent}>
            <input type="checkbox" checked={writes} onChange={(e) => setWrites(e.target.checked)} />
            Allow real event-data changes (not a sandbox)
          </label>
          <label className={styles.liveConsent}>
            <input type="checkbox" checked={staff} onChange={(e) => setStaff(e.target.checked)} />
            Enable staff tools for this session
          </label>
          <label className={styles.liveConsent}>
            <input type="checkbox" checked={marketplace} onChange={(e) => setMarketplace(e.target.checked)} />
            Open marketplace for this virtual device
          </label>
          <p className={styles.microcopy}>
            These permissions are fixed for the session. The simulator PIN cannot grant production access. Use a staging
            API to test changes safely.
          </p>
        </details>
      )}
      <div className={styles.liveActions}>
        {!active ? (
          <button
            className={styles.primaryAction}
            disabled={disabled || !consent || !!unavailable}
            onClick={() => {
              if (
                !window.isSecureContext ||
                !navigator.mediaDevices?.getUserMedia ||
                typeof AudioWorkletNode !== "function" ||
                typeof AudioContext !== "function"
              ) {
                setStatus((s) => ({
                  ...s,
                  stage: "error",
                  message: "Live voice needs a modern browser on HTTPS or localhost with microphone support.",
                }));
                return;
              }
              void client.current?.start({ writes, staff, marketplace });
            }}
          >
            <Mic size={16} />
            Start talking
          </button>
        ) : (
          <>
            {["idle", "muted"].includes(status.stage) && (
              <button disabled={status.blocked} onClick={() => void client.current?.resume()}>
                <Play size={16} />
                Resume
              </button>
            )}
            {status.stage === "speaking" && (
              <button onClick={() => client.current?.interrupt()}>
                <Mic size={16} />
                Interrupt & speak
              </button>
            )}
            {status.stage === "listening" && (
              <button onClick={() => client.current?.finishTurn()}>
                <Send size={15} />
                I'm done
              </button>
            )}
            {["listening", "thinking", "speaking"].includes(status.stage) && (
              <button onClick={() => client.current?.mute()}>
                <MicOff size={16} />
                Mute
              </button>
            )}
            <button className={styles.hangup} onClick={() => client.current?.stop()}>
              <PhoneOff size={16} />
              End
            </button>
          </>
        )}
      </div>
      <div className={styles.livePreferences}>
        <label>
          <Volume2 size={15} />
          <span>Voice volume</span>
          <input
            aria-label="Live voice volume"
            type="range"
            min={0}
            max={80}
            value={volume}
            onChange={(e) => {
              setVolume(Number(e.target.value));
              onSetting("volume", Number(e.target.value));
            }}
          />
          <output>{volume}%</output>
        </label>
        <label>
          <input
            type="checkbox"
            checked={continuous}
            onChange={(e) => {
              setContinuous(e.target.checked);
              onSetting("continuous", +e.target.checked);
            }}
          />
          Keep listening after replies
        </label>
      </div>
      <p className={styles.microcopy}>
        Same bridge, prompts, tools, 16 kHz audio and turn handling as the gadget. Follow-ups retain context; eight
        seconds of silence starts a fresh conversation, just like the gadget. Sessions end after five minutes.
        Headphones help. Screen and volume tools affect this virtual device only.
      </p>
      {status.bridge && (
        <details className={styles.liveTranscript} open>
          <summary>Bridge debugger · {status.bridge.tools.length} tools loaded</summary>
          <p className={styles.microcopy}>
            {status.bridge.model} · {status.bridge.voice} · prompt {status.bridge.promptHash}
          </p>
          <p className={styles.microcopy}>
            {status.bridge.permissions.writes ? "REAL CHANGES ENABLED" : "Read-only event data"} ·{" "}
            {status.bridge.permissions.staff ? "Staff" : "Visitor"} · marketplace{" "}
            {status.bridge.permissions.marketplace ? "open" : "closed"}
          </p>
          {!status.bridge.siteConfigured && (
            <p role="alert">
              The bridge has no OWY_API_KEY. Event-data tools will fail, just as on the gadget. Conversation, screen and
              volume tools work.
            </p>
          )}
          <details>
            <summary>Available tools</summary>
            <p className={styles.microcopy}>{status.bridge.tools.join(", ")}</p>
          </details>
          {status.tools?.length ? (
            <ol>
              {status.tools.map((tool, index) => (
                <li key={index}>
                  <code>{tool.name}</code> · {tool.status}
                  {tool.ms !== undefined ? ` · ${tool.ms} ms` : ""}
                  {tool.detail ? ` — ${tool.detail}` : ""}
                </li>
              ))}
            </ol>
          ) : (
            <p className={styles.microcopy}>Tool calls and failures appear here during the conversation.</p>
          )}
        </details>
      )}
      {(status.input || status.output) && (
        <details className={styles.liveTranscript}>
          <summary>On-page transcript · not saved</summary>
          <p>
            <strong>You</strong> {status.input}
          </p>
          <p>
            <strong>Owy</strong> {status.output}
          </p>
          <button
            onClick={() => {
              if (client.current) {
                client.current.status.input = "";
                client.current.status.output = "";
              }
              setStatus((s) => ({ ...s, input: "", output: "" }));
            }}
          >
            Clear transcript
          </button>
        </details>
      )}
    </section>
  );
}
