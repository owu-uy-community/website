"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";

import { useStoredState } from "components/Admin/stage/useStoredState";
import { WebVoice, type ListenChannel, type VoiceStatus } from "components/Companion/web-voice";
import { toast } from "components/shared/ui/toast-utils";
import { useRealtimeChannel } from "hooks/useRealtimeChannel";
import { orpc } from "lib/orpc";
import type { SeatStatus, TalkCommand } from "lib/orpc/owy-stage/schemas";
import { talkContext, type TalkPosition } from "lib/owy-stage/talk/deck";
import { OWY_TALK_CHANNEL } from "lib/realtime/channels";
import type {
  DeviceRouting,
  TalkContext,
  TalkMessage,
  TalkReply,
} from "../../../../owy/companion/bridge/src/web/contract";

export type SeatCommand = TalkCommand["message"];
export type RemoteSeat = SeatStatus & { at: string; receivedAt: number };

/** A seat that hasn't reported for this long is gone (it reports every 5 s). */
const SEAT_STALE_MS = 12_000;

const isText = (value: unknown): value is string => typeof value === "string" && value.length <= 120;
const isBool = (value: unknown): value is boolean => typeof value === "boolean";
const isListen = (value: unknown): value is ListenChannel => value === "L" || value === "R" || value === "mix";
const newId = () => Math.random().toString(36).slice(2, 12) + Date.now().toString(36);

export const LISTEN_LABELS: Record<ListenChannel, string> = { L: "Agustín", R: "Público", mix: "Ambos" };
/** TX1 (left) is the presenter's lav; TX2 (right) the handheld that goes around the room. */
export const askerFor = (listen: ListenChannel) => (listen === "R" ? "audience" : "presenter");

/**
 * The Mac side of the talk: this tab attaches to a physical Owy as its laptop audio (the DJI
 * receiver in, the room speaker out) and is then the only thing that talks to the bridge. Every
 * other console (the presenter's phone) reaches Owy through the relay: it publishes a command,
 * the seat runs it. Without a seat the slides still move; only Owy's buttons go quiet.
 */
/** A refusal this soon after a scripted line is that line's (notices don't name their command). */
const CLIP_FALLBACK_MS = 4000;

