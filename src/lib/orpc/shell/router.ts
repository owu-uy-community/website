import { openapi } from "@orpc/openapi";

import { authed, inCommunity } from "../base";
import { ShellStatusInputSchema, ShellStatusSchema } from "./schemas";
import * as Shell from "./service";

export const shellRouter = {
  status: authed
    .meta(openapi({ tags: ["Admin"], summary: "The event around every admin page: phase, clock, counts, live rigs" }))
    .input(ShellStatusInputSchema)
    .use(inCommunity("event:list"))
    .output(ShellStatusSchema)
    .effect(function* ({ input }) {
      return yield* Shell.getStatus(input.eventId);
    }),
};
