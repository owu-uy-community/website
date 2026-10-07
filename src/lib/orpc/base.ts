// Adds `.effect(function* …)` to every builder. A side-effect import: it must
// load before any procedure is defined, which this module guarantees.
import "@orpc/experimental-effect/extensions/effect";

import type { WithEffectContext } from "@orpc/experimental-effect";
import { defineMeta, ORPCError, os } from "@orpc/server";
import * as Sentry from "@sentry/nextjs";
import { Context, Effect } from "effect";

import type { Session } from "app/lib/auth";

import type { CommunityRoleValue } from "../db/schema";
import { wideEvent } from "../evlog";
import { APP_ERRORS, toWireError } from "./errors";
import { memberRole, resolveScope, ROLE_RANK, type ScopeInput } from "./scope";
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
}

/** What a procedure behind `authed` has: the caller, also available to effects as `CurrentUser`. */
export type AuthedContext = Omit<BaseContext, "effect/context"> & {
  user: Actor;
  "effect/context": Context.Context<AppServices | CurrentUser>;
};

/** Who may call a procedure. Every procedure declares one; a test pins the whole map. */
export type Access = "public" | "authed" | "staff" | `community:${CommunityRoleValue}`;

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

const requireSession = os.$context<BaseContext>().middleware(async ({ context, next }) => {
  const session = await context.getSession();
  if (!session) throw new ORPCError("UNAUTHORIZED", { message: "Iniciá sesión para continuar" });

  const user: Actor = {
    id: session.user.id,
    name: session.user.name,
    role: session.user.role,
    via: context.requestHeaders?.has("x-api-key") ? "api-key" : "session",
  };
  Sentry.setUser({ id: user.id });
  wideEvent()?.set({ user: { id: user.id, role: user.role, via: user.via } });

  return next({
    context: { user, "effect/context": context["effect/context"].pipe(Context.add(CurrentUser, user)) },
  });
});

const requireStaff = os.$context<AuthedContext>().middleware(async ({ context, next }) => {
  if (context.user.role !== "admin") {
    throw new ORPCError("FORBIDDEN", { message: "Esto lo puede hacer solo el staff del sitio" });
  }

  return next();
});

const base = os.$context<BaseContext>().errors(APP_ERRORS).use(errorBoundary);

/** Anyone, signed in or not. */
export const pub = base.meta(accessMeta("public"));

/** Any signed-in user (session or API key). Adds `CurrentUser`. */
export const authed = base.meta(accessMeta("authed")).use(requireSession);

/** Site staff (`user.role === "admin"`): event setup, the OBS rig, the wall. */
export const staff = authed.meta(accessMeta("staff")).use(requireStaff);

/**
 * At least `minimum` role in the community the (validated) input points at;
 * site staff always pass. Use after `.input(...)` on `authed`. Adds
 * `CommunityScope` — services must still filter by it.
 */
export const inCommunity = (minimum: CommunityRoleValue) =>
  os
    .$context<AuthedContext>()
    .meta(accessMeta(`community:${minimum}`))
    .middleware(async ({ context, next }, input: ScopeInput) => {
      const run = Effect.runPromiseWith(context["effect/context"]);
      const scope = await run(resolveScope(input));
      if (!scope) {
        throw new ORPCError("NOT_FOUND", {
          message: "No encontramos la comunidad o el evento de este pedido",
          data: { entity: "community" },
        });
      }

      if (context.user.role !== "admin") {
        const role = await run(memberRole(scope.communityId, context.user.id));
        if (!role || ROLE_RANK[role] < ROLE_RANK[minimum]) {
          throw new ORPCError("FORBIDDEN", { message: `Necesitás rol ${minimum} en esta comunidad` });
        }
      }

      wideEvent()?.set({
        community: { id: scope.communityId },
        ...(scope.eventId ? { event: { id: scope.eventId } } : {}),
      });

      return next({
        context: { scope, "effect/context": context["effect/context"].pipe(Context.add(CommunityScope, scope)) },
      });
    });
