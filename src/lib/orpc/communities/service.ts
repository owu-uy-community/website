import { and, asc, countDistinct, desc, eq, sql } from "drizzle-orm";
import { Effect } from "effect";

import { owuSlackLinked } from "../../authz/principal";
import { higherCommunityRole } from "../../authz/people";
import {
  account,
  communities,
  communityClaims,
  communityMembers,
  events,
  invitations,
  user,
  type CommunityClaimRow,
  type CommunityLinks,
  type CommunityRow,
} from "../../db/schema";
import { isValidCommunitySlug } from "../../tenant";
import { enqueueEmail } from "../../email/outbox";
import { refreshPage } from "../../revalidate";
import { accessInviteEmail, claimDecidedEmail } from "../../email/templates";
import { query, transaction } from "../db";
import { Conflict, Invalid, NotFound } from "../errors";
import { checkGrant, holdsOwuSlack, needsOwuSlack, raises } from "./grants";
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
  links: row.links,
  slackChannel: row.slackChannel,
  listed: row.listed,
  recurringSlot: (row.recurringSlot as Community["recurringSlot"]) ?? null,
  pausedUntil: row.pausedUntil,
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

/**
 * Edit a community; its public pages (directory, profile, home, agenda) show it on their next visit.
 * A return date only means something during a pause: leaving the pause drops it.
 */
export const updateCommunity = (
  communityId: string,
  data: Partial<
    Pick<
      CommunityRow,
      | "name"
      | "description"
      | "logoUrl"
      | "isActive"
      | "status"
      | "topics"
      | "links"
      | "slackChannel"
      | "noShowNudge"
      | "recurringSlot"
      | "pausedUntil"
    >
  >
) =>
  query((db) =>
    db
      .update(communities)
      .set(data.status && data.status !== "pausa" ? { ...data, pausedUntil: null } : data)
      .where(eq(communities.id, communityId))
      .returning()
  ).pipe(
    Effect.flatMap(([row]) => (row ? Effect.succeed(toCommunity(row)) : Effect.fail(communityNotFound))),
    Effect.tap((community) =>
      Effect.sync(() => {
        for (const path of ["/", "/comunidades", "/eventos", `/comunidad/${community.slug}`]) refreshPage(path);
      })
    )
  );

/**
 * A community gone, with its members. Only once it has no events: those carry rooms, talks,
 * attendees and the day's history, so they are deleted (each from its own settings) first.
 */
export const deleteCommunity = (communityId: string) =>
  transaction(
    Effect.gen(function* () {
      const [community] = yield* query((db) =>
        db.select().from(communities).where(eq(communities.id, communityId)).for("update")
      );
      if (!community) return yield* communityNotFound;
      const [held] = yield* query((db) =>
        db
          .select({ events: countDistinct(events.id) })
          .from(events)
          .where(eq(events.communityId, communityId))
      );
      if (held && held.events > 0) {
        return yield* new Conflict({
          reason: "community_has_events",
          message: `${community.name} tiene ${held.events === 1 ? "un evento" : `${held.events} eventos`}: eliminalos primero, desde sus ajustes.`,
        });
      }
      yield* query((db) => db.delete(communities).where(eq(communities.id, communityId)));

      return { ok: true as const };
    })
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
        owuSlack: sql<boolean>`(${owuSlackLinked(sql.raw(`"user"."id"`))} and "user"."slackDeactivatedAt" is null)`,
      })
      .from(communityMembers)
      .innerJoin(user, eq(communityMembers.userId, user.id))
      .where(eq(communityMembers.communityId, communityId))
      .orderBy(asc(user.name))
  ).pipe(
    Effect.map((rows) => rows.map((row): CommunityMember => ({ ...row, createdAt: row.createdAt.toISOString() })))
  );

const lastOwner = new Conflict({ reason: "last_owner", message: "La comunidad tiene que conservar al menos un dueño" });

/**
 * Membership changes of one community run one at a time: each locks the
 * community row first, inside its transaction. Two admins demoting the last
 * two owners at once can't both see "one left", and with a single lock taken
 * first there is no lock order to get wrong (no deadlocks). The database keeps
 * the same rule for every other writer (src/lib/db/triggers.ts).
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

const INVITATION_DAYS = 30;

/**
 * Add someone to the team by the email they use or their OWU Slack id. Someone already on the OWU
 * Slack joins right away; anyone else gets an invitation that applies when they sign in with it
 * (the allowlist). Someone already on the team is refused: their role changes from the list.
 */
