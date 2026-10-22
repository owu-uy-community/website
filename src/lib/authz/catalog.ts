import { createAccessControl, type Role } from "better-auth/plugins/access";
import { defaultStatements as adminStatements } from "better-auth/plugins/admin/access";

/**
 * Every permission on the platform, as Better Auth access-control statements: a resource and the
 * actions on it. One catalog drives the API (each procedure names one permission), the pages, the
 * nav, realtime, API keys and the Owy bot. Pure, so client code reads it too.
 *
 * Two scopes:
 * - Community permissions are held through a role in one community (owner, admin, editor, member,
 *   door, or a custom role the community defines).
 * - Platform permissions are held through a platform role (user.role). A platform role may also
 *   hold community permissions: then it holds them in every community (site staff do).
 */
export const communityStatements = {
  /** The community itself: its public profile and settings. */
  organization: ["update"],
  member: ["read", "create", "update", "delete", "manage-admins", "manage-owners", "show-on-profile"],
  invitation: ["create", "cancel"],
  /** Custom roles of the community. */
  role: ["read", "create", "update", "delete"],
  event: [
    "list",
    "read",
    "create",
    "update",
    "publish",
    "cancel",
    "delete",
    "hold",
    "stats",
    "cohost",
    "message",
    "door-link",
  ],
  rsvp: ["review", "seat", "cancel", "test"],
  attendee: ["read", "export", "tag", "sync", "undo", "checkin", "checkins"],
  task: ["read", "work", "manage"],
  announcement: ["read", "ack", "manage"],
  incident: ["read", "report", "work", "delete", "manage", "confidential"],
  integration: ["read", "retry", "connect", "disconnect"],
  venue: ["requests", "read", "request"],
  survey: ["read", "write"],
  poll: ["read", "create", "vote", "choose"],
  room: ["set-status"],
  calendar: ["read"],
  activity: ["read"],
  dashboard: ["read"],
  assistant: ["ask"],
} as const;

export const platformStatements = {
  /** Better Auth's admin plugin checks these two by name (users, bans, impersonation, sessions). */
  ...adminStatements,
  ...communityStatements,
  organization: ["update", "create", "list", "delete"],
  event: [...communityStatements.event, "manage"],
  venue: [...communityStatements.venue, "manage"],
  survey: [...communityStatements.survey, "delete"],
  /** Community claims and access requests (the waitlist). */
  claim: ["read", "decide"],
  /** The open-space board: rooms, slots, talks, and reading talk cards with OCR. */
  program: ["manage"],
  raffle: ["read", "run"],
  comms: ["read", "send", "schedule", "dispatch"],
  /** The stage wall, the countdown, the cast highlight, the screens and the companion. */
  stage: ["read", "operate", "fire-preset"],
  obs: ["read", "operate"],
  runOfShow: ["read", "operate"],
  semanario: ["read", "write", "publish"],
  salarySurvey: ["manage"],
  /** Site-wide numbers and integration health. */
  insight: ["read"],
  apiKey: ["create", "read", "revoke"],
  audit: ["read"],
  /** A service API key may act for the person talking to it (the Owy bot): see authz/actor.ts. */
  delegation: ["act-as"],
  /** Operate the Owy agent itself (its HTTP channel). */
  owy: ["operate"],
} as const;

export type PlatformStatements = typeof platformStatements;
export type CommunityStatements = typeof communityStatements;

type PermissionOf<S extends Record<string, readonly string[]>> = {
  [R in keyof S & string]: `${R}:${S[R][number]}`;
}[keyof S & string];

/** "resource:action", e.g. "event:publish". */
export type Permission = PermissionOf<PlatformStatements>;
export type CommunityPermission = PermissionOf<CommunityStatements>;

/** A role's grants in the shape Better Auth stores and checks: resource → actions. */
export type Grants = { [resource: string]: readonly string[] };

export const platformAc = createAccessControl(platformStatements);
export const communityAc = createAccessControl(communityStatements);

const plus = (...sets: Grants[]): Grants => {
  const out: Record<string, string[]> = {};
  for (const set of sets) {
    for (const [resource, actions] of Object.entries(set)) {
      out[resource] = [...new Set([...(out[resource] ?? []), ...actions])];
    }
  }

  return out;
};

