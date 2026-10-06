import { openapi } from "@orpc/openapi";
import { Effect } from "effect";
import * as z from "zod";

import { authed, inCommunity, pub, staff } from "../base";
import {
  AddCommunityMemberSchema,
  CommunityIdSchema,
  CommunityMemberSchema,
  CommunitySchema,
  CreateCommunitySchema,
  GetCommunityBySlugSchema,
  ListCommunitiesSchema,
  RemoveCommunityMemberSchema,
  UpdateCommunityMemberRoleSchema,
  UpdateCommunitySchema,
} from "./schemas";
import * as Communities from "./service";

const docs = (summary: string) => openapi({ tags: ["Communities"], summary });

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

  update: authed
    .meta(docs("Edit a community"))
    .input(UpdateCommunitySchema)
    .use(inCommunity("admin"))
    .output(CommunitySchema)
    .effect(function* ({ input }) {
      return yield* Communities.updateCommunity(input.communityId, input.data);
    }),

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