export const addCommunityMember = (input: {
  communityId: string;
  email?: string | undefined;
  slackUserId?: string | undefined;
  name?: string | undefined;
  role: CommunityRole;
}) =>
  transaction(
    Effect.gen(function* () {
      const me = yield* CurrentUser;
      yield* lockCommunity(input.communityId);
      const email = input.email?.toLowerCase().trim() || null;
      const slackUserId = input.slackUserId?.trim() || null;
      if (!email && !slackUserId)
        return yield* new Invalid({ message: "Indicá un email o un usuario del Slack de OWU" });

      const [target] = yield* query((db) =>
        db
          .select({ id: user.id })
          .from(user)
          .where(
            email
              ? eq(sql`lower(${user.email})`, email)
              : sql`${user.id} in (select ${account.userId} from ${account} where ${account.providerId} = 'slack' and ${account.accountId} = ${slackUserId})`
          )
          .limit(1)
      );
      if (target && (yield* memberRole(input.communityId, target.id))) {
        return yield* new Conflict({
          reason: "already_member",
          message: "Ya es parte de la comunidad: cambiale el rol desde la lista",
        });
      }
      yield* checkGrant(input.communityId, target?.id ?? null, null, input.role);

      if (target && (yield* holdsOwuSlack(target.id))) {
        const [row] = yield* query((db) =>
          db
            .insert(communityMembers)
            .values({ communityId: input.communityId, userId: target.id, role: input.role })
            .returning()
        );

        return { status: "added" as const, member: row, invitationId: null };
      }

      const [invitation] = yield* query((db) =>
        db
          .insert(invitations)
          .values({
            communityId: input.communityId,
            role: input.role,
            email,
            slackUserId,
            name: input.name ?? null,
            invitedById: me.id,
            expiresAt: new Date(Date.now() + INVITATION_DAYS * 86_400_000),
          })
          .returning()
      );
      const [community] = yield* query((db) =>
        db.select({ name: communities.name }).from(communities).where(eq(communities.id, input.communityId))
      );
      if (email) {
        yield* enqueueEmail({
          kind: "access_invite",
          to: email,
          dedupeKey: `access_invite:${invitation.id}`,
          ...accessInviteEmail({ inviterName: me.name, communityName: community?.name ?? null, role: input.role }),
        });
      }

      return { status: "invited" as const, member: null, invitationId: invitation.id };
    })
  );

export const updateCommunityMemberRole = (input: { communityId: string; memberId: string; role: CommunityRole }) =>
  transaction(
    Effect.gen(function* () {
      yield* lockCommunity(input.communityId);
      const member = yield* findMembership(input.communityId, input.memberId);
      if (member.role === input.role) return member;

      yield* checkGrant(input.communityId, member.userId, member.role, input.role);
      if ((yield* raises(input.communityId, member.role, input.role)) && !(yield* holdsOwuSlack(member.userId))) {
        return yield* needsOwuSlack;
      }
      if (member.role === "owner" && (yield* ownerCount(input.communityId)) <= 1) return yield* lastOwner;

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

      yield* checkGrant(input.communityId, member.userId, member.role, null);
      if (member.role === "owner" && (yield* ownerCount(input.communityId)) <= 1) return yield* lastOwner;

      yield* query((db) => db.delete(communityMembers).where(eq(communityMembers.id, input.memberId)));

      return { success: true as const };
    })
  );

/** Leave a community's team. The last owner can't: someone has to keep running it. */
export const leaveCommunity = (communityId: string) =>
  transaction(
    Effect.gen(function* () {
      const me = yield* CurrentUser;
      yield* lockCommunity(communityId);
      const role = yield* memberRole(communityId, me.id);
      if (!role) return yield* new NotFound({ entity: "member", message: "No sos parte de esta comunidad" });
      if (role === "owner" && (yield* ownerCount(communityId)) <= 1) return yield* lastOwner;

      yield* query((db) =>
        db
          .delete(communityMembers)
          .where(and(eq(communityMembers.communityId, communityId), eq(communityMembers.userId, me.id)))
      );

      return { success: true as const };
    })
  );

/** Show me, or not, among the organizers on the community's public page. Only my own membership. */
export const setShowOnProfile = (input: { communityId: string; show: boolean }) =>
  Effect.gen(function* () {
    const me = yield* CurrentUser;
    const [row] = yield* query((db) =>
      db
        .update(communityMembers)
        .set({ showOnProfile: input.show })
        .where(and(eq(communityMembers.communityId, input.communityId), eq(communityMembers.userId, me.id)))
        .returning({ showOnProfile: communityMembers.showOnProfile })
    );
    if (!row) return yield* new NotFound({ entity: "member", message: "No sos parte del equipo de esta comunidad" });
    const [community] = yield* query((db) =>
      db.select({ slug: communities.slug }).from(communities).where(eq(communities.id, input.communityId))
    );
    if (community) refreshPage(`/comunidad/${community.slug}`);

    return row;
  });

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

const normalizeName = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

/** A free /comunidad/<slug> for a proposed name ("Rust Uruguay" → rust-uruguay, rust-uruguay-2…). */
const freeCommunitySlug = (name: string) =>
  Effect.gen(function* () {
    let base = name
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 40)
      .replace(/-$/, "");
    if (!isValidCommunitySlug(base)) base = `${base || "comunidad"}-uy`.replace(/^-/, "");
    const taken = new Set(
      (yield* query((db) =>
        db
          .select({ slug: communities.slug })
          .from(communities)
          .where(sql`${communities.slug} like ${`${base}%`}`)
      )).map((row) => row.slug)
    );
    for (let index = 1; ; index++) {
      const candidate = index === 1 ? base : `${base}-${index}`;
      if (!taken.has(candidate) && isValidCommunitySlug(candidate)) return candidate;
    }
  });

