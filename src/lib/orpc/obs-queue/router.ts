import { openapi } from "@orpc/openapi";

import { pub, staff } from "../base";
import { GetInstanceSchema, LoopActionSchema, OBSQueueStateSchema, UpdateStateSchema } from "./schemas";
import * as Queue from "./service";

const docs = (summary: string) => openapi({ tags: ["OBS"], summary });

export const obsQueueRouter = {
  getState: pub
    .meta(docs("A rig's scene loop: queue, presets and playback"))
    .input(GetInstanceSchema)
    .output(OBSQueueStateSchema)
    .effect(function* ({ input }) {
      return yield* Queue.getQueue(input.instanceId);
    }),

  updateState: staff
    .meta(docs("Save a rig's loop; only the fields sent change"))
    .input(UpdateStateSchema)
    .output(OBSQueueStateSchema)
    .effect(function* ({ input }) {
      return yield* Queue.updateQueue(input);
    }),

  loop: staff
    .meta(docs("Play, pause, stop or step a rig's loop as it is right now"))
    .input(LoopActionSchema)
    .output(OBSQueueStateSchema)
    .effect(function* ({ input }) {
      return yield* Queue.loop(input);
    }),
};