export function useSeat(position: TalkPosition | null) {
  const [deviceId, setDeviceId] = useStoredState("owy-charla-device", "owy-knob", isText);
  const [micId, setMicId] = useStoredState("owy-charla-mic", "", isText);
  const [raw, setRaw] = useStoredState("owy-charla-raw", true, isBool);
  const [listen, setListen] = useStoredState<ListenChannel>("owy-charla-listen", "L", isListen);
  const [talkOn, setTalkOn] = useStoredState("owy-charla-talk", true, isBool);
  const [status, setStatus] = useState<VoiceStatus>({ stage: "off", message: "", input: "", output: "" });
  const [device, setDevice] = useState<DeviceRouting | null>(null);
  const [talk, setTalk] = useState<TalkContext>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [remote, setRemote] = useState<RemoteSeat | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [seatId] = useState(newId);
  const voice = useRef<WebVoice | null>(null);
  const seen = useRef(new Set<string>());
  /** The last scripted line with a recording: if the bridge refuses it (knob offline…), the recording plays here. */
  const lastClip = useRef<{ clip: string; at: number } | null>(null);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const onReply = useCallback((reply: TalkReply) => {
    if (reply.type === "status") {
      setDevice(reply.device);
      setTalk(reply.talk);
      return;
    }
    setNotice(reply.message);
    const clip = lastClip.current;
    if (reply.level === "error" && clip && Date.now() - clip.at < CLIP_FALLBACK_MS) {
      lastClip.current = null;
      toast.info("Owy", `${reply.message} Va el audio grabado.`);
      void playLocalClip(clip.clip);
      return;
    }
    if (reply.level === "error") toast.error("Owy", reply.message);
    else if (reply.level === "warn") toast.info("Owy", reply.message);
  }, []);

  const getVoice = useCallback(
    () =>
      (voice.current ??= new WebVoice(
        (next) => setStatus({ ...next }),
        () => {},
        () => {},
        undefined,
        () => {},
        onReply
      )),
    [onReply]
  );

  useEffect(() => () => voice.current?.stop("Consola cerrada."), []);

  const attached = status.attached ?? null;
  const tried = status.stage !== "off";

  const connect = useCallback(() => {
    const v = getVoice();
    v.setMic({ deviceId: micId || undefined, raw });
    v.setChannel(listen);
    setDevice(null);
    setNotice(null);
    // The seat speaks for the device, not for itself: a staff, writing session (pitches place cards).
    void v.start({ writes: true, staff: true, marketplace: false }, deviceId.trim() || "owy-knob");
  }, [getVoice, micId, raw, listen, deviceId]);
  const disconnect = useCallback(() => voice.current?.stop("Desconectaste la consola de Owy."), []);

  useEffect(() => {
    voice.current?.setMic({ deviceId: micId || undefined, raw });
  }, [micId, raw]);
  useEffect(() => {
    voice.current?.setChannel(listen);
  }, [listen]);

  // Owy knows the slide on screen and who is asking, for every turn while «Modo charla» is on.
  const slide = position?.slide ?? null;
  useEffect(() => {
    if (!attached) return;
    voice.current?.talk({
      type: "talk",
      talk: talkOn && slide ? { slide: talkContext({ slide, step: 0 }), asker: askerFor(listen) } : null,
    });
  }, [attached, talkOn, slide, listen]);

  useEffect(() => {
    if (!attached) return;
    const ask = () => voice.current?.talk({ type: "status" });
    ask();
    const id = setInterval(ask, 3000);
    return () => clearInterval(id);
  }, [attached]);

  // The heartbeat: phones only offer Owy's buttons while a seat says it is attached.
  const report = useMutation(orpc.owyStage.talkStatus.mutationOptions());
  const reportRef = useRef(report.mutate);
  reportRef.current = report.mutate;
  const beat = useRef<SeatStatus | null>(null);
  beat.current = {
    seat: seatId,
    attached,
    stage: status.stage,
    listen,
    talk: talkOn,
    pitch: device?.pitch.mode ?? null,
    voice: device?.voice
      ? {
          tier: device.voice.tier,
          realtime: device.voice.realtime,
          lastPath: device.voice.lastPath,
          lastTurn: device.voice.lastTurn
            ? {
                path: device.voice.lastTurn.path,
                ttfaMs: device.voice.lastTurn.ttfaMs,
                totalMs: device.voice.lastTurn.totalMs,
              }
            : null,
        }
      : null,
  };
  const beatKey = JSON.stringify(beat.current);
  const wasSeat = useRef(false);
  if (tried) wasSeat.current = true;
  useEffect(() => {
    if (!wasSeat.current) return;
    const send = () => beat.current && reportRef.current(beat.current);
    send();
    // Disconnected: that one last beat tells the phones; then this tab goes quiet.
    if (!tried) return;
    const id = setInterval(send, 5000);
    return () => clearInterval(id);
  }, [beatKey, tried]);

  /** Runs a command here when this tab is the seat; false when it can't (not attached). */
  const runLocal = useCallback(
    (message: SeatCommand): boolean => {
      if (message.type === "listen") {
        setListen(message.channel);
        return true;
      }
      if (message.type === "say" && message.clip) lastClip.current = { clip: message.clip, at: Date.now() };
      return voice.current?.talk(message as TalkMessage) ?? false;
    },
    [setListen]
  );

  useRealtimeChannel(OWY_TALK_CHANNEL, (event, payload) => {
    if (event === "status") {
      const seat = payload as SeatStatus & { at: string };
      if (seat.seat !== seatId) setRemote({ ...seat, receivedAt: Date.now() });
      return;
    }
    if (event !== "command" || !attached) return;
    const command = payload as TalkCommand;
    if (seen.current.has(command.id)) return;
    seen.current.add(command.id);
    if (seen.current.size > 200) seen.current = new Set([...seen.current].slice(-100));
    runLocal(command.message);
  });

  const relay = useMutation(
    orpc.owyStage.talkCommand.mutationOptions({
      onError: (error) => toast.error("No le llegó a Owy", error.message),
    })
  );
  const relayRef = useRef(relay.mutate);
  relayRef.current = relay.mutate;

  const remoteOnline =
    !attached && remote !== null && remote.attached !== null && now - remote.receivedAt < SEAT_STALE_MS;

  /** Owy, from this tab: straight to the bridge as the seat, through the relay otherwise. */
  const command = useCallback(
    (message: SeatCommand): boolean => {
      if (attached) return runLocal(message);
      if (!remoteOnline) return false;
      relayRef.current({ id: newId(), message });
      return true;
    },
    [attached, remoteOnline, runLocal]
  );

  const prepare = useCallback(() => {
    if (!voice.current?.talk({ type: "route", mic: "laptop", output: "laptop" }))
      toast.error("Owy no está conectado", "Conectá la consola a Owy primero.");
    else toast.success("Listo", "Owy escucha este micrófono y habla por esta compu.");
  }, []);

  return {
    seatId,
    deviceId,
    setDeviceId,
    micId,
    setMicId,
    raw,
    setRaw,
    listen,
    setListen: useCallback(
      (channel: ListenChannel) => (attached ? setListen(channel) : command({ type: "listen", channel })),
      [attached, setListen, command]
    ),
    talkOn,
    setTalkOn,
    status,
    attached,
    /** This tab tried to be the seat (the Mac): the one that may play recorded clips itself. */
    tried,
    device,
    talk,
    notice,
    remote,
    remoteOnline,
    now,
    /** Owy can be driven from here: this tab is attached, or a seat elsewhere is. */
    ready: attached !== null || remoteOnline,
    connect,
    disconnect,
    command,
    prepare,
  };
}

