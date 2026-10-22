import { and, eq, gt, inArray, or, sql } from "drizzle-orm";

import { ROLE_RANK } from "../roles";
import { db, type Db } from "../db";
import { account, communities, communityMembers, invitations, user } from "../db/schema";
import { audit } from "./audit";
import { platformRolesOf, type PlatformRole } from "./catalog";
import { loadPersonById } from "./principal";

/** Roles that need the OWU Slack to be held (everything but `user` and `service`). */
export const needsOwuSlack = (platformRoles: readonly string[]) =>
  platformRoles.some((role) => role !== "user" && role !== "service");

/** Merge platform roles into a user.role value, legacy names mapped, `user` dropped when there are others. */
export function withPlatformRoles(current: string, add: readonly PlatformRole[], remove: readonly PlatformRole[] = []) {
  const roles = new Set<PlatformRole>([...platformRolesOf(current), ...add]);
  for (const role of remove) roles.delete(role);
  roles.delete("user");

  return roles.size > 0 ? [...roles].join(",") : "user";
}

/** Higher of two community roles: a built-in ranks; an unknown (custom) role never replaces a built-in. */
export function higherCommunityRole(current: string, incoming: string): string {
  const rank = ROLE_RANK as Record<string, number>;
  if (rank[current] === undefined) return current;
  if (rank[incoming] === undefined) return current;

  return rank[incoming] > rank[current] ? incoming : current;
}

/**
 * Apply the invitations waiting for a person (by their email or their Slack id) once they can hold
 * them: every role needs the OWU Slack. Each invitation applies once, even with two sign-ins racing.
 * Never lowers a role they already hold.
 */
export async function applyInvitations(userId: string): Promise<number> {
  const person = await loadPersonById(userId);
  if (!person || person.banned) return 0;
  const [me] = await db.select({ email: user.email, role: user.role }).from(user).where(eq(user.id, userId));
  const slackIds = (
    await db
      .select({ id: account.accountId })
      .from(account)
      .where(and(eq(account.userId, userId), eq(account.providerId, "slack")))
  ).map((row) => row.id);

  const waiting = await db
    .select()
    .from(invitations)
    .where(
      and(
        eq(invitations.status, "pending"),
        gt(invitations.expiresAt, new Date()),
        or(
          eq(sql`lower(${invitations.email})`, me.email.toLowerCase()),
          slackIds.length > 0 ? inArray(invitations.slackUserId, slackIds) : sql`false`
        )
      )
    );

  let applied = 0;
  for (const invitation of waiting) {
    const platform = invitation.communityId ? [] : platformRolesOf(invitation.role);
    if ((invitation.communityId || needsOwuSlack(platform)) && !person.owuSlack) continue;

    const done = await db.transaction(async (tx) => {
      const [claimed] = await tx
        .update(invitations)
        .set({ status: "accepted", acceptedById: userId, acceptedAt: new Date() })
        .where(and(eq(invitations.id, invitation.id), eq(invitations.status, "pending")))
        .returning();
      if (!claimed) return false;

      if (claimed.communityId) {
        await grantCommunityRole(tx, claimed.communityId, userId, claimed.role);
      } else {
        const [fresh] = await tx.select({ role: user.role }).from(user).where(eq(user.id, userId)).for("update");
        await tx
          .update(user)
          .set({ role: withPlatformRoles(fresh.role, platform) })
          .where(eq(user.id, userId));
      }
      await audit(tx, {
        actorId: userId,
        via: "system",
        byId: claimed.invitedById,
        action: "invitation.accept",
        targetType: "invitation",
        targetId: claimed.id,
        communityId: claimed.communityId,
        data: { role: claimed.role },
      });

      return true;
    });
    if (done) applied++;
  }

  return applied;
}

/** Add someone to a community with a role, or raise their role to it; never lowers one. */
export async function grantCommunityRole(tx: Db, communityId: string, userId: string, role: string) {
  await tx.select({ id: communities.id }).from(communities).where(eq(communities.id, communityId)).for("update");
  const [current] = await tx
    .select({ role: communityMembers.role })
    .from(communityMembers)
    .where(and(eq(communityMembers.communityId, communityId), eq(communityMembers.userId, userId)));
  if (!current) {
    await tx.insert(communityMembers).values({ communityId, userId, role });

    return role;
  }
  const next = higherCommunityRole(current.role, role);
  if (next !== current.role) {
    await tx
      .update(communityMembers)
      .set({ role: next })
      .where(and(eq(communityMembers.communityId, communityId), eq(communityMembers.userId, userId)));
  }

  return next;
}

/** Names of the communities where this person is the only owner and others remain. */
export async function soleOwnerOf(userId: string): Promise<string[]> {
  const rows = await db
    .select({ name: communities.name })
    .from(communityMembers)
    .innerJoin(communities, eq(communities.id, communityMembers.communityId))
    .where(
      and(
        eq(communityMembers.userId, userId),
        eq(communityMembers.role, "owner"),
        sql`not exists (
          select 1 from "community_members" other
          where other."communityId" = "community_members"."communityId"
            and other.role = 'owner' and other."userId" <> ${userId}
        )`,
        sql`exists (
          select 1 from "community_members" other
          where other."communityId" = "community_members"."communityId" and other."userId" <> ${userId}
        )`
      )
    );

  return rows.map((row) => row.name);
}

/** People with a role on the platform or in a community who aren't linked to the OWU Slack. */
export async function roleHoldersWithoutOwuSlack() {
  const holders = await db
    .selectDistinct({ id: user.id, name: user.name, email: user.email, role: user.role })
    .from(user)
    .leftJoin(communityMembers, eq(communityMembers.userId, user.id))
    .where(or(sql`${user.role} not in ('user', 'service')`, sql`${communityMembers.id} is not null`));
  const out: { id: string; name: string; email: string; role: string }[] = [];
  for (const holder of holders) {
    const person = await loadPersonById(holder.id);
    if (person && !person.owuSlack && !platformRolesOf(holder.role).includes("service")) out.push(holder);
  }

  return out;
}
