// Adds `.effect(function* …)` to every builder. A side-effect import: it must
// load before any procedure is defined, which this module guarantees.
import "@orpc/experimental-effect/extensions/effect";

import type { WithEffectContext } from "@orpc/experimental-effect";
import { defineMeta, ORPCError, os } from "@orpc/server";
import * as Sentry from "@sentry/nextjs";
import { Context, Effect } from "effect";

import type { Session } from "app/lib/auth";

import { audit } from "../authz/audit";
import { parsePermission, type CommunityPermission, type Permission } from "../authz/catalog";
import { can, principalFor, type Principal } from "../authz/principal";
import { db } from "../db";
import { wideEvent } from "../evlog";
import { APP_ERRORS, toWireError } from "./errors";
import { resolveScope, type ScopeInput } from "./scope";
import { CommunityScope, CurrentUser, type Actor, type AppServices } from "./services";

/**
 * What every procedure starts with. `getSession` is lazy and memoized per
 * request, so procedures that never ask for the caller never pay for the lookup
 * (and a batch shares one lookup).
 */
export interface BaseContext extends WithEffectContext<AppServices> {
  getSession: () => Promise<Session | null>;
  /** Present for HTTP calls; tells an API-key caller (the Owy bot) from a browser. */
  requestHeaders?: Headers;
  /** The caller as the permission checks see them; resolved once per request. */
  principal?: Promise<Principal | null>;
}

/** What a procedure behind `authed` has: the caller, also available to effects as `CurrentUser`. */
export type AuthedContext = Omit<BaseContext, "effect/context"> & {
  user: Actor;
  "effect/context": Context.Context<AppServices | CurrentUser>;
};

/**
 * Who may call a procedure: anyone, anyone signed in, a platform permission ("platform:stage:operate",
 * held through a platform role), or a community permission ("community:event:update", held through
 * a role in the community the input points at, or a platform role that holds it everywhere). Every
 * procedure declares one; a test pins the whole map.
 */
export type Access = "public" | "authed" | `platform:${Permission}` | `community:${CommunityPermission}`;

const [accessMeta, getAccess] = defineMeta("access", (incoming: Access) => incoming);
export { getAccess };

/**
 * Outermost middleware: whatever a procedure throws leaves as a typed error
 * the client can act on, or — for a crash — a sanitized INTERNAL_SERVER_ERROR
 * reported to Sentry once. Middleware rather than a handler interceptor so the
 * server-side caller and tests get exactly the same errors as HTTP clients.
 */
const errorBoundary = os.$context<BaseContext>().middleware(async ({ next, path }) => {
  try {
    return await next();
  } catch (error) {
    throw toWireError(error, { path });
  }
});

/** The caller, read fresh: a role taken away or a ban counts on the next request. */
export const principalOf = (context: BaseContext): Promise<Principal | null> =>
  (context.principal ??= context.getSession().then((session) => principalFor(session, context.requestHeaders)));

const requireSession = os.$context<BaseContext>().middleware(async ({ context, next }) => {
  const principal = await principalOf(context);
  if (!principal || principal.banned) {
    throw new ORPCError("UNAUTHORIZED", { message: "Iniciá sesión para continuar" });
  }

  const user: Actor = { id: principal.id, name: principal.name, via: principal.via, principal };
  Sentry.setUser({ id: user.id });
  wideEvent()?.set({
    user: {
      id: user.id,
      roles: principal.roles.join(","),
      via: user.via,
      ...(principal.byId ? { by: principal.byId } : {}),
    },
  });

  return next({
    context: { user, "effect/context": context["effect/context"].pipe(Context.add(CurrentUser, user)) },
  });
});

/** Actions that only read; everything else a permission guards is written to the audit log. */
const READ_ACTIONS = new Set(["read", "list", "checkins", "requests", "stats", "ask"]);

/** Record a change made through a permission-guarded procedure, after it succeeded. */
async function recordChange(
  user: Actor,
  permission: string,
  path: readonly string[],
  input: unknown,
  communityId: string | null,
  headers: Headers | undefined
) {
  if (READ_ACTIONS.has(parsePermission(permission)[1])) return;
  const target = (input ?? {}) as Record<string, unknown>;
  const targetId = typeof target.id === "string" ? target.id : null;
  try {
    await audit(db, {
      actorId: user.id,
      via: user.via,
      byId: user.principal.byId,
      action: path.join("."),
      targetType: parsePermission(permission)[0],
      targetId,
      communityId,
      data: { input },
      ip: headers?.get("x-real-ip") ?? headers?.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      userAgent: headers?.get("user-agent") ?? null,
    });
  } catch (error) {
    // The change already happened; a missing audit row must not turn it into an error for the caller.
    Sentry.captureException(error, { tags: { audit: path.join(".") } });
  }
}

const base = os.$context<BaseContext>().errors(APP_ERRORS).use(errorBoundary);

/** Anyone, signed in or not. */
export const pub = base.meta(accessMeta("public"));

/** Any signed-in person, or a service account's API key. Adds `CurrentUser`. */
export const authed = base.meta(accessMeta("authed")).use(requireSession);

/** A platform permission (held through a platform role). */
export const platform = (permission: Permission) =>
  authed.meta(accessMeta(`platform:${permission}`)).use(async ({ context, next, path }, input: unknown) => {
    if (!(await can(context.user.principal, permission))) {
      throw new ORPCError("FORBIDDEN", { message: "No tenés permiso para hacer esto" });
    }
    const result = await next();
    await recordChange(context.user, permission, path, input, null, context.requestHeaders);

    return result;
  });

/**
 * A community permission in the community the (validated) input points at:
 * through a role there, or a platform role that holds it everywhere. Use after
 * `.input(...)` on `authed`. Adds `CommunityScope` — services must still filter by it.
 */
export const inCommunity = (permission: CommunityPermission) =>
  os
    .$context<AuthedContext>()
    .meta(accessMeta(`community:${permission}`))
    .middleware(async ({ context, next, path }, input: ScopeInput) => {
      const run = Effect.runPromiseWith(context["effect/context"]);
      const scope = await run(resolveScope(input));
      if (!scope) {
        throw new ORPCError("NOT_FOUND", {
          message: "No encontramos la comunidad o el evento de este pedido",
          data: { entity: "community" },
        });
      }

      if (!(await can(context.user.principal, permission, scope.communityId))) {
        throw new ORPCError("FORBIDDEN", { message: "No tenés permiso para hacer esto en esta comunidad" });
      }

      wideEvent()?.set({
        community: { id: scope.communityId },
        ...(scope.eventId ? { event: { id: scope.eventId } } : {}),
      });

      const result = await next({
        context: { scope, "effect/context": context["effect/context"].pipe(Context.add(CommunityScope, scope)) },
      });
      await recordChange(context.user, permission, path, input, scope.communityId, context.requestHeaders);

      return result;
    });
