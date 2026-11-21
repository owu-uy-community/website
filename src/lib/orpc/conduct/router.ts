import { openapi } from "@orpc/openapi";
import { ratelimit } from "@orpc/ratelimit";
import * as z from "zod";

import { authed, inCommunity, pub, type BaseContext } from "../base";
import { limiter } from "../ratelimit";
import {
  AddReportNoteSchema,
  ConductReportsSchema,
  ConductTeamSchema,
  EventRefSchema,
  ReportSchema,
  SetReportStatusSchema,
  SetRespondersSchema,
  type ReportInput,
} from "./schemas";
import * as Conduct from "./service";

const docs = (summary: string) => openapi({ tags: ["Conduct"], summary });

/** A handful of reports per hour from one address and event stops a script, not a person. */
const reportLimit = ratelimit({
  limiter: limiter({ prefix: "conduct-report:", maxRequests: 5, window: 3_600_000 }),
  key: ({ context }: { context: BaseContext }, input: ReportInput) => {
    const headers = context.requestHeaders;
    const ip = headers?.get("x-real-ip") ?? headers?.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

    return `${ip}:${input.communitySlug}/${input.eventSlug}`;
  },
});

// Code of conduct. The team names responders per event; anyone reports from the event's page.
// Reports are read only by the event's responders and OWU's conduct staff, so reading them is
// `authed` and the service decides (a community role isn't enough, not even admin). They aren't
// audit-logged either: the audit log would copy what they say.
export const conductRouter = {
  team: authed
    .meta(docs("Who on the team can be named a code-of-conduct responder for the event, and who is"))
    .input(EventRefSchema)
    .use(inCommunity("event:update"))
    .output(ConductTeamSchema)
    .effect(function* ({ input }) {
      return yield* Conduct.team(input.eventId);
    }),

  setResponders: authed
    .meta(docs("Name the event's code-of-conduct responders (1 to 3 people on the team)"))
    .input(SetRespondersSchema)
    .use(inCommunity("event:update"))
    .output(ConductTeamSchema)
    .effect(function* ({ input }) {
      return yield* Conduct.setResponders(input);
    }),

  report: pub
    .meta(docs("Report a problem at an event, anonymously if wanted; it goes to its responders and OWU"))
    .input(ReportSchema)
    .use(reportLimit)
    .output(z.object({ ok: z.literal(true), to: z.enum(["both", "owu"]) }))
    .effect(function* ({ input }) {
      return yield* Conduct.report(input);
    }),

  reports: authed
    .meta(docs("The event's conduct reports with their notes (its responders and OWU's conduct staff)"))
    .input(EventRefSchema)
    .output(ConductReportsSchema)
    .effect(function* ({ input }) {
      return yield* Conduct.reports(input.eventId);
    }),

  addNote: authed
    .meta(docs("Add a note to a conduct report's log"))
    .input(AddReportNoteSchema)
    .output(ConductReportsSchema)
    .effect(function* ({ input }) {
      return yield* Conduct.addNote(input);
    }),

  setStatus: authed
    .meta(docs("Mark a conduct report open, in progress or resolved"))
    .input(SetReportStatusSchema)
    .output(ConductReportsSchema)
    .effect(function* ({ input }) {
      return yield* Conduct.setStatus(input);
    }),
};
