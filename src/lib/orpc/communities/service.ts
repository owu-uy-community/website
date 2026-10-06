import { and, asc, eq } from "drizzle-orm";
import { Effect } from "effect";

import { communities, communityMembers, user, type CommunityRow } from "../../db/schema";
import { query, transaction } from "../db";
import { Conflict, Forbidden, Invalid, NotFound } from "../errors";
import { memberRole } from "../scope";
import { CurrentUser } from "../services";
import type { Community, CommunityMember, CommunityRole } from "./schemas";

const toCommunity = (row: CommunityRow): Community => ({
  id: row.id,
  slug: row.slug,
  name: row.name,
  description: row.description,
  logoUrl: row.logoUrl,
  customDomain: row.customDomain,
  isActive: row.isActive,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

const communityNotFound = new NotFound({ entity: "community", message: "Esa comunidad no existe" });

export const listCommunities = (includeInactive: boolean) =>
  query((db) =>
    db
      .select()
      .from(communities)
      .where(includeInactive ? undefined : eq(communities.isActive, true))
      .orderBy(asc(communities.name))
  ).pipe(Effect.map((rows) => rows.map(toCommunity)));

export const getCommunityBySlug = (slug: string) =>
  query((db) => db.select().from(communities).where(eq(communities.slug, slug))).pipe(
    Effect.map(([row]) => (row ? toCommunity(row) : null))
  );

/** Create a community with its creator as the first owner, both or neither. */
export const createCommunity = (input: { slug: string; name: string; description?: string; logoUrl?: string }) =>
  Effect.gen(function* () {
    const creator = yield* CurrentUser;

    return yield* transaction(
      Effect.gen(function* () {
        const [row] = yield* query((db) =>
          db
            .insert(communities)
            .values({
              slug: input.slug,
              name: input.name,
              description: input.description ?? null,
              logoUrl: input.logoUrl ?? null,
            })
            .returning()
        );
        yield* query((db) =>
          db.insert(communityMembers).values({ communityId: row.id, userId: creator.id, role: "owner" })
        );

        return toCommunity(row);
      })
    ).pipe(
      Effect.catchTag("UniqueViolation", () =>
        Effect.fail(
          new Conflict({ reason: "slug_taken", message: `Ya existe una comunidad con el slug "${input.slug}"` })
        )
      )
    );
  });

export const updateCommunity = (
  communityId: string,
  data: Partial<Pick<CommunityRow, "name" | "description" | "logoUrl" | "isActive">>
) =>
  query((db) => db.update(communities).set(data).where(eq(communities.id, communityId)).returning()).pipe(
    Effect.flatMap(([row]) => (row ? Effect.succeed(toCommunity(row)) : Effect.fail(communityNotFound)))
  );

export const listCommunityMembers = (communityId: string) =>
  query((db) =>
    db
      .select({
        id: communityMembers.id,
        communityId: communityMembers.communityId,
        userId: communityMembers.userId,
        role: communityMembers.role,
        createdAt: communityMembers.createdAt,
        name: user.name,
        email: user.email,
        image: user.image,
      })
      .from(communityMembers)
      .innerJoin(user, eq(communityMembers.userId, user.id))
      .where(eq(communityMembers.communityId, communityId))
      .orderBy(asc(user.name))
  ).pipe(
    Effect.map((rows) => rows.map((row): CommunityMember => ({ ...row, createdAt: row.createdAt.toISOString() })))
  );

/** Site staff, or an owner of this community: the only ones who may hand out or take away ownership. */
const requesterIsOwner = (communityId: string) =>
  Effect.gen(function* () {
    const requester = yield* CurrentUser;
    if (requester.role === "admin") return true;

    return (yield* memberRole(communityId, requester.id)) === "owner";
  });

const ownersOnly = new Forbidden({ message: "Solo un owner de la comunidad puede cambiar a otro owner" });
const lastOwner = new Conflict({ reason: "last_owner", message: "La comunidad tiene que conservar al menos un owner" });

/**
 * Membership changes of one community run one at a time: each locks the
 * community row first, inside its transaction. Two admins demoting the last
 * two owners at once can't both see "one left", and with a single lock taken
 * first there is no lock order to get wrong (no deadlocks).
 */
const lockCommunity = (communityId: string) =>
  query((db) =>
    db.select({ id: communities.id }).from(communities).where(eq(communities.id, communityId)).for("update")
  ).pipe(Effect.flatMap(([row]) => (row ? Effect.void : Effect.fail(communityNotFound))));

const ownerCount = (communityId: string) =>
  query((db) =>
    db
      .select({ id: communityMembers.id })
      .from(communityMembers)
      .where(and(eq(communityMembers.communityId, communityId), eq(communityMembers.role, "owner")))
  ).pipe(Effect.map((rows) => rows.length));

const findMembership = (communityId: string, memberId: string) =>
  query((db) =>
    db
      .select()
      .from(communityMembers)
      .where(and(eq(communityMembers.id, memberId), eq(communityMembers.communityId, communityId)))
  ).pipe(
    Effect.flatMap(([member]) =>
      member
        ? Effect.succeed(member)
        : Effect.fail(new NotFound({ entity: "member", message: "Esa persona no es miembro de la comunidad" }))
    )
  );

/**
 * Add someone by the email they signed in with, or change the role of an
 * existing member. Giving or taking away the owner role is reserved to owners
 * (and staff), and the last owner can never be demoted this way.
 */
export const addCommunityMember = (input: { communityId: string; email: string; role: CommunityRole }) =>
  transaction(
    Effect.gen(function* () {
      yield* lockCommunity(input.communityId);
      const [target] = yield* query((db) =>
        db.select({ id: user.id }).from(user).where(eq(user.email, input.email.toLowerCase().trim()))
      );
      if (!target) {
        return yield* new Invalid({
          message: "No hay nadie con ese email: tiene que haber iniciado sesión al menos una vez",
        });
      }

      const current = yield* memberRole(input.communityId, target.id);
      const touchesOwner = input.role === "owner" || current === "owner";
      if (touchesOwner && !(yield* requesterIsOwner(input.communityId))) return yield* ownersOnly;
      if (current === "owner" && input.role !== "owner" && (yield* ownerCount(input.communityId)) <= 1) {
        return yield* lastOwner;
      }

      const [row] = yield* query((db) =>
        db
          .insert(communityMembers)
          .values({ communityId: input.communityId, userId: target.id, role: input.role })
          .onConflictDoUpdate({
            target: [communityMembers.communityId, communityMembers.userId],
            set: { role: input.role },
          })
          .returning()
      );

      return row;
    })
  );

export const updateCommunityMemberRole = (input: { communityId: string; memberId: string; role: CommunityRole }) =>
  transaction(
    Effect.gen(function* () {
      yield* lockCommunity(input.communityId);
      const member = yield* findMembership(input.communityId, input.memberId);

      if ((member.role === "owner" || input.role === "owner") && !(yield* requesterIsOwner(input.communityId))) {
        return yield* ownersOnly;
      }
      if (member.role === "owner" && input.role !== "owner" && (yield* ownerCount(input.communityId)) <= 1) {
        return yield* lastOwner;
      }

      const [row] = yield* query((db) =>
        db.update(communityMembers).set({ role: input.role }).where(eq(communityMembers.id, input.memberId)).returning()
      );

      return row;
    })
  );

export const removeCommunityMember = (input: { communityId: string; memberId: string }) =>
  transaction(
    Effect.gen(function* () {
      yield* lockCommunity(input.communityId);
      const member = yield* findMembership(input.communityId, input.memberId);

      if (member.role === "owner") {
        if (!(yield* requesterIsOwner(input.communityId))) return yield* ownersOnly;
        if ((yield* ownerCount(input.communityId)) <= 1) return yield* lastOwner;
      }

      yield* query((db) => db.delete(communityMembers).where(eq(communityMembers.id, input.memberId)));

      return { success: true as const };
    })
  );
