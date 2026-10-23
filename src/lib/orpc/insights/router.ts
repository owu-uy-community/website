import { openapi } from "@orpc/openapi";
import * as z from "zod";

import { authed, inCommunity, platform, pub } from "../base";
import {
  CommunityRefSchema,
  ExportSchema,
  ImpactSchema,
  InsightsSchema,
  OrganizersSchema,
  OwuInsightsSchema,
  SetPublicStatsSchema,
} from "./schemas";
import * as Insights from "./service";

const docs = (summary: string) => openapi({ tags: ["Insights"], summary });

// A community's numbers for its team; OWU's for staff; the public impact page for anyone.
// Aggregates only: no procedure here names a person who came.
export const insightsRouter = {
  community: authed
    .meta(docs("A community's numbers: events, who came, second visits, people coming back, speakers"))
    .input(CommunityRefSchema)
    .use(inCommunity("event:stats"))
    .output(InsightsSchema)
    .effect(function* ({ input }) {
      return yield* Insights.communityInsights(input.communityId);
    }),

  organizers: authed
    .meta(docs("The team's editors and up, and when each last did something in the community"))
    .input(CommunityRefSchema)
    .use(inCommunity("event:stats"))
    .output(OrganizersSchema)
    .effect(function* ({ input }) {
      return yield* Insights.organizers(input.communityId);
    }),

  owu: platform("insight:read")
    .meta(docs("OWU's numbers as a whole and every community's at a glance (site staff)"))
    .output(OwuInsightsSchema)
    .effect(function* () {
      return yield* Insights.owuInsights;
    }),

  impact: pub
    .meta(docs("OWU's yearly totals, and each community's that chose to show them"))
    .output(ImpactSchema)
    .effect(function* () {
      return yield* Insights.impact;
    }),

  setPublic: authed
    .meta(docs("Show, or not, the community's numbers on OWU's public impact page"))
    .input(SetPublicStatsSchema)
    .use(inCommunity("organization:update"))
    .output(z.object({ publicStats: z.boolean() }))
    .effect(function* ({ input }) {
      return yield* Insights.setPublicStats(input.communityId, input.publicStats);
    }),

  export: authed
    .meta(docs("The community's data as CSV files and one JSON: events, attendance counts, team, follower count"))
    .input(CommunityRefSchema)
    .use(inCommunity("organization:update"))
    .output(ExportSchema)
    .effect(function* ({ input }) {
      return yield* Insights.exportData(input.communityId);
    }),
};
