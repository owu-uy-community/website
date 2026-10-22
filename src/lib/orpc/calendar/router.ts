import { openapi } from "@orpc/openapi";

import { authed, inCommunity } from "../base";
import { PlanResultSchema, PlanSchema } from "./schemas";
import * as Calendar from "./service";

export const calendarRouter = {
  plan: authed
    .meta(
      openapi({
        tags: ["Calendar"],
        summary: "A month of days scored for clashes with other communities, holidays and habits, with suggestions",
      })
    )
    .input(PlanSchema)
    .use(inCommunity("editor"))
    .output(PlanResultSchema)
    .effect(function* ({ input }) {
      return yield* Calendar.plan(input);
    }),
};
