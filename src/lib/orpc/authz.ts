import { Effect } from "effect";

import type { Permission } from "../authz/catalog";
import { can } from "../authz/principal";
import { CurrentUser } from "./services";

/**
 * Does the caller hold `permission` (in `communityId`, when given)? For decisions inside a service
 * beyond the procedure's own permission: what to show, whose note can be edited.
 */
export const allowed = (permission: Permission, communityId?: string | null) =>
  Effect.gen(function* () {
    const user = yield* CurrentUser;

    return yield* Effect.promise(() => can(user.principal, permission, communityId));
  });
