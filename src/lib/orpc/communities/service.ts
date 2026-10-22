import { and, asc, countDistinct, desc, eq, sql } from "drizzle-orm";
import { Effect } from "effect";

import {
  communities,
  communityClaims,
  communityMembers,
  events,
  user,
  type CommunityClaimRow,
  type CommunityRow,
} from "../../db/schema";
import { enqueueEmail } from "../../email/outbox";
import { claimDecidedEmail } from "../../email/templates";
import { query, transaction } from "../db";
import { Conflict, Forbidden, Invalid, NotFound } from "../errors";
import { memberRole } from "../scope";
import { CurrentUser } from "../services";
import { recordActivity } from "../ops";
import type {
  ClaimForReview,
  Community,
  CommunityMember,
  CommunityOverview,
  CommunityRole,
  MyClaim,
  MyCommunity,
} from "./schemas";

const toCommunity = (row: CommunityRow): Community => ({
  id: row.id,
  slug: row.slug,
  name: row.name,
  description: row.description,
  logoUrl: row.logoUrl,
  customDomain: row.customDomain,
  isActive: row.isActive,
  status: row.status,
  topics: row.topics,
  listed: row.listed,
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

/** Every community, active or not, with its member and event counts (the admin's list). */
export const listCommunitiesForAdmin = () =>
  query((db) =>
    db
      .select({
        community: communities,
        memberCount: countDistinct(communityMembers.id),
        eventCount: countDistinct(events.id),
      })
      .from(communities)
      .leftJoin(communityMembers, eq(communityMembers.communityId, communities.id))
      .leftJoin(events, eq(events.communityId, communities.id))
      .groupBy(communities.id)
      .orderBy(asc(communities.name))
  ).pipe(
    Effect.map((rows) =>
      rows.map((row): CommunityOverview => ({
        ...toCommunity(row.community),
        memberCount: row.memberCount,
        eventCount: row.eventCount,
      }))
    )
  );

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
          new Conflict({
            reason: "slug_taken",
            message: `Ya hay una comunidad en /comunidad/${input.slug}: elegí otra dirección.`,
          })
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

// ---------------------------------------------------------------------------
// Organizers: the communities I run, and claims on directory communities
// ---------------------------------------------------------------------------

/** The communities I organize (any role) and my claims, for the panel's switcher. */
export const mine = () =>
  Effect.gen(function* () {
    const me = yield* CurrentUser;
    const [memberships, claims] = yield* Effect.all([
      query((db) =>
        db
          .select({
            id: communities.id,
            slug: communities.slug,
            name: communities.name,
            logoUrl: communities.logoUrl,
            role: communityMembers.role,
          })
          .from(communityMembers)
          .innerJoin(communities, eq(communities.id, communityMembers.communityId))
          .where(and(eq(communityMembers.userId, me.id), eq(communities.isActive, true)))
          .orderBy(asc(communities.name))
      ),
      query((db) =>
        db
          .select({
            id: communityClaims.id,
            communityId: communityClaims.communityId,
            communityName: communities.name,
            status: communityClaims.status,
            createdAt: communityClaims.createdAt,
          })
          .from(communityClaims)
          .innerJoin(communities, eq(communities.id, communityClaims.communityId))
          .where(eq(communityClaims.userId, me.id))
          .orderBy(desc(communityClaims.createdAt))
      ),
    ]);

    return {
      communities: memberships satisfies MyCommunity[],
      claims: claims.map((claim): MyClaim => ({ ...claim, createdAt: claim.createdAt.toISOString() })),
    };
  });

/**
 * Ask to organize a directory community. A rejected claim can be sent again; a pending one or
 * an existing membership can't.
 */
export const claim = (input: {
  communityId: string;
  relation: CommunityClaimRow["relation"];
  message: string;
  link: string | null;
}) =>
  Effect.gen(function* () {
    const me = yield* CurrentUser;
    const [community] = yield* query((db) =>
      db
        .select({ id: communities.id, name: communities.name, isActive: communities.isActive })
        .from(communities)
        .where(eq(communities.id, input.communityId))
    );
    if (!community?.isActive) return yield* communityNotFound;
    if (yield* memberRole(input.communityId, me.id)) {
      return yield* new Conflict({ reason: "already_member", message: `Ya organizás ${community.name}` });
    }

    const [row] = yield* query((db) =>
      db
        .insert(communityClaims)
        .values({ ...input, userId: me.id })
        .onConflictDoUpdate({
          target: [communityClaims.communityId, communityClaims.userId],
          set: {
            relation: input.relation,
            message: input.message,
            link: input.link,
            status: "pending",
            reviewedById: null,
            reviewedAt: null,
            createdAt: new Date(),
          },
          // Only a rejected claim is reopened; a pending one stays as it was
          setWhere: eq(communityClaims.status, "rejected"),
        })
        .returning()
    );
    if (!row) {
      return yield* new Conflict({ reason: "claim_pending", message: "Ya pediste organizar esta comunidad" });
    }
    yield* recordActivity({
      eventId: null,
      verb: "community.claimed",
      entityType: "community",
      entityId: input.communityId,
      summary: `pidió organizar ${community.name}`,
    });

    return {
      id: row.id,
      communityId: row.communityId,
      communityName: community.name,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
    } satisfies MyClaim;
  });

/** Pending claims first, then the last decided ones, for site staff. */
export const listClaims = () =>
  query((db) =>
    db
      .select({
        claim: communityClaims,
        community: { id: communities.id, slug: communities.slug, name: communities.name },
        user: { id: user.id, name: user.name, email: user.email, image: user.image },
        owners: sql<number>`(select count(*)::int from ${communityMembers} where ${communityMembers.communityId} = ${communities.id} and ${communityMembers.role} = 'owner')`,
      })
      .from(communityClaims)
      .innerJoin(communities, eq(communities.id, communityClaims.communityId))
      .innerJoin(user, eq(user.id, communityClaims.userId))
      .orderBy(sql`${communityClaims.status} = 'pending' desc`, desc(communityClaims.createdAt))
      .limit(100)
  ).pipe(
    Effect.map((rows) =>
      rows.map((row): ClaimForReview => ({
        id: row.claim.id,
        relation: row.claim.relation,
        message: row.claim.message,
        link: row.claim.link,
        status: row.claim.status,
        createdAt: row.claim.createdAt.toISOString(),
        community: { ...row.community, hasOwner: row.owners > 0 },
        user: row.user,
      }))
    )
  );

/**
 * Approve or reject a claim. Approving adds the person to the community: as owner when it has
 * none yet, as editor otherwise, unless staff pick a role.
 */
export const decideClaim = (input: { claimId: string; decision: "approve" | "reject"; role?: CommunityRole }) =>
  transaction(
    Effect.gen(function* () {
      const reviewer = yield* CurrentUser;
      const [row] = yield* query((db) =>
        db.select().from(communityClaims).where(eq(communityClaims.id, input.claimId)).for("update")
      );
      if (!row) return yield* new NotFound({ entity: "claim", message: "Ese pedido no existe" });
      if (row.status !== "pending") {
        return yield* new Conflict({ reason: "claim_decided", message: "Ese pedido ya se resolvió" });
      }
      yield* lockCommunity(row.communityId);

      const status: CommunityClaimRow["status"] = input.decision === "approve" ? "approved" : "rejected";
      const reviewedAt = new Date();
      yield* query((db) =>
        db
          .update(communityClaims)
          .set({ status, reviewedById: reviewer.id, reviewedAt })
          .where(eq(communityClaims.id, row.id))
      );

      let role: CommunityRole | null = null;
      if (status === "approved") {
        const granted = input.role ?? ((yield* ownerCount(row.communityId)) === 0 ? "owner" : "editor");
        yield* query((db) =>
          db
            .insert(communityMembers)
            .values({ communityId: row.communityId, userId: row.userId, role: granted })
            .onConflictDoUpdate({
              target: [communityMembers.communityId, communityMembers.userId],
              set: { role: granted },
            })
        );
        role = granted;
      }
      const [person] = yield* query((db) =>
        db
          .select({
            name: user.name,
            email: user.email,
            communityName: communities.name,
            communitySlug: communities.slug,
          })
          .from(user)
          .innerJoin(communities, eq(communities.id, row.communityId))
          .where(eq(user.id, row.userId))
      );
      if (person) {
        yield* enqueueEmail({
          kind: "claim_decided",
          to: person.email,
          dedupeKey: `claim_decided:${row.id}:${reviewedAt.getTime()}`,
          ...claimDecidedEmail({ ...person, role }),
        });
      }
      yield* recordActivity({
        eventId: null,
        verb: status === "approved" ? "community.claim_approved" : "community.claim_rejected",
        entityType: "community",
        entityId: row.communityId,
        summary: status === "approved" ? `aprobó a un organizador (${role})` : "rechazó un pedido para organizar",
      });

      return { id: row.id, status, role };
    })
  );
