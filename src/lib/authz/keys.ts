import { eq } from "drizzle-orm";

import { auth } from "../../app/lib/auth";

import { db } from "../db";
import { user } from "../db/schema";
import { audit } from "./audit";
import { intersectGrants, PLATFORM_ROLE_GRANTS, sanitizeGrants, type Grants } from "./catalog";
import { withPlatformRoles } from "./people";

/**
 * What each kind of machine may do, at most. A key only authenticates a service account, and its
 * permissions are always cut down to the `service` role's.
 */
export const KEY_PRESETS = {
  /** The Owy bot: acts for the person talking to it, never beyond what that person may do. */
  owy: { ...PLATFORM_ROLE_GRANTS.service, owy: [] },
  /** Whoever runs Owy's console (its HTTP channel): only that. */
  "owy-operator": { owy: ["operate"] },
  /** A Stream Deck on the stage: fire presets and drive OBS, nothing else. */
  "stream-deck": { stage: ["fire-preset"], obs: ["read", "operate"] },
  /** A physical Owy companion: talks and board as the bot does, for whoever is in front of it. */
  companion: {
    event: ["list", "read"],
    calendar: ["read"],
    program: ["manage"],
    incident: ["report"],
    stage: ["read", "operate"],
    delegation: ["act-as"],
    // Its bridge calls Owy's companion routes with this same key
    owy: ["operate"],
  },
} as const satisfies Record<string, Grants>;

export type KeyPreset = keyof typeof KEY_PRESETS;

/** The service account a key belongs to, created on first use (role `service`, never a person). */
export async function ensureServiceAccount(id: string, name: string) {
  const [existing] = await db.select({ id: user.id, role: user.role }).from(user).where(eq(user.id, id));
  if (existing) {
    const role = withPlatformRoles(existing.role, ["service"]);
    if (role !== existing.role) await db.update(user).set({ role }).where(eq(user.id, id));

    return id;
  }
  const now = new Date();
  await db.insert(user).values({
    id,
    name,
    email: `${id}@service.owu.uy`,
    emailVerified: true,
    createdAt: now,
    updatedAt: now,
    role: "service",
  });

  return id;
}

/**
 * Mint a key for a service account. The key is returned once (Better Auth keeps only its hash).
 * Expiring is required: a forgotten key on a lost device must stop working on its own.
 */
export async function mintServiceKey(input: {
  ownerId: string;
  name: string;
  permissions: Grants;
  expiresInDays: number;
  createdById: string | null;
}) {
  const permissions = intersectGrants(sanitizeGrants(input.permissions), PLATFORM_ROLE_GRANTS.service);
  const result = await auth.api.createApiKey({
    body: {
      userId: input.ownerId,
      name: input.name,
      prefix: input.ownerId.replace(/[^a-z0-9]/gi, "").slice(0, 8) || "owu",
      expiresIn: Math.round(input.expiresInDays * 86_400),
      permissions: permissions as Record<string, string[]>,
    },
  });
  await audit(db, {
    actorId: input.createdById,
    via: input.createdById ? "session" : "system",
    action: "api_key.create",
    targetType: "api_key",
    targetId: result.id,
    data: { owner: input.ownerId, name: input.name, permissions, expiresInDays: input.expiresInDays },
  });

  return { id: result.id, key: result.key, permissions, expiresAt: result.expiresAt };
}
