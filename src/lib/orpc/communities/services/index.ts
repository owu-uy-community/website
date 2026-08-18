import { ORPCError } from "@orpc/server";
import { and, asc, eq } from "drizzle-orm";

import { isValidCommunitySlug } from "../../../tenant";
import { db } from "../../../db";
import { communities, communityMembers, user, type CommunityRow } from "../../../db/schema";
import type {
  AddCommunityMemberInput,
  Community,
  CommunityMember,
  CreateCommunityInput,
  ListCommunityMembersInput,
  RemoveCommunityMemberInput,
  UpdateCommunityInput,
  UpdateCommunityMemberRoleInput,
} from "../schemas";

const transformCommunity = (row: CommunityRow): Community => ({
  id: row.id,
  slug: row.slug,
  name: row.name,
  description: row.description,
  logoUrl: row.logoUrl,
  customDomain: row.customDomain,
  isActive: row.isActive,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

export async function listCommunities(includeInactive = false): Promise<Community[]> {
  const rows = includeInactive
    ? await db.select().from(communities).orderBy(asc(communities.name))
    : await db.select().from(communities).where(eq(communities.isActive, true)).orderBy(asc(communities.name));

  return rows.map(transformCommunity);
}

export async function getCommunityBySlug(slug: string): Promise<Community | null> {
  const [row] = await db.select().from(communities).where(eq(communities.slug, slug));

  return row ? transformCommunity(row) : null;
}

export async function createCommunity(input: CreateCommunityInput, creatorUserId: string): Promise<Community> {
  if (!isValidCommunitySlug(input.slug)) {
    throw new Error("Slug inválido o reservado");
  }

  const [existing] = await db.select({ id: communities.id }).from(communities).where(eq(communities.slug, input.slug));
  if (existing) {
    throw new Error("Ya existe una comunidad con ese slug");
  }

  const [row] = await db
    .insert(communities)
    .values({
      slug: input.slug,
      name: input.name,
      description: input.description ?? null,
      logoUrl: input.logoUrl ?? null,
    })
    .returning();

  await db
    .insert(communityMembers)
    .values({ communityId: row.id, userId: creatorUserId, role: "owner" })
    .onConflictDoNothing({ target: [communityMembers.communityId, communityMembers.userId] });

  return transformCommunity(row);
}

export async function updateCommunity(input: UpdateCommunityInput): Promise<Community> {
  const [row] = await db
    .update(communities)
    .set(input.data)
    .where(eq(communities.id, input.communityId))
    .returning();

  if (!row) throw new Error("Comunidad no encontrada");

  return transformCommunity(row);
}

export async function listCommunityMembers(input: ListCommunityMembersInput): Promise<CommunityMember[]> {
  const rows = await db
    .select({
      id: communityMembers.id,
      communityId: communityMembers.communityId,
      userId: communityMembers.userId,
      role: communityMembers.role,
      createdAt: communityMembers.createdAt,
      name: user.name,
      email: user.email,
      image: user.image,
    })
    .from(communityMembers)
    .innerJoin(user, eq(communityMembers.userId, user.id))
    .where(eq(communityMembers.communityId, input.communityId))
    .orderBy(asc(user.name));

  return rows.map((row) => ({
    id: row.id,
    communityId: row.communityId,
    userId: row.userId,
    role: row.role,
    name: row.name,
    email: row.email,
    image: row.image,
    createdAt: row.createdAt.toISOString(),
  }));
}

async function countOwners(communityId: string): Promise<number> {
  const rows = await db
    .select({ id: communityMembers.id })
    .from(communityMembers)
    .where(and(eq(communityMembers.communityId, communityId), eq(communityMembers.role, "owner")));

  return rows.length;
}

async function requesterIsOwner(communityId: string, userId: string, isSiteStaff: boolean): Promise<boolean> {
  if (isSiteStaff) return true;

  const [membership] = await db
    .select({ role: communityMembers.role })
    .from(communityMembers)
    .where(and(eq(communityMembers.communityId, communityId), eq(communityMembers.userId, userId)));

  return membership?.role === "owner";
}

export async function addCommunityMember(input: AddCommunityMemberInput, requester: { userId: string; isSiteStaff: boolean }) {
  const [targetUser] = await db.select({ id: user.id }).from(user).where(eq(user.email, input.email.toLowerCase().trim()));
  if (!targetUser) {
    throw new ORPCError("BAD_REQUEST", {
      message: "No existe un usuario con ese email (debe iniciar sesión al menos una vez)",
    });
  }

  // Only owners (or site staff) can grant the owner role
  if (input.role === "owner" && !(await requesterIsOwner(input.communityId, requester.userId, requester.isSiteStaff))) {
    throw new ORPCError("FORBIDDEN", { message: "Solo un owner puede otorgar el rol owner" });
  }

  const [row] = await db
    .insert(communityMembers)
    .values({ communityId: input.communityId, userId: targetUser.id, role: input.role })
    .onConflictDoUpdate({
      target: [communityMembers.communityId, communityMembers.userId],
      set: { role: input.role },
    })
    .returning();

  return row;
}

export async function updateCommunityMemberRole(
  input: UpdateCommunityMemberRoleInput,
  requester: { userId: string; isSiteStaff: boolean }
) {
  const [member] = await db
    .select()
    .from(communityMembers)
    .where(and(eq(communityMembers.id, input.memberId), eq(communityMembers.communityId, input.communityId)));
  if (!member) throw new Error("Miembro no encontrado");

  const touchesOwnerRole = member.role === "owner" || input.role === "owner";
  if (touchesOwnerRole && !(await requesterIsOwner(input.communityId, requester.userId, requester.isSiteStaff))) {
    throw new Error("Solo un owner puede modificar el rol owner");
  }

  if (member.role === "owner" && input.role !== "owner" && (await countOwners(input.communityId)) <= 1) {
    throw new Error("La comunidad debe conservar al menos un owner");
  }

  const [row] = await db
    .update(communityMembers)
    .set({ role: input.role })
    .where(eq(communityMembers.id, input.memberId))
    .returning();

  return row;
}

export async function removeCommunityMember(
  input: RemoveCommunityMemberInput,
  requester: { userId: string; isSiteStaff: boolean }
) {
  const [member] = await db
    .select()
    .from(communityMembers)
    .where(and(eq(communityMembers.id, input.memberId), eq(communityMembers.communityId, input.communityId)));
  if (!member) throw new Error("Miembro no encontrado");

  if (member.role === "owner") {
    if (!(await requesterIsOwner(input.communityId, requester.userId, requester.isSiteStaff))) {
      throw new Error("Solo un owner puede quitar a otro owner");
    }
    if ((await countOwners(input.communityId)) <= 1) {
      throw new Error("La comunidad debe conservar al menos un owner");
    }
  }

  await db.delete(communityMembers).where(eq(communityMembers.id, input.memberId));

  return { success: true } as const;
}
