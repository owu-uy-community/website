import { openapi } from "@orpc/openapi";

import { staff } from "../base";
import { AudioRoutingSnapshotSchema, SetAudioRoutingSchema } from "./schemas";
import { getAudioRouting, setAudioRouting } from "./services";

const docs = (summary: string) => openapi({ tags: ["Companion"], summary });

/**
 * Physical Owy companions: where each device's microphone and audio output
 * live (the device, or the venue laptop running the bridge). Plain handlers:
 * they proxy the bridge's loopback settings API, and "unreachable" is an
 * answer, not an error.
 */
export const companionRouter = {
  getAudioRouting: staff
    .meta(docs("Each companion's audio routing, as the bridge on the venue laptop has it"))
    .output(AudioRoutingSnapshotSchema)
    .handler(() => getAudioRouting()),

  setAudioRouting: staff
    .meta(docs("Route a companion's microphone or audio output to the device or the laptop"))
    .input(SetAudioRoutingSchema)
    .output(AudioRoutingSnapshotSchema)
    .handler(({ input }) => setAudioRouting(input)),
};
