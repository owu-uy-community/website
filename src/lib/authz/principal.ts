import { and, eq, sql, type SQL } from "drizzle-orm";

import type { Session } from "app/lib/auth";

import { db } from "../db";
import { account, apikey, communities, communityMembers, communityRoles, user } from "../db/schema";
import {
  ANYONE_VIA_BOT,
  COMMUNITY_ROLE_GRANTS,
  communityPart,
  grantsHold,
  intersectGrants,
  mergeGrants,
  platformGrantsOf,
  platformRolesOf,
  sanitizeGrants,
  type Grants,
  type Permission,
  type PlatformRole,
} from "./catalog";
import { OWU_SLACK_TEAM_ID, owuSlackRequired } from "./slack";

/**
 * Who is calling, and everything a permission check needs about them, read fresh from the
 * database once per request (never from the session cookie cache: a role taken away or a ban
 * counts on the very next request).
 */
export type Principal = {
  /** The person the request acts as (for the Owy bot: the person talking to it). */
  readonly id: string;
  readonly name: string;
  /** Platform roles that count right now (after the OWU Slack requirement). */
  readonly roles: readonly PlatformRole[];
  /** Platform roles on record, counting or not. */
  readonly heldRoles: readonly PlatformRole[];
  readonly via: "session" | "api-key" | "impersonation" | "delegated";
  /** Delegated: the bot's service account. Impersonation: the superadmin. */
  readonly byId: string | null;
  readonly banned: boolean;
  /** Linked to the OWU Slack workspace (and not deactivated there). */
  readonly owuSlack: boolean;
  /** Grants held on every community and on the platform. */
  readonly platform: Grants;
  /** What the credential allows at most (an API key's permissions); null = no cap. */
  readonly ceiling: Grants | null;
  /** Whose community memberships count (null: an anonymous person behind the bot). */
  readonly memberOf: string | null;
};

/**
 * Linked to a Slack account of the OWU workspace. `userId` is raw SQL naming the user's id column,
 * table included: Drizzle leaves columns unqualified in single-table queries, and inside this
 * subquery an unqualified "id" would be the account's.
 */
export const owuSlackLinked = (userId: SQL) => sql<boolean>`exists (
  select 1 from "account" linked
  where linked."userId" = ${userId} and linked."providerId" = 'slack' and linked."slackTeamId" = ${OWU_SLACK_TEAM_ID}
)`;

type Person = {
  id: string;
  name: string;
  role: string;
  banned: boolean;
  owuSlack: boolean;
};

const banActive = (banned: boolean | null, banExpires: Date | null) =>
  Boolean(banned) && (!banExpires || banExpires.getTime() > Date.now());

async function loadPerson(where: ReturnType<typeof eq>): Promise<Person | null> {
  const [row] = await db
    .select({
      id: user.id,
      name: user.name,
      role: user.role,
      banned: user.banned,
      banExpires: user.banExpires,
      slackDeactivatedAt: user.slackDeactivatedAt,
      owuSlack: owuSlackLinked(sql.raw(`"user"."id"`)),
    })
    .from(user)
    .where(where);
  if (!row) return null;

  return {
    id: row.id,
    name: row.name,
    role: row.role,
    banned: banActive(row.banned, row.banExpires),
    owuSlack: row.owuSlack && !row.slackDeactivatedAt,
  };
}

export const loadPersonById = (id: string) => loadPerson(eq(user.id, id));

/** Platform roles that count: everything but `user` and `service` needs the OWU Slack. */
function countingRoles(person: Person): { held: PlatformRole[]; counting: PlatformRole[] } {
  const held = platformRolesOf(person.role);
  const exempt = (role: PlatformRole) => role === "user" || role === "service";
  const counting = person.owuSlack || !owuSlackRequired() ? held : held.filter(exempt);

  return { held, counting: counting.length > 0 ? counting : ["user"] };
}

function personPrincipal(person: Person, via: Principal["via"], byId: string | null): Principal {
  const { held, counting } = countingRoles(person);

  return {
    id: person.id,
    name: person.name,
    roles: counting,
    heldRoles: held,
    via,
    byId,
    banned: person.banned,
    owuSlack: person.owuSlack,
    platform: person.banned ? {} : platformGrantsOf(counting),
    ceiling: null,
    memberOf: person.banned ? null : person.id,
  };
}

/** The Owy bot's account from before service accounts (see `pnpm owy:key`). */
const LEGACY_BOT_ID = "owy-bot";

/** The header the Owy bot names the person it acts for with: "slack:U…", "telegram:123" or "anonymous". */
export const ACTOR_HEADER = "x-owu-actor";

/** Resolve "slack:U123" / "telegram:42" to the person who linked that account. */
async function personByIdentity(identity: string): Promise<Person | null | "anonymous"> {
  const at = identity.indexOf(":");
  const provider = identity.slice(0, at);
  const accountId = identity.slice(at + 1);
  if (identity === "anonymous" || at <= 0 || !accountId || !["slack", "telegram"].includes(provider)) {
    return "anonymous";
  }
  const [linked] = await db
    .select({ userId: account.userId })
    .from(account)
    .where(and(eq(account.providerId, provider), eq(account.accountId, accountId)))
    .limit(1);

  return linked ? loadPersonById(linked.userId) : "anonymous";
}

/**
 * The principal behind a Better Auth session (cookie or API key) and the request's headers.
 * Null when there is nobody, or when an API key belongs to a person: keys only authenticate
 * service accounts (anyone could mint one for themselves before, and it outlived their sessions).
 */
