import { openapi } from "@orpc/openapi";
import { ratelimit } from "@orpc/ratelimit";
import * as z from "zod";

import { authed, inCommunity, type AuthedContext } from "../base";
import { limiter } from "../ratelimit";
import { ChooseSchema, CreatePollSchema, PollListSchema, PollSchema, VoteSchema } from "./schemas";
import * as Polls from "./service";

const docs = (summary: string) => openapi({ tags: ["Date polls"], summary });

/** A poll emails every invited community's organizers: a handful a day per person is plenty. */
const createLimit = ratelimit({
  limiter: limiter({ prefix: "date-poll:", maxRequests: 5, window: 86_400_000 }),
  key: ({ context }: { context: AuthedContext }) => context.user.id,
});

/** Choosing a date with other communities: candidate days, answers by community, the pick. */
export const pollsRouter = {
  list: authed
    .meta(docs("The polls this community asked and the ones it's invited to"))
    .input(PollListSchema)
    .use(inCommunity("editor"))
    .output(z.array(PollSchema))
    .effect(function* () {
      return yield* Polls.list;
    }),

  create: authed
    .meta(docs("Ask other communities which of a few days works for a joint event"))
    .input(CreatePollSchema)
    .use(inCommunity("editor"))
    .use(createLimit)
    .output(PollSchema)
    .effect(function* ({ input }) {
      return yield* Polls.create(input);
    }),

  vote: authed
    .meta(docs("This community's answers: sí, si hace falta or no, per day"))
    .input(VoteSchema)
    .use(inCommunity("editor"))
    .output(PollSchema)
    .effect(function* ({ input }) {
      return yield* Polls.vote(input);
    }),

  choose: authed
    .meta(docs("Pick the date: it's reserved, and the communities that said yes are added as co-hosts"))
    .input(ChooseSchema)
    .use(inCommunity("editor"))
    .output(z.object({ poll: PollSchema, eventId: z.string() }))
    .effect(function* ({ input }) {
      return yield* Polls.choose(input);
    }),
};
