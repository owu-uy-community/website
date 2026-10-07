/**
 * The bridge's typed control API (oRPC), served by `web/settings.ts` on the
 * loopback settings port under `/rpc`. The Next.js admin consumes it with a
 * typed oRPC client (`RouterClient<BridgeRouter>`), so this file must stay
 * light: the schemas live in `./contract` (zod only) and this file adds the
 * handlers over a narrow view of a device session — importing `DeviceSession`
 * here would drag the whole bridge into the site's type-check.
 */
import { ORPCError, os } from "@orpc/server";
import { audioRoute, type AudioRoute } from "../audio/route";
import {
  SetAudioRoutingSchema,
  SetPitchSchema,
  SettingsSnapshotSchema,
  type PitchSettings,
  type SettingsSnapshot,
} from "./contract";

export * from "./contract";

/** What the router needs from a physical device session (DeviceSession satisfies it). */
export interface RoutableSession {
  readonly id: string;
  readonly connected: boolean;
  readonly hasPeer: boolean;
  audioRouting(): { mic: AudioRoute; output: AudioRoute; source: "device" | "override" | "env" };
  setAudioRouting(which: "mic" | "output", route: AudioRoute): void;
  pitchSettings(): PitchSettings;
  setPitchSetting(which: "mode" | "reacts", on: boolean): void;
}

export interface BridgeRpcContext {
  sessions: readonly RoutableSession[];
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
    })),
  };
}

const base = os.$context<BridgeRpcContext>();

export const bridgeRouter = {
  settings: {
    /** Current audio routing of every device the bridge drives. */
    get: base.output(SettingsSnapshotSchema).handler(({ context }) => settingsSnapshot(context.sessions)),
    /** Flip a device's mic / audio output between the device and the laptop (browser peer). */
    set: base
      .input(SetAudioRoutingSchema)
      .output(SettingsSnapshotSchema)
      .handler(async ({ input, context }) => {
        const session = context.sessions.find((s) => s.id === input.deviceId);
        if (!session) throw new ORPCError("NOT_FOUND", { message: `unknown device ${input.deviceId}` });
        if (input.mic !== undefined) session.setAudioRouting("mic", audioRoute(input.mic));
        if (input.output !== undefined) session.setAudioRouting("output", audioRoute(input.output));
        context.log?.(`settings: ${session.id} mic=${input.mic ?? "-"} output=${input.output ?? "-"}`);
        // A device-backed select confirms asynchronously (native API round trip):
        // give it a moment so the snapshot we return already shows the change.
        const wanted = { mic: input.mic && audioRoute(input.mic), output: input.output && audioRoute(input.output) };
        for (let waited = 0; waited < 800; waited += 50) {
          const now = session.audioRouting();
          if ((!wanted.mic || now.mic === wanted.mic) && (!wanted.output || now.output === wanted.output)) break;
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
        return settingsSnapshot(context.sessions);
      }),
    /** Modo pitch on/off and whether Owy reacts to a pitch (the device's switches when the board has them). */
    setPitch: base
      .input(SetPitchSchema)
      .output(SettingsSnapshotSchema)
      .handler(async ({ input, context }) => {
        const session = context.sessions.find((s) => s.id === input.deviceId);
        if (!session) throw new ORPCError("NOT_FOUND", { message: `unknown device ${input.deviceId}` });
        if (input.mode !== undefined) session.setPitchSetting("mode", input.mode);
        if (input.reacts !== undefined) session.setPitchSetting("reacts", input.reacts);
        context.log?.(`settings: ${session.id} pitch mode=${input.mode ?? "-"} reacts=${input.reacts ?? "-"}`);
        for (let waited = 0; waited < 800; waited += 50) {
          const now = session.pitchSettings();
          if ((input.mode === undefined || now.mode === input.mode) && (input.reacts === undefined || now.reacts === input.reacts))
            break;
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
        return settingsSnapshot(context.sessions);
      }),
  },
};

export type BridgeRouter = typeof bridgeRouter;
