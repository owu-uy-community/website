import { and, count, eq } from "drizzle-orm";
import { Effect } from "effect";
import * as z from "zod";

import { audit } from "../../authz/audit";
import {
  COMMUNITY_ROLE_GRANTS,
  communityPart,
  communityStatements,
  grantsHold,
  grantsWithin,
  permissionsOf,
  sanitizeGrants,
  type Grants,
} from "../../authz/catalog";
import { ROLE_LABELS } from "../../authz/labels";
import { grantsIn, platformGrants } from "../../authz/principal";
import { communityMembers, communityRoles, invitations } from "../../db/schema";
import { query, transaction } from "../db";
import { Conflict, Forbidden, Invalid, NotFound } from "../errors";
import { CurrentUser } from "../services";

export const CommunityRoleInfoSchema = z.object({
  role: z.string(),
  label: z.string(),
  description: z.string(),
  builtIn: z.boolean(),
  permissions: z.array(z.string()),
  members: z.number(),
});
export type CommunityRoleInfo = z.infer<typeof CommunityRoleInfoSchema>;

export const RoleInputSchema = z.object({
  communityId: z.string().min(1),
  label: z.string().trim().min(2).max(40),
  description: z.string().trim().max(200).default(""),
  /** "resource:action" community permissions. */
  permissions: z.array(z.string()).max(80),
});

const BUILT_INS = Object.keys(COMMUNITY_ROLE_GRANTS);

const slugOf = (label: string) =>
  label
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40);

/** "event:read" strings to grants, keeping only community permissions that exist. */
export function grantsFromPermissions(permissions: readonly string[]): Grants {
  const out: Record<string, string[]> = {};
  for (const permission of permissions) {
    const at = permission.indexOf(":");
    const resource = permission.slice(0, at);
    const action = permission.slice(at + 1);
    (out[resource] ??= []).push(action);
  }

  return sanitizeGrants(out, communityStatements as Grants);
}

/** Built-in roles and the community's own, with what each holds and how many people have it. */
export const listRoles = (communityId: string) =>
  Effect.gen(function* () {
    const [custom, usage] = yield* Effect.all([
      query((db) => db.select().from(communityRoles).where(eq(communityRoles.communityId, communityId))),
      query((db) =>
        db
          .select({ role: communityMembers.role, members: count() })
          .from(communityMembers)
          .where(eq(communityMembers.communityId, communityId))
          .groupBy(communityMembers.role)
      ),
    ]);
    const membersOf = (role: string) => usage.find((row) => row.role === role)?.members ?? 0;

    return [
      ...BUILT_INS.map((role): CommunityRoleInfo => ({
        role,
        label: ROLE_LABELS[role]?.label ?? role,
        description: ROLE_LABELS[role]?.hint ?? "",
        builtIn: true,
        permissions: permissionsOf((COMMUNITY_ROLE_GRANTS as Record<string, Grants>)[role]),
        members: membersOf(role),
      })),
      ...custom.map((row): CommunityRoleInfo => ({
        role: row.role,
        label: row.label,
        description: row.description,
        builtIn: false,
        permissions: permissionsOf(communityPart(sanitizeGrants(row.permission))),
        members: membersOf(row.role),
      })),
    ];
  });

/**
 * A role can't hold more than its author holds in the community (people managing memberships
 * from the platform excepted), nor anything over owners or admins.
 */
const mayDefine = (communityId: string, grants: Grants) =>
  Effect.gen(function* () {
    const me = yield* CurrentUser;
    if (grantsHold(grants, "member:manage-owners") || grantsHold(grants, "member:manage-admins")) {
      return yield* new Invalid({ message: "Manejar dueños y admins queda para esos roles: sacá ese permiso" });
    }
    if (grantsHold(platformGrants(me.principal), "member:update")) return;
    const held = yield* Effect.promise(() => grantsIn(me.principal, communityId));
    if (!grantsWithin(grants, held)) {
      return yield* new Forbidden({ message: "El rol no puede tener permisos que vos no tenés" });
    }
  });

