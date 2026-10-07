import { openapi } from "@orpc/openapi";

import { pub, staff } from "../base";
import {
  CountdownEndtimeSchema,
  CountdownStateSchema,
  GetCountdownStateSchema,
  UpdateCountdownStateSchema,
} from "./schemas";
import * as Countdown from "./service";

const docs = (summary: string) => openapi({ tags: ["Countdown"], summary });

export const countdownRouter = {
  getState: pub
    .meta(docs("An event's countdown as the screens show it"))
    .input(GetCountdownStateSchema)
    .output(CountdownStateSchema)
    .effect(function* ({ input }) {
      return yield* Countdown.getCountdown(input.eventId);
    }),

  getEndtime: pub
    .meta(docs("When an event's running countdown reaches zero, if one is running"))
    .input(GetCountdownStateSchema)
    .output(CountdownEndtimeSchema)
    .effect(function* ({ input }) {
      const state = yield* Countdown.getCountdown(input.eventId);

      return { targetTime: state.targetTime ?? null };
    }),

  updateState: staff
    .meta(docs("Start, pause, reset or set an event's countdown"))
    .input(UpdateCountdownStateSchema)
    .output(CountdownStateSchema)
    .effect(function* ({ input }) {
      return yield* Countdown.updateCountdown(input);
    }),
};
