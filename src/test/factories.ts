import { createId } from "@paralleldrive/cuid2";

import { db } from "lib/db";
import { communities, communityMembers, events, rooms, schedules, tracks, user } from "lib/db/schema";

/**
 * Row factories for integration tests. Every row gets unique ids/slugs, so
 * tests never collide and nothing needs cleaning up: the database is
 * recreated on each run (see integration-global-setup.ts).
 */

const slug = (prefix: string) => `${prefix}-${createId().slice(0, 8)}`;

export type UserRow = typeof user.$inferSelect;

export async function makeUser(overrides: Partial<typeof user.$inferInsert> = {}): Promise<UserRow> {
  const now = new Date();
  const [row] = await db
    .insert(user)
    .values({
      id: createId(),
      name: "Ada Tester",
      email: `${createId()}@test.owu.uy`,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
      role: "user",
      status: "active",
      ...overrides,
    })
    .returning();

  return row;
}

export const makeSiteAdmin = (overrides: Partial<typeof user.$inferInsert> = {}) =>
  makeUser({ name: "Site Admin", role: "admin", ...overrides });

export async function makeCommunity(overrides: Partial<typeof communities.$inferInsert> = {}) {
  const [row] = await db
    .insert(communities)
    .values({ slug: slug("comunidad"), name: "Comunidad de prueba", ...overrides })
    .returning();

  return row;
}

export async function makeMember(
  communityId: string,
  role: "owner" | "admin" | "editor" | "member",
  overrides: Partial<typeof user.$inferInsert> = {}
): Promise<UserRow> {
  const member = await makeUser({ name: `Community ${role}`, ...overrides });
  await db.insert(communityMembers).values({ communityId, userId: member.id, role });

  return member;
}

export async function makeEvent(communityId: string, overrides: Partial<typeof events.$inferInsert> = {}) {
  const [row] = await db
    .insert(events)
    .values({
      name: "Open Space de prueba",
      slug: slug("evento"),
      communityId,
      startDate: new Date("2026-11-07T17:30:00.000Z"),
      endDate: new Date("2026-11-07T23:30:00.000Z"),
      ...overrides,
    })
    .returning();

  return row;
}

export async function makeSlot(eventId: string, overrides: Partial<typeof schedules.$inferInsert> = {}) {
  const [row] = await db
    .insert(schedules)
    .values({
      name: "Bloque",
      startTime: "15:00",
      endTime: "15:45",
      date: new Date("2026-11-07T12:00:00.000Z"),
      openSpaceId: eventId,
      ...overrides,
    })
    .returning();

  return row;
}

export async function makeRoom(eventId: string, overrides: Partial<typeof rooms.$inferInsert> = {}) {
  const [row] = await db
    .insert(rooms)
    .values({ name: slug("Sala"), openSpaceId: eventId, ...overrides })
    .returning();

  return row;
}

export async function makeTrack(
  where: { eventId: string; scheduleId: string; roomId: string },
  overrides: Partial<typeof tracks.$inferInsert> = {}
) {
  const [row] = await db
    .insert(tracks)
    .values({
      title: "Charla de prueba",
      openSpaceId: where.eventId,
      scheduleId: where.scheduleId,
      roomId: where.roomId,
      ...overrides,
    })
    .returning();

  return row;
}

/** A community with one event, two rooms (one with TV) and two time slots. */
export async function makeBoard() {
  const community = await makeCommunity();
  const event = await makeEvent(community.id);
  const [plainRoom, tvRoom] = await Promise.all([
    makeRoom(event.id, { name: slug("Sala"), sortOrder: 0 }),
    makeRoom(event.id, { name: slug("Sala TV"), hasTV: true, hasWhiteboard: true, sortOrder: 1 }),
  ]);
  const [early, late] = await Promise.all([
    makeSlot(event.id, { startTime: "15:00", endTime: "15:45" }),
    makeSlot(event.id, { startTime: "16:00", endTime: "16:45" }),
  ]);

  return { community, event, rooms: { plain: plainRoom, tv: tvRoom }, slots: { early, late } };
}