/** Plays a recorded line in this tab (the seat whose bridge is down); tells the operator when there is none. */
export async function playLocalClip(clip: string): Promise<boolean> {
  const url = `/companion-audio/clips/${clip}.wav`;
  const head = await fetch(url, { method: "HEAD", cache: "no-store" }).catch(() => null);
  if (!head?.ok) {
    toast.error("No hay audio grabado", `Falta ${clip}.wav (pnpm -C owy companion:talk-clips).`);
    return false;
  }
  try {
    await new Audio(url).play();
    return true;
  } catch {
    toast.error("No se pudo reproducir el audio", "Tocá la página una vez y probá de nuevo.");
    return false;
  }
}

/** Live levels (0–1) of both sides of the chosen input, for the two meters: open even between turns. */
export function useMicMeters(micId: string, enabled: boolean) {
  const [levels, setLevels] = useState<[number, number]>([0, 0]);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !navigator.mediaDevices?.getUserMedia) return;
    let stream: MediaStream | null = null;
    let ctx: AudioContext | null = null;
    let timer: ReturnType<typeof setInterval> | undefined;
    let live = true;
    navigator.mediaDevices
      .getUserMedia({
        audio: {
          ...(micId ? { deviceId: { exact: micId } } : {}),
          channelCount: { ideal: 2 },
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      })
      .then(async (media) => {
        if (!live) return media.getTracks().forEach((track) => track.stop());
        stream = media;
        setError(null);
        // Labels only show up once the page holds a microphone.
        setDevices((await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "audioinput"));
        ctx = new AudioContext();
        const source = ctx.createMediaStreamSource(media);
        const split = ctx.createChannelSplitter(2);
        source.connect(split);
        const sides = [0, 1].map((side) => {
          const analyser = ctx!.createAnalyser();
          analyser.fftSize = 512;
          split.connect(analyser, side);
          return analyser;
        });
        const mono = media.getAudioTracks()[0]?.getSettings().channelCount === 1;
        const buffer = new Float32Array(512);
        timer = setInterval(() => {
          const [left, right] = sides.map((analyser) => {
            analyser.getFloatTimeDomainData(buffer);
            return Math.min(1, Math.sqrt(buffer.reduce((sum, v) => sum + v * v, 0) / buffer.length) * 6);
          });
          setLevels([left, mono ? left : right]);
        }, 80);
      })
      .catch((reason: Error) => {
        if (!live) return;
        setError(
          reason.name === "NotAllowedError"
            ? "Sin permiso de micrófono: permitilo en el navegador."
            : reason.name === "NotFoundError" || reason.name === "OverconstrainedError"
              ? "No se encontró ese micrófono. ¿Está conectado el receptor?"
              : `El micrófono no abrió (${reason.message || reason.name}).`
        );
      });

    return () => {
      live = false;
      clearInterval(timer);
      stream?.getTracks().forEach((track) => track.stop());
      void ctx?.close().catch(() => {});
    };
  }, [micId, enabled]);

  return { levels, devices, error };
}