// ---------------------------------------------------------------------------
// Community roles. Each built-in is the one below it plus more, as ROLE_RANK
// ranks them; `door` stands apart (check-in only, for door volunteers).
// ---------------------------------------------------------------------------
const memberGrants = {
  event: ["list"],
  attendee: ["checkin", "checkins"],
  incident: ["read", "report", "work"],
  task: ["read", "work"],
  announcement: ["read", "ack"],
  room: ["set-status"],
  venue: ["requests"],
} satisfies Grants;

const editorGrants = plus(memberGrants, {
  event: ["read", "create", "update", "publish", "delete", "hold", "stats", "cohost"],
  incident: ["delete", "manage"],
  task: ["manage"],
  announcement: ["manage"],
  venue: ["read", "request"],
  member: ["show-on-profile"],
  integration: ["read", "retry"],
  rsvp: ["review"],
  survey: ["read", "write"],
  poll: ["read", "create", "vote", "choose"],
  calendar: ["read"],
  activity: ["read"],
});

const adminGrants = plus(editorGrants, {
  organization: ["update"],
  member: ["read", "create", "update", "delete"],
  invitation: ["create", "cancel"],
  role: ["read", "create", "update", "delete"],
  event: ["cancel", "message", "door-link"],
  rsvp: ["seat", "cancel", "test"],
  attendee: ["read", "export", "tag", "sync", "undo"],
  incident: ["confidential"],
  integration: ["connect", "disconnect"],
  dashboard: ["read"],
  assistant: ["ask"],
});

const ownerGrants = plus(adminGrants, { member: ["manage-admins", "manage-owners"] });

const doorGrants = { event: ["list"], attendee: ["checkin", "checkins"] } satisfies Grants;

export const COMMUNITY_ROLE_GRANTS = {
  owner: ownerGrants,
  admin: adminGrants,
  editor: editorGrants,
  member: memberGrants,
  door: doorGrants,
} as const satisfies Record<string, Grants>;

export type BuiltInCommunityRole = keyof typeof COMMUNITY_ROLE_GRANTS;

// ---------------------------------------------------------------------------
// Platform roles. A person may hold several (stored comma-joined in user.role).
// ---------------------------------------------------------------------------
const {
  user: _user,
  session: _session,
  apiKey: _apiKey,
  audit: _audit,
  owy: _owy,
  ...staffGrants
} = platformStatements;

export const PLATFORM_ROLE_GRANTS = {
  /**
   * Everything, including roles, impersonation, API keys and the audit log; but nobody may view the
   * site as another privileged person (`user:impersonate-admins` is held by no role).
   */
  superadmin: {
    ...platformStatements,
    user: platformStatements.user.filter((action) => action !== "impersonate-admins"),
  },
  /** Event operations on every community: what site staff ("admin") could do before. */
  staff: { ...staffGrants, delegation: [] },
  /** People and access: users, bans, sessions, claims, access requests and memberships anywhere. */
  moderator: {
    user: ["list", "get", "ban"],
    session: ["list", "revoke"],
    claim: ["read", "decide"],
    organization: ["list"],
    invitation: ["create", "cancel"],
    member: ["read", "create", "update", "delete", "manage-admins", "manage-owners"],
    role: ["read"],
    audit: ["read"],
  },
  /**
   * Machine accounts (the Owy bot, the Stream Deck, the companion). What a service may ever do;
   * each key narrows it further, and the bot only uses it on behalf of someone who holds it too.
   */
  service: {
    event: ["list", "read"],
    calendar: ["read"],
    program: ["manage"],
    room: ["set-status"],
    task: ["read", "work", "manage"],
    announcement: ["read", "ack", "manage"],
    incident: ["read", "report", "work"],
    attendee: ["checkins"],
    stage: ["read", "operate", "fire-preset"],
    obs: ["read", "operate"],
    runOfShow: ["read"],
    semanario: ["read", "write"],
    insight: ["read"],
    delegation: ["act-as"],
    owy: ["operate"],
  },
  user: {},
} as const satisfies Record<string, Grants>;

