import { openapi } from "@orpc/openapi";
import { ratelimit } from "@orpc/ratelimit";
import { Effect } from "effect";
import * as z from "zod";

import { can } from "../../authz/principal";
import { authed, inCommunity, platform, principalOf, pub, type AuthedContext } from "../base";
import { NotFound } from "../errors";
import { limiter } from "../ratelimit";
import {
  AssignSchema,
  CardRefSchema,
  CardSchema,
  ClaimProposalSchema,
  ClaimRefSchema,
  ClaimSchema,
  CommunityRefSchema,
  CreateRequestSchema,
  InboxProposalSchema,
  MaterialsViewSchema,
  MyProposalSchema,
  ProposalFieldsSchema,
  ProposalRefSchema,
  PublicSpeakerSchema,
  SetRequestClosedSchema,
  SpeakerProfileSchema,
  SubmitMaterialsSchema,
  TalkRequestSchema,
  TokenSchema,
  UpdateProposalSchema,
} from "./schemas";
import * as Talks from "./service";

const docs = (summary: string) => openapi({ tags: ["Talks"], summary });
const Id = z.object({ id: z.string() });

/** A proposal emails the organizers it names: a few a day per person is plenty. */
const proposeLimit = ratelimit({
  limiter: limiter({ prefix: "talk-propose:", maxRequests: 5, window: 86_400_000 }),
  key: ({ context }: { context: AuthedContext }) => context.user.id,
});

/**
 * Talks: the rolling call for talks on /dar-una-charla, the pool every community's Charlas page
 * reads, claims ("La queremos"), talk requests, speaker profiles and share cards.
 */