export const createRole = (input: { communityId: string; label: string; description: string; permissions: string[] }) =>
  transaction(
    Effect.gen(function* () {
      const me = yield* CurrentUser;
      const role = slugOf(input.label);
      if (!role || BUILT_INS.includes(role)) {
        return yield* new Invalid({ message: "Elegí otro nombre: ese ya es un rol de OWU" });
      }
      const grants = grantsFromPermissions(input.permissions);
      if (Object.keys(grants).length === 0) return yield* new Invalid({ message: "Marcá al menos un permiso" });
      yield* mayDefine(input.communityId, grants);
      const [row] = yield* query((db) =>
        db
          .insert(communityRoles)
          .values({
            communityId: input.communityId,
            role,
            label: input.label,
            description: input.description,
            permission: grants as Record<string, string[]>,
            createdById: me.id,
          })
          .onConflictDoNothing()
          .returning()
      );
      if (!row) return yield* new Conflict({ reason: "role_exists", message: "Ya hay un rol con ese nombre" });

      return { role };
    })
  );

export const updateRole = (input: {
  communityId: string;
  role: string;
  label?: string | undefined;
  description?: string | undefined;
  permissions?: string[] | undefined;
}) =>
  transaction(
    Effect.gen(function* () {
      const me = yield* CurrentUser;
      const [current] = yield* query((db) =>
        db
          .select()
          .from(communityRoles)
          .where(and(eq(communityRoles.communityId, input.communityId), eq(communityRoles.role, input.role)))
          .for("update")
      );
      if (!current) return yield* new NotFound({ entity: "role", message: "Ese rol no existe en la comunidad" });
      const grants = input.permissions ? grantsFromPermissions(input.permissions) : null;
      if (grants) {
        if (Object.keys(grants).length === 0) return yield* new Invalid({ message: "Marcá al menos un permiso" });
        yield* mayDefine(input.communityId, grants);
        // Editing your own role can't raise it
        const [mine] = yield* query((db) =>
          db
            .select({ role: communityMembers.role })
            .from(communityMembers)
            .where(and(eq(communityMembers.communityId, input.communityId), eq(communityMembers.userId, me.id)))
        );
        if (mine?.role === input.role && !grantsWithin(grants, sanitizeGrants(current.permission))) {
          return yield* new Forbidden({ message: "No podés sumarle permisos a tu propio rol" });
        }
      }
      yield* query((db) =>
        db
          .update(communityRoles)
          .set({
            ...(input.label ? { label: input.label } : {}),
            ...(input.description !== undefined ? { description: input.description } : {}),
            ...(grants ? { permission: grants as Record<string, string[]> } : {}),
          })
          .where(eq(communityRoles.id, current.id))
      );
      yield* query((db) =>
        audit(db, {
          actorId: me.id,
          via: me.via,
          byId: me.principal.byId,
          action: "role.update",
          targetType: "role",
          targetId: current.id,
          communityId: input.communityId,
          data: { role: input.role, before: current.permission, after: grants ?? undefined, label: input.label },
        })
      );

      return { role: input.role };
    })
  );

/** Delete a custom role nobody holds (and no pending invitation offers). */
export const deleteRole = (input: { communityId: string; role: string }) =>
  transaction(
    Effect.gen(function* () {
      const [[{ holders }], [{ offered }]] = yield* Effect.all([
        query((db) =>
          db
            .select({ holders: count() })
            .from(communityMembers)
            .where(and(eq(communityMembers.communityId, input.communityId), eq(communityMembers.role, input.role)))
        ),
        query((db) =>
          db
            .select({ offered: count() })
            .from(invitations)
            .where(
              and(
                eq(invitations.communityId, input.communityId),
                eq(invitations.role, input.role),
                eq(invitations.status, "pending")
              )
            )
        ),
      ]);
      if (holders > 0 || offered > 0) {
        return yield* new Conflict({
          reason: "role_in_use",
          message: "Hay gente (o invitaciones) con ese rol: cambiales el rol antes de borrarlo",
        });
      }
      const [row] = yield* query((db) =>
        db
          .delete(communityRoles)
          .where(and(eq(communityRoles.communityId, input.communityId), eq(communityRoles.role, input.role)))
          .returning({ id: communityRoles.id })
      );
      if (!row) return yield* new NotFound({ entity: "role", message: "Ese rol no existe en la comunidad" });

      return { success: true as const };
    })
  );
