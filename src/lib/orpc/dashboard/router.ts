import { openapi } from "@orpc/openapi";

import { staff } from "../base";
import { DashboardStatsSchema, GetDashboardStatsSchema } from "./schemas";
import * as Dashboard from "./service";

export const dashboardRouter = {
  getStats: staff
    .meta(openapi({ tags: ["Dashboard"], summary: "An event at a glance: the board, the slot on now, ticketing" }))
    .input(GetDashboardStatsSchema)
    .output(DashboardStatsSchema)
    .effect(function* ({ input }) {
      return yield* Dashboard.getStats(input.eventId);
    }),
};
