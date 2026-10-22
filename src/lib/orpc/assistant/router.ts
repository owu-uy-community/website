import { openapi } from "@orpc/openapi";
import * as z from "zod";

import { authed, inCommunity } from "../base";
import * as Assistant from "./service";

export const assistantRouter = {
  ask: authed
    .meta(openapi({ tags: ["Admin"], summary: "Ask Owy about the event, answered from mission control's data" }))
    .input(z.object({ eventId: z.string().min(1), question: z.string().trim().min(3).max(300) }))
    .use(inCommunity("admin"))
    .output(z.object({ answer: z.string() }))
    .effect(function* ({ input }) {
      return yield* Assistant.ask(input.eventId, input.question);
    }),
};
