import { and, eq } from "drizzle-orm";
import { Effect } from "effect";

import {
  COMMUNITY_ROLE_GRANTS,
  communityPart,
  grantsHold,
  grantsWithin,
  sanitizeGrants,
  type Grants,
} from "../../authz/catalog";
import { grantsIn, loadPersonById, platformGrants } from "../../authz/principal";
import { communityRoles } from "../../db/schema";
import { allowed } from "../authz";
import { query } from "../db";
import { Forbidden, Invalid } from "../errors";
import { CurrentUser } from "../services";

/** What a role grants in a community: a built-in's grants, a custom role's, or null when it has no such role. */
export const roleGrantsIn = (communityId: string, role: string) =>
  Effect.gen(function* () {
    const builtIn = (COMMUNITY_ROLE_GRANTS as Record<string, Grants>)[role];
    if (builtIn) return builtIn;
    const [custom] = yield* query((db) =>
      db
        .select({ permission: communityRoles.permission })
        .from(communityRoles)
        .where(and(eq(communityRoles.communityId, communityId), eq(communityRoles.role, role)))
    );

    return custom ? communityPart(sanitizeGrants(custom.permission)) : null;
  });

export const ownersOnly = new Forbidden({ message: "Solo un owner de la comunidad puede cambiar a otro owner" });
export const adminsOnly = new Forbidden({ message: "Solo un owner de la comunidad puede cambiar a un admin" });
const noEscalation = new Forbidden({ message: "No podés dar un rol con más permisos que los que tenés vos" });
const notYourself = new Forbidden({ message: "No podés subirte el rol a vos mismo" });

/**
 * The rules every change to someone's role in a community follows, before it's written. `current`
 * is the role they hold now (null: they aren't a member yet); `next` the role they'll hold (null:
 * they leave).
 * - Changing an owner, or making one, takes `member:manage-owners`; an admin, `member:manage-admins`.
 * - The role must exist in the community.
 * - Nobody hands out a role holding more than they hold in the community. People whose power over
 *   memberships comes from the platform (moderators, staff) may assign any role, to others.
 * - Nobody raises their own role.
 * Returns the grants of `next`.
 */
export const checkGrant = (
  communityId: string,
  targetUserId: string | null,
  current: string | null,
  next: string | null
) =>
  Effect.gen(function* () {
    const me = yield* CurrentUser;
    const touched = [current, next];
    if (touched.includes("owner") && !(yield* allowed("member:manage-owners", communityId))) {
      return yield* ownersOnly;
    }
    if (touched.includes("admin") && !(yield* allowed("member:manage-admins", communityId))) {
      return yield* adminsOnly;
    }
    if (next === null) return null;

    const grants = yield* roleGrantsIn(communityId, next);
    if (!grants) return yield* new Invalid({ message: `La comunidad no tiene el rol «${next}»` });

    const held = yield* Effect.promise(() => grantsIn(me.principal, communityId));
    if (targetUserId === me.id) {
      if (!grantsWithin(grants, held)) return yield* notYourself;

      return grants;
    }
    const platformWide = grantsHold(platformGrants(me.principal), "member:update");
    if (!platformWide && !grantsWithin(grants, held)) return yield* noEscalation;

    return grants;
  });

/** True when `next` holds anything `current` doesn't: a raise, which needs the OWU Slack. */
export const raises = (communityId: string, current: string | null, next: string) =>
  Effect.gen(function* () {
    if (current === null) return true;
    const [before, after] = yield* Effect.all([roleGrantsIn(communityId, current), roleGrantsIn(communityId, next)]);

    return !grantsWithin(after ?? {}, before ?? {});
  });

/**
 * Can this person take a new role? New grants need the OWU Slack right away (signing in with it once
 * links it); only roles held before the rollout get the grace period (see authz/slack.ts).
 */
export const holdsOwuSlack = (userId: string) =>
  Effect.promise(() => loadPersonById(userId)).pipe(Effect.map((person) => Boolean(person?.owuSlack)));

export const needsOwuSlack = new Invalid({
  message:
    "Para tener un rol hace falta entrar con el Slack de OWU. Le dejamos la invitación: se aplica cuando entre con ese Slack.",
});
