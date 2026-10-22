import { openapi } from "@orpc/openapi";
import { ratelimit } from "@orpc/ratelimit";
import * as z from "zod";

import { authed, inCommunity, pub, staff, type AuthedContext } from "../base";
import { limiter } from "../ratelimit";
import {
  HostViewSchema,
  ManagedVenueSchema,
  RankedVenueSchema,
  RequestRefSchema,
  RequestVenueSchema,
  RespondSchema,
  SubmitVenueSchema,
  TokenSchema,
  UpdateVenueSchema,
  VenueIdSchema,
  VenueListSchema,
  VenueRequestSchema,
  VenueSchema,
} from "./schemas";
import * as Venues from "./service";

const docs = (summary: string) => openapi({ tags: ["Venues"], summary });
const byUser = ({ context }: { context: AuthedContext }) => context.user.id;

/** A community asks a handful of spaces a month; five a day per person stops a script, not an organizer. */
const requestLimit = ratelimit({
  limiter: limiter({ prefix: "venue-request:", maxRequests: 5, window: 86_400_000 }),
  key: byUser,
});
const submitLimit = ratelimit({
  limiter: limiter({ prefix: "venue-submit:", maxRequests: 3, window: 86_400_000 }),
  key: byUser,
});

export const venuesRouter = {
  list: authed
    .meta(docs("The active spaces (never their contacts), best first for the event's size, needs and day"))
    .input(VenueListSchema)
    .use(inCommunity("editor"))
    .output(z.array(RankedVenueSchema))
    .effect(function* ({ input }) {
      return yield* Venues.list(input);
    }),

  request: authed
    .meta(docs("Ask a space to host on 1–3 ranked dates; its contact answers from an emailed link"))
    .input(RequestVenueSchema)
    .use(inCommunity("editor"))
    .use(requestLimit)
    .output(VenueRequestSchema)
    .effect(function* ({ input }) {
      return yield* Venues.request(input);
    }),

  requests: authed
    .meta(docs("The community's requests; the address and contact show once accepted"))
    .input(VenueListSchema)
    .use(inCommunity("member"))
    .output(z.array(VenueRequestSchema))
    .effect(function* ({ input }) {
      return yield* Venues.requests(input.communityId);
    }),

  cancelRequest: authed
    .meta(docs("Withdraw a request still waiting for an answer"))
    .input(RequestRefSchema)
    .use(inCommunity("editor"))
    .output(z.object({ id: z.string() }))
    .effect(function* ({ input }) {
      return yield* Venues.cancel(input.requestId);
    }),

  byToken: pub
    .meta(docs("A request as its host's link shows it"))
    .input(TokenSchema)
    .output(HostViewSchema)
    .effect(function* ({ input }) {
      return yield* Venues.byToken(input.token);
    }),

  respond: pub
    .meta(docs("The host's answer from the link: take a date, or not this time"))
    .input(RespondSchema)
    .output(z.object({ status: z.string() }))
    .effect(function* ({ input }) {
      return yield* Venues.respond(input);
    }),

  submit: authed
    .meta(docs("Offer a space (Sumá tu espacio); the person becomes its contact and staff review it"))
    .input(SubmitVenueSchema)
    .use(submitLimit)
    .output(z.object({ id: z.string() }))
    .effect(function* ({ input }) {
      return yield* Venues.submit(input);
    }),

  manage: {
    list: staff
      .meta(docs("Every space with its contacts and address"))
      .output(z.array(ManagedVenueSchema))
      .effect(function* () {
        return yield* Venues.manageList;
      }),

    update: staff
      .meta(docs("Approve, archive or edit a space"))
      .input(UpdateVenueSchema)
      .output(z.object({ id: z.string() }))
      .effect(function* ({ input }) {
        return yield* Venues.manageUpdate(input.venueId, input.data);
      }),

    remove: staff
      .meta(docs("Delete a space and its requests"))
      .input(VenueIdSchema)
      .output(z.object({ id: z.string() }))
      .effect(function* ({ input }) {
        return yield* Venues.manageRemove(input.venueId);
      }),
  },
};