export type PlatformRole = keyof typeof PLATFORM_ROLE_GRANTS;
export const PLATFORM_ROLES = Object.keys(PLATFORM_ROLE_GRANTS) as PlatformRole[];

/**
 * What anyone may do through the Owy bot without a role of their own: ask about the event and
 * report a problem. The bot's key and service role still cap it.
 */
export const ANYONE_VIA_BOT: Grants = { event: ["list", "read"], incident: ["report"], calendar: ["read"] };

/** The roles Better Auth's admin plugin is configured with. */
export const platformRoles = Object.fromEntries(
  Object.entries(PLATFORM_ROLE_GRANTS).map(([name, grants]) => [name, platformAc.newRole(grants as never)])
) as unknown as Record<PlatformRole, Role>;

/** Roles before the RBAC rollout: "admin" was site staff. Read as staff until the data migration runs. */
export const LEGACY_PLATFORM_ROLES: Record<string, PlatformRole> = { admin: "staff" };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
export function parsePermission(permission: string): [resource: string, action: string] {
  const at = permission.indexOf(":");

  return [permission.slice(0, at), permission.slice(at + 1)];
}

/** True when `grants` hold `permission`. */
export function grantsHold(grants: Grants | null | undefined, permission: string): boolean {
  if (!grants) return false;
  const [resource, action] = parsePermission(permission);

  return grants[resource]?.includes(action) ?? false;
}

/** Union of grants. */
export const mergeGrants = plus;

/** Intersection of grants: what both hold. */
export function intersectGrants(a: Grants, b: Grants): Grants {
  const out: Record<string, string[]> = {};
  for (const [resource, actions] of Object.entries(a)) {
    const both = actions.filter((action) => b[resource]?.includes(action));
    if (both.length > 0) out[resource] = both;
  }

  return out;
}

/** True when every grant in `inner` is also in `outer` (no escalation). */
export function grantsWithin(inner: Grants, outer: Grants): boolean {
  return Object.entries(inner).every(([resource, actions]) =>
    actions.every((action) => outer[resource]?.includes(action))
  );
}

/** Every "resource:action" a set of grants holds, sorted. */
export function permissionsOf(grants: Grants): Permission[] {
  return Object.entries(grants)
    .flatMap(([resource, actions]) => actions.map((action) => `${resource}:${action}` as Permission))
    .toSorted();
}

/** Only the community resources of `grants`, keeping actions a community role can hold. */
export function communityPart(grants: Grants): Grants {
  const out: Record<string, string[]> = {};
  for (const [resource, actions] of Object.entries(grants)) {
    const allowed = (communityStatements as Grants)[resource];
    if (!allowed) continue;
    const kept = actions.filter((action) => allowed.includes(action));
    if (kept.length > 0) out[resource] = kept;
  }

  return out;
}

/** Platform roles of a user.role value ("staff,moderator"), legacy names mapped, unknown dropped. */
export function platformRolesOf(value: string | null | undefined): PlatformRole[] {
  const roles = (value ?? "user")
    .split(",")
    .map((role) => role.trim())
    .map((role) => LEGACY_PLATFORM_ROLES[role] ?? role)
    .filter((role): role is PlatformRole => role in PLATFORM_ROLE_GRANTS);

  return roles.length > 0 ? [...new Set(roles)] : ["user"];
}

/** The grants of a set of platform roles. */
export const platformGrantsOf = (roles: readonly PlatformRole[]): Grants =>
  plus(...roles.map((role) => PLATFORM_ROLE_GRANTS[role] as Grants));

/** Is a value valid JSON grants, keeping only known resources and actions of `catalog`. */
export function sanitizeGrants(value: unknown, catalog: Grants = platformStatements): Grants {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  const out: Record<string, string[]> = {};
  for (const [resource, actions] of Object.entries(value as Record<string, unknown>)) {
    const allowed = catalog[resource];
    if (!allowed || !Array.isArray(actions)) continue;
    const kept = [...new Set(actions.filter((action): action is string => allowed.includes(action as string)))];
    if (kept.length > 0) out[resource] = kept;
  }

  return out;
}
