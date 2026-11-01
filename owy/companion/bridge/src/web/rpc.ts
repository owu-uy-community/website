/**
 * The bridge's typed control API (oRPC), served by `web/settings.ts` on the
 * loopback settings port under `/rpc`. The Next.js admin consumes it with a
 * typed oRPC client (`RouterClient<BridgeRouter>`), so this file must stay
 * light: the schemas live in `./contract` (zod only) and this file adds the
 * handlers over a narrow view of a device session — importing `DeviceSession`
 * here would drag the whole bridge into the site's type-check.
 */
import { ORPCError, os } from "@orpc/server";
import { z } from "zod";
import { audioRoute, micRoute, type AudioRoute, type MicRoute } from "../audio/route";
import {
  HostMicSchema,
  SetAudioRoutingSchema,
  SetHostMicSchema,
  SetPitchSchema,
  SettingsSnapshotSchema,
  type HostMicSnapshot,
  type PitchSettings,
  type SettingsSnapshot,
  type VoiceStatus,
} from "./contract";

export * from "./contract";

/** What the router needs from a physical device session (DeviceSession satisfies it). */
export interface RoutableSession {
  readonly id: string;
  readonly connected: boolean;
  readonly hasPeer: boolean;
  audioRouting(): { mic: MicRoute; output: AudioRoute; source: "device" | "override" | "env" };
  setAudioRouting(which: "mic", route: MicRoute): void;
  setAudioRouting(which: "output", route: AudioRoute): void;
  pitchSettings(): PitchSettings;
  setPitchMode(on: boolean): void;
  setPitchVoice(voice: PitchSettings["voice"]): void;
  voiceStatus?(): VoiceStatus;
}

/** What the router needs from the Mac's microphone (HostMic satisfies it). */
export interface RoutableHostMic {
  status(): Omit<HostMicSnapshot, "available">;
  devices(): Promise<string[]>;
  select(name: string | null, channel?: HostMicSnapshot["channel"]): void;
  probe(ms: number): Promise<{ peak: number; rms: number; seconds: number; health: HostMicSnapshot["health"] }>;
}

export interface BridgeRpcContext {
  sessions: readonly RoutableSession[];
  hostMic?: RoutableHostMic;
  log?: (message: string) => void;
}

export function settingsSnapshot(sessions: readonly RoutableSession[]): SettingsSnapshot {
  return {
    devices: sessions.map((session) => ({
      id: session.id,
      connected: session.connected,
      ...session.audioRouting(),
      peer: session.hasPeer,
      pitch: session.pitchSettings(),
      ...(session.voiceStatus ? { voice: session.voiceStatus() } : {}),
    })),
  };
}

/** Every device, plus the Mac's mic (its inputs are listed by ffmpeg, so this one is async). */
async function fullSnapshot(context: BridgeRpcContext): Promise<SettingsSnapshot> {
  const snapshot = settingsSnapshot(context.sessions);
  if (!context.hostMic) return snapshot;
  return { ...snapshot, hostMic: { ...context.hostMic.status(), available: await context.hostMic.devices() } };
}

const base = os.$context<BridgeRpcContext>();

const findSession = (context: BridgeRpcContext, deviceId: string) => {
  const session = context.sessions.find((s) => s.id === deviceId);
  if (!session) throw new ORPCError("NOT_FOUND", { message: `unknown device ${deviceId}` });
  return session;
};

/** A device-backed select confirms asynchronously (native API round trip): give it a moment so the snapshot shows it. */
async function settle(done: () => boolean): Promise<void> {
  for (let waited = 0; waited < 800 && !done(); waited += 50) await new Promise((resolve) => setTimeout(resolve, 50));
}

export const bridgeRouter = {
  settings: {
    /** Current audio routing of every device the bridge drives, and the Mac's mic. */
    get: base.output(SettingsSnapshotSchema).handler(({ context }) => fullSnapshot(context)),
    /** A device's mic (the device, the browser, the Mac) and audio output (the device, the browser). */
    set: base
      .input(SetAudioRoutingSchema)
      .output(SettingsSnapshotSchema)
      .handler(async ({ input, context }) => {
        const session = findSession(context, input.deviceId);
        const wanted = { mic: input.mic && micRoute(input.mic), output: input.output && audioRoute(input.output) };
        if (wanted.mic) session.setAudioRouting("mic", wanted.mic);
        if (wanted.output) session.setAudioRouting("output", wanted.output);
        context.log?.(`settings: ${session.id} mic=${input.mic ?? "-"} output=${input.output ?? "-"}`);
        await settle(() => {
          const now = session.audioRouting();
          return (!wanted.mic || now.mic === wanted.mic) && (!wanted.output || now.output === wanted.output);
        });
        return fullSnapshot(context);
      }),
    /** Modo pitch on/off and what Owy says back (the device's switch and select when the board has them). */
    setPitch: base
      .input(SetPitchSchema)
      .output(SettingsSnapshotSchema)
      .handler(async ({ input, context }) => {
        const session = findSession(context, input.deviceId);
        if (input.mode !== undefined) session.setPitchMode(input.mode);
        if (input.voice !== undefined) session.setPitchVoice(input.voice);
        context.log?.(`settings: ${session.id} pitch mode=${input.mode ?? "-"} voice=${input.voice ?? "-"}`);
        await settle(() => {
          const now = session.pitchSettings();
          return (input.mode === undefined || now.mode === input.mode) && (input.voice === undefined || now.voice === input.voice);
        });
        return fullSnapshot(context);
      }),
    /** Which Mac input (and which side of a stereo one) feeds the `host` route; reopens the capture. */
    setHostMic: base
      .input(SetHostMicSchema)
      .output(SettingsSnapshotSchema)
      .handler(async ({ input, context }) => {
        const hostMic = context.hostMic;
        if (!hostMic) throw new ORPCError("NOT_FOUND", { message: "this bridge has no Mac microphone" });
        const current = hostMic.status();
        hostMic.select(input.name === undefined ? current.name : input.name, input.channel ?? current.channel);
        context.log?.(`settings: mic de la Mac → ${input.name ?? current.name ?? "integrado"} (${input.channel ?? current.channel})`);
        await settle(() => hostMic.status().health !== "starting" && hostMic.status().health !== "off");
        return fullSnapshot(context);
      }),
    /** Records a few seconds from the Mac's mic and reports how loud it was (the venue check). */
    probeHostMic: base
      .input(z.object({ ms: z.number().int().min(500).max(10_000).default(4000) }))
      .output(z.object({ peak: z.number(), rms: z.number(), seconds: z.number(), health: HostMicSchema.shape.health }))
      .handler(async ({ input, context }) => {
        if (!context.hostMic) throw new ORPCError("NOT_FOUND", { message: "this bridge has no Mac microphone" });
        const { peak, rms, seconds, health } = await context.hostMic.probe(input.ms);
        return { peak, rms, seconds, health };
      }),
  },
};

export type BridgeRouter = typeof bridgeRouter;
