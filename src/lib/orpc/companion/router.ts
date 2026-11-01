import { openapi } from "@orpc/openapi";

import { platform } from "../base";
import * as Control from "./control";
import {
  AudioRoutingSnapshotSchema,
  CommandSentSchema,
  CompanionStateSchema,
  HostMicProbeSchema,
  ProbeHostMicSchema,
  ReportReplySchema,
  ReportSchema,
  SendCommandSchema,
  SetAudioRoutingSchema,
  SetHostMicSchema,
  SetPitchSchema,
  SetSettingsSchema,
  SettingRowsSchema,
} from "./schemas";
import { getAudioRouting, probeHostMic, setAudioRouting, setHostMic, setPitch } from "./services";

const docs = (summary: string) => openapi({ tags: ["Companion"], summary });

/**
 * Physical Owy companions. The site keeps every setting of the bridge and of each device, and the
 * bridge's last report (state, set, report); the bridge on the venue Mac follows them and runs
 * commands (command). The older handlers below proxy the bridge's loopback settings API, so they
 * only answer when this site runs on that Mac: "unreachable" is an answer, not an error.
 */
export const companionRouter = {
  state: platform("stage:read")
    .meta(docs("Every companion setting as stored, and the bridge's last report"))
    .output(CompanionStateSchema)
    .effect(function* () {
      return yield* Control.state();
    }),

  set: platform("stage:operate")
    .meta(docs("Change settings of the bridge or of a device; the bridge follows"))
    .input(SetSettingsSchema)
    .output(SettingRowsSchema)
    .effect(function* ({ input }) {
      return yield* Control.set(input.changes);
    }),

  command: platform("stage:operate")
    .meta(docs("Ask the bridge to do something now (a tone, a line, a restart…); never queued"))
    .input(SendCommandSchema)
    .output(CommandSentSchema)
    .effect(function* ({ input }) {
      return yield* Control.command(input.command);
    }),

  report: platform("stage:operate")
    .meta(docs("The bridge's heartbeat: what is in effect, changes made on a device, command results"))
    .input(ReportSchema)
    .output(ReportReplySchema)
    .effect(function* ({ input }) {
      return yield* Control.report(input);
    }),

  getAudioRouting: platform("stage:read")
    .meta(docs("Each companion's audio routing and modo pitch, as the bridge on the venue laptop has it"))
    .output(AudioRoutingSnapshotSchema)
    .handler(() => getAudioRouting()),

  setAudioRouting: platform("stage:operate")
    .meta(docs("Route a companion's microphone (device, Mac, browser) or audio output (device, browser)"))
    .input(SetAudioRoutingSchema)
    .output(AudioRoutingSnapshotSchema)
    .handler(({ input }) => setAudioRouting(input)),

  setPitch: platform("stage:operate")
    .meta(docs("Turn a companion's modo pitch on or off, and set what Owy says back"))
    .input(SetPitchSchema)
    .output(AudioRoutingSnapshotSchema)
    .handler(({ input }) => setPitch(input)),

  setHostMic: platform("stage:operate")
    .meta(docs("Pick the Mac's input (and side of a stereo receiver) the bridge records for the Mac route"))
    .input(SetHostMicSchema)
    .output(AudioRoutingSnapshotSchema)
    .handler(({ input }) => setHostMic(input)),

  probeHostMic: platform("stage:operate")
    .meta(docs("Record a few seconds from the Mac's mic on the bridge and report the level"))
    .input(ProbeHostMicSchema)
    .output(HostMicProbeSchema)
    .handler(({ input }) => probeHostMic(input)),
};
