import { openapi } from "@orpc/openapi";
import { ratelimit } from "@orpc/ratelimit";
import { Effect } from "effect";
import * as z from "zod";

import { authed, inCommunity, pub, staff, type AuthedContext } from "../base";
import { limiter } from "../ratelimit";
import {
  AddCommunityMemberSchema,
  ClaimCommunitySchema,
  ClaimForReviewSchema,
  ClaimStatusSchema,
  CommunityIdSchema,
  CommunityRoleSchema,
  DecideClaimSchema,
  MineSchema,
  MyClaimSchema,
  CommunityMemberSchema,
  CommunityOverviewSchema,
  CommunitySchema,
  CreateCommunitySchema,
  GetCommunityBySlugSchema,
  ListCommunitiesSchema,
  RemoveCommunityMemberSchema,
  ShowOnProfileSchema,
  UpdateCommunityMemberRoleSchema,
  UpdateCommunitySchema,
} from "./schemas";
import * as Follow from "./follow";
import * as Communities from "./service";

const docs = (summary: string) => openapi({ tags: ["Communities"], summary });

const FollowStateSchema = z.object({ followers: z.number(), following: z.boolean() });

/** Three claims a day per person is plenty for a real organizer and stops a script. */
const claimLimit = ratelimit({
  limiter: limiter({ prefix: "claim:", maxRequests: 3, window: 86_400_000 }),
  key: ({ context }: { context: AuthedContext }) => context.user.id,
});

const MembershipSchema = z.object({
  id: z.string(),
  communityId: z.string(),
  userId: z.string(),
  role: CommunityMemberSchema.shape.role,
});

export const communitiesRouter = {
  list: pub
    .meta(docs("List communities"))
    .input(ListCommunitiesSchema)
    .output(z.array(CommunitySchema))
    .effect(function* ({ input, context }) {
      const session = yield* Effect.promise(() => context.getSession());

      return yield* Communities.listCommunities(input?.includeInactive === true && session?.user.role === "admin");
    }),

  listForAdmin: staff
    .meta(docs("Every community, active or not, with its member and event counts (site staff)"))
    .output(z.array(CommunityOverviewSchema))
    .effect(function* () {
      return yield* Communities.listCommunitiesForAdmin();
    }),

  getBySlug: pub
    .meta(docs("Find a community by its slug"))
    .input(GetCommunityBySlugSchema)
    .output(CommunitySchema.nullable())
    .effect(function* ({ input }) {
      return yield* Communities.getCommunityBySlug(input.communitySlug);
    }),

  create: staff
    .meta(docs("Create a community (site staff); the creator becomes its owner"))
    .input(CreateCommunitySchema)
    .output(CommunitySchema)
    .effect(function* ({ input }) {
      return yield* Communities.createCommunity(input);
    }),

  delete: staff
    .meta(docs("Delete a community with its members, once it has no events (site staff)"))
    .input(CommunityIdSchema)
    .output(z.object({ ok: z.literal(true) }))
    .effect(function* ({ input }) {
      return yield* Communities.deleteCommunity(input.communityId);
    }),

  update: authed
    .meta(docs("Edit a community"))
    .input(UpdateCommunitySchema)
    .use(inCommunity("admin"))
    .output(CommunitySchema)
    .effect(function* ({ input }) {
      return yield* Communities.updateCommunity(input.communityId, input.data);
    }),

  mine: authed
    .meta(docs("The communities I organize and my claims (organizer panel)"))
    .output(MineSchema)
    .effect(function* () {
      return yield* Communities.mine();
    }),

  followState: pub
    .meta(docs("How many follow a community, and whether the caller does"))
    .input(CommunityIdSchema)
    .output(FollowStateSchema)
    .effect(function* ({ input, context }) {
      const session = yield* Effect.promise(() => context.getSession());
      return yield* Follow.state(input.communityId, session?.user.id ?? null);
    }),

  follow: authed
    .meta(docs("Follow a community: an email for each event it publishes"))
    .input(CommunityIdSchema)
    .output(FollowStateSchema)
    .effect(function* ({ input, context }) {
      return yield* Follow.follow(input.communityId, context.user.id);
    }),

  unfollow: authed
    .meta(docs("Stop following a community"))
    .input(CommunityIdSchema)
    .output(FollowStateSchema)
    .effect(function* ({ input, context }) {
      return yield* Follow.unfollow(input.communityId, context.user.id);
    }),

  claim: authed
    .meta(docs("Ask to organize a directory community; site staff decide"))
    .input(ClaimCommunitySchema)
    .use(claimLimit)
    .output(MyClaimSchema)
    .effect(function* ({ input }) {
      return yield* Communities.claim(input);
    }),

  claims: {
    list: staff
      .meta(docs("Claims to organize a community, pending first (site staff)"))
      .output(z.array(ClaimForReviewSchema))
      .effect(function* () {
        return yield* Communities.listClaims();
      }),

    decide: staff
      .meta(docs("Approve or reject a claim; approving adds the person to the community (site staff)"))
      .input(DecideClaimSchema)
      .output(z.object({ id: z.string(), status: ClaimStatusSchema, role: CommunityRoleSchema.nullable() }))
      .effect(function* ({ input }) {
        return yield* Communities.decideClaim(input);
      }),
  },

  members: {
    list: authed
      .meta(docs("List a community's members and their roles"))
      .input(CommunityIdSchema)
      .use(inCommunity("admin"))
      .output(z.array(CommunityMemberSchema))
      .effect(function* ({ input }) {
        return yield* Communities.listCommunityMembers(input.communityId);
      }),

    add: authed
      .meta(docs("Add someone by email, or change an existing member's role"))
      .input(AddCommunityMemberSchema)
      .use(inCommunity("admin"))
      .output(MembershipSchema)
      .effect(function* ({ input }) {
        return yield* Communities.addCommunityMember(input);
      }),

    updateRole: authed
      .meta(docs("Change a member's role"))
      .input(UpdateCommunityMemberRoleSchema)
      .use(inCommunity("admin"))
      .output(MembershipSchema)
      .effect(function* ({ input }) {
        return yield* Communities.updateCommunityMemberRole(input);
      }),

    showOnProfile: authed
      .meta(docs("Appear, or not, among the organizers on the community's public page (name and photo)"))
      .input(ShowOnProfileSchema)
      .use(inCommunity("editor"))
      .output(z.object({ showOnProfile: z.boolean() }))
      .effect(function* ({ input }) {
        return yield* Communities.setShowOnProfile(input);
      }),

    remove: authed
      .meta(docs("Remove a member"))
      .input(RemoveCommunityMemberSchema)
      .use(inCommunity("admin"))
      .output(z.object({ success: z.literal(true) }))
      .effect(function* ({ input }) {
        return yield* Communities.removeCommunityMember(input);
      }),
  },
};