export async function principalFor(session: Session | null, headers?: Headers): Promise<Principal | null> {
  if (!session) return null;
  const key = headers?.get("x-api-key");
  const viaKey = Boolean(key) && session.session.token === key;

  const person = await loadPersonById(session.user.id);
  if (!person) return null;

  if (!viaKey) {
    const impersonator = (session.session as { impersonatedBy?: string | null }).impersonatedBy ?? null;

    return personPrincipal(person, impersonator ? "impersonation" : "session", impersonator);
  }

  // An API key: its owner must be a service account; the key's permissions cap it.
  const [row] = await db
    .select({ permissions: apikey.permissions })
    .from(apikey)
    .where(eq(apikey.id, session.session.id));
  // ponytail: the Owy bot's key predates service accounts (owner `owy-bot` with role "admin", no
  // permissions) and must keep working between the deploy and the data migration, which ends it.
  // Only that account, and never acting for someone else: a legacy key can't hide who's behind it.
  const legacyBotKey = person.id === LEGACY_BOT_ID && person.role === "admin" && !row?.permissions;
  if (person.banned || !(legacyBotKey || platformRolesOf(person.role).includes("service"))) return null;
  const service = personPrincipal({ ...person, role: "service" }, "api-key", null);
  const ceiling = row?.permissions
    ? sanitizeGrants(JSON.parse(row.permissions))
    : { ...service.platform, delegation: [] };
  const keyed: Principal = { ...service, ceiling: intersectGrants(ceiling, service.platform) };

  const actor = headers?.get(ACTOR_HEADER);
  if (!actor || !grantsHold(keyed.ceiling, "delegation:act-as")) return keyed;

  // The bot acts for the person talking to it: what they may do, never more than the key.
  const human = await personByIdentity(actor.trim());
  if (human === "anonymous" || human === null) {
    return {
      ...keyed,
      via: "delegated",
      byId: person.id,
      roles: ["user"],
      heldRoles: ["user"],
      platform: ANYONE_VIA_BOT,
      memberOf: null,
    };
  }
  const delegated = personPrincipal(human, "delegated", person.id);

  return {
    ...delegated,
    platform: mergeGrants(delegated.platform, ANYONE_VIA_BOT),
    ceiling: keyed.ceiling,
  };
}

/** A principal for code that runs without a request (scripts, cron) as a given person. */
export async function principalOf(userId: string): Promise<Principal | null> {
  const person = await loadPersonById(userId);

  return person ? personPrincipal(person, "session", null) : null;
}

// ---------------------------------------------------------------------------
// Community grants
// ---------------------------------------------------------------------------
export type Membership = { role: string; grants: Grants; active: boolean } | null;

/** One person's role in one community, with what it grants (built-in or custom). */
export async function membershipOf(userId: string, communityId: string): Promise<Membership> {
  const [row] = await db
    .select({ role: communityMembers.role, active: communities.isActive, custom: communityRoles.permission })
    .from(communityMembers)
    .innerJoin(communities, eq(communities.id, communityMembers.communityId))
    .leftJoin(
      communityRoles,
      and(eq(communityRoles.communityId, communityMembers.communityId), eq(communityRoles.role, communityMembers.role))
    )
    .where(and(eq(communityMembers.communityId, communityId), eq(communityMembers.userId, userId)));
  if (!row) return null;
  const builtIn = (COMMUNITY_ROLE_GRANTS as Record<string, Grants>)[row.role];

  return { role: row.role, active: row.active, grants: builtIn ?? communityPart(sanitizeGrants(row.custom ?? {})) };
}

const memo = new WeakMap<Principal, Map<string, Promise<Grants>>>();

/**
 * Everything a principal holds in a community: their platform grants plus their membership's.
 * A membership counts only while the community is active and the person is on the OWU Slack.
 */
export function grantsIn(principal: Principal, communityId: string): Promise<Grants> {
  let byCommunity = memo.get(principal);
  if (!byCommunity) memo.set(principal, (byCommunity = new Map()));
  let grants = byCommunity.get(communityId);
  if (!grants) {
    grants = (async () => {
      let held = principal.platform;
      if (principal.memberOf && !principal.banned) {
        const membership = await membershipOf(principal.memberOf, communityId);
        const counts = membership !== null && membership.active && (principal.owuSlack || !owuSlackRequired());
        if (counts) held = mergeGrants(held, membership.grants);
      }

      return principal.ceiling ? intersectGrants(held, principal.ceiling) : held;
    })();
    byCommunity.set(communityId, grants);
  }

  return grants;
}

/** What a principal holds outside any community. */
export const platformGrants = (principal: Principal): Grants =>
  principal.ceiling ? intersectGrants(principal.platform, principal.ceiling) : principal.platform;

/** Does the principal hold `permission` (in `communityId`, when given)? */
export async function can(principal: Principal | null, permission: Permission, communityId?: string | null) {
  if (!principal || principal.banned) return false;
  const grants = communityId ? await grantsIn(principal, communityId) : platformGrants(principal);

  return grantsHold(grants, permission);
}

/** True when the principal holds `permission` in at least one community, or everywhere. */
export async function canSomewhere(principal: Principal | null, permission: Permission): Promise<boolean> {
  if (!principal || principal.banned) return false;
  if (grantsHold(platformGrants(principal), permission)) return true;
  if (!principal.memberOf) return false;
  const memberships = await db
    .select({ communityId: communityMembers.communityId })
    .from(communityMembers)
    .where(eq(communityMembers.userId, principal.memberOf));
  for (const { communityId } of memberships) {
    if (await can(principal, permission, communityId)) return true;
  }

  return false;
}