/** Which of a community's links a URL is: its Meetup, LinkedIn, Instagram, or its site. */
const linkKey = (url: string): keyof CommunityLinks => {
  const host = new URL(url).hostname.replace(/^www\./, "");
  if (host.endsWith("meetup.com")) return "meetup";
  if (host.endsWith("linkedin.com")) return "linkedin";
  if (host.endsWith("instagram.com")) return "instagram";

  return "website";
};

/**
 * Propose a community that isn't in the directory, with a claim to organize it, in one step: it
 * stays unlisted and inactive until site staff approve the claim, which lists it and makes the
 * person its owner. A name the directory already has is pointed there instead.
 */
export const propose = (input: {
  name: string;
  relation: CommunityClaimRow["relation"];
  links: string[];
  topics: string[];
  message: string;
}) =>
  transaction(
    Effect.gen(function* () {
      const me = yield* CurrentUser;
      const wanted = normalizeName(input.name);
      const existing = (yield* query((db) =>
        db.select({ id: communities.id, name: communities.name, isActive: communities.isActive }).from(communities)
      )).find((community) => normalizeName(community.name) === wanted);
      if (existing?.isActive) {
        return yield* new Conflict({
          reason: "already_listed",
          message: `${existing.name} ya está en OWU: buscala en la lista y pedí organizarla`,
        });
      }
      if (existing) {
        return yield* new Conflict({
          reason: "already_proposed",
          message: `Alguien ya propuso ${existing.name}: el staff de OWU la está revisando`,
        });
      }

      const links: CommunityLinks = {};
      for (const url of input.links) links[linkKey(url)] ??= url;
      const slug = yield* freeCommunitySlug(input.name);
      const [community] = yield* query((db) =>
        db
          .insert(communities)
          .values({ name: input.name, slug, topics: input.topics, links, isActive: false, listed: false })
          .returning({ id: communities.id, name: communities.name })
      );
      const [claim] = yield* query((db) =>
        db
          .insert(communityClaims)
          .values({
            communityId: community.id,
            userId: me.id,
            relation: input.relation,
            message: input.message,
            link: input.links[0] ?? null,
            proposed: true,
          })
          .returning()
      );
      yield* recordActivity({
        eventId: null,
        verb: "community.proposed",
        entityType: "community",
        entityId: community.id,
        summary: `propuso sumar ${community.name}`,
      });

      return {
        id: claim.id,
        communityId: community.id,
        communityName: community.name,
        status: claim.status,
        createdAt: claim.createdAt.toISOString(),
      } satisfies MyClaim;
    })
  );

/** Pending claims first, then the last decided ones, for site staff. */
export const listClaims = () =>
  query((db) =>
    db
      .select({
        claim: communityClaims,
        community: { id: communities.id, slug: communities.slug, name: communities.name, topics: communities.topics },
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
        proposed: row.claim.proposed,
        community: { ...row.community, hasOwner: row.owners > 0 },
        user: row.user,
      }))
    )
  );

/**
 * Approve or reject a claim. Approving adds the person to the community: as owner when it has
 * none yet, as editor otherwise, unless staff pick a role. A proposed community is listed and
 * activated with it (rejected, it stays out of sight).
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
      if (status === "approved" && row.proposed) {
        const [listed] = yield* query((db) =>
          db
            .update(communities)
            .set({ isActive: true, listed: true })
            .where(eq(communities.id, row.communityId))
            .returning({ slug: communities.slug })
        );
        if (listed) for (const path of ["/comunidades", `/comunidad/${listed.slug}`]) refreshPage(path);
      }
      if (status === "approved") {
        const offered = input.role ?? ((yield* ownerCount(row.communityId)) === 0 ? "owner" : "editor");
        // Never lowers a role they got meanwhile (approving used to demote a sole owner to editor)
        const current = yield* memberRole(row.communityId, row.userId);
        const granted = current ? higherCommunityRole(current, offered) : offered;
        yield* checkGrant(row.communityId, row.userId, current, granted);
        if (current === granted) {
          // Already there
        } else if (yield* holdsOwuSlack(row.userId)) {
          yield* query((db) =>
            db
              .insert(communityMembers)
              .values({ communityId: row.communityId, userId: row.userId, role: granted })
              .onConflictDoUpdate({
                target: [communityMembers.communityId, communityMembers.userId],
                set: { role: granted },
              })
          );
        } else {
          // Roles need the OWU Slack: it applies when they sign in with it
          const [claimant] = yield* query((db) =>
            db.select({ email: user.email }).from(user).where(eq(user.id, row.userId))
          );
          yield* query((db) =>
            db.insert(invitations).values({
              communityId: row.communityId,
              role: granted,
              email: claimant?.email ?? null,
              invitedById: reviewer.id,
              note: "Pedido para organizar aprobado",
              expiresAt: new Date(Date.now() + INVITATION_DAYS * 86_400_000),
            })
          );
        }
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
