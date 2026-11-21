import { openapi } from "@orpc/openapi";
import * as z from "zod";

import { platform } from "../base";
import { MarkOutreachSchema, OutreachQueueSchema, OutreachTargetSchema } from "./schemas";
import * as Outreach from "./service";

const docs = (summary: string) => openapi({ tags: ["Outreach"], summary });

// Site staff's queue of communities that need a hand. Reading takes the site's numbers
// (insight:read); writing to a team and marking rows takes organization:update. Both are staff's,
// not moderators' (they look after people and access, not communities' health).
export const outreachRouter = {
  list: platform("insight:read")
    .meta(docs("Communities that need a hand: quiet, dormant, one organizer, stale host contacts, unanswered requests"))
    .output(OutreachQueueSchema)
    .effect(function* () {
      return yield* Outreach.queue;
    }),

  email: platform("organization:update")
    .meta(docs("Send the reason's templated email to the community's editors and up (replies go to the staff)"))
    .input(OutreachTargetSchema)
    .output(z.object({ sent: z.number() }))
    .effect(function* ({ input }) {
      return yield* Outreach.email(input);
    }),

  mark: platform("organization:update")
    .meta(docs("Mark a reason done (off the queue 90 days) or snoozed (30 days)"))
    .input(MarkOutreachSchema)
    .output(z.object({ id: z.string(), until: z.string().nullable() }))
    .effect(function* ({ input }) {
      return yield* Outreach.mark(input);
    }),

  undo: platform("organization:update")
    .meta(docs("Take back a done or snoozed mark"))
    .input(z.object({ id: z.string().min(1) }))
    .output(z.object({ ok: z.literal(true) }))
    .effect(function* ({ input }) {
      return yield* Outreach.undo(input.id);
    }),
};
