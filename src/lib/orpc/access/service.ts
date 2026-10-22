import { randomInt } from "node:crypto";

import { and, count, desc, eq, ilike, isNull, lt, max, ne, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { Effect } from "effect";

import { audit, type AuditEntry as AuditInput } from "../../authz/audit";
import {
  grantsHold,
  grantsWithin,
  permissionsOf,
  platformGrantsOf,
  platformRolesOf,
  sanitizeGrants,
  type PlatformRole,
} from "../../authz/catalog";
import { ensureServiceAccount, KEY_PRESETS, mintServiceKey } from "../../authz/keys";
import { grantCommunityRole, needsOwuSlack, withPlatformRoles } from "../../authz/people";
import { canSomewhere, grantsIn, loadPersonById, owuSlackLinked, platformGrants } from "../../authz/principal";
import { OWU_SLACK_REQUIRED_FROM, OWU_SLACK_TEAM_ID } from "../../authz/slack";
import {
  accessRequests,
  account,
  apikey,
  auditLog,
  communities,
  communityMembers,
  invitations,
  session,
  user,
  verification,
} from "../../db/schema";
import { enqueueEmail } from "../../email/outbox";
import { accessInviteEmail, accessRequestDecidedEmail } from "../../email/templates";
import { checkGrant, holdsOwuSlack } from "../communities/grants";
import { query, transaction } from "../db";
import { Conflict, Forbidden, Invalid, NotFound } from "../errors";
import { resolveScope } from "../scope";
import { CurrentUser } from "../services";
import type { AccessRequest, ApiKeyRow, AuditEntry, Invitation, Me, Person, PersonDetail } from "./schemas";

const DAY = 86_400_000;
const iso = (date: Date | null | undefined) => (date ? date.toISOString() : null);

/** On the OWU Slack, as the permission checks see it (see owuSlackLinked). */
const owuSlackOf = () =>
  sql<boolean>`(${owuSlackLinked(sql.raw(`"user"."id"`))} and "user"."slackDeactivatedAt" is null)`;

/** Write an audit row for the caller, inside the current transaction. */
const record = (entry: Omit<AuditInput, "actorId" | "via" | "byId">) =>
  Effect.gen(function* () {
    const me = yield* CurrentUser;
    yield* query((db) => audit(db, { ...entry, actorId: me.id, via: me.via, byId: me.principal.byId }));
  });

// ---------------------------------------------------------------------------
// Me
// ---------------------------------------------------------------------------

/** What the viewer holds and is waiting for: the access page, the OWU Slack banner. */
export const me = () =>
  Effect.gen(function* () {
    const actor = yield* CurrentUser;
    const { principal } = actor;
    const [[row], accounts, memberships, requests] = yield* Effect.all([
      query((db) => db.select({ email: user.email, role: user.role }).from(user).where(eq(user.id, actor.id))),
      query((db) =>
        db
          .select({ provider: account.providerId, team: account.slackTeamId })
          .from(account)
          .where(eq(account.userId, actor.id))
      ),
      query((db) =>
        db
          .select({ id: communities.id, name: communities.name, slug: communities.slug, role: communityMembers.role })
          .from(communityMembers)
          .innerJoin(communities, eq(communities.id, communityMembers.communityId))
          .where(eq(communityMembers.userId, actor.id))
      ),
      query((db) =>
        db
          .select({
            id: accessRequests.id,
            communityId: accessRequests.communityId,
            communityName: communities.name,
            status: accessRequests.status,
            createdAt: accessRequests.createdAt,
          })
          .from(accessRequests)
          .leftJoin(communities, eq(communities.id, accessRequests.communityId))
          .where(eq(accessRequests.userId, actor.id))
          .orderBy(desc(accessRequests.createdAt))
          .limit(20)
      ),
    ]);

    return {
      id: actor.id,
      name: actor.name,
      email: row?.email ?? "",
      roles: platformRolesOf(row?.role),
      countingRoles: [...principal.roles],
      permissions: permissionsOf(platformGrants(principal)),
      owuSlack: principal.owuSlack,
      otherSlack: accounts.some((item) => item.provider === "slack" && item.team !== OWU_SLACK_TEAM_ID),
      telegram: accounts.some((item) => item.provider === "telegram"),
      owuSlackRequiredFrom: OWU_SLACK_REQUIRED_FROM.toISOString(),
      communities: memberships,
      requests: requests.map((request) => ({ ...request, createdAt: request.createdAt.toISOString() })),
      impersonatedBy: principal.via === "impersonation" ? principal.byId : null,
    } satisfies Me;
  });

// ---------------------------------------------------------------------------
// Access requests: the waitlist
// ---------------------------------------------------------------------------

/**
 * Ask for access: to the OWU dashboard (no community) or to a community's team. One open request
 * per place; someone who already has it is told so.
 */
export const requestAccess = (input: { communityId: string | null; message: string }) =>
  transaction(
    Effect.gen(function* () {
      const actor = yield* CurrentUser;
      if (actor.via !== "session") return yield* new Forbidden({ message: "Solo una persona puede pedir acceso" });
      if (input.communityId) {
        const [community] = yield* query((db) =>
          db.select({ isActive: communities.isActive }).from(communities).where(eq(communities.id, input.communityId!))
        );
        if (!community?.isActive)
          return yield* new NotFound({ entity: "community", message: "Esa comunidad no existe" });
        const [member] = yield* query((db) =>
          db
            .select({ id: communityMembers.id })
            .from(communityMembers)
            .where(and(eq(communityMembers.communityId, input.communityId!), eq(communityMembers.userId, actor.id)))
        );
        if (member) return yield* new Conflict({ reason: "already_member", message: "Ya sos parte de esa comunidad" });
      } else {
        const has =
          actor.principal.roles.some((role) => role !== "user") ||
          (yield* Effect.promise(() => canSomewhere(actor.principal, "event:list")));
        if (has) return yield* new Conflict({ reason: "has_access", message: "Ya tenés acceso al panel" });
      }

      const [pending] = yield* query((db) =>
        db
          .select({ id: accessRequests.id })
          .from(accessRequests)
          .where(
            and(
              eq(accessRequests.userId, actor.id),
              eq(accessRequests.status, "pending"),
              input.communityId ? eq(accessRequests.communityId, input.communityId) : isNull(accessRequests.communityId)
            )
          )
      );
      if (pending)
        return yield* new Conflict({ reason: "request_pending", message: "Ya pediste acceso: está en revisión" });

      const [row] = yield* query((db) =>
        db
          .insert(accessRequests)
          .values({ userId: actor.id, communityId: input.communityId, message: input.message })
          .returning({ id: accessRequests.id })
      );
      yield* record({
        action: "access.request",
        targetType: "access_request",
        targetId: row.id,
        communityId: input.communityId,
        data: { message: input.message },
      });

      return { id: row.id };
    })
  );

export const cancelRequest = (requestId: string) =>
  Effect.gen(function* () {
    const actor = yield* CurrentUser;
    const [row] = yield* query((db) =>
      db
        .update(accessRequests)
        .set({ status: "cancelled", decidedAt: new Date() })
        .where(
          and(
            eq(accessRequests.id, requestId),
            eq(accessRequests.userId, actor.id),
            eq(accessRequests.status, "pending")
          )
        )
        .returning({ id: accessRequests.id })
    );
    if (!row) return yield* new NotFound({ entity: "access_request", message: "No hay un pedido abierto con ese id" });

    return { success: true as const };
  });

const decider = alias(user, "decider");

/** Requests to review: every one (platform), or one community's. Pending first, newest first. */
export const listRequests = (input: { communityId?: string | null; status?: AccessRequest["status"] }) =>
  query((db) =>
    db
      .select({
        id: accessRequests.id,
        status: accessRequests.status,
        message: accessRequests.message,
        grantedRole: accessRequests.grantedRole,
        createdAt: accessRequests.createdAt,
        decidedAt: accessRequests.decidedAt,
        communityId: communities.id,
        communityName: communities.name,
        communitySlug: communities.slug,
        userId: user.id,
        userName: user.name,
        userEmail: user.email,
        userImage: user.image,
        owuSlack: owuSlackOf(),
        deciderId: decider.id,
        deciderName: decider.name,
      })
      .from(accessRequests)
      .innerJoin(user, eq(user.id, accessRequests.userId))
      .leftJoin(communities, eq(communities.id, accessRequests.communityId))
      .leftJoin(decider, eq(decider.id, accessRequests.decidedById))
      .where(
        and(
          input.communityId === undefined
            ? undefined
            : input.communityId === null
              ? isNull(accessRequests.communityId)
              : eq(accessRequests.communityId, input.communityId),
          input.status ? eq(accessRequests.status, input.status) : undefined
        )
      )
      .orderBy(sql`${accessRequests.status} = 'pending' desc`, desc(accessRequests.createdAt))
      .limit(200)
  ).pipe(
    Effect.map((rows) =>
      rows.map((row): AccessRequest => ({
        id: row.id,
        status: row.status,
        message: row.message,
        grantedRole: row.grantedRole,
        createdAt: row.createdAt.toISOString(),
        decidedAt: iso(row.decidedAt),
        community: row.communityId ? { id: row.communityId, name: row.communityName!, slug: row.communitySlug! } : null,
        user: {
          id: row.userId,
          name: row.userName,
          email: row.userEmail,
          image: row.userImage,
          owuSlack: row.owuSlack,
        },
        decidedBy: row.deciderId ? { id: row.deciderId, name: row.deciderName! } : null,
      }))
    )
  );

/**
 * Approve or reject a request. Approving grants a community role (the request's community by
 * default, as member) or platform roles; without the OWU Slack the grant waits as an invitation.
 * `scopeCommunityId`: the community a community admin decides for (they can't grant elsewhere).
 */
export const decideRequest = (input: {
  requestId: string;
  decision: "approve" | "reject";
  grant?: { communityId: string; role: string } | { platformRoles: PlatformRole[] } | undefined;
  scopeCommunityId?: string;
}) =>
  transaction(
    Effect.gen(function* () {
      const actor = yield* CurrentUser;
      const [request] = yield* query((db) =>
        db.select().from(accessRequests).where(eq(accessRequests.id, input.requestId)).for("update")
      );
      if (!request || (input.scopeCommunityId !== undefined && request.communityId !== input.scopeCommunityId)) {
        return yield* new NotFound({ entity: "access_request", message: "Ese pedido no existe" });
      }
      if (request.status !== "pending")
        return yield* new Conflict({ reason: "decided", message: "Ese pedido ya se resolvió" });
      if (request.userId === actor.id) return yield* new Forbidden({ message: "No podés aprobar tu propio pedido" });

      let grantedRole: string | null = null;
      // Approved, but waiting for them to sign in with the OWU Slack
      let invited = false;
      if (input.decision === "approve") {
        const grant =
          input.grant ?? (request.communityId ? { communityId: request.communityId, role: "member" } : null);
        if (!grant) return yield* new Invalid({ message: "Elegí qué acceso darle" });
        if (input.scopeCommunityId !== undefined && "platformRoles" in grant) {
          return yield* new Forbidden({ message: "Desde la comunidad solo se dan roles de la comunidad" });
        }
        if ("platformRoles" in grant) {
          if (needsOwuSlack(grant.platformRoles) && !(yield* holdsOwuSlack(request.userId))) {
            // Not on the OWU Slack yet: the roles wait for them, as an invitation the same checks allow
            yield* mayGrantPlatformRoles(grant.platformRoles);
            const [person] = yield* query((db) =>
              db.select({ email: user.email }).from(user).where(eq(user.id, request.userId))
            );
            yield* query((db) =>
              db.insert(invitations).values({
                communityId: null,
                role: grant.platformRoles.join(","),
                email: person?.email ?? null,
                invitedById: actor.id,
                note: "Pedido de acceso aprobado",
                expiresAt: new Date(Date.now() + 30 * DAY),
              })
            );
            invited = true;
          } else {
            yield* applyPlatformRoles(request.userId, grant.platformRoles, []);
          }
          grantedRole = grant.platformRoles.join(",");
        } else {
          if (input.scopeCommunityId !== undefined && grant.communityId !== input.scopeCommunityId) {
            return yield* new Forbidden({ message: "Desde la comunidad solo se dan roles de la comunidad" });
          }
          yield* checkGrant(grant.communityId, request.userId, null, grant.role);
          if (yield* holdsOwuSlack(request.userId)) {
            yield* query((db) => grantCommunityRole(db, grant.communityId, request.userId, grant.role));
          } else {
            const [person] = yield* query((db) =>
              db.select({ email: user.email }).from(user).where(eq(user.id, request.userId))
            );
            yield* query((db) =>
              db.insert(invitations).values({
                communityId: grant.communityId,
                role: grant.role,
                email: person?.email ?? null,
                invitedById: actor.id,
                note: "Pedido de acceso aprobado",
                expiresAt: new Date(Date.now() + 30 * DAY),
              })
            );
            invited = true;
          }
          grantedRole = grant.role;
        }
      }

      yield* query((db) =>
        db
          .update(accessRequests)
          .set({
            status: input.decision === "approve" ? "approved" : "rejected",
            grantedRole,
            decidedById: actor.id,
            decidedAt: new Date(),
          })
          .where(eq(accessRequests.id, request.id))
      );
      const [person] = yield* query((db) =>
        db
          .select({ name: user.name, email: user.email, communityName: communities.name })
          .from(user)
          .leftJoin(communities, eq(communities.id, sql`${request.communityId}`))
          .where(eq(user.id, request.userId))
      );
      if (person) {
        yield* enqueueEmail({
          kind: "access_request_decided",
          to: person.email,
          dedupeKey: `access_request_decided:${request.id}`,
          ...accessRequestDecidedEmail({ name: person.name, communityName: person.communityName, role: grantedRole }),
        });
      }

      return {
        id: request.id,
        status: input.decision === "approve" ? ("approved" as const) : ("rejected" as const),
        grantedRole,
        invited,
      };
    })
  );

// ---------------------------------------------------------------------------
// Platform roles
// ---------------------------------------------------------------------------

/**
 * Change someone's platform roles: never your own, never to something you couldn't hold yourself,
 * never leaving the site without a superadmin, and privileged roles only for people on the OWU
 * Slack (service accounts excepted: machines aren't on Slack).
 */
/** Site roles are given only with `user:set-role`, and never one holding more than the giver does. */
const mayGrantPlatformRoles = (roles: readonly PlatformRole[]) =>
  Effect.gen(function* () {
    const actor = yield* CurrentUser;
    const mine = platformGrants(actor.principal);
    if (!grantsHold(mine, "user:set-role")) {
      return yield* new Forbidden({ message: "No tenés permiso para cambiar roles del sitio" });
    }
    if (!grantsWithin(platformGrantsOf(roles), mine)) {
      return yield* new Forbidden({ message: "No podés dar ni sacar un rol con más permisos que los tuyos" });
    }
  });

const applyPlatformRoles = (userId: string, add: readonly PlatformRole[], remove: readonly PlatformRole[]) =>
  Effect.gen(function* () {
    const actor = yield* CurrentUser;
    if (userId === actor.id) return yield* new Forbidden({ message: "No podés cambiar tus propios roles" });
    yield* mayGrantPlatformRoles([...add, ...remove]);
    const [target] = yield* query((db) =>
      db.select({ role: user.role }).from(user).where(eq(user.id, userId)).for("update")
    );
    if (!target) return yield* new NotFound({ entity: "user", message: "Esa persona no existe" });

    const next = withPlatformRoles(target.role, add, remove);
    const roles = platformRolesOf(next);
    if (needsOwuSlack(add) && !(yield* holdsOwuSlack(userId))) {
      return yield* new Invalid({
        message: "Esa persona no entró con el Slack de OWU: los roles lo necesitan. Mandale una invitación.",
      });
    }
    if (
      remove.includes("superadmin") ||
      (platformRolesOf(target.role).includes("superadmin") && !roles.includes("superadmin"))
    ) {
      const [{ total }] = yield* query((db) =>
        db
          .select({ total: count() })
          .from(user)
          .where(and(sql`'superadmin' = any(string_to_array(${user.role}, ','))`, ne(user.id, userId)))
      );
      if (total === 0)
        return yield* new Conflict({ reason: "last_superadmin", message: "Tiene que quedar al menos un superadmin" });
    }
    yield* query((db) => db.update(user).set({ role: next, updatedAt: new Date() }).where(eq(user.id, userId)));
    yield* record({
      action: "user.set_role",
      targetType: "user",
      targetId: userId,
      data: { before: target.role, after: next },
    });

    return next;
  });

export const setRoles = (input: { userId: string; roles: PlatformRole[] }) =>
  transaction(
    Effect.gen(function* () {
      const [target] = yield* query((db) => db.select({ role: user.role }).from(user).where(eq(user.id, input.userId)));
      if (!target) return yield* new NotFound({ entity: "user", message: "Esa persona no existe" });
      const before = platformRolesOf(target.role);
      const wanted = input.roles.filter((role) => role !== "user");
      const role = yield* applyPlatformRoles(
        input.userId,
        wanted.filter((item) => !before.includes(item)),
        before.filter((item) => item !== "user" && !wanted.includes(item))
      );

      return { roles: platformRolesOf(role) };
    })
  );

// ---------------------------------------------------------------------------
// Invitations: the allowlist
// ---------------------------------------------------------------------------
const inviter = alias(user, "inviter");

export const listInvitations = (input: { communityId?: string | null; status?: Invitation["status"] }) =>
  query((db) =>
    db
      .select({
        invitation: invitations,
        communityName: communities.name,
        inviterId: inviter.id,
        inviterName: inviter.name,
      })
      .from(invitations)
      .leftJoin(communities, eq(communities.id, invitations.communityId))
      .leftJoin(inviter, eq(inviter.id, invitations.invitedById))
      .where(
        and(
          input.communityId === undefined
            ? undefined
            : input.communityId === null
              ? isNull(invitations.communityId)
              : eq(invitations.communityId, input.communityId),
          eq(invitations.status, input.status ?? "pending")
        )
      )
      .orderBy(desc(invitations.createdAt))
      .limit(200)
  ).pipe(
    Effect.map((rows) =>
      rows.map(({ invitation, communityName, inviterId, inviterName }): Invitation => ({
        id: invitation.id,
        communityId: invitation.communityId,
        communityName,
        role: invitation.role,
        email: invitation.email,
        slackUserId: invitation.slackUserId,
        name: invitation.name,
        note: invitation.note,
        status: invitation.status,
        invitedBy: inviterId ? { id: inviterId, name: inviterName! } : null,
        expiresAt: invitation.expiresAt.toISOString(),
        createdAt: invitation.createdAt.toISOString(),
      }))
    )
  );

/** Pre-grant platform roles to an email or an OWU Slack member: they apply when that person signs in. */
export const createPlatformInvitation = (input: {
  email?: string | undefined;
  slackUserId?: string | undefined;
  name?: string | undefined;
  roles: PlatformRole[];
  note: string;
  days: number;
}) =>
  transaction(
    Effect.gen(function* () {
      const actor = yield* CurrentUser;
      const roles = input.roles.filter((role) => role !== "user");
      if (roles.length === 0) return yield* new Invalid({ message: "Elegí al menos un rol" });
      if (!grantsWithin(platformGrantsOf(roles), platformGrants(actor.principal))) {
        return yield* new Forbidden({ message: "No podés invitar con un rol con más permisos que los tuyos" });
      }
      const email = input.email?.toLowerCase().trim() || null;
      const [row] = yield* query((db) =>
        db
          .insert(invitations)
          .values({
            communityId: null,
            role: roles.join(","),
            email,
            slackUserId: input.slackUserId ?? null,
            name: input.name ?? null,
            note: input.note,
            invitedById: actor.id,
            expiresAt: new Date(Date.now() + input.days * DAY),
          })
          .returning({ id: invitations.id })
      );
      if (email) {
        yield* enqueueEmail({
          kind: "access_invite",
          to: email,
          dedupeKey: `access_invite:${row.id}`,
          ...accessInviteEmail({ inviterName: actor.name, communityName: null, role: roles.join(",") }),
        });
      }

      return { id: row.id };
    })
  );

/** Cancel a pending invitation (in `communityId` only, when a community admin does it). */
export const revokeInvitation = (input: { invitationId: string; communityId?: string }) =>
  Effect.gen(function* () {
    const [row] = yield* query((db) =>
      db
        .update(invitations)
        .set({ status: "revoked" })
        .where(
          and(
            eq(invitations.id, input.invitationId),
            eq(invitations.status, "pending"),
            input.communityId ? eq(invitations.communityId, input.communityId) : undefined
          )
        )
        .returning({ id: invitations.id, communityId: invitations.communityId })
    );
    if (!row)
      return yield* new NotFound({ entity: "invitation", message: "No hay una invitación pendiente con ese id" });

    return { success: true as const };
  });

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------
export const listPeople = (input: {
  q: string;
  role?: PlatformRole | "any" | undefined;
  banned?: boolean | undefined;
  limit: number;
  offset: number;
}) =>
  Effect.gen(function* () {
    const term = input.q ? `%${input.q.replace(/[%_]/g, "")}%` : null;
    const where = and(
      term ? or(ilike(user.name, term), ilike(user.email, term)) : undefined,
      input.role === "any"
        ? ne(user.role, "user")
        : input.role
          ? sql`${input.role} = any(string_to_array(${user.role}, ','))`
          : undefined,
      input.banned === undefined
        ? undefined
        : input.banned
          ? eq(user.banned, true)
          : sql`coalesce(${user.banned}, false) = false`
    );
    const [rows, [{ total }]] = yield* Effect.all([
      query((db) =>
        db
          .select({
            id: user.id,
            name: user.name,
            email: user.email,
            image: user.image,
            role: user.role,
            banned: user.banned,
            banReason: user.banReason,
            banExpires: user.banExpires,
            createdAt: user.createdAt,
            owuSlack: owuSlackOf(),
            slack: sql<boolean>`exists (select 1 from "account" a where a."userId" = "user"."id" and a."providerId" = 'slack')`,
            memberships: sql<number>`(select count(*)::int from "community_members" m where m."userId" = "user"."id")`,
            lastSeenAt: sql<Date | null>`(select max(s."updatedAt") from "session" s where s."userId" = "user"."id")`,
          })
          .from(user)
          .where(where)
          .orderBy(sql`${user.role} <> 'user' desc`, user.name)
          .limit(input.limit)
          .offset(input.offset)
      ),
      query((db) => db.select({ total: count() }).from(user).where(where)),
    ]);

    return {
      total,
      people: rows.map((row): Person => ({
        id: row.id,
        name: row.name,
        email: row.email,
        image: row.image,
        roles: platformRolesOf(row.role),
        banned: Boolean(row.banned),
        banReason: row.banReason,
        banExpires: iso(row.banExpires),
        owuSlack: row.owuSlack,
        slack: row.slack,
        memberships: row.memberships,
        createdAt: row.createdAt.toISOString(),
        lastSeenAt: row.lastSeenAt ? new Date(row.lastSeenAt).toISOString() : null,
      })),
    };
  });

export const getPerson = (userId: string) =>
  Effect.gen(function* () {
    const [row] = yield* query((db) =>
      db
        .select({
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
          role: user.role,
          banned: user.banned,
          banReason: user.banReason,
          banExpires: user.banExpires,
          createdAt: user.createdAt,
          owuSlack: owuSlackOf(),
        })
        .from(user)
        .where(eq(user.id, userId))
    );
    if (!row) return yield* new NotFound({ entity: "user", message: "Esa persona no existe" });
    const [accounts, memberships, sessions, lastSeen] = yield* Effect.all([
      query((db) =>
        db
          .select({ provider: account.providerId, accountId: account.accountId, slackTeamId: account.slackTeamId })
          .from(account)
          .where(eq(account.userId, userId))
      ),
      query((db) =>
        db
          .select({
            id: communities.id,
            name: communities.name,
            slug: communities.slug,
            role: communityMembers.role,
            since: communityMembers.createdAt,
          })
          .from(communityMembers)
          .innerJoin(communities, eq(communities.id, communityMembers.communityId))
          .where(eq(communityMembers.userId, userId))
      ),
      query((db) =>
        db
          .select()
          .from(session)
          .where(and(eq(session.userId, userId), sql`${session.expiresAt} > now()`))
          .orderBy(desc(session.updatedAt))
          .limit(20)
      ),
      query((db) =>
        db
          .select({ at: max(session.updatedAt) })
          .from(session)
          .where(eq(session.userId, userId))
      ),
    ]);
    const person = yield* Effect.promise(() => loadPersonById(userId));
    const roles = platformRolesOf(row.role);

    return {
      id: row.id,
      name: row.name,
      email: row.email,
      image: row.image,
      roles,
      banned: Boolean(person?.banned),
      banReason: row.banReason,
      banExpires: iso(row.banExpires),
      owuSlack: row.owuSlack,
      slack: accounts.some((item) => item.provider === "slack"),
      memberships: memberships.length,
      createdAt: row.createdAt.toISOString(),
      lastSeenAt: iso(lastSeen[0]?.at ?? null),
      accounts,
      communities: memberships.map((item) => ({ ...item, since: item.since.toISOString() })),
      sessions: sessions.map((item) => ({
        id: item.id,
        createdAt: item.createdAt.toISOString(),
        expiresAt: item.expiresAt.toISOString(),
        ipAddress: item.ipAddress,
        userAgent: item.userAgent,
        impersonatedBy: item.impersonatedBy,
      })),
      permissions: permissionsOf(platformGrantsOf(roles)),
    } satisfies PersonDetail;
  });

/** May the caller act on this person: not themselves, and only on someone who holds no more than they do. */
const actOn = (userId: string, what: string) =>
  Effect.gen(function* () {
    const actor = yield* CurrentUser;
    if (userId === actor.id) return yield* new Forbidden({ message: `No podés ${what} tu propia cuenta` });
    const [target] = yield* query((db) => db.select({ role: user.role }).from(user).where(eq(user.id, userId)));
    if (!target) return yield* new NotFound({ entity: "user", message: "Esa persona no existe" });
    if (!grantsWithin(platformGrantsOf(platformRolesOf(target.role)), platformGrants(actor.principal))) {
      return yield* new Forbidden({ message: `No podés ${what} a alguien con más permisos que vos` });
    }
  });

/**
 * Suspend someone (Better Auth's ban: they can't sign in, and every session and key of theirs stops
 * working). For `days`, or until lifted.
 */
export const ban = (input: { userId: string; reason: string; days?: number | undefined }) =>
  transaction(
    Effect.gen(function* () {
      yield* actOn(input.userId, "suspender");
      const banExpires = input.days ? new Date(Date.now() + input.days * DAY) : null;
      yield* query((db) =>
        db.update(user).set({ banned: true, banReason: input.reason, banExpires }).where(eq(user.id, input.userId))
      );
      yield* query((db) => db.delete(session).where(eq(session.userId, input.userId)));

      return { success: true as const };
    })
  );

export const unban = (userId: string) =>
  transaction(
    Effect.gen(function* () {
      yield* actOn(userId, "reactivar");
      yield* query((db) =>
        db.update(user).set({ banned: false, banReason: null, banExpires: null }).where(eq(user.id, userId))
      );

      return { success: true as const };
    })
  );

/** Sign someone out everywhere (one session, or all of them). */
export const revokeSessions = (input: { userId: string; sessionId?: string | undefined }) =>
  transaction(
    Effect.gen(function* () {
      const actor = yield* CurrentUser;
      if (input.userId !== actor.id) yield* actOn(input.userId, "cerrar las sesiones de");
      const removed = yield* query((db) =>
        db
          .delete(session)
          .where(and(eq(session.userId, input.userId), input.sessionId ? eq(session.id, input.sessionId) : undefined))
          .returning({ id: session.id })
      );
      yield* record({
        action: "session.revoke",
        targetType: "user",
        targetId: input.userId,
        data: { sessions: removed.length, sessionId: input.sessionId },
      });

      return { revoked: removed.length };
    })
  );

// ---------------------------------------------------------------------------
// API keys
// ---------------------------------------------------------------------------
const keyOwner = alias(user, "key_owner");

export const listApiKeys = () =>
  query((db) =>
    db
      .select({ key: apikey, ownerId: keyOwner.id, ownerName: keyOwner.name })
      .from(apikey)
      .innerJoin(keyOwner, eq(keyOwner.id, apikey.referenceId))
      .orderBy(desc(apikey.createdAt))
  ).pipe(
    Effect.map((rows) =>
      rows.map(({ key, ownerId, ownerName }): ApiKeyRow => ({
        id: key.id,
        name: key.name,
        start: key.start,
        owner: { id: ownerId, name: ownerName },
        permissions: key.permissions ? (sanitizeGrants(JSON.parse(key.permissions)) as Record<string, string[]>) : {},
        enabled: key.enabled !== false,
        expiresAt: iso(key.expiresAt),
        lastRequest: iso(key.lastRequest),
        createdAt: key.createdAt.toISOString(),
      }))
    )
  );

export const createApiKey = (input: {
  owner: string;
  ownerName?: string | undefined;
  name: string;
  preset?: keyof typeof KEY_PRESETS | undefined;
  permissions?: Record<string, string[]> | undefined;
  days: number;
}) =>
  Effect.gen(function* () {
    const actor = yield* CurrentUser;
    const permissions = input.preset ? KEY_PRESETS[input.preset] : sanitizeGrants(input.permissions ?? {});
    if (Object.keys(permissions).length === 0)
      return yield* new Invalid({ message: "La llave necesita al menos un permiso" });
    const [existing] = yield* query((db) => db.select({ role: user.role }).from(user).where(eq(user.id, input.owner)));
    if (existing && !platformRolesOf(existing.role).includes("service")) {
      return yield* new Invalid({ message: "Las llaves son de cuentas de servicio (máquinas), no de personas" });
    }
    yield* Effect.promise(() => ensureServiceAccount(input.owner, input.ownerName ?? input.name));

    return yield* Effect.promise(() =>
      mintServiceKey({
        ownerId: input.owner,
        name: input.name,
        permissions,
        expiresInDays: input.days,
        createdById: actor.id,
      })
    ).pipe(
      Effect.map((minted) => ({
        id: minted.id,
        key: minted.key,
        expiresAt: minted.expiresAt ? new Date(minted.expiresAt).toISOString() : null,
      }))
    );
  });

export const revokeApiKey = (keyId: string) =>
  Effect.gen(function* () {
    const [row] = yield* query((db) =>
      db
        .delete(apikey)
        .where(eq(apikey.id, keyId))
        .returning({ id: apikey.id, name: apikey.name, owner: apikey.referenceId })
    );
    if (!row) return yield* new NotFound({ entity: "api_key", message: "Esa llave no existe" });

    return { success: true as const };
  });

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------
const auditActor = alias(user, "audit_actor");
const auditBy = alias(user, "audit_by");

export const listAudit = (input: {
  actorId?: string | undefined;
  communityId?: string | undefined;
  action?: string | undefined;
  before?: string | undefined;
  limit: number;
}) =>
  query((db) =>
    db
      .select({
        entry: auditLog,
        actorName: auditActor.name,
        actorImage: auditActor.image,
        byName: auditBy.name,
        communityName: communities.name,
      })
      .from(auditLog)
      .leftJoin(auditActor, eq(auditActor.id, auditLog.actorId))
      .leftJoin(auditBy, eq(auditBy.id, auditLog.byId))
      .leftJoin(communities, eq(communities.id, auditLog.communityId))
      .where(
        and(
          input.actorId ? eq(auditLog.actorId, input.actorId) : undefined,
          input.communityId ? eq(auditLog.communityId, input.communityId) : undefined,
          input.action ? ilike(auditLog.action, `${input.action.replace(/[%_]/g, "")}%`) : undefined,
          input.before ? lt(auditLog.createdAt, new Date(input.before)) : undefined
        )
      )
      .orderBy(desc(auditLog.createdAt))
      .limit(input.limit)
  ).pipe(
    Effect.map((rows) =>
      rows.map(({ entry, actorName, actorImage, byName, communityName }): AuditEntry => ({
        id: entry.id,
        createdAt: entry.createdAt.toISOString(),
        action: entry.action,
        via: entry.via,
        targetType: entry.targetType,
        targetId: entry.targetId,
        actor: entry.actorId ? { id: entry.actorId, name: actorName ?? "—", image: actorImage ?? null } : null,
        by: entry.byId ? { id: entry.byId, name: byName ?? "—" } : null,
        community: entry.communityId ? { id: entry.communityId, name: communityName ?? "—" } : null,
        data: entry.data,
        ip: entry.ip,
      }))
    )
  );

// ---------------------------------------------------------------------------
// Checks for machines (the Owy bot asks before offering a tool)
// ---------------------------------------------------------------------------

/** Which of `permissions` the caller holds (for the bot: the person it acts for), in a community or event. */
export const check = (input: {
  permissions: string[];
  communityId?: string | undefined;
  eventId?: string | undefined;
}) =>
  Effect.gen(function* () {
    const actor = yield* CurrentUser;
    let communityId = input.communityId ?? null;
    if (input.eventId) {
      const scope = yield* resolveScope({ eventId: input.eventId, communityId: input.communityId });
      if (!scope) return yield* new NotFound({ entity: "event", message: "Ese evento no existe" });
      communityId = scope.communityId;
    }
    const grants = communityId
      ? yield* Effect.promise(() => grantsIn(actor.principal, communityId!))
      : platformGrants(actor.principal);

    return {
      actor: { id: actor.id, name: actor.name, via: actor.via, roles: [...actor.principal.roles] },
      allowed: Object.fromEntries(input.permissions.map((permission) => [permission, grantsHold(grants, permission)])),
    };
  });

// ---------------------------------------------------------------------------
// Telegram: linking an account so the bot knows who is talking to it
// ---------------------------------------------------------------------------

/** A one-time code (10 minutes) the person sends the bot: "/vincular <code>". */
// ---------------------------------------------------------------------------
// My sessions (Ajustes)
// ---------------------------------------------------------------------------

/**
 * Where I'm signed in. Better Auth's own list asks for a session started in the last day, which
 * left anyone signed in since longer unable to see theirs; reading your own devices doesn't need it.
 */
export const mySessions = (currentId: string | null) =>
  Effect.gen(function* () {
    const actor = yield* CurrentUser;
    const rows = yield* query((db) =>
      db
        .select()
        .from(session)
        .where(and(eq(session.userId, actor.id), sql`${session.expiresAt} > now()`))
        .orderBy(desc(session.updatedAt))
    );

    return rows.map((row) => ({
      id: row.id,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      ipAddress: row.ipAddress,
      userAgent: row.userAgent,
      current: row.id === currentId,
    }));
  });

/** Sign me out of one other device, or of every other one; never the session asking. */
export const revokeMySessions = (input: { sessionId?: string | undefined; currentId: string | null }) =>
  Effect.gen(function* () {
    const actor = yield* CurrentUser;
    // Only the person, from their own session: not a bot, not someone viewing the site as them
    if (actor.via !== "session" || !input.currentId) {
      return yield* new Forbidden({ message: "Solo vos podés cerrar tus sesiones" });
    }
    const removed = yield* query((db) =>
      db
        .delete(session)
        .where(
          and(
            eq(session.userId, actor.id),
            ne(session.id, input.currentId!),
            input.sessionId ? eq(session.id, input.sessionId) : undefined
          )
        )
        .returning({ id: session.id })
    );
    yield* record({
      action: "session.revoke_own",
      targetType: "user",
      targetId: actor.id,
      data: { sessions: removed.length },
    });

    return { revoked: removed.length };
  });

export const telegramCode = () =>
  Effect.gen(function* () {
    const actor = yield* CurrentUser;
    if (actor.via !== "session")
      return yield* new Forbidden({ message: "Solo una persona puede vincular su Telegram" });
    const expiresAt = new Date(Date.now() + 10 * 60_000);
    // Short enough to type on a phone (and to fit a t.me start link); kept like Better Auth keeps
    // its own one-time codes, in its verification table
    const code = Array.from({ length: 8 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");
    yield* query((db) =>
      db.insert(verification).values({
        id: crypto.randomUUID(),
        identifier: `telegram-link:${code}`,
        value: actor.id,
        expiresAt,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    );

    return { code, expiresAt: expiresAt.toISOString() };
  });

/** No 0/O, 1/I/L: read aloud or typed, nothing to confuse. */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** The bot links the Telegram account it got the code from to the person who made the code. */
export const linkTelegram = (input: { code: string; telegramUserId: string }) =>
  transaction(
    Effect.gen(function* () {
      // One use: the code is gone as soon as it's read
      const [claimed] = yield* query((db) =>
        db
          .delete(verification)
          .where(eq(verification.identifier, `telegram-link:${input.code.trim().toUpperCase()}`))
          .returning({ userId: verification.value, expiresAt: verification.expiresAt })
      );
      const userId = claimed && claimed.expiresAt.getTime() > Date.now() ? claimed.userId : null;
      if (!userId) return yield* new Invalid({ message: "Ese código no sirve o ya venció: generá otro en owu.uy" });
      const [taken] = yield* query((db) =>
        db
          .select({ userId: account.userId })
          .from(account)
          .where(and(eq(account.providerId, "telegram"), eq(account.accountId, input.telegramUserId)))
      );
      if (taken && taken.userId !== userId) {
        return yield* new Conflict({
          reason: "telegram_taken",
          message: "Ese Telegram ya está vinculado a otra cuenta",
        });
      }
      if (!taken) {
        const now = new Date();
        yield* query((db) =>
          db.insert(account).values({
            id: crypto.randomUUID(),
            accountId: input.telegramUserId,
            providerId: "telegram",
            userId,
            createdAt: now,
            updatedAt: now,
          })
        );
      }
      const [person] = yield* query((db) => db.select({ name: user.name }).from(user).where(eq(user.id, userId)));
      yield* record({ action: "identity.link_telegram", targetType: "user", targetId: userId });

      return { name: person?.name ?? "" };
    })
  );

export const unlinkTelegram = () =>
  Effect.gen(function* () {
    const actor = yield* CurrentUser;
    // Only the person, from their own session: not a bot, not someone viewing the site as them
    if (actor.via !== "session") return yield* new Forbidden({ message: "Solo vos podés desvincular tu Telegram" });
    yield* query((db) =>
      db.delete(account).where(and(eq(account.userId, actor.id), eq(account.providerId, "telegram")))
    );
    yield* record({ action: "identity.unlink_telegram", targetType: "user", targetId: actor.id });

    return { success: true as const };
  });

// ---------------------------------------------------------------------------
// The OWU Slack's people, for invite pickers
// ---------------------------------------------------------------------------
type SlackMember = { id: string; name: string; title: string; image: string | null };
let slackDirectory: { at: number; members: Promise<SlackMember[]> } | null = null;

/** Everyone on the OWU Slack (bot token, `users:read`), cached 15 minutes. Empty without a token. */
function slackMembers(): Promise<SlackMember[]> {
  const token = process.env.OWY_SLACK_BOT_TOKEN;
  if (!token) return Promise.resolve([]);
  if (slackDirectory && Date.now() - slackDirectory.at < 15 * 60_000) return slackDirectory.members;
  const members = (async () => {
    const out: SlackMember[] = [];
    let cursor = "";
    for (let page = 0; page < 20; page++) {
      const response = await fetch(`https://slack.com/api/users.list?limit=200${cursor ? `&cursor=${cursor}` : ""}`, {
        headers: { authorization: `Bearer ${token}` },
      });
      const body = (await response.json()) as {
        ok: boolean;
        members?: {
          id: string;
          deleted?: boolean;
          is_bot?: boolean;
          name: string;
          profile?: { real_name?: string; display_name?: string; title?: string; image_72?: string };
        }[];
        response_metadata?: { next_cursor?: string };
      };
      if (!body.ok) break;
      for (const member of body.members ?? []) {
        if (member.deleted || member.is_bot || member.id === "USLACKBOT") continue;
        out.push({
          id: member.id,
          name: member.profile?.real_name || member.profile?.display_name || member.name,
          title: member.profile?.title ?? "",
          image: member.profile?.image_72 ?? null,
        });
      }
      cursor = body.response_metadata?.next_cursor ?? "";
      if (!cursor) break;
    }

    return out;
  })().catch(() => []);
  slackDirectory = { at: Date.now(), members };

  return members;
}

const fold = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/** OWU Slack members matching a name, for whoever may add people somewhere. */
export const searchSlack = (q: string) =>
  Effect.gen(function* () {
    const actor = yield* CurrentUser;
    const may = yield* Effect.promise(() => canSomewhere(actor.principal, "member:create"));
    if (!may) return yield* new Forbidden({ message: "No podés sumar gente a ninguna comunidad" });
    const term = fold(q.trim());
    if (term.length < 2) return [];
    const members = yield* Effect.promise(slackMembers);

    return members.filter((member) => fold(member.name).includes(term)).slice(0, 8);
  });
