import { openapi } from "@orpc/openapi";
import * as z from "zod";

import { authed, inCommunity } from "../base";
import { listActivity } from "../ops";

const ActivitySchema = z.object({
  id: z.string(),
  verb: z.string(),
  entityType: z.string(),
  entityId: z.string().nullable(),
  summary: z.string(),
  actor: z.object({ id: z.string(), name: z.string(), image: z.string().nullable() }).nullable(),
  createdAt: z.string(),
});

export const activityRouter = {
  list: authed
    .meta(openapi({ tags: ["Admin"], summary: "What happened in an event (or to one thing in it), newest first" }))
    .input(
      z.object({
        eventId: z.string().min(1),
        entityType: z.string().optional(),
        entityId: z.string().optional(),
        limit: z.number().int().min(1).max(200).default(40),
      })
    )
    .use(inCommunity("editor"))
    .output(z.array(ActivitySchema))
    .effect(function* ({ input }) {
      return yield* listActivity(input);
    }),
};

export type ActivityItem = z.infer<typeof ActivitySchema>;
