import { openapi } from "@orpc/openapi";
import { ratelimit } from "@orpc/ratelimit";
import { Effect } from "effect";
import * as z from "zod";

import { can } from "../../authz/principal";
import { authed, inCommunity, platform, principalOf, pub, type AuthedContext } from "../base";
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
import { AccessRequestSchema, InvitationSchema } from "../access/schemas";
import * as Access from "../access/service";
import * as Follow from "./follow";
import { CommunityRoleInfoSchema, RoleInputSchema } from "./roles";
import * as Roles from "./roles";
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

/** Added right away (they're on the OWU Slack), or invited (it applies when they sign in with it). */
const AddResultSchema = z.object({
  status: z.enum(["added", "invited"]),
  member: MembershipSchema.nullable(),
  invitationId: z.string().nullable(),
});

export const communitiesRouter = {
  list: pub
    .meta(docs("List communities"))
    .input(ListCommunitiesSchema)
    .output(z.array(CommunitySchema))
    .effect(function* ({ input, context }) {
      // Inactive ones only for whoever may list every community (site staff, moderators)
      const everything =
        input?.includeInactive === true &&
        (yield* Effect.promise(async () => can(await principalOf(context), "organization:list")));

      return yield* Communities.listCommunities(everything);
    }),

  listForAdmin: platform("organization:list")
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

  create: platform("organization:create")
    .meta(docs("Create a community (site staff); the creator becomes its owner"))
    .input(CreateCommunitySchema)
    .output(CommunitySchema)
    .effect(function* ({ input }) {
      return yield* Communities.createCommunity(input);
    }),

  delete: platform("organization:delete")
    .meta(docs("Delete a community with its members, once it has no events (site staff)"))
    .input(CommunityIdSchema)
    .output(z.object({ ok: z.literal(true) }))
    .effect(function* ({ input }) {
      return yield* Communities.deleteCommunity(input.communityId);
    }),

  update: authed
    .meta(docs("Edit a community"))
    .input(UpdateCommunitySchema)
    .use(inCommunity("organization:update"))
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
    list: platform("claim:read")
      .meta(docs("Claims to organize a community, pending first (site staff)"))
      .output(z.array(ClaimForReviewSchema))
      .effect(function* () {
        return yield* Communities.listClaims();
      }),

    decide: platform("claim:decide")
      .meta(docs("Approve or reject a claim; approving adds the person to the community (site staff)"))
      .input(DecideClaimSchema)
      .output(z.object({ id: z.string(), status: ClaimStatusSchema, role: CommunityRoleSchema.nullable() }))
      .effect(function* ({ input }) {
        return yield* Communities.decideClaim(input);
      }),
  },

  /** The community's roles: the built-ins and its own (custom), with what each holds. */
  roles: {
    list: authed
      .meta(docs("The community's roles and the permissions each holds"))
      .input(CommunityIdSchema)
      .use(inCommunity("role:read"))
      .output(z.array(CommunityRoleInfoSchema))
      .effect(function* ({ input }) {
        return yield* Roles.listRoles(input.communityId);
      }),

    create: authed
      .meta(docs("Create a custom role (never with more than the author holds)"))
      .input(RoleInputSchema)
      .use(inCommunity("role:create"))
      .output(z.object({ role: z.string() }))
      .effect(function* ({ input }) {
        return yield* Roles.createRole(input);
      }),

    update: authed
      .meta(docs("Rename a custom role or change what it holds"))
      .input(
        RoleInputSchema.partial({ label: true, description: true, permissions: true }).extend({
          role: CommunityRoleSchema,
        })
      )
      .use(inCommunity("role:update"))
      .output(z.object({ role: z.string() }))
      .effect(function* ({ input }) {
        return yield* Roles.updateRole(input);
      }),

    delete: authed
      .meta(docs("Delete a custom role nobody holds"))
      .input(z.object({ communityId: z.string().min(1), role: CommunityRoleSchema }))
      .use(inCommunity("role:delete"))
      .output(z.object({ success: z.literal(true) }))
      .effect(function* ({ input }) {
        return yield* Roles.deleteRole(input);
      }),
  },

  /** Invitations to the team waiting for the person to sign in with the OWU Slack. */
  invitations: {
    list: authed
      .meta(docs("The community's pending invitations"))
      .input(CommunityIdSchema)
      .use(inCommunity("member:read"))
      .output(z.array(InvitationSchema))
      .effect(function* ({ input }) {
        return yield* Access.listInvitations({ communityId: input.communityId });
      }),

    revoke: authed
      .meta(docs("Cancel a pending invitation to the team"))
      .input(z.object({ communityId: z.string().min(1), invitationId: z.string().min(1) }))
      .use(inCommunity("invitation:cancel"))
      .output(z.object({ success: z.literal(true) }))
      .effect(function* ({ input }) {
        return yield* Access.revokeInvitation(input);
      }),
  },

  /** People asking to join the community's team (the waitlist). */
  requests: {
    list: authed
      .meta(docs("Requests to join the community's team, pending first"))
      .input(CommunityIdSchema)
      .use(inCommunity("member:read"))
      .output(z.array(AccessRequestSchema))
      .effect(function* ({ input }) {
        return yield* Access.listRequests({ communityId: input.communityId });
      }),

    decide: authed
      .meta(docs("Approve (with a role) or reject a request to join the team"))
      .input(
        z.object({
          communityId: z.string().min(1),
          requestId: z.string().min(1),
          decision: z.enum(["approve", "reject"]),
          role: CommunityRoleSchema.default("member"),
        })
      )
      .use(inCommunity("member:create"))
      .output(
        z.object({
          id: z.string(),
          status: z.enum(["approved", "rejected"]),
          grantedRole: z.string().nullable(),
          invited: z.boolean(),
        })
      )
      .effect(function* ({ input }) {
        return yield* Access.decideRequest({
          requestId: input.requestId,
          decision: input.decision,
          grant: { communityId: input.communityId, role: input.role },
          scopeCommunityId: input.communityId,
        });
      }),
  },

  members: {
    list: authed
      .meta(docs("List a community's members and their roles"))
      .input(CommunityIdSchema)
      .use(inCommunity("member:read"))
      .output(z.array(CommunityMemberSchema))
      .effect(function* ({ input }) {
        return yield* Communities.listCommunityMembers(input.communityId);
      }),

    add: authed
      .meta(docs("Add someone to the team by email or OWU Slack id; without the OWU Slack yet, invite them"))
      .input(AddCommunityMemberSchema)
      .use(inCommunity("member:create"))
      .output(AddResultSchema)
      .effect(function* ({ input }) {
        return yield* Communities.addCommunityMember(input);
      }),

    updateRole: authed
      .meta(docs("Change a member's role"))
      .input(UpdateCommunityMemberRoleSchema)
      .use(inCommunity("member:update"))
      .output(MembershipSchema)
      .effect(function* ({ input }) {
        return yield* Communities.updateCommunityMemberRole(input);
      }),

    showOnProfile: authed
      .meta(docs("Appear, or not, among the organizers on the community's public page (name and photo)"))
      .input(ShowOnProfileSchema)
      .use(inCommunity("member:show-on-profile"))
      .output(z.object({ showOnProfile: z.boolean() }))
      .effect(function* ({ input }) {
        return yield* Communities.setShowOnProfile(input);
      }),

    leave: authed
      .meta(docs("Leave a community's team (the last owner can't)"))
      .input(CommunityIdSchema)
      .output(z.object({ success: z.literal(true) }))
      .effect(function* ({ input }) {
        return yield* Communities.leaveCommunity(input.communityId);
      }),

    remove: authed
      .meta(docs("Remove a member"))
      .input(RemoveCommunityMemberSchema)
      .use(inCommunity("member:delete"))
      .output(z.object({ success: z.literal(true) }))
      .effect(function* ({ input }) {
        return yield* Communities.removeCommunityMember(input);
      }),
  },
};
