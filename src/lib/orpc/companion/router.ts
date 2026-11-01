import { openapi } from "@orpc/openapi";

import { platform } from "../base";
import {
  AudioRoutingSnapshotSchema,
  HostMicProbeSchema,
  ProbeHostMicSchema,
  SetAudioRoutingSchema,
  SetHostMicSchema,
  SetPitchSchema,
} from "./schemas";
import { getAudioRouting, probeHostMic, setAudioRouting, setHostMic, setPitch } from "./services";

const docs = (summary: string) => openapi({ tags: ["Companion"], summary });

/**
 * Physical Owy companions: where each device's microphone and audio output
 * live (the device, the Mac running the bridge, or a browser), modo pitch and
 * what Owy says back. Plain handlers: they proxy the bridge's loopback
 * settings API, and "unreachable" is an answer, not an error.
 */
export const companionRouter = {
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
