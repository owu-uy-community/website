import { openapi } from "@orpc/openapi";
import { ratelimit } from "@orpc/ratelimit";
import * as z from "zod";

import { authed, inCommunity, type AuthedContext } from "../base";
import { limiter } from "../ratelimit";
import { ChooseSchema, CreatePollSchema, PollListSchema, PollRefSchema, PollSchema, VoteSchema } from "./schemas";
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
    .use(inCommunity("poll:read"))
    .output(z.array(PollSchema))
    .effect(function* () {
      return yield* Polls.list;
    }),

  create: authed
    .meta(docs("Ask other communities which of a few days works for a joint event"))
    .input(CreatePollSchema)
    .use(inCommunity("poll:create"))
    .use(createLimit)
    .output(PollSchema)
    .effect(function* ({ input }) {
      return yield* Polls.create(input);
    }),

  vote: authed
    .meta(docs("This community's answers: sí, si hace falta or no, per day"))
    .input(VoteSchema)
    .use(inCommunity("poll:vote"))
    .output(PollSchema)
    .effect(function* ({ input }) {
      return yield* Polls.vote(input);
    }),

  choose: authed
    .meta(docs("Pick the date: it's reserved, and the communities that said yes are added as co-hosts"))
    .input(ChooseSchema)
    .use(inCommunity("poll:choose"))
    .output(z.object({ poll: PollSchema, eventId: z.string() }))
    .effect(function* ({ input }) {
      return yield* Polls.choose(input);
    }),

  // Closing and deleting are the asker's call, like picking the date: the same permission
  close: authed
    .meta(docs("Stop the answers without picking a date (the asking community only)"))
    .input(PollRefSchema)
    .use(inCommunity("poll:choose"))
    .output(PollSchema)
    .effect(function* ({ input }) {
      return yield* Polls.close(input);
    }),

  remove: authed
    .meta(docs("Delete a poll for every community (the asking community only); restore undoes it"))
    .input(PollRefSchema)
    .use(inCommunity("poll:choose"))
    .output(z.object({ id: z.string() }))
    .effect(function* ({ input }) {
      return yield* Polls.remove(input);
    }),

  restore: authed
    .meta(docs("Bring back a deleted poll, as it was"))
    .input(PollRefSchema)
    .use(inCommunity("poll:choose"))
    .output(PollSchema)
    .effect(function* ({ input }) {
      return yield* Polls.restore(input);
    }),
};
