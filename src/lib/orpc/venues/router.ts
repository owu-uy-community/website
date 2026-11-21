import { openapi } from "@orpc/openapi";
import { ratelimit } from "@orpc/ratelimit";
import * as z from "zod";

import { authed, inCommunity, platform, pub, type AuthedContext } from "../base";
import { limiter } from "../ratelimit";
import * as Hosting from "./hosting";
import {
  AcceptProposalSchema,
  BroadcastPreviewSchema,
  BroadcastSchema,
  CheckAnswerSchema,
  CheckViewSchema,
  ContactLeftSchema,
  EventRefSchema,
  HostViewSchema,
  ManagedVenueSchema,
  RankedVenueSchema,
  RecapSchema,
  RequestRefSchema,
  RequestVenueSchema,
  RespondSchema,
  SendRecapSchema,
  SubmitVenueSchema,
  TokenSchema,
  UnansweredSchema,
  UpdateContactSchema,
  UpdateVenueSchema,
  VenueIdSchema,
  VenueListSchema,
  VenueRequestSchema,
} from "./schemas";
import * as Venues from "./service";

const VenueRefSchema = z.object({ id: z.string(), name: z.string() });

const docs = (summary: string) => openapi({ tags: ["Venues"], summary });
const byUser = ({ context }: { context: AuthedContext }) => context.user.id;

/** A community asks a handful of spaces a month; five a day per person stops a script, not an organizer. */
const requestLimit = ratelimit({
  limiter: limiter({ prefix: "venue-request:", maxRequests: 5, window: 86_400_000 }),
  key: byUser,
});
/** Reporting a contact gone is rare; ten a day per person stops anyone flagging the whole directory. */
const reportLimit = ratelimit({
  limiter: limiter({ prefix: "venue-contact-left:", maxRequests: 10, window: 86_400_000 }),
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
    .use(inCommunity("venue:read"))
    .output(z.array(RankedVenueSchema))
    .effect(function* ({ input }) {
      return yield* Venues.list(input);
    }),

  request: authed
    .meta(docs("Ask a space to host on 1–3 ranked dates; its contact answers from an emailed link"))
    .input(RequestVenueSchema)
    .use(inCommunity("venue:request"))
    .use(requestLimit)
    .output(VenueRequestSchema)
    .effect(function* ({ input }) {
      return yield* Venues.request(input);
    }),

  broadcastPreview: authed
    .meta(docs("The spaces a request to several at once would reach, for these dates and needs"))
    .input(BroadcastPreviewSchema)
    .use(inCommunity("venue:request"))
    .output(z.array(VenueRefSchema))
    .effect(function* ({ input }) {
      return yield* Venues.broadcastPreview(input);
    }),

  broadcast: authed
    .meta(docs("Ask every space that fits at once (Buscamos espacio): the first to accept takes it"))
    .input(BroadcastSchema)
    .use(inCommunity("venue:request"))
    .use(requestLimit)
    .output(z.object({ broadcastId: z.string(), venues: z.array(VenueRefSchema) }))
    .effect(function* ({ input }) {
      return yield* Venues.broadcast(input);
    }),

  requests: authed
    .meta(docs("The community's requests; the address and contact show once accepted"))
    .input(VenueListSchema)
    .use(inCommunity("venue:requests"))
    .output(z.array(VenueRequestSchema))
    .effect(function* ({ input }) {
      return yield* Venues.requests(input.communityId);
    }),

  cancelRequest: authed
    .meta(docs("Withdraw a request still waiting for an answer"))
    .input(RequestRefSchema)
    .use(inCommunity("venue:request"))
    .output(z.object({ id: z.string() }))
    .effect(function* ({ input }) {
      return yield* Venues.cancel(input.requestId);
    }),

  reopenRequest: authed
    .meta(docs("Undo a cancel: the request waits for the host again"))
    .input(RequestRefSchema)
    .use(inCommunity("venue:request"))
    .output(VenueRequestSchema)
    .effect(function* ({ input }) {
      return yield* Venues.reopen(input.requestId);
    }),

  acceptProposal: authed
    .meta(docs("Take one of the dates a host proposed; it's held for the event"))
    .input(AcceptProposalSchema)
    .use(inCommunity("venue:request"))
    .output(VenueRequestSchema)
    .effect(function* ({ input }) {
      return yield* Venues.acceptProposal(input);
    }),

  declineProposal: authed
    .meta(docs("None of the host's dates work: close the request and thank the host"))
    .input(RequestRefSchema)
    .use(inCommunity("venue:request"))
    .output(z.object({ id: z.string() }))
    .effect(function* ({ input }) {
      return yield* Venues.declineProposal(input.requestId);
    }),

  contactLeft: authed
    .meta(
      docs("Esta persona ya no está: staff are asked to check the contact, and the request goes to the space's others")
    )
    .input(ContactLeftSchema)
    .use(inCommunity("venue:request"))
    .use(reportLimit)
    .output(z.object({ remaining: z.number() }))
    .effect(function* ({ input }) {
      return yield* Venues.contactLeft(input);
    }),

  recapPreview: authed
    .meta(docs("The host's recap for a past event, numbers only, to review before sending"))
    .input(EventRefSchema)
    .use(inCommunity("venue:request"))
    .output(RecapSchema)
    .effect(function* ({ input }) {
      return yield* Hosting.recapPreview(input.eventId);
    }),

  sendRecap: authed
    .meta(docs("Send the recap to the space's contacts, once"))
    .input(SendRecapSchema)
    .use(inCommunity("venue:request"))
    .output(RecapSchema)
    .effect(function* ({ input }) {
      return yield* Hosting.sendRecap(input);
    }),

  checkByToken: pub
    .meta(docs("The yearly check as its contact's link shows it"))
    .input(TokenSchema)
    .output(CheckViewSchema)
    .effect(function* ({ input }) {
      return yield* Hosting.checkByToken(input.token);
    }),

  checkAnswer: pub
    .meta(docs("The contact's yearly answer: still hosting, paused, or gone"))
    .input(CheckAnswerSchema)
    .output(z.object({ answer: z.enum(["yes", "pause", "left"]), requestable: z.boolean() }))
    .effect(function* ({ input }) {
      return yield* Hosting.checkAnswer(input);
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
    list: platform("venue:manage")
      .meta(docs("Every space with its contacts and address"))
      .output(z.array(ManagedVenueSchema))
      .effect(function* () {
        return yield* Venues.manageList;
      }),

    update: platform("venue:manage")
      .meta(docs("Approve, archive or edit a space"))
      .input(UpdateVenueSchema)
      .output(z.object({ id: z.string() }))
      .effect(function* ({ input }) {
        return yield* Venues.manageUpdate(input.venueId, input.data);
      }),

    updateContact: platform("venue:manage")
      .meta(docs("Mark a contact's mail as bouncing or the person as gone, or undo it"))
      .input(UpdateContactSchema)
      .output(z.object({ id: z.string() }))
      .effect(function* ({ input }) {
        return yield* Venues.manageContact(input.contactId, input.data);
      }),

    unanswered: platform("venue:manage")
      .meta(docs("Requests that went 72 h without an answer, this last month"))
      .output(z.array(UnansweredSchema))
      .effect(function* () {
        return yield* Venues.manageUnanswered;
      }),

    remove: platform("venue:manage")
      .meta(docs("Delete a space and its requests"))
      .input(VenueIdSchema)
      .output(z.object({ id: z.string() }))
      .effect(function* ({ input }) {
        return yield* Venues.manageRemove(input.venueId);
      }),
  },
};
