import { openapi } from "@orpc/openapi";

import { authed, inCommunity } from "../base";
import { PanelSummarySchema, SummaryInputSchema } from "./schemas";
import * as Panel from "./service";

/** The organizer panel's frame: what its sidebar, bell and Inicio show, in one round trip. */
export const panelRouter = {
  summary: authed
    .meta(
      openapi({
        tags: ["Organizer events"],
        summary: "A community at a glance: what's ahead, what needs an answer, clashes, the team's latest changes",
      })
    )
    .input(SummaryInputSchema)
    .use(inCommunity("editor"))
    .output(PanelSummarySchema)
    .effect(function* () {
      return yield* Panel.summary;
    }),
};
