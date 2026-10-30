import { openapi } from "@orpc/openapi";

import { authed, inCommunity, platform } from "../base";
import { DashboardStatsSchema, GetDashboardStatsSchema } from "./schemas";
import * as Dashboard from "./service";
import { getToday } from "./today";
import { TodayInputSchema, TodaySchema } from "./today-schemas";

export const dashboardRouter = {
  getStats: platform("insight:read")
    .meta(openapi({ tags: ["Dashboard"], summary: "An event at a glance: the board, the slot on now, ticketing" }))
    .input(GetDashboardStatsSchema)
    .output(DashboardStatsSchema)
    .effect(function* ({ input }) {
      return yield* Dashboard.getStats(input.eventId);
    }),

  today: authed
    .meta(
      openapi({ tags: ["Dashboard"], summary: "Hoy: preparation, mission control or the report, by the event's phase" })
    )
    .input(TodayInputSchema)
    .use(inCommunity("dashboard:read"))
    .output(TodaySchema)
    .effect(function* ({ input }) {
      return yield* getToday(input.eventId);
    }),
};