export const talksRouter = {
  propose: authed
    .meta(docs("Propose a talk to one or several communities, or to any of OWU"))
    .input(ProposalFieldsSchema)
    .use(proposeLimit)
    .output(Id)
    .effect(function* ({ input }) {
      return yield* Talks.propose(input);
    }),

  update: authed
    .meta(docs("Edit one of your open proposals"))
    .input(UpdateProposalSchema)
    .output(Id)
    .effect(function* ({ input }) {
      return yield* Talks.update(input);
    }),

  withdraw: authed
    .meta(docs("Withdraw one of your proposals; a community that took it is told"))
    .input(ProposalRefSchema)
    .output(Id)
    .effect(function* ({ input }) {
      return yield* Talks.withdraw(input.proposalId);
    }),

  mine: authed
    .meta(docs("Your proposals, with who took each and where it goes"))
    .output(z.array(MyProposalSchema))
    .effect(function* () {
      return yield* Talks.mine;
    }),

  profile: authed
    .meta(docs("Your speaker profile"))
    .output(SpeakerProfileSchema)
    .effect(function* () {
      return yield* Talks.profile;
    }),

  saveProfile: authed
    .meta(docs("Save your speaker profile; `public` opens your page on owu.uy"))
    .input(SpeakerProfileSchema)
    .output(SpeakerProfileSchema)
    .effect(function* ({ input }) {
      return yield* Talks.saveProfile(input);
    }),

  speaker: pub
    .meta(docs("A speaker's public page: their profile and their talks at OWU events"))
    .input(z.object({ userId: z.string().min(1) }))
    .output(PublicSpeakerSchema)
    .effect(function* ({ input }) {
      return yield* Talks.speaker(input.userId);
    }),

  inbox: authed
    .meta(docs("Open proposals this community may take: named to it, or to any of OWU"))
    .input(CommunityRefSchema)
    .use(inCommunity("talk:read"))
    .output(z.array(InboxProposalSchema))
    .effect(function* () {
      return yield* Talks.inbox;
    }),

  claimedFor: authed
    .meta(docs("The talks this community took (claimed, on an event or given), with the speaker's email"))
    .input(CommunityRefSchema)
    .use(inCommunity("talk:read"))
    .output(z.array(ClaimSchema))
    .effect(function* () {
      return yield* Talks.claimedFor;
    }),

  claim: authed
    .meta(docs("«La queremos»: take a talk. One community at a time; the speaker gets your contact"))
    .input(ClaimProposalSchema)
    .use(inCommunity("talk:claim"))
    .output(ClaimSchema)
    .effect(function* ({ input }) {
      return yield* Talks.claim(input.proposalId);
    }),

  release: authed
    .meta(docs("Let a taken talk go back to the pool (and off its event)"))
    .input(ClaimRefSchema)
    .use(inCommunity("talk:claim"))
    .output(z.object({ id: z.string(), proposalId: z.string(), eventId: z.string().nullable() }))
    .effect(function* ({ input }) {
      return yield* Talks.release(input.claimId);
    }),

  assign: authed
    .meta(docs("Put a taken talk on one of this community's coming events; the speaker hears the date"))
    .input(AssignSchema)
    .use(inCommunity("talk:claim"))
    .output(ClaimSchema)
    .effect(function* ({ input }) {
      return yield* Talks.assign(input.claimId);
    }),

  given: authed
    .meta(docs("Mark a talk as given, after its event"))
    .input(ClaimRefSchema)
    .use(inCommunity("talk:claim"))
    .output(ClaimSchema)
    .effect(function* ({ input }) {
      return yield* Talks.given(input.claimId);
    }),

  archive: platform("talk:claim")
    .meta(docs("Staff: archive a proposal (spam); it leaves every inbox"))
    .input(ProposalRefSchema)
    .output(Id)
    .effect(function* ({ input }) {
      return yield* Talks.archive(input.proposalId);
    }),

  requests: {
    open: pub
      .meta(docs("Every community's open talk requests, for /dar-una-charla"))
      .output(z.array(TalkRequestSchema))
      .effect(function* () {
        return yield* Talks.openRequests;
      }),

    list: authed
      .meta(docs("This community's talk requests"))
      .input(CommunityRefSchema)
      .use(inCommunity("talk:read"))
      .output(z.array(TalkRequestSchema))
      .effect(function* () {
        return yield* Talks.requests;
      }),

    create: authed
      .meta(docs("«Buscamos charla sobre…»: shown on /dar-una-charla until closed"))
      .input(CreateRequestSchema)
      .use(inCommunity("talk:claim"))
      .output(TalkRequestSchema)
      .effect(function* ({ input }) {
        return yield* Talks.createRequest(input);
      }),

    setClosed: authed
      .meta(docs("Close a talk request, or open it again"))
      .input(SetRequestClosedSchema)
      .use(inCommunity("talk:claim"))
      .output(TalkRequestSchema)
      .effect(function* ({ input }) {
        return yield* Talks.setRequestClosed(input.requestId, input.closed);
      }),
  },

  card: pub
    .meta(docs("The words on an event's or a talk's share card: anyone's once published, else organizers only"))
    .input(CardRefSchema)
    .output(CardSchema)
    .effect(function* ({ input, context }) {
      const card = yield* Talks.card(input);
      if (card.public) return card;
      const allowed = yield* Effect.promise(async () =>
        can(await principalOf(context), "event:read", card.communityId)
      );
      if (!allowed) return yield* new NotFound({ entity: "card", message: "No hay tarjeta para eso" });

      return card;
    }),

  materials: {
    view: pub
      .meta(docs("The talk behind a speaker's materials link"))
      .input(TokenSchema)
      .output(MaterialsViewSchema)
      .effect(function* ({ input }) {
        return yield* Talks.materialsView(input.token);
      }),

    submit: pub
      .meta(docs("The speaker's slides and recording links, from the emailed link, once"))
      .input(SubmitMaterialsSchema)
      .output(z.object({ added: z.number() }))
      .effect(function* ({ input }) {
        return yield* Talks.submitMaterials(input);
      }),
  },
};
